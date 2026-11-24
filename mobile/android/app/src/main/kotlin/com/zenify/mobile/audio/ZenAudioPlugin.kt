package com.zenify.mobile.audio

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Surface
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.VideoSize
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.zenify.mobile.yt.YtDataSource
import com.zenify.mobile.yt.YtEngine
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.view.TextureRegistry
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Channels:
 *  - MethodChannel  zenify/audio           play / setNext / prefetch / prewarm / clearAllCaches / pause / resume / stop / seek / setVolume / setFx / dispose / setLifecycle
 *  - EventChannel   zenify/audio/events    {type: state|position|duration|resolved|error, ...}
 *  - EventChannel   zenify/audio/spectrum  List<double>(36) at about 30 fps
 */
@OptIn(UnstableApi::class)
class ZenAudioPlugin : FlutterPlugin, MethodChannel.MethodCallHandler, ActivityAware {
    companion object {
        @Volatile
        var activeHeaders: Map<String, String> = emptyMap()
        @Volatile
        var currentMediaId: String? = null
    }

    private lateinit var ctx: Context
    private val main = Handler(Looper.getMainLooper())
    private var processor = ZenFxProcessor()
    private var player: ExoPlayer? = null
    private var fadePlayer: ExoPlayer? = null
    private var sourceFactory: MediaSource.Factory? = null
    private var events: EventChannel.EventSink? = null
    private var spectrumSink: EventChannel.EventSink? = null
    private var textureRegistry: TextureRegistry? = null
    private var videoTextureEntry: TextureRegistry.SurfaceTextureEntry? = null
    private var videoSurface: Surface? = null
    private var pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var videoJob: Job? = null
    private val videoIds = ConcurrentHashMap.newKeySet<String>() // next tracks that want video
    @Volatile private var isCurrentVideo: Boolean = false
    @Volatile private var normalizeVolume: Boolean = false
    @Volatile private var currentSongLoudnessDb: Double? = null
    @Volatile private var retriedId: String? = null
    private val playGeneration = AtomicInteger(0)
    private val nextGeneration = AtomicInteger(0)
    private var lastDuration = -1L
    private var pending = PlaybackParameters(1f, 1f)

    // ───────────────── CROSSFADE ENGINE ─────────────────
    private val XF_LEAD_MS = 2200L                 // how early Dart is told to arm
    @Volatile private var xfConfigMs = 0L
    @Volatile private var xfStyle = "smooth"
    @Volatile private var xfBpm = 0f
    private var xfFx = XfFxProcessor()
    @Volatile private var userVol = 1f
    private var dueSentFor: String? = null
    private var xf: Xf? = null

    private class Xf(
        val out: ExoPlayer?, val inn: ExoPlayer, val style: String, val ms: Long,
        val outFx: XfFxProcessor?, val inFx: XfFxProcessor, val bpm: Float,
    ) {
        var started = false; var elapsed = 0L; var last = 0L; var lastRate = 0L
        var outSpeed = 1f; var inSpeed = 1f
    }

    private fun ss(x: Float): Float { val v = x.coerceIn(0f, 1f); return v * v * (3f - 2f * v) }

    private fun lerpF(a: Float, b: Float, t: Float) = a + (b - a) * t.coerceIn(0f, 1f)
    private fun logF(a: Float, b: Float, t: Float) =
        (a * (b / a).toDouble().pow(t.coerceIn(0f, 1f).toDouble())).toFloat()

    /** Audible dry gain [out, in]. KEEP IDENTICAL to CrossfadeCurves.gains in Dart. */
    private fun xfGains(style: String, f: Float): FloatArray {
        val h = (PI / 2).toFloat()
        return when (style) {
            "linear" -> floatArrayOf(1f - f, f)
            "s_curve", "rnb_glide", "hp_riser" -> { val e = ss(f); floatArrayOf(cos(e * h), sin(e * h)) }
            "dj_blend", "bass_swap", "stutter_gate" -> {
                val i = ss(f / 0.45f); val o = 1f - ss((f - 0.55f) / 0.45f)
                val n = sqrt(i * i + o * o); val g = if (n > 1f) 1f / n else 1f
                floatArrayOf(o * g, i * g)
            }
            "dip" -> floatArrayOf(1f - ss(f / 0.55f), ss((f - 0.45f) / 0.55f))
            "turntable" -> floatArrayOf((1f - f) * (1f - f), sin(ss((f - 0.1f) / 0.9f) * h))
            "filter_sweep" -> floatArrayOf(1f - ss((f - 0.35f) / 0.65f), ss(f / 0.65f))
            "echo_out" -> floatArrayOf(1f - ss(f / 0.5f), ss((f - 0.3f) / 0.5f))
            "reverb_wash" -> floatArrayOf(1f - ss(f / 0.6f), ss((f - 0.3f) / 0.6f))
            "tape_stop" -> floatArrayOf(1f - ss((f - 0.55f) / 0.45f), ss((f - 0.4f) / 0.4f))
            "spin_up" -> floatArrayOf(1f - ss(f / 0.7f), ss(f / 0.6f))
            "slam_cut" -> floatArrayOf(1f - ss((f - 0.46f) / 0.06f), ss((f - 0.47f) / 0.04f))
            else -> floatArrayOf(cos(f * h), sin(f * h))   // smooth, radio_tune, lofi_dive, flanger_sweep, auto
        }
    }

    /** Every effect knob for one side at progress f. */
    private fun xfPlan(style: String, f: Float, out: Boolean, bpm: Float): FxPlan {
        val p = FxPlan()
        val g = xfGains(style, f)[if (out) 0 else 1]
        p.vol = g
        val beat = if (bpm in 60f..200f) 60000f / bpm else 500f
        val tail = if (f < 0.8f) 1f else 1f - ss((f - 0.8f) / 0.2f)   // lets echo/reverb ring out
        when (style) {
            "rnb_glide" -> { if (out) p.lp = logF(18000f, 450f, ss(f)) else p.hp = logF(1600f, 20f, ss(f)) }
            "bass_swap" -> { p.lowDb = if (out) -30f * ss((f - 0.45f) / 0.1f) else -30f * (1f - ss((f - 0.5f) / 0.1f)) }
            "filter_sweep" -> {
                if (out) { p.lp = logF(20000f, 180f, ss(f / 0.9f)); p.q = 2.2f }
                else { p.hp = logF(3000f, 20f, ss(f / 0.9f)); p.q = 1.4f }
            }
            "hp_riser" -> { if (out) p.hp = logF(20f, 700f, ss(f)) else { p.hp = logF(4500f, 20f, ss(f)); p.q = 1.2f } }
            "echo_out" -> if (out) { p.vol = tail; p.dry = g; p.echo = 0.65f * ss(f / 0.25f); p.fb = 0.55f; p.echoMs = beat * 0.75f }
            "reverb_wash" -> {
                if (out) { p.vol = tail; p.dry = g; p.verb = 0.75f * ss(f / 0.4f); p.lp = logF(20000f, 3500f, ss(f)) }
                else p.hp = logF(1800f, 20f, ss((f - 0.3f) / 0.5f))
            }
            "tape_stop" -> if (out) { val t = (f / 0.7f).coerceIn(0f, 1f); p.speed = 1f - 0.85f * t * t; p.lp = logF(20000f, 900f, t) }
            "turntable" -> if (out) p.speed = 1f - 0.5f * ss(f / 0.9f)
            "spin_up" -> if (!out) { p.speed = lerpF(0.55f, 1f, ss(f / 0.6f)); p.lp = logF(1500f, 20000f, ss(f / 0.7f)) }
            "stutter_gate" -> if (out) { p.gateHz = (1000f / beat) * lerpF(2f, 8f, f); p.gateDepth = lerpF(0.3f, 1f, f) }
            "lofi_dive" -> { if (out) { p.hold = 1 + (f * 14f).toInt(); p.lp = logF(20000f, 1800f, f) } else p.lp = logF(2200f, 20000f, ss(f)) }
            "flanger_sweep" -> { p.flange = if (out) ss(f / 0.8f) else 1f - ss(f) }
            "radio_tune" -> {
                if (out) { p.hp = logF(20f, 500f, ss(f)); p.lp = logF(20000f, 2800f, ss(f)) }
                else { p.hp = logF(500f, 20f, ss(f)); p.lp = logF(2800f, 20000f, ss(f)) }
            }
            "slam_cut" -> if (out) { p.vol = tail; p.dry = g; p.verb = 0.7f * ss((f - 0.4f) / 0.1f) }
        }
        return p
    }

    private fun xfHolding() = xf?.started == false   // new player prepared but fade not begun

    private val xfTick = object : Runnable {
        override fun run() {
            val x = xf ?: return
            val now = SystemClock.uptimeMillis()
            val o = x.out
            if (!x.started) {
                val rem = if (o != null && o.duration != C.TIME_UNSET) o.duration - o.currentPosition else 0L
                val ready = x.inn.playbackState == Player.STATE_READY
                val go = rem <= x.ms && (ready || rem <= x.ms * 85 / 100)
                if (!go) {
                    val waitMs = if (rem > x.ms) (rem - x.ms).coerceIn(20L, 250L) else 20L
                    main.postDelayed(this, waitMs)
                    return
                }
                x.started = true; x.last = now
                x.inn.volume = 0f
                x.inn.playWhenReady = true
                emitState()
                emit(mapOf("type" to "crossfade", "phase" to "start", "ms" to x.ms, "style" to x.style))
            }
            val dt = now - x.last; x.last = now
            if (x.inn.playWhenReady) x.elapsed += dt
            val f = (x.elapsed.toFloat() / x.ms).coerceIn(0f, 1f)
            val po = xfPlan(x.style, f, true, x.bpm)
            val pi = xfPlan(x.style, f, false, x.bpm)
            o?.volume = (userVol * po.vol).coerceIn(0f, 1f)
            x.inn.volume = (userVol * pi.vol).coerceIn(0f, 1f)
            x.outFx?.apply(po); x.inFx.apply(pi)
            if (now - x.lastRate >= 90) {
                x.lastRate = now
                if (o != null && abs(po.speed - x.outSpeed) > 0.01f) {
                    x.outSpeed = po.speed
                    o.playbackParameters = PlaybackParameters(pending.speed * po.speed, pending.pitch * po.speed)
                }
                if (abs(pi.speed - x.inSpeed) > 0.01f) {
                    x.inSpeed = pi.speed
                    x.inn.playbackParameters = PlaybackParameters(pending.speed * pi.speed, pending.pitch * pi.speed)
                }
            }
            if (f >= 1f) finishXfade() else main.postDelayed(this, 16)
        }
    }

    private fun safeReleasePlayer(p: ExoPlayer?) {
        if (p == null) return
        try {
            if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                p.clearVideoSurface()
            }
            if (p.isCommandAvailable(Player.COMMAND_CHANGE_MEDIA_ITEMS)) {
                p.clearMediaItems()
            }
            if (p.playbackState != Player.STATE_IDLE && p.isCommandAvailable(Player.COMMAND_STOP)) {
                p.stop()
            }
            p.release()
        } catch (_: Throwable) {
            // Defensive catch to prevent debugger break-on-exception pauses
        }
    }

    private fun finishXfade() {
        val x = xf ?: return
        main.removeCallbacks(xfTick)
        safeReleasePlayer(x.out)
        if (fadePlayer === x.out) fadePlayer = null
        x.inFx.resetFx()
        val inn = x.inn
        if (inn.isCommandAvailable(Player.COMMAND_SET_SPEED_AND_PITCH)) {
            inn.playbackParameters = pending
        }
        if (inn.isCommandAvailable(Player.COMMAND_SET_VOLUME)) {
            inn.volume = userVol
        }
        xf = null
        emit(mapOf("type" to "crossfade", "phase" to "end"))
    }

    private fun cancelXfade() {
        main.removeCallbacks(xfTick)
        val had = xf != null
        safeReleasePlayer(fadePlayer)
        fadePlayer = null
        xf = null
        xfFx.resetFx()
        val p = player
        if (p != null) {
            if (p.isCommandAvailable(Player.COMMAND_SET_SPEED_AND_PITCH)) {
                p.playbackParameters = pending
            }
            if (p.isCommandAvailable(Player.COMMAND_SET_VOLUME)) {
                p.volume = userVol
            }
        }
        if (had) emit(mapOf("type" to "crossfade", "phase" to "end"))
    }

    /** Replaces `p.prepare(); p.playWhenReady = true` everywhere. */
    private fun beginPlayback(p: ExoPlayer) {
        p.prepare()
        if (xf?.inn === p) {                       // crossfade: buffer silently, xfTick starts it on time
            p.playWhenReady = false
            main.removeCallbacks(xfTick); main.post(xfTick)
        } else p.playWhenReady = true
    }

    @Volatile
    private var isDueTickerActive: Boolean = false

    // Works in background too: tells Dart "arm the crossfade now".
    private val dueTicker = object : Runnable {
        override fun run() {
            val p = player
            val id = currentMediaId
            if (p != null && xfConfigMs > 0 && xf == null && p.isPlaying && id != null && dueSentFor != id) {
                val d = p.duration
                if (d != C.TIME_UNSET && d > xfConfigMs * 2 + 2000) {
                    val rem = d - p.currentPosition
                    if (rem in 1..(xfConfigMs + XF_LEAD_MS)) {
                        dueSentFor = id
                        emit(mapOf("type" to "crossfadeDue", "mediaId" to id, "remainingMs" to rem))
                    }
                }
            }
            if (player?.isPlaying == true && xfConfigMs > 0) {
                main.postDelayed(this, 250)
            } else {
                isDueTickerActive = false
            }
        }
    }

    private fun updateDueTickerState() {
        val active = player?.isPlaying == true && xfConfigMs > 0
        if (active) {
            if (!isDueTickerActive) {
                isDueTickerActive = true
                main.removeCallbacks(dueTicker)
                main.post(dueTicker)
            }
        } else {
            isDueTickerActive = false
            main.removeCallbacks(dueTicker)
        }
    }

    @Volatile
    private var isAppInForeground: Boolean = true
    @Volatile
    private var isTickerScheduled: Boolean = false

    private val ticker = object : Runnable {
        override fun run() {
            val p = player
            val isSuppressed = p?.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
            val active = p != null && !isSuppressed && p.playWhenReady && (
                p.isPlaying || p.playbackState == Player.STATE_BUFFERING
            )
            if (active && isAppInForeground) {
                emitProgressSnapshot(p)
                main.postDelayed(this, 500L)
                isTickerScheduled = true
            } else {
                if (active) {
                    emitProgressSnapshot(p)
                }
                isTickerScheduled = false
            }
        }
    }

    private fun emitProgressSnapshot(p: ExoPlayer) {
        emit(mapOf("type" to "position", "ms" to p.currentPosition.coerceAtLeast(0L)))
        val d = p.duration
        if (d != C.TIME_UNSET && d > 0L && d != lastDuration) {
            lastDuration = d
            emit(mapOf("type" to "duration", "ms" to d))
        }
    }

    private fun startTicker() {
        if (!isTickerScheduled) {
            isTickerScheduled = true
            main.removeCallbacks(ticker)
            main.post(ticker)
        }
    }

    private var bufferStallRunnable: Runnable? = null

    private fun checkStallWatchdog(p: ExoPlayer) {
        bufferStallRunnable?.let { main.removeCallbacks(it) }
        bufferStallRunnable = null

        if (p.playbackState == Player.STATE_BUFFERING && p.playWhenReady) {
            val r = Runnable {
                val curP = player ?: return@Runnable
                if (curP === p && curP.playbackState == Player.STATE_BUFFERING && curP.playWhenReady) {
                    Log.w("ZenAudioPlugin", "Buffer stall detected at pos=${curP.currentPosition}ms! Recovering...")
                    val pos = curP.currentPosition.coerceAtLeast(0L)
                    curP.seekTo(pos)
                }
            }
            bufferStallRunnable = r
            main.postDelayed(r, 6500L) // 6.5s stall threshold
        }
    }

    private fun stopTicker() {
        isTickerScheduled = false
        main.removeCallbacks(ticker)
        bufferStallRunnable?.let { main.removeCallbacks(it) }
        bufferStallRunnable = null
    }

    private fun updateTickerState() {
        val p = player
        val isSuppressed = p?.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
        val active = p != null && !isSuppressed && p.playWhenReady && (
            p.isPlaying || p.playbackState == Player.STATE_BUFFERING
        )
        if (active && isAppInForeground) {
            startTicker()
        } else {
            stopTicker()
        }
        updateSpectrumTickerState()
        updateDueTickerState()
    }

    private fun safeReleaseVideoTexture() {
        val p = player
        if (p != null && p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
            try {
                p.clearVideoSurface()
            } catch (_: Throwable) {}
        }
        val surf = videoSurface
        videoSurface = null
        if (surf != null) {
            try {
                if (surf.isValid) {
                    surf.release()
                }
            } catch (_: Throwable) {}
        }
        val entry = videoTextureEntry
        videoTextureEntry = null
        if (entry != null) {
            try {
                entry.release()
            } catch (_: Throwable) {}
        }
    }

    private fun getOrCreateVideoTextureId(): Long {
        val existing = videoTextureEntry
        val surf = videoSurface
        if (existing != null && surf != null && surf.isValid) {
            return existing.id()
        }
        safeReleaseVideoTexture()

        val entry = textureRegistry?.createSurfaceTexture() ?: return -1L
        val surface = Surface(entry.surfaceTexture())
        videoTextureEntry = entry
        videoSurface = surface
        val id = entry.id()
        emit(mapOf("type" to "videoTextureId", "id" to id))
        return id
    }

    private fun attachVideoSurface(p: ExoPlayer) {
        val entry = videoTextureEntry
        val surf = videoSurface
        if (entry == null || surf == null || !surf.isValid) {
            getOrCreateVideoTextureId()
        }
        val surface = videoSurface
        if (surface != null && surface.isValid) {
            if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                try {
                    p.setVideoSurface(surface)
                } catch (_: Throwable) {}
            }
            val vs = p.videoSize
            if (vs.width > 0 && vs.height > 0) {
                var w = vs.width
                var h = vs.height
                if (vs.unappliedRotationDegrees == 90 || vs.unappliedRotationDegrees == 270) {
                    val tmp = w
                    w = h
                    h = tmp
                }
                if (vs.pixelWidthHeightRatio > 0f && vs.pixelWidthHeightRatio != 1f) {
                    w = (w * vs.pixelWidthHeightRatio).toInt()
                }
                emit(mapOf("type" to "videoSize", "width" to w, "height" to h))
            }
        }
    }

    private fun releaseVideoTexture() {
        safeReleaseVideoTexture()
    }

    private fun handleVideoViewport(state: String, widthPx: Int, heightPx: Int) {
        val p = player ?: return
        when (state) {
            "hidden" -> {
                // Detach surface to pause video decoding pipeline while audio continues seamlessly
                if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                    try {
                        p.clearVideoSurface()
                    } catch (_: Throwable) {}
                }
            }
            "mini", "docked" -> {
                attachVideoSurface(p)
                if (p.isCommandAvailable(Player.COMMAND_SET_TRACK_SELECTION_PARAMETERS)) {
                    try {
                        val maxW = if (widthPx > 0) widthPx else 640
                        val maxH = if (heightPx > 0) heightPx else 480
                        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                            .setMaxVideoSize(maxW, maxH)
                            .build()
                    } catch (_: Throwable) {}
                }
            }
            "full" -> {
                attachVideoSurface(p)
                if (p.isCommandAvailable(Player.COMMAND_SET_TRACK_SELECTION_PARAMETERS)) {
                    try {
                        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                            .clearVideoSizeConstraints()
                            .build()
                    } catch (_: Throwable) {}
                }
            }
        }
    }

    @Volatile
    private var isSpectrumTickerActive: Boolean = false

    private val spectrumTicker = object : Runnable {
        override fun run() {
            val sink = spectrumSink ?: return
            val live = player?.isPlaying == true
            if (!isAppInForeground || !live) {
                isSpectrumTickerActive = false
                return
            }
            val b = processor.bands
            try {
                sink.success(List(b.size) { b[it].toDouble() })
            } catch (_: Throwable) {}
            main.postDelayed(this, 33)
        }
    }

    private fun updateSpectrumTickerState() {
        val active = spectrumSink != null && isAppInForeground && player?.isPlaying == true
        if (active) {
            if (!isSpectrumTickerActive) {
                isSpectrumTickerActive = true
                main.removeCallbacks(spectrumTicker)
                main.post(spectrumTicker)
            }
        } else {
            isSpectrumTickerActive = false
            main.removeCallbacks(spectrumTicker)
        }
    }

    override fun onAttachedToEngine(b: FlutterPlugin.FlutterPluginBinding) {
        ctx = b.applicationContext
        textureRegistry = b.textureRegistry
        pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        YtEngine.init(ctx)

        MethodChannel(b.binaryMessenger, "zenify/audio").setMethodCallHandler(this)
        EventChannel(b.binaryMessenger, "zenify/audio/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink?) { events = sink }
            override fun onCancel(args: Any?) { events = null }
        })
        EventChannel(b.binaryMessenger, "zenify/audio/spectrum").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink?) {
                spectrumSink = sink
                processor.hasSpectrumListener = true
                updateSpectrumTickerState()
            }
            override fun onCancel(args: Any?) {
                spectrumSink = null
                processor.hasSpectrumListener = false
                updateSpectrumTickerState()
            }
        })
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        stopTicker()
        main.removeCallbacksAndMessages(null)
        pluginScope.cancel()
        releaseVideoTexture()
        textureRegistry = null
        cancelXfade()
        safeReleasePlayer(player)
        player = null
        sourceFactory = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        isAppInForeground = true
    }

    override fun onDetachedFromActivityForConfigChanges() {}

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        isAppInForeground = true
    }

    override fun onDetachedFromActivity() {
        isAppInForeground = false
    }

    private fun emit(m: Map<String, Any?>) {
        try {
            events?.success(m)
        } catch (_: Throwable) {}
    }

    private fun emitState() {
        if (xfHolding()) return
        val p = player ?: return
        val isSuppressed = p.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
        val s = when {
            p.playbackState == Player.STATE_ENDED -> "completed"
            p.playbackState == Player.STATE_IDLE -> "stopped"
            isSuppressed || !p.playWhenReady -> "paused"
            p.isPlaying -> "playing"
            p.playWhenReady && p.playbackState == Player.STATE_BUFFERING && !isSuppressed -> "playing"
            else -> "paused"
        }
        val isBuffering = p.playbackState == Player.STATE_BUFFERING && !isSuppressed && p.playWhenReady
        emit(mapOf("type" to "state", "value" to s, "buffering" to isBuffering))
    }

    private fun resolveMediaUri(mediaId: String, isVideo: Boolean = false): Uri {
        return if (mediaId.startsWith("/") || mediaId.startsWith("file://")) {
            Uri.parse(if (mediaId.startsWith("file://")) mediaId else "file://$mediaId")
        } else {
            val q = YtEngine.currentQuality
            val vq = YtEngine.videoMaxHeight
            val sep = if (mediaId.contains("?")) "&" else "?"
            val uriStr = if (isVideo) "zenify://video/$mediaId${sep}q=$q&vq=$vq" else "zenify://media/$mediaId${sep}q=$q"
            Uri.parse(uriStr)
        }
    }

    private fun ensurePlayer(): ExoPlayer {
        player?.let { return it }
        val renderersFactory = object : DefaultRenderersFactory(ctx) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
            ): AudioSink? {
                return DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(false)
                    .setEnableAudioTrackPlaybackParams(false) // speed and pitch use Sonic, after FX
                    .setAudioProcessors(arrayOf<AudioProcessor>(processor, xfFx))
                    .build()
            }
        }

        val dataSourceFactory = YtDataSource.createDataSourceFactory(ctx) { videoId, resolved ->
            val loudness = resolved.loudnessDb
            currentSongLoudnessDb = loudness
            processor.setLoudnessDb(if (normalizeVolume) loudness else 0.0)
            main.post {
                emit(mapOf(
                    "type" to "resolved",
                    "id" to videoId,
                    "client" to resolved.client,
                    "ttlMs" to (resolved.expiresInSec * 1000L),
                    "fromCache" to false,
                    "loudnessDb" to loudness
                ))
            }
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)
        sourceFactory = mediaSourceFactory

        // Buffer control optimized for video streams & instant seeking: 4s buffer before playback, 6s on rebuffer
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 20_000,
                /* maxBufferMs = */ 60_000,
                /* bufferForPlaybackMs = */ 4_000,
                /* bufferForPlaybackAfterRebufferMs = */ 6_000
            )
            .setBackBuffer(10_000, false)
            .setTargetBufferBytes(128 * 1024 * 1024)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        val p = ExoPlayer.Builder(ctx, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()

        try {
            // Disable hardware DSP offload so AudioProcessor (Studio FX) and progressive
            // container seeking remain sample-accurate across all devices and streams.
            val offloadPrefs = TrackSelectionParameters.AudioOffloadPreferences.Builder()
                .setAudioOffloadMode(TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED)
                .build()
            if (p.isCommandAvailable(Player.COMMAND_SET_TRACK_SELECTION_PARAMETERS)) {
                p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                    .setAudioOffloadPreferences(offloadPrefs)
                    .build()
            }
        } catch (e: Throwable) {
            Log.d("ZenAudioPlugin", "AudioOffloadPreferences not supported: ${e.message}")
        }

        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (p !== player) return
                Log.w("ZenAudioPlugin", "state=$state pos=${p.currentPosition} buffered=${p.bufferedPosition}")
                checkStallWatchdog(p)
                emitState()
                if (state == Player.STATE_READY) {
                    emitProgressSnapshot(p)
                }
                updateTickerState()
            }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (p !== player) return
                Log.w("ZenAudioPlugin", "playWhenReady=$playWhenReady reason=$reason")
                checkStallWatchdog(p)
                if (!playWhenReady) {
                    stopTicker()
                }
                emitState()
                emitProgressSnapshot(p)
                updateTickerState()
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (p !== player) return
                if (!isPlaying && p.playbackState != Player.STATE_BUFFERING) {
                    stopTicker()
                }
                emitState()
                emitProgressSnapshot(p)
                updateTickerState()
            }
            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                if (p !== player) return
                if (playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    p.playWhenReady = false
                    stopTicker()
                }
                emitState()
                emitProgressSnapshot(p)
                updateTickerState()
            }
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (p !== player) return
                var w = videoSize.width
                var h = videoSize.height
                if (videoSize.unappliedRotationDegrees == 90 || videoSize.unappliedRotationDegrees == 270) {
                    val tmp = w
                    w = h
                    h = tmp
                }
                if (videoSize.pixelWidthHeightRatio > 0f && videoSize.pixelWidthHeightRatio != 1f) {
                    w = (w * videoSize.pixelWidthHeightRatio).toInt()
                }
                emit(mapOf(
                    "type" to "videoSize",
                    "width" to w,
                    "height" to h,
                ))
            }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                if (p !== player) return
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    emit(mapOf("type" to "autoTransition", "mediaId" to (mediaItem?.mediaId ?: "")))
                    // Remove finished media items so that the active item is always at index 0
                    val curP = player
                    if (curP != null && curP.isCommandAvailable(Player.COMMAND_CHANGE_MEDIA_ITEMS)) {
                        val cur = curP.currentMediaItemIndex
                        if (cur > 0 && cur <= curP.mediaItemCount) {
                            curP.removeMediaItems(0, cur)
                        }
                    }
                }
                lastDuration = -1L
                val isVideoItem = isCurrentVideo || mediaItem?.localConfiguration?.tag == "video"
                if (isVideoItem) {
                    attachVideoSurface(p)
                } else {
                    if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                        try {
                            p.clearVideoSurface()
                        } catch (_: Throwable) {}
                    }
                    emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
                }
                emit(mapOf("type" to "position", "ms" to p.currentPosition.coerceAtLeast(0L)))
                val d = p.duration
                if (d != C.TIME_UNSET && d > 0L) {
                    lastDuration = d
                    emit(mapOf("type" to "duration", "ms" to d))
                }
                currentMediaId = mediaItem?.mediaId
                retriedId = null
                val id = mediaItem?.mediaId
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && id != null && videoIds.remove(id) && !isVideoItem) {
                    startVideoUpgrade(id, mediaItem.mediaMetadata)
                }
                emitState()
            }
            override fun onPlayerError(error: PlaybackException) {
                if (p !== player) return
                stopTicker()
                val id = currentMediaId
                val is403 = error.message?.contains("403") == true || error.errorCodeName.contains("BAD_HTTP_STATUS")
                val retryable = error.errorCode == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ||
                    error.errorCode == PlaybackException.ERROR_CODE_IO_UNSPECIFIED ||
                    error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
                    error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
                    is403
                if (id != null && retryable && retriedId != id) {
                    retriedId = id
                    val client = YtEngine.urlCache.findAnyForVideo(id)?.client ?: "IOS"
                    YtEngine.markClientFailed(id, client)
                    YtDataSource.evictMedia(ctx, id)
                    val pos = p.currentPosition.coerceAtLeast(0L)
                    if (isCurrentVideo) {
                        attachVideoSurface(p)
                        p.setMediaItem(MediaItem.Builder()
                            .setMediaId(id)
                            .setCustomCacheKey(id)
                            .setUri(resolveMediaUri(id, true))
                            .setMediaMetadata(p.mediaMetadata)
                            .setTag("video")
                            .build(), pos)
                    } else {
                        p.setMediaItem(audioItem(id, p.mediaMetadata), pos)
                    }
                    p.prepare()
                    p.playWhenReady = true
                    return
                }
                currentMediaId?.let { failedId ->
                    YtDataSource.evictMedia(ctx, failedId)
                }
                Log.w("ZenAudioPlugin", "playback error ${error.errorCodeName}")
                emit(mapOf(
                    "type" to "error",
                    "message" to (error.message ?: "playback error"),
                    "errorCode" to error.errorCode,
                    "errorCodeName" to error.errorCodeName,
                    "is403" to is403
                ))
            }
        })
        p.playbackParameters = pending
        player = p
        return p
    }

    private fun prepareCrossfade(crossfadeMs: Long): ExoPlayer {
        cancelXfade()
        val old = player
        val oldFx = xfFx
        // CRITICAL: stop the old player from reacting to audio-focus loss when the new one takes focus
        old?.setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
            /* handleAudioFocus = */ false
        )
        fadePlayer = old
        player = null

        val newProcessor = ZenFxProcessor()
        newProcessor.params = processor.params
        newProcessor.setLoudnessDb(processor.loudnessDb)
        newProcessor.hasSpectrumListener = processor.hasSpectrumListener
        processor = newProcessor
        xfFx = XfFxProcessor()

        val np = ensurePlayer()
        np.volume = 0f
        val rem = if (old != null && old.duration != C.TIME_UNSET)
            (old.duration - old.currentPosition).coerceAtLeast(0L) else crossfadeMs
        xf = Xf(old, np, xfStyle, min(crossfadeMs, rem).coerceAtLeast(250L), oldFx, xfFx, xfBpm)
        return np
    }

    private fun audioItem(id: String, md: MediaMetadata) = MediaItem.Builder()
        .setMediaId(id).setCustomCacheKey(id).setUri(resolveMediaUri(id, false))
        .setMediaMetadata(md).setTag("audio").build()

    private fun startVideoUpgrade(mediaId: String, md: MediaMetadata) {
        val gen = playGeneration.get()
        videoJob?.cancel()
        videoJob = pluginScope.launch {
            val r = try {
                withTimeoutOrNull(20_000) { YtEngine.resolve(mediaId, wantVideo = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w("ZenAudioPlugin", "Video upgrade resolve failed for $mediaId: ${e.message}")
                null
            }
            withContext(Dispatchers.Main) {
                val p = player ?: return@withContext
                if (gen != playGeneration.get() || currentMediaId != mediaId) return@withContext
                val vu = r?.videoUrl
                val mf = sourceFactory
                if (r == null || vu.isNullOrBlank() || mf == null) {
                    emit(mapOf("type" to "videoUnavailable")); return@withContext
                }
                if ((r.videoWidth ?: 0) > 0 && (r.videoHeight ?: 0) > 0)
                    emit(mapOf("type" to "videoSizeHint", "width" to r.videoWidth, "height" to r.videoHeight))

                fun item(uri: Uri, key: String?) = MediaItem.Builder().setMediaId(mediaId)
                    .apply { if (key != null) setCustomCacheKey(key) }
                    .setUri(uri).setMediaMetadata(md).setTag("video").build()

                val src: MediaSource = when {
                    r.isHls -> {
                        activeHeaders = r.headers
                        mf.createMediaSource(MediaItem.Builder().setMediaId(mediaId).setUri(Uri.parse(vu))
                            .setMimeType(androidx.media3.common.MimeTypes.APPLICATION_M3U8)
                            .setMediaMetadata(md).setTag("video").build())
                    }
                    vu != r.url -> MergingMediaSource(false, true,
                        mf.createMediaSource(item(Uri.parse("zenify://video/$mediaId"), "$mediaId#v")),
                        mf.createMediaSource(item(Uri.parse("zenify://media/$mediaId?v=1"), mediaId)))
                    else -> mf.createMediaSource(item(Uri.parse("zenify://video/$mediaId"), "$mediaId#v"))
                }
                val pos = p.currentPosition; val wasPlaying = p.playWhenReady
                attachVideoSurface(p)
                p.setMediaSource(src, pos)
                p.prepare()
                p.playWhenReady = wasPlaying
            }
        }
    }

    private fun playMediaId(
        mediaId: String,
        title: String?,
        artist: String?,
        artworkUrl: String?,
        startMs: Long?,
        loudnessDb: Double? = null,
        isVideo: Boolean = false,
        crossfadeMs: Long = 0L
    ) {
        dueSentFor = null
        playGeneration.incrementAndGet()
        currentMediaId = mediaId
        isCurrentVideo = isVideo
        if (loudnessDb != null) currentSongLoudnessDb = loudnessDb
        processor.setLoudnessDb(if (normalizeVolume) currentSongLoudnessDb else 0.0)
        val shouldCrossfade = crossfadeMs > 0 && player != null && (player?.isPlaying == true || player?.playbackState == Player.STATE_READY)
        val p = if (shouldCrossfade) {
            prepareCrossfade(crossfadeMs)
        } else {
            cancelXfade()
            ensurePlayer()
        }
        val metadata = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
            .build()

        if (!isVideo) {
            videoJob?.cancel()
            retriedId = null
            if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                try {
                    p.clearVideoSurface()
                } catch (_: Throwable) {}
            }
            emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
            lastDuration = -1L
            p.setMediaItem(audioItem(mediaId, metadata), startMs ?: 0L)
            beginPlayback(p)
            return
        }

        videoJob?.cancel()
        retriedId = null
        attachVideoSurface(p)
        emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
        lastDuration = -1L

        val effectiveVq = YtEngine.videoMaxHeight.coerceAtMost(1080)
        val cached = YtEngine.urlCache["$mediaId#video#${effectiveVq}p#${YtEngine.currentQuality}"]
        val mf = sourceFactory
        if (cached != null && !cached.videoUrl.isNullOrBlank() && mf != null) {
            val vu = cached.videoUrl
            val src: MediaSource = if (vu != cached.url) {
                MergingMediaSource(
                    false,
                    true,
                    mf.createMediaSource(MediaItem.Builder().setMediaId(mediaId).setUri(Uri.parse("zenify://video/$mediaId")).setCustomCacheKey("$mediaId#v").setMediaMetadata(metadata).setTag("video").build()),
                    mf.createMediaSource(MediaItem.Builder().setMediaId(mediaId).setUri(Uri.parse("zenify://media/$mediaId?v=1")).setCustomCacheKey(mediaId).setMediaMetadata(metadata).setTag("video").build())
                )
            } else {
                mf.createMediaSource(MediaItem.Builder().setMediaId(mediaId).setUri(Uri.parse("zenify://video/$mediaId")).setCustomCacheKey("$mediaId#v").setMediaMetadata(metadata).setTag("video").build())
            }
            p.setMediaSource(src, startMs ?: 0L)
            beginPlayback(p)
            return
        }

        p.setMediaItem(audioItem(mediaId, metadata), startMs ?: 0L) // audio starts immediately
        beginPlayback(p)
        startVideoUpgrade(mediaId, metadata) // video attaches when ready
    }

    private fun playUrl(
        url: String,
        headers: Map<String, String>? = null,
        mediaId: String? = null,
        videoUrl: String? = null,
        title: String? = null,
        artist: String? = null,
        artworkUrl: String? = null,
        startMs: Long? = null,
        loudnessDb: Double? = null,
        isVideo: Boolean = false,
        crossfadeMs: Long = 0L
    ) {
        dueSentFor = null
        playGeneration.incrementAndGet()
        currentMediaId = mediaId
        isCurrentVideo = isVideo || !videoUrl.isNullOrBlank()
        if (loudnessDb != null) currentSongLoudnessDb = loudnessDb
        processor.setLoudnessDb(if (normalizeVolume) currentSongLoudnessDb else 0.0)
        val shouldCrossfade = crossfadeMs > 0 && player != null && (player?.isPlaying == true || player?.playbackState == Player.STATE_READY)
        val p = if (shouldCrossfade) {
            prepareCrossfade(crossfadeMs)
        } else {
            cancelXfade()
            ensurePlayer()
        }
        if (headers != null) {
            activeHeaders = headers
        }
        val metadata = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
            .build()
        lastDuration = -1L

        val mf = sourceFactory
        val wantsVideo = isVideo || !videoUrl.isNullOrBlank()
        if (!videoUrl.isNullOrBlank() && videoUrl != url && mf != null) {
            attachVideoSurface(p)
            emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
            val videoItem = MediaItem.Builder()
                .setUri(videoUrl)
                .apply { if (!mediaId.isNullOrBlank()) setCustomCacheKey("$mediaId#v") }
                .setMediaMetadata(metadata)
                .setTag("video")
                .build()
            val audioItem = MediaItem.Builder()
                .setUri(url)
                .apply { if (!mediaId.isNullOrBlank()) setCustomCacheKey(mediaId) }
                .setMediaMetadata(metadata)
                .setTag("video")
                .build()
            val merged = MergingMediaSource(
                false,
                true,
                mf.createMediaSource(videoItem),
                mf.createMediaSource(audioItem)
            )
            p.setMediaSource(merged, startMs ?: 0L)
            beginPlayback(p)
        } else {
            if (wantsVideo) {
                attachVideoSurface(p)
            } else {
                if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                    try {
                        p.clearVideoSurface()
                    } catch (_: Throwable) {}
                }
            }
            emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
            val mediaItem = MediaItem.Builder()
                .setUri(url)
                .apply { if (!mediaId.isNullOrBlank()) setCustomCacheKey(if (wantsVideo) "$mediaId#v" else mediaId) }
                .setMediaMetadata(metadata)
                .setTag(if (wantsVideo) "video" else "audio")
                .build()
            p.setMediaItem(mediaItem, startMs ?: 0L)
            beginPlayback(p)
        }
    }

    private fun setNextMediaId(
        mediaId: String?,
        title: String? = null,
        artist: String? = null,
        artworkUrl: String? = null,
        isVideo: Boolean = false
    ) {
        nextGeneration.incrementAndGet()
        val p = player ?: return
        if (!p.isCommandAvailable(Player.COMMAND_CHANGE_MEDIA_ITEMS)) return
        val curIndex = p.currentMediaItemIndex
        val nextIndex = (curIndex + 1).coerceAtLeast(0)
        if (mediaId.isNullOrBlank()) {
            if (p.mediaItemCount > nextIndex) {
                p.removeMediaItems(nextIndex, p.mediaItemCount)
            }
            return
        }
        val metadata = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
            .build()

        if (isVideo) videoIds.add(mediaId) else videoIds.remove(mediaId)
        val mediaItem = audioItem(mediaId, metadata)
        if (nextIndex < p.mediaItemCount) {
            p.replaceMediaItem(nextIndex, mediaItem)
        } else {
            p.addMediaItem(mediaItem)
        }
        YtEngine.prefetch(listOf(mediaId))
    }

    private fun setFx(m: Map<String, Any?>) {
        processor.params = FxParams.from(m)
        val speed = ((m["speed"] as? Number)?.toFloat() ?: 1f).coerceIn(0.5f, 2f)
        val pitch = ((m["pitch"] as? Number)?.toFloat() ?: 1f).coerceIn(0.5f, 2f)
        pending = PlaybackParameters(speed, pitch)
        val p = player
        if (p != null && p.playbackParameters != pending) p.playbackParameters = pending
    }

    @Suppress("UNCHECKED_CAST")
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "play" -> {
                    val mediaId = call.argument<String>("mediaId")
                    val isVideo = call.argument<Boolean>("isVideo") ?: false
                    val crossfadeMs = call.argument<Number>("crossfadeMs")?.toLong() ?: 0L
                    val xfStyleArg = call.argument<String>("crossfadeStyle") ?: call.argument<String>("style")
                    if (!xfStyleArg.isNullOrBlank()) {
                        val parts = xfStyleArg.split('@')
                        xfStyle = parts[0].let { if (it == "auto") "smooth" else it }
                        xfBpm = parts.getOrNull(1)?.toFloatOrNull() ?: xfBpm
                    }
                    if (!mediaId.isNullOrBlank()) {
                        playMediaId(
                            mediaId = mediaId,
                            title = call.argument<String>("title"),
                            artist = call.argument<String>("artist"),
                            artworkUrl = call.argument<String>("artworkUrl"),
                            startMs = call.argument<Number>("startMs")?.toLong(),
                            loudnessDb = call.argument<Number>("loudnessDb")?.toDouble(),
                            isVideo = isVideo,
                            crossfadeMs = crossfadeMs
                        )
                    } else {
                        val url = call.argument<String>("url")
                        val rawHeaders = call.argument<Map<String, Any?>>("headers")
                        val headersMap = rawHeaders?.mapNotNull { (k, v) -> if (v != null) k to v.toString() else null }?.toMap()
                        if (!url.isNullOrBlank()) {
                            playUrl(
                                url = url,
                                headers = headersMap,
                                mediaId = mediaId,
                                videoUrl = call.argument<String>("videoUrl"),
                                title = call.argument<String>("title"),
                                artist = call.argument<String>("artist"),
                                artworkUrl = call.argument<String>("artworkUrl"),
                                startMs = call.argument<Number>("startMs")?.toLong(),
                                loudnessDb = call.argument<Number>("loudnessDb")?.toDouble(),
                                isVideo = isVideo,
                                crossfadeMs = crossfadeMs
                            )
                        }
                    }
                    result.success(null)
                }
                "setNext" -> {
                    val mediaId = call.argument<String>("mediaId")
                    val title = call.argument<String>("title")
                    val artist = call.argument<String>("artist")
                    val artworkUrl = call.argument<String>("artworkUrl")
                    val isVideo = call.argument<Boolean>("isVideo") ?: false
                    setNextMediaId(mediaId, title, artist, artworkUrl, isVideo)
                    result.success(null)
                }
                "setCrossfade" -> {
                    xfConfigMs = call.argument<Number>("ms")?.toLong() ?: 0L
                    val raw = call.argument<String>("style") ?: "smooth"
                    val parts = raw.split('@')
                    xfStyle = parts[0].let { if (it == "auto") "smooth" else it }
                    xfBpm = parts.getOrNull(1)?.toFloatOrNull() ?: 0f
                    updateDueTickerState()
                    result.success(null)
                }
                "prefetch" -> {
                    val mediaIds = call.argument<List<String>>("mediaIds") ?: emptyList()
                    YtEngine.prefetch(mediaIds)
                    result.success(null)
                }
                "prewarm" -> {
                    YtEngine.prewarm()
                    result.success(null)
                }
                "setAudioQuality" -> {
                    val quality = call.argument<String>("quality") ?: "high"
                    YtEngine.currentQuality = quality
                    YtEngine.urlCache.clear()
                    result.success(null)
                }
                "setVideoQuality" -> {
                    val quality = call.argument<String>("quality") ?: "720p"
                    val maxH = when (quality.lowercase()) {
                        "360p" -> 360
                        "480p" -> 480
                        "720p" -> 720
                        "1080p" -> 1080
                        "2k", "1440p" -> 1440
                        "4k", "2160p" -> 2160
                        "8k", "4320p" -> 4320
                        else -> 720
                    }
                    YtEngine.videoMaxHeight = maxH
                    YtEngine.urlCache.clear()
                    result.success(null)
                }
                "clearAllCaches" -> {
                    YtEngine.clearAll(ctx)
                    YtDataSource.clearCache(ctx)
                    result.success(null)
                }
                "pause" -> {
                    val p = player
                    if (p != null && p.isCommandAvailable(Player.COMMAND_PLAY_PAUSE)) p.pause()
                    val fp = fadePlayer
                    if (fp != null && fp.isCommandAvailable(Player.COMMAND_PLAY_PAUSE)) fp.pause()
                    stopTicker()
                    result.success(null)
                }
                "resume" -> {
                    val p = player
                    if (xf?.started != false && p != null && p.isCommandAvailable(Player.COMMAND_PLAY_PAUSE)) {
                        p.play()
                    }
                    val fp = fadePlayer
                    if (fp != null && fp.isCommandAvailable(Player.COMMAND_PLAY_PAUSE)) {
                        fp.play()
                    }
                    updateTickerState()
                    result.success(null)
                }
                "stop" -> {
                    videoJob?.cancel()
                    videoIds.clear()
                    playGeneration.incrementAndGet()
                    nextGeneration.incrementAndGet()
                    currentMediaId = null
                    cancelXfade()
                    val p = player
                    if (p != null) {
                        if (p.playbackState != Player.STATE_IDLE && p.isCommandAvailable(Player.COMMAND_STOP)) {
                            p.stop()
                        }
                        if (p.isCommandAvailable(Player.COMMAND_CHANGE_MEDIA_ITEMS)) {
                            p.clearMediaItems()
                        }
                        if (p.isCommandAvailable(Player.COMMAND_SET_VIDEO_SURFACE)) {
                            try {
                                p.clearVideoSurface()
                            } catch (_: Throwable) {}
                        }
                    }
                    emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
                    stopTicker()
                    result.success(null)
                }
                "seek" -> {
                    dueSentFor = null
                    val ms = (call.argument<Number>("ms")?.toLong() ?: 0L).coerceAtLeast(0L)
                    val p = player
                    if (p != null) {
                        val count = p.mediaItemCount
                        val idx = p.currentMediaItemIndex.coerceAtLeast(0)
                        if (p.playbackState == Player.STATE_IDLE && count > 0 && idx < count) {
                            p.seekTo(idx, ms)
                            p.prepare()
                            p.playWhenReady = true
                        } else if (p.playbackState == Player.STATE_ENDED && count > 0 && idx < count) {
                            p.seekTo(idx, ms)
                            p.playWhenReady = true
                        } else {
                            p.seekTo(ms)
                        }
                        emit(mapOf("type" to "position", "ms" to ms))
                        updateTickerState()
                    }
                    result.success(null)
                }
                "setLifecycle" -> {
                    val wasForeground = isAppInForeground
                    isAppInForeground = call.argument<Boolean>("isForeground") ?: true
                    if (!wasForeground && isAppInForeground) {
                        player?.let { p ->
                            emitState()
                            emitProgressSnapshot(p)
                            if (isCurrentVideo) {
                                attachVideoSurface(p)
                            }
                        }
                        updateTickerState()
                    } else if (!isAppInForeground) {
                        stopTicker()
                        updateSpectrumTickerState()
                    }
                    result.success(null)
                }
                "setMaxCacheSize" -> {
                    val bytes = call.argument<Number>("bytes")?.toLong() ?: (256L * 1024L * 1024L)
                    com.zenify.mobile.yt.YtDataSource.setMaxCacheSizeBytes(bytes)
                    result.success(null)
                }
                "setVolume" -> {
                    userVol = (call.argument<Number>("v")?.toFloat() ?: 1f).coerceIn(0f, 1f)
                    if (xf == null) {
                        val p = player
                        if (p != null && p.isCommandAvailable(Player.COMMAND_SET_VOLUME)) {
                            p.volume = userVol
                        }
                    }
                    result.success(null)
                }
                "setNormalizeVolume" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    normalizeVolume = enabled
                    val db = if (enabled) currentSongLoudnessDb else 0.0
                    processor.setLoudnessDb(db)
                    result.success(null)
                }
                "setMono" -> {
                    val mono = call.argument<Boolean>("mono") ?: false
                    processor.setMono(mono)
                    result.success(null)
                }
                "isWifiConnected" -> {
                    val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
                    val activeNetwork = cm?.activeNetwork
                    val caps = cm?.getNetworkCapabilities(activeNetwork)
                    val isWifi = caps?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) == true ||
                                 caps?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) == true
                    result.success(isWifi)
                }
                "setLoudnessDb" -> {
                    val db = call.argument<Number>("loudnessDb")?.toDouble()
                    if (db != null) currentSongLoudnessDb = db
                    processor.setLoudnessDb(if (normalizeVolume) currentSongLoudnessDb else 0.0)
                    result.success(null)
                }
                "setFx" -> {
                    val m = call.arguments as? Map<String, Any?> ?: emptyMap()
                    setFx(m)
                    result.success(null)
                }
                "setVideoViewport" -> {
                    val state = call.argument<String>("state") ?: "full"
                    val widthPx = call.argument<Int>("widthPx") ?: 0
                    val heightPx = call.argument<Int>("heightPx") ?: 0
                    handleVideoViewport(state, widthPx, heightPx)
                    result.success(null)
                }
                "getVideoTextureId" -> { result.success(getOrCreateVideoTextureId()) }
                "releaseVideoSurface" -> { releaseVideoTexture(); result.success(null) }
                "dispose" -> {
                    videoJob?.cancel()
                    videoIds.clear()
                    playGeneration.incrementAndGet()
                    nextGeneration.incrementAndGet()
                    releaseVideoTexture()
                    cancelXfade()
                    safeReleasePlayer(player)
                    player = null
                    sourceFactory = null
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error("zen_audio", e.message, null)
        }
    }
}
