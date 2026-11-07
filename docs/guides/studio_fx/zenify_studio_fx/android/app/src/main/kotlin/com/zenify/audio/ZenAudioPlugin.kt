package com.zenify.audio

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Channels:
 *  - MethodChannel  zenify/audio           play / pause / resume / stop / seek / setVolume / setFx / dispose
 *  - EventChannel   zenify/audio/events    {type: state|position|duration|error, ...}
 *  - EventChannel   zenify/audio/spectrum  List<double>(36) at about 30 fps
 */
@OptIn(UnstableApi::class)
class ZenAudioPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var ctx: Context
    private val main = Handler(Looper.getMainLooper())
    private val processor = ZenFxProcessor()
    private var player: ExoPlayer? = null
    private var events: EventChannel.EventSink? = null
    private var spectrumSink: EventChannel.EventSink? = null
    private var lastDuration = -1L
    private var pending = PlaybackParameters(1f, 1f)

    private val ticker = object : Runnable {
        override fun run() {
            val p = player
            if (p != null) {
                if (p.isPlaying) emit(mapOf("type" to "position", "ms" to p.currentPosition))
                val d = p.duration
                if (d != C.TIME_UNSET && d != lastDuration) {
                    lastDuration = d
                    emit(mapOf("type" to "duration", "ms" to d))
                }
            }
            main.postDelayed(this, 200)
        }
    }

    private val spectrumTicker = object : Runnable {
        override fun run() {
            val sink = spectrumSink ?: return
            val live = player?.isPlaying == true
            val b = processor.bands
            sink.success(List(b.size) { if (live) b[it].toDouble() else 0.0 })
            main.postDelayed(this, 33)
        }
    }

    override fun onAttachedToEngine(b: FlutterPlugin.FlutterPluginBinding) {
        ctx = b.applicationContext
        MethodChannel(b.binaryMessenger, "zenify/audio").setMethodCallHandler(this)
        EventChannel(b.binaryMessenger, "zenify/audio/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink?) { events = sink }
            override fun onCancel(args: Any?) { events = null }
        })
        EventChannel(b.binaryMessenger, "zenify/audio/spectrum").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink?) {
                spectrumSink = sink
                main.removeCallbacks(spectrumTicker)
                main.post(spectrumTicker)
            }
            override fun onCancel(args: Any?) {
                spectrumSink = null
                main.removeCallbacks(spectrumTicker)
            }
        })
        main.post(ticker)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        main.removeCallbacksAndMessages(null)
        player?.release()
        player = null
    }

    private fun emit(m: Map<String, Any?>) { events?.success(m) }

    private fun emitState() {
        val p = player ?: return
        val s = when {
            p.playbackState == Player.STATE_ENDED -> "completed"
            p.playbackState == Player.STATE_IDLE -> "stopped"
            p.playWhenReady -> "playing" // buffering still counts as playing, so the UI does not flicker
            else -> "paused"
        }
        emit(mapOf("type" to "state", "value" to s))
    }

    private fun ensurePlayer(): ExoPlayer {
        player?.let { return it }
        val factory = object : DefaultRenderersFactory(ctx) {
            // Media3 1.9 signature. On 1.4 to 1.5 remove the last parameter (enableOffload).
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
                enableOffload: Boolean,
            ): AudioSink {
                return DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(false)
                    .setEnableAudioTrackPlaybackParams(false) // speed and pitch use Sonic, after our FX
                    .setOffloadMode(DefaultAudioSink.OFFLOAD_MODE_DISABLED) // offload would bypass the FX
                    .setAudioProcessors(arrayOf<AudioProcessor>(processor))
                    .build()
            }
        }
        val p = ExoPlayer.Builder(ctx, factory)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) { emitState() }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) { emitState() }
            override fun onPlayerError(error: PlaybackException) {
                emit(mapOf("type" to "error", "message" to (error.message ?: "playback error")))
            }
        })
        p.playbackParameters = pending
        player = p
        return p
    }

    private fun play(url: String, headers: Map<String, String>) {
        val p = ensurePlayer()
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(10_000)
            .setReadTimeoutMs(20_000)
            .setDefaultRequestProperties(headers)
        headers["User-Agent"]?.let { http.setUserAgent(it) }
        val src = ProgressiveMediaSource.Factory(DefaultDataSource.Factory(ctx, http))
            .createMediaSource(MediaItem.fromUri(url))
        lastDuration = -1L
        p.setMediaSource(src)
        p.prepare()
        p.playWhenReady = true
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
                    play(call.argument<String>("url")!!, call.argument<Map<String, String>>("headers") ?: emptyMap())
                    result.success(null)
                }
                "pause" -> { player?.pause(); result.success(null) }
                "resume" -> { player?.play(); result.success(null) }
                "stop" -> { player?.stop(); player?.clearMediaItems(); result.success(null) }
                "seek" -> { player?.seekTo(call.argument<Number>("ms")?.toLong() ?: 0L); result.success(null) }
                "setVolume" -> { player?.volume = (call.argument<Number>("v")?.toFloat() ?: 1f).coerceIn(0f, 1f); result.success(null) }
                "setFx" -> { setFx(call.arguments as Map<String, Any?>); result.success(null) }
                "dispose" -> { player?.release(); player = null; result.success(null) }
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error("zen_audio", e.message, null)
        }
    }
}
