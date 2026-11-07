package com.zenify.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.*

/**
 * Real-time FX chain, the native twin of the web ZenAudioEngine:
 *   vocal isolator -> [reorderable: EQ, Filter, Warmth, Chorus, Echo, Reverb]
 *   -> stereo width -> 8D orbit -> compressor (night mode) -> soft clip
 * Runs inside ExoPlayer's AudioSink on 16-bit PCM, so it works with any
 * stream ExoPlayer can decode (Opus/WebM, AAC/M4A, MP3 ...).
 */
const val BANDS = 36
private const val BLOCK = 128
private const val TWO_PI = (2.0 * PI).toFloat()

class FxParams(
    val bypass: Boolean = false,
    val eq: FloatArray = FloatArray(3),
    val reverb: String = "none",
    val reverbAmount: Float = 0.4f,
    val echo: Float = 0f,
    val echoTime: Float = 0.32f,
    val chorus: Float = 0f,
    val filter: Float = 0f,
    val drive: Float = 0f,
    val width: Float = 1f,
    val night: Boolean = false,
    val vocalMode: String = "off",
    val vocalAmount: Float = 0.85f,
    val vocalFocus: Float = 0.5f,
    val chain: List<String> = listOf("eq", "filter", "drive", "chorus", "echo", "reverb"),
    val is8D: Boolean = false,
    val clockwise: Boolean = true,
    val speed8D: Float = 0.15f,
) {
    companion object {
        fun from(m: Map<String, Any?>): FxParams {
            fun f(k: String, d: Float) = (m[k] as? Number)?.toFloat() ?: d
            fun s(k: String, d: String) = (m[k] as? String) ?: d
            fun b(k: String, d: Boolean) = (m[k] as? Boolean) ?: d
            val eq = (m["eq"] as? List<*>)?.map { (it as? Number)?.toFloat() ?: 0f }
            val chain = (m["chain"] as? List<*>)?.mapNotNull { it as? String }
            return FxParams(
                bypass = b("bypass", false),
                eq = FloatArray(3) { eq?.getOrNull(it) ?: 0f },
                reverb = s("reverb", "none"),
                reverbAmount = f("reverbAmount", 0.4f),
                echo = f("echo", 0f),
                echoTime = f("echoTime", 0.32f),
                chorus = f("chorus", 0f),
                filter = f("filter", 0f),
                drive = f("drive", 0f),
                width = f("width", 1f),
                night = b("night", false),
                vocalMode = s("vocalMode", "off"),
                vocalAmount = f("vocalAmount", 0.85f),
                vocalFocus = f("vocalFocus", 0.5f),
                chain = if (chain.isNullOrEmpty()) listOf("eq", "filter", "drive", "chorus", "echo", "reverb") else chain,
                is8D = b("is8D", false),
                clockwise = s("direction8D", "clockwise") == "clockwise",
                speed8D = f("speed8D", 0.15f),
            )
        }
    }
}

@UnstableApi
class ZenFxProcessor : BaseAudioProcessor() {
    @Volatile var params: FxParams = FxParams()
    @Volatile var bands: FloatArray = FloatArray(BANDS)

    private var engine: Engine? = null
    private var inCh = 2

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT || inputAudioFormat.channelCount !in 1..2) {
            return AudioProcessor.AudioFormat.NOT_SET // leave unusual formats untouched
        }
        inCh = inputAudioFormat.channelCount
        engine = Engine(inputAudioFormat.sampleRate.toFloat()) { bands = it.copyOf() }
        return AudioProcessor.AudioFormat(inputAudioFormat.sampleRate, 2, C.ENCODING_PCM_16BIT)
    }

    override fun onFlush() {
        engine?.clear()
    }

    override fun onReset() {
        engine = null
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val eng = engine
        if (eng == null) {
            val out = replaceOutputBuffer(inputBuffer.remaining())
            out.put(inputBuffer)
            out.flip()
            return
        }
        val frames = inputBuffer.remaining() / (2 * inCh)
        val out = replaceOutputBuffer(frames * 4)
        eng.process(params, inputBuffer, inCh, frames, out)
        out.flip()
    }
}

// =============================================================================
// DSP building blocks
// =============================================================================
private const val LP = 0
private const val HP = 1
private const val BP = 2
private const val PEAK = 3
private const val LSHELF = 4
private const val HSHELF = 5

private fun dbToLin(db: Float) = 10f.pow(db / 20f)
private fun smooth(cur: Float, target: Float, k: Float) = cur + (target - cur) * k

private class Biquad {
    var b0 = 1f; var b1 = 0f; var b2 = 0f; var a1 = 0f; var a2 = 0f
    private var x1 = 0f; private var x2 = 0f; private var y1 = 0f; private var y2 = 0f

    fun run(x: Float): Float {
        val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = x; y2 = y1; y1 = y
        return y
    }

    fun clear() { x1 = 0f; x2 = 0f; y1 = 0f; y2 = 0f }

    /** RBJ cookbook coefficients. */
    fun set(type: Int, fs: Float, f0: Float, q: Float, gainDb: Float = 0f) {
        val f = f0.coerceIn(10f, fs * 0.45f)
        val w0 = TWO_PI * f / fs
        val cw = cos(w0); val sw = sin(w0)
        val al = sw / (2f * q)
        val a = 10f.pow(gainDb / 40f)
        var n0 = 1f; var n1 = 0f; var n2 = 0f; var d0 = 1f; var d1 = 0f; var d2 = 0f
        when (type) {
            LP -> { n0 = (1f - cw) / 2f; n1 = 1f - cw; n2 = n0; d0 = 1f + al; d1 = -2f * cw; d2 = 1f - al }
            HP -> { n0 = (1f + cw) / 2f; n1 = -(1f + cw); n2 = n0; d0 = 1f + al; d1 = -2f * cw; d2 = 1f - al }
            BP -> { n0 = al; n1 = 0f; n2 = -al; d0 = 1f + al; d1 = -2f * cw; d2 = 1f - al }
            PEAK -> { n0 = 1f + al * a; n1 = -2f * cw; n2 = 1f - al * a; d0 = 1f + al / a; d1 = -2f * cw; d2 = 1f - al / a }
            LSHELF -> {
                val sa = 2f * sqrt(a) * (sw * 0.70710678f)
                n0 = a * ((a + 1f) - (a - 1f) * cw + sa)
                n1 = 2f * a * ((a - 1f) - (a + 1f) * cw)
                n2 = a * ((a + 1f) - (a - 1f) * cw - sa)
                d0 = (a + 1f) + (a - 1f) * cw + sa
                d1 = -2f * ((a - 1f) + (a + 1f) * cw)
                d2 = (a + 1f) + (a - 1f) * cw - sa
            }
            HSHELF -> {
                val sa = 2f * sqrt(a) * (sw * 0.70710678f)
                n0 = a * ((a + 1f) + (a - 1f) * cw + sa)
                n1 = -2f * a * ((a - 1f) + (a + 1f) * cw)
                n2 = a * ((a + 1f) + (a - 1f) * cw - sa)
                d0 = (a + 1f) - (a - 1f) * cw + sa
                d1 = 2f * ((a - 1f) - (a + 1f) * cw)
                d2 = (a + 1f) - (a - 1f) * cw - sa
            }
        }
        b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = d1 / d0; a2 = d2 / d0
    }
}

private class DelayLine(size: Int) {
    private val buf = FloatArray(size + 3)
    private var w = 0

    fun write(x: Float) { buf[w] = x; w++; if (w >= buf.size) w = 0 }

    /** [d] samples back from the most recent write (d >= 1). */
    fun read(d: Float): Float {
        val dd = d.coerceIn(1f, (buf.size - 3).toFloat())
        var rp = w - dd
        if (rp < 0f) rp += buf.size
        val i = rp.toInt()
        val fr = rp - i
        val a = buf[i % buf.size]
        val b = buf[(i + 1) % buf.size]
        return a + (b - a) * fr
    }

    fun clear() = buf.fill(0f)
}

private abstract class Mod {
    var active = false
    abstract fun update(p: FxParams, k: Float)
    abstract fun process(io: FloatArray)
    abstract fun clear()
}

private class EqMod(val fs: Float) : Mod() {
    private val g = FloatArray(3)
    private val bq = Array(3) { Array(2) { Biquad() } }
    private var trim = 1f

    override fun update(p: FxParams, k: Float) {
        var any = false
        for (i in 0..2) { g[i] = smooth(g[i], p.eq[i], k); if (abs(g[i]) > 0.02f) any = true }
        active = any
        if (!any) return
        for (c in 0..1) {
            bq[0][c].set(LSHELF, fs, 110f, 0.8f, g[0])
            bq[1][c].set(PEAK, fs, 1500f, 0.8f, g[1])
            bq[2][c].set(HSHELF, fs, 8000f, 0.8f, g[2])
        }
        trim = dbToLin(-max(0f, maxOf(g[0], g[1], g[2])) * 0.6f) // headroom for boosts
    }

    override fun process(io: FloatArray) {
        for (c in 0..1) io[c] = bq[2][c].run(bq[1][c].run(bq[0][c].run(io[c]))) * trim
    }

    override fun clear() { bq.forEach { r -> r.forEach { it.clear() } } }
}

private class FilterMod(val fs: Float) : Mod() {
    private var v = 0f
    private val hp = Array(2) { Biquad() }
    private val lp = Array(2) { Biquad() }

    override fun update(p: FxParams, k: Float) {
        v = smooth(v, p.filter.coerceIn(-1f, 1f), k)
        active = abs(v) > 0.02f
        if (!active) return
        val lpF = 20000f * 0.0125f.pow(max(0f, -v))
        val hpF = 20f * 300f.pow(max(0f, v))
        for (c in 0..1) { hp[c].set(HP, fs, hpF, 0.707f); lp[c].set(LP, fs, lpF, 0.707f) }
    }

    override fun process(io: FloatArray) { for (c in 0..1) io[c] = lp[c].run(hp[c].run(io[c])) }
    override fun clear() { hp.forEach { it.clear() }; lp.forEach { it.clear() } }
}

private class DriveMod(val fs: Float) : Mod() {
    private var d = 0f
    private val tone = FloatArray(2)
    private val toneA = 1f - exp(-TWO_PI * 7500f / fs)
    private val tanhK = tanh(2.5f)

    override fun update(p: FxParams, k: Float) {
        d = smooth(d, p.drive.coerceIn(0f, 1f), k)
        active = d > 0.003f
    }

    override fun process(io: FloatArray) {
        val pre = 1f + 3f * d
        val wetG = d * 0.85f / sqrt(pre)
        val dryG = 1f - 0.5f * d
        for (c in 0..1) {
            val x = io[c]
            val sat = tanh(2.5f * x * pre) / tanhK
            tone[c] += toneA * (sat - tone[c])
            io[c] = x * dryG + tone[c] * wetG
        }
    }

    override fun clear() { tone.fill(0f) }
}

private class ChorusMod(val fs: Float) : Mod() {
    private val lines = arrayOf(DelayLine((fs * 0.06f).toInt()), DelayLine((fs * 0.06f).toInt()))
    private var amt = 0f
    private var pa = 0f
    private var pb = 0f

    override fun update(p: FxParams, k: Float) {
        amt = smooth(amt, p.chorus.coerceIn(0f, 1f), k)
        active = amt > 0.003f
    }

    override fun process(io: FloatArray) {
        val depth = 0.0012f + 0.0028f * amt
        pa += TWO_PI * 0.55f / fs; if (pa > TWO_PI) pa -= TWO_PI
        pb += TWO_PI * 0.73f / fs; if (pb > TWO_PI) pb -= TWO_PI
        lines[0].write(io[0]); lines[1].write(io[1])
        io[0] += lines[0].read((0.020f + depth * sin(pa)) * fs) * amt * 0.8f
        io[1] += lines[1].read((0.026f + depth * sin(pb)) * fs) * amt * 0.8f
    }

    override fun clear() { lines.forEach { it.clear() } }
}

private class EchoMod(val fs: Float) : Mod() {
    private val lines = arrayOf(DelayLine((fs * 1.6f).toInt()), DelayLine((fs * 1.6f).toInt()))
    private val tone = FloatArray(2)
    private val toneA = 1f - exp(-TWO_PI * 4200f / fs) // every repeat gets darker
    private var amt = 0f
    private var time = 0.32f
    private var tail = 0

    override fun update(p: FxParams, k: Float) {
        amt = smooth(amt, p.echo.coerceIn(0f, 1f), k)
        time = smooth(time, p.echoTime.coerceIn(0.06f, 1f), k * 0.5f)
        if (amt > 0.003f) tail = (fs * 4f).toInt() else if (tail > 0) tail -= BLOCK
        active = amt > 0.003f || tail > 0
    }

    override fun process(io: FloatArray) {
        val fb = 0.28f + 0.32f * amt
        val wet = amt * 0.85f
        val send = if (amt > 0.003f) 1f else 0f
        for (c in 0..1) {
            val d = lines[c].read(time * fs)
            tone[c] += toneA * (d - tone[c])
            lines[c].write(io[c] * send + tone[c] * fb)
            io[c] += tone[c] * wet
        }
    }

    override fun clear() { lines.forEach { it.clear() }; tone.fill(0f); tail = 0 }
}

private class Comb(size: Int) {
    private val buf = FloatArray(max(1, size))
    private var i = 0
    private var store = 0f

    fun run(inp: Float, fb: Float, d1: Float, d2: Float): Float {
        val o = buf[i]
        store = o * d2 + store * d1
        buf[i] = inp + store * fb
        if (++i >= buf.size) i = 0
        return o
    }

    fun clear() { buf.fill(0f); store = 0f; i = 0 }
}

private class Allpass(size: Int) {
    private val buf = FloatArray(max(1, size))
    private var i = 0

    fun run(inp: Float): Float {
        val b = buf[i]
        val o = -inp + b
        buf[i] = inp + b * 0.5f
        if (++i >= buf.size) i = 0
        return o
    }

    fun clear() { buf.fill(0f); i = 0 }
}

/** Freeverb with two room types: warehouse (small hall) and cathedral (church). */
private class ReverbMod(val fs: Float) : Mod() {
    private val sc = fs / 44100f
    private val ct = intArrayOf(1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)
    private val at = intArrayOf(556, 441, 341, 225)
    private val combs = Array(2) { ch -> Array(8) { Comb(((ct[it] + ch * 23) * sc).toInt()) } }
    private val aps = Array(2) { ch -> Array(4) { Allpass(((at[it] + ch * 23) * sc).toInt()) } }
    private val pre = DelayLine((fs * 0.06f).toInt())
    private var amt = 0f
    private var room = 0.65f
    private var damp = 0.5f
    private var preMs = 12f
    private var tail = 0

    override fun update(p: FxParams, k: Float) {
        val on = p.reverb != "none"
        amt = smooth(amt, if (on) p.reverbAmount.coerceIn(0f, 1f) else 0f, k)
        when (p.reverb) {
            "cathedral" -> { room = smooth(room, 0.90f, k * 0.3f); damp = smooth(damp, 0.30f, k * 0.3f); preMs = smooth(preMs, 30f, k * 0.3f) }
            "warehouse" -> { room = smooth(room, 0.65f, k * 0.3f); damp = smooth(damp, 0.50f, k * 0.3f); preMs = smooth(preMs, 12f, k * 0.3f) }
        }
        if (amt > 0.003f) tail = (fs * 5f).toInt() else if (tail > 0) tail -= BLOCK
        active = amt > 0.003f || tail > 0
    }

    override fun process(io: FloatArray) {
        pre.write((io[0] + io[1]) * 0.015f)
        val x = pre.read(preMs * 0.001f * fs)
        val fb = room * 0.28f + 0.7f
        val d1 = damp * 0.4f
        val d2 = 1f - d1
        val dry = 1f - amt * 0.25f
        val wetG = amt * 1.6f // tune by ear
        for (c in 0..1) {
            var s = 0f
            for (cb in combs[c]) s += cb.run(x, fb, d1, d2)
            for (ap in aps[c]) s = ap.run(s)
            io[c] = io[c] * dry + s * wetG
        }
    }

    override fun clear() {
        combs.forEach { r -> r.forEach { it.clear() } }
        aps.forEach { r -> r.forEach { it.clear() } }
        pre.clear(); tail = 0
    }
}

/** Mid/side vocal isolator and karaoke (same maths as the web version). */
private class VocalStage(val fs: Float) {
    private val band = Biquad()
    private val lowL = Biquad(); private val lowR = Biquad()
    private val hiL = Biquad(); private val hiR = Biquad()
    private var mix = 0f
    private var gBand = 1f; private var gSide = 1f; private var gBass = 1f; private var gHigh = 1f
    var active = false

    init {
        lowL.set(LP, fs, 180f, 0.707f); lowR.set(LP, fs, 180f, 0.707f)
        hiL.set(HP, fs, 5500f, 0.707f); hiR.set(HP, fs, 5500f, 0.707f)
    }

    fun update(p: FxParams, k: Float) {
        val off = p.vocalMode == "off"
        val a = p.vocalAmount.coerceIn(0f, 1f)
        band.set(BP, fs, 1400f, 0.4f + p.vocalFocus.coerceIn(0f, 1f) * 1.4f)
        mix = smooth(mix, if (off) 0f else 1f, k * 2f)
        val tb: Float; val ts: Float; val tl: Float; val th: Float
        if (p.vocalMode == "karaoke") {
            tb = max(0f, 1f - a * 1.15f); ts = 1f + 0.15f * a; tl = 1f; th = 1f
        } else {
            tb = 1.3f * a; ts = max(0f, 1f - a * 1.25f); tl = max(0f, 1f - a * 0.95f); th = tl
        }
        gBand = smooth(gBand, tb, k); gSide = smooth(gSide, ts, k)
        gBass = smooth(gBass, tl, k); gHigh = smooth(gHigh, th, k)
        active = mix > 0.003f
    }

    fun process(io: FloatArray) {
        if (!active) return
        val l = io[0]; val r = io[1]
        val mid = band.run((l + r) * 0.5f) * gBand
        val bass = (lowL.run(l) + lowR.run(r)) * 0.5f * gBass
        val high = (hiL.run(l) + hiR.run(r)) * 0.5f * gHigh
        val side = (l - r) * 0.5f * gSide
        val c = mid + bass + high
        io[0] = l + (c + side - l) * mix
        io[1] = r + (c - side - r) * mix
    }

    fun clear() { band.clear(); lowL.clear(); lowR.clear(); hiL.clear(); hiR.clear() }
}

/** 8D orbit: interaural delay + level + head-shadow filtering on a rotating azimuth. */
private class Spatial(val fs: Float) {
    private val line = DelayLine((fs * 0.002f).toInt() + 8)
    private val lp = FloatArray(2)
    private var theta = 0f
    private var mix = 0f
    private var dir = 1f
    private var freq = 0.15f

    fun update(p: FxParams, k: Float) {
        mix = smooth(mix, if (p.is8D) 1f else 0f, k * 1.5f)
        dir = if (p.clockwise) 1f else -1f
        freq = p.speed8D.coerceIn(0.03f, 0.6f)
    }

    fun process(io: FloatArray) {
        if (mix < 0.002f) return
        theta += TWO_PI * freq / fs * dir
        if (theta > TWO_PI) theta -= TWO_PI else if (theta < 0f) theta += TWO_PI
        val s = sin(theta); val c = cos(theta); val a = abs(s)
        val mono = (io[0] + io[1]) * 0.5f
        val side = (io[0] - io[1]) * 0.5f
        line.write(mono)
        val far = line.read(1f + a * 0.00066f * fs) // up to about 0.66 ms
        val back = (1f - c) * 0.5f
        val bg = 1f - 0.2f * back
        val gNear = (1f + 0.25f * a) * bg
        val gFar = (1f - 0.5f * a) * bg
        val bf = 1f - 0.6f * back
        val aFar = 1f - exp(-TWO_PI * (20000f * (1f - a) + 2500f * a) * bf / fs)
        val aNear = 1f - exp(-TWO_PI * 20000f * bf / fs)
        val rightNear = s >= 0f
        lp[0] += (if (rightNear) aFar else aNear) * ((if (rightNear) far else mono) - lp[0])
        lp[1] += (if (rightNear) aNear else aFar) * ((if (rightNear) mono else far) - lp[1])
        val l = lp[0] * (if (rightNear) gFar else gNear) + side * 0.4f
        val r = lp[1] * (if (rightNear) gNear else gFar) - side * 0.4f
        io[0] += (l - io[0]) * mix
        io[1] += (r - io[1]) * mix
    }

    fun clear() { line.clear(); lp.fill(0f) }
}

private class Comp(val fs: Float) {
    private var env = 0f
    private var gain = 1f
    private var th = -14f
    private var ratio = 3f
    private var knee = 24f
    private var makeup = 1f
    private var attC = exp(-1f / (fs * 0.01f))
    private var relC = exp(-1f / (fs * 0.25f))

    fun set(night: Boolean, k: Float) {
        th = smooth(th, if (night) -32f else -14f, k)
        ratio = smooth(ratio, if (night) 6f else 3f, k)
        knee = smooth(knee, if (night) 18f else 24f, k)
        makeup = smooth(makeup, if (night) 2.2f else 1f, k)
        relC = exp(-1f / (fs * (if (night) 0.18f else 0.25f)))
    }

    fun run(io: FloatArray) {
        val peak = max(abs(io[0]), abs(io[1]))
        env = if (peak > env) attC * env + (1f - attC) * peak else relC * env + (1f - relC) * peak
        val over = 20f * log10(env + 1e-6f) - th
        val slope = 1f / ratio - 1f
        val gr = when {
            2f * over < -knee -> 0f
            2f * abs(over) <= knee -> slope * (over + knee / 2f).pow(2) / (2f * knee)
            else -> slope * over
        }
        val target = dbToLin(gr)
        gain += (target - gain) * (if (target < gain) 0.05f else 0.001f)
        io[0] *= gain * makeup
        io[1] *= gain * makeup
    }

    fun clear() { env = 0f; gain = 1f }
}

/** 2048-point FFT -> 36 log bands (40 Hz..16 kHz) with auto-gain, for the UI spectrum. */
private class Analyzer(val fs: Float, val out: (FloatArray) -> Unit) {
    private val n = 2048
    private val hop = 1024
    private val ring = FloatArray(n)
    private var wp = 0
    private var cnt = 0
    private val win = FloatArray(n) { (0.5 - 0.5 * cos(2.0 * PI * it / (n - 1))).toFloat() }
    private val re = FloatArray(n)
    private val im = FloatArray(n)
    private val rev = IntArray(n).also { r ->
        val bits = 11
        for (i in 0 until n) { var x = i; var y = 0; for (b in 0 until bits) { y = (y shl 1) or (x and 1); x = x shr 1 }; r[i] = y }
    }
    private val levels = FloatArray(BANDS)
    private val vals = FloatArray(BANDS)
    private var refDb = -50f

    fun push(x: Float) {
        ring[wp] = x; wp = (wp + 1) and (n - 1)
        if (++cnt >= hop) { cnt = 0; compute() }
    }

    private fun fft() {
        for (i in 0 until n) { val j = rev[i]; if (j > i) { val t = re[i]; re[i] = re[j]; re[j] = t; val u = im[i]; im[i] = im[j]; im[j] = u } }
        var len = 2
        while (len <= n) {
            val ang = (-2.0 * PI / len)
            val wr = cos(ang).toFloat(); val wi = sin(ang).toFloat()
            val half = len / 2
            var i = 0
            while (i < n) {
                var cr = 1f; var ci = 0f
                for (j in 0 until half) {
                    val a = i + j; val b = a + half
                    val vr = re[b] * cr - im[b] * ci
                    val vi = re[b] * ci + im[b] * cr
                    re[b] = re[a] - vr; im[b] = im[a] - vi
                    re[a] += vr; im[a] += vi
                    val ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr
                }
                i += len
            }
            len = len shl 1
        }
    }

    private fun compute() {
        for (i in 0 until n) { re[i] = ring[(wp + i) and (n - 1)] * win[i]; im[i] = 0f }
        fft()
        val binHz = fs / n
        var curMax = -200f
        for (i in 0 until BANDS) {
            val f0 = 40f * (16000f / 40f).pow(i.toFloat() / BANDS)
            val f1 = 40f * (16000f / 40f).pow((i + 1).toFloat() / BANDS)
            val b0 = max(1, floor(f0 / binHz).toInt())
            val b1 = max(b0 + 1, ceil(f1 / binHz).toInt())
            var p = 0f; var cntB = 0
            var b = b0
            while (b < b1 && b < n / 2) {
                val mag = sqrt(re[b] * re[b] + im[b] * im[b]) / (n / 4f)
                p += mag * mag; cntB++; b++
            }
            val avgDb = 10f * log10((if (cntB > 0) p / cntB else 0f) + 1e-12f)
            val v = avgDb + 3.5f * log2(sqrt(f0 * f1) / 500f) // compensate the natural spectral slope
            vals[i] = v
            if (v > curMax) curMax = v
        }
        refDb += (curMax - refDb) * (if (curMax > refDb) 0.35f else 0.02f)
        for (i in 0 until BANDS) {
            val t = ((vals[i] - (refDb - 38f)) / 38f).coerceIn(0f, 1f).pow(1.25f)
            levels[i] += (t - levels[i]) * (if (t > levels[i]) 0.6f else 0.16f)
        }
        out(levels)
    }
}

// =============================================================================
// Engine: owns all modules, smooths parameters, renders frames
// =============================================================================
private class Engine(val fs: Float, onBands: (FloatArray) -> Unit) {
    private val eq = EqMod(fs)
    private val filter = FilterMod(fs)
    private val drive = DriveMod(fs)
    private val chorus = ChorusMod(fs)
    private val echo = EchoMod(fs)
    private val reverb = ReverbMod(fs)
    private val mods: Map<String, Mod> = mapOf(
        "eq" to eq, "filter" to filter, "drive" to drive,
        "chorus" to chorus, "echo" to echo, "reverb" to reverb,
    )
    private var order: Array<Mod> = arrayOf(eq, filter, drive, chorus, echo, reverb)
    private var orderKey = ""
    private val vocal = VocalStage(fs)
    private val spatial = Spatial(fs)
    private val comp = Comp(fs)
    private val analyzer = Analyzer(fs, onBands)
    private val io = FloatArray(2)
    private var width = 1f
    private var bypassMix = 1f

    fun clear() {
        mods.values.forEach { it.clear() }
        vocal.clear(); spatial.clear(); comp.clear()
    }

    private fun update(p: FxParams, n: Int) {
        val k = 1f - exp(-n / (fs * 0.05f))
        val kb = 1f - exp(-n / (fs * 0.02f))
        val key = p.chain.joinToString(",")
        if (key != orderKey) {
            orderKey = key
            val list = p.chain.mapNotNull { mods[it] }.toMutableList()
            mods.values.forEach { if (it !in list) list.add(it) }
            order = list.toTypedArray()
        }
        bypassMix = smooth(bypassMix, if (p.bypass) 0f else 1f, kb)
        vocal.update(p, k)
        for (m in order) m.update(p, k)
        width = smooth(width, p.width.coerceIn(0f, 2f), k)
        spatial.update(p, k)
        comp.set(p.night, k)
    }

    private fun frame() {
        vocal.process(io)
        for (i in order.indices) { val m = order[i]; if (m.active) m.process(io) }
        if (abs(width - 1f) > 0.01f) {
            val mid = (io[0] + io[1]) * 0.5f
            val side = (io[0] - io[1]) * 0.5f * width
            io[0] = mid + side; io[1] = mid - side
        }
        spatial.process(io)
        comp.run(io)
        io[0] = soft(io[0]); io[1] = soft(io[1])
    }

    private fun soft(x: Float): Float {
        val a = abs(x)
        return if (a < 0.9f) x else sign(x) * (0.9f + 0.1f * tanh((a - 0.9f) / 0.1f))
    }

    private fun toShort(x: Float): Short = (x.coerceIn(-1f, 1f) * 32767f).toInt().toShort()

    fun process(p: FxParams, src: ByteBuffer, inCh: Int, frames: Int, out: ByteBuffer) {
        var done = 0
        while (done < frames) {
            val n = min(BLOCK, frames - done)
            update(p, n)
            for (i in 0 until n) {
                val a = src.getShort() / 32768f
                val b = if (inCh == 2) src.getShort() / 32768f else a
                io[0] = a; io[1] = b
                if (bypassMix > 0.001f) {
                    frame()
                    if (bypassMix < 0.999f) {
                        io[0] = a + (io[0] - a) * bypassMix
                        io[1] = b + (io[1] - b) * bypassMix
                    }
                }
                analyzer.push((io[0] + io[1]) * 0.5f)
                out.putShort(toShort(io[0])); out.putShort(toShort(io[1]))
            }
            done += n
        }
    }
}
