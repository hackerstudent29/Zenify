package com.zenify.mobile.audio

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.*

/** One snapshot of every effect knob for one side (out or in) at one moment. */
class FxPlan {
    var vol = 1f            // player volume multiplier (after processor)
    var dry = 1f            // dry level inside processor; also feeds echo/reverb sends
    var lp = 20000f; var hp = 20f; var q = 0.707f
    var lowDb = 0f          // low shelf @200 Hz
    var echo = 0f; var fb = 0.4f; var echoMs = 375f
    var verb = 0f
    var gateHz = 0f; var gateDepth = 0f
    var hold = 1            // sample-rate crush: hold every N frames
    var flange = 0f
    var speed = 1f          // speed+pitch (tape / vinyl)
    fun neutral() = dry == 1f && lp >= 19000f && hp <= 25f && abs(lowDb) < 0.1f &&
        echo == 0f && verb == 0f && gateHz == 0f && hold == 1 && flange == 0f
}

@OptIn(UnstableApi::class)
class XfFxProcessor : BaseAudioProcessor() {
    @Volatile var enabled = false
    @Volatile private var p = FxPlan()
    fun apply(plan: FxPlan) { p = plan; enabled = !plan.neutral() }
    fun resetFx() { enabled = false; p = FxPlan() }
    override fun onReset() { resetFx() }

    private class Bq {
        var b0 = 1f; var b1 = 0f; var b2 = 0f; var a1 = 0f; var a2 = 0f; var z1 = 0f; var z2 = 0f
        fun run(x: Float): Float { val y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y }
    }
    private class Comb(n: Int) {
        val b = FloatArray(n); var i = 0; var s = 0f
        fun run(x: Float): Float { val o = b[i]; s = o * 0.8f + s * 0.2f; b[i] = x + s * 0.82f; if (++i == b.size) i = 0; return o }
    }
    private class Ap(n: Int) {
        val b = FloatArray(n); var i = 0
        fun run(x: Float): Float { val d = b[i]; val o = d - x; b[i] = x + d * 0.5f; if (++i == b.size) i = 0; return o }
    }

    private var sr = 44100; private var ch = 2
    private val lpF = Array(2) { Bq() }; private val hpF = Array(2) { Bq() }; private val shF = Array(2) { Bq() }
    private var cLp = -1f; private var cLq = -1f; private var cHp = -1f; private var cHq = -1f; private var cDb = 99f
    private var eBuf = Array(2) { FloatArray(1) }; private var eW = 0
    private var combs = Array(2) { arrayOf<Comb>() }; private var aps = Array(2) { arrayOf<Ap>() }
    private var fBuf = Array(2) { FloatArray(1) }; private var fW = 0; private var lfo = 0f
    private var gPh = 0f; private var gS = 1f; private var cnt = 0
    private val held = FloatArray(2)

    private fun alloc() {
        eBuf = Array(2) { FloatArray(sr) }; eW = 0
        val t = intArrayOf(1116, 1188, 1277, 1356)
        combs = Array(2) { c -> Array(4) { i -> Comb(t[i] * sr / 44100 + c * 23) } }
        aps = Array(2) { Array(2) { i -> Ap((if (i == 0) 556 else 441) * sr / 44100) } }
        fBuf = Array(2) { FloatArray(2048) }; fW = 0
        for (a in arrayOf(lpF, hpF, shF)) for (b in a) { b.z1 = 0f; b.z2 = 0f }
        cLp = -1f; cHp = -1f; cDb = 99f; gS = 1f
    }

    override fun onConfigure(f: AudioFormat): AudioFormat {
        if (f.encoding != C.ENCODING_PCM_16BIT || f.channelCount !in 1..2) return AudioFormat.NOT_SET
        sr = f.sampleRate; ch = f.channelCount
        alloc()
        return f
    }
    override fun onFlush() { alloc() }

    private fun set(a: Array<Bq>, c: FloatArray) { for (b in a) { b.b0 = c[0]; b.b1 = c[1]; b.b2 = c[2]; b.a1 = c[3]; b.a2 = c[4] } }
    private fun lpC(f: Float, q: Float): FloatArray {
        val w = 2.0 * PI * f.coerceIn(20f, sr * 0.45f) / sr; val cs = cos(w); val al = sin(w) / (2.0 * q); val a0 = 1 + al
        return floatArrayOf(((1 - cs) / 2 / a0).toFloat(), ((1 - cs) / a0).toFloat(), ((1 - cs) / 2 / a0).toFloat(), (-2 * cs / a0).toFloat(), ((1 - al) / a0).toFloat())
    }
    private fun hpC(f: Float, q: Float): FloatArray {
        val w = 2.0 * PI * f.coerceIn(20f, sr * 0.45f) / sr; val cs = cos(w); val al = sin(w) / (2.0 * q); val a0 = 1 + al
        return floatArrayOf(((1 + cs) / 2 / a0).toFloat(), (-(1 + cs) / a0).toFloat(), ((1 + cs) / 2 / a0).toFloat(), (-2 * cs / a0).toFloat(), ((1 - al) / a0).toFloat())
    }
    private fun shC(db: Float): FloatArray {
        val A = 10.0.pow(db / 40.0); val w = 2.0 * PI * 200.0 / sr; val cs = cos(w)
        val sA = 2 * sqrt(A) * (sin(w) / 2.0 * sqrt(2.0))
        val a0 = (A + 1) + (A - 1) * cs + sA
        return floatArrayOf((A * ((A + 1) - (A - 1) * cs + sA) / a0).toFloat(), (2 * A * ((A - 1) - (A + 1) * cs) / a0).toFloat(),
            (A * ((A + 1) - (A - 1) * cs - sA) / a0).toFloat(), (-2 * ((A - 1) + (A + 1) * cs) / a0).toFloat(), (((A + 1) + (A - 1) * cs - sA) / a0).toFloat())
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val n = inputBuffer.remaining()
        if (n == 0) return
        val out = replaceOutputBuffer(n)
        val pl = p
        if (!enabled) { out.put(inputBuffer); out.flip(); return }

        val useLp = pl.lp < 19000f; val useHp = pl.hp > 25f; val useSh = abs(pl.lowDb) > 0.1f
        if (useLp && (pl.lp != cLp || pl.q != cLq)) { cLp = pl.lp; cLq = pl.q; set(lpF, lpC(pl.lp, pl.q)) }
        if (useHp && (pl.hp != cHp || pl.q != cHq)) { cHp = pl.hp; cHq = pl.q; set(hpF, hpC(pl.hp, pl.q)) }
        if (useSh && pl.lowDb != cDb) { cDb = pl.lowDb; set(shF, shC(pl.lowDb)) }

        val frames = n / (2 * ch)
        val size = eBuf[0].size
        val dl = (pl.echoMs * sr / 1000f).toInt().coerceIn(1, size - 1)
        val lfoInc = (2.0 * PI * 0.3 / sr).toFloat()

        for (i in 0 until frames) {
            var gain = 1f
            if (pl.gateHz > 0f) {
                gPh += pl.gateHz / sr; if (gPh >= 1f) gPh -= 1f
                gS += ((if (gPh < 0.5f) 1f else 1f - pl.gateDepth) - gS) * 0.03f; gain = gS
            }
            cnt++
            var rI = 0
            if (pl.flange > 0f) {
                lfo += lfoInc; if (lfo > 6.2831853f) lfo -= 6.2831853f
                val d = ((0.0007f + 0.0025f * (0.5f + 0.5f * sin(lfo))) * sr).toInt()
                rI = ((fW - d) % 2048 + 2048) % 2048
            }
            val r = (eW - dl + size) % size
            for (c in 0 until ch) {
                var x = inputBuffer.getShort() / 32768f
                if (pl.hold > 1) { if (cnt % pl.hold == 0) held[c] = x; x = held[c] }
                if (useSh) x = shF[c].run(x)
                if (useHp) x = hpF[c].run(x)
                if (useLp) x = lpF[c].run(x)
                x *= gain
                if (pl.flange > 0f) { val d = fBuf[c][rI]; fBuf[c][fW] = x + 0.4f * d; x += pl.flange * 0.8f * d }
                val y = x * pl.dry
                var o = y
                if (pl.echo > 0f) { val d = eBuf[c][r]; eBuf[c][eW] = y + d * pl.fb; o += d * pl.echo }
                if (pl.verb > 0f) {
                    val rin = y * 0.2f; var s = 0f
                    for (cb in combs[c]) s += cb.run(rin)
                    var a = s * 0.25f
                    for (ap in aps[c]) a = ap.run(a)
                    o += a * pl.verb
                }
                out.putShort((o.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
            }
            eW = (eW + 1) % size; fW = (fW + 1) % 2048
        }
        out.flip()
    }
}
