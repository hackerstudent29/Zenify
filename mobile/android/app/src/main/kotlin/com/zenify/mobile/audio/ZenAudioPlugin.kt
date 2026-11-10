package com.zenify.mobile.audio

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.zenify.mobile.yt.YtDataSource
import com.zenify.mobile.yt.YtEngine
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Channels:
 *  - MethodChannel  zenify/audio           play / setNext / prefetch / prewarm / clearAllCaches / pause / resume / stop / seek / setVolume / setFx / dispose
 *  - EventChannel   zenify/audio/events    {type: state|position|duration|resolved|error, ...}
 *  - EventChannel   zenify/audio/spectrum  List<double>(36) at about 30 fps
 */
@OptIn(UnstableApi::class)
class ZenAudioPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    companion object {
        @Volatile
        var activeHeaders: Map<String, String> = emptyMap()
    }

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
        YtEngine.init(ctx)

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
            p.playWhenReady -> "playing" // buffering still counts as playing, so UI does not flicker
            else -> "paused"
        }
        val isBuffering = p.playbackState == Player.STATE_BUFFERING
        emit(mapOf("type" to "state", "value" to s, "buffering" to isBuffering))
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
                    .setAudioProcessors(arrayOf<AudioProcessor>(processor))
                    .build()
            }
        }

        val dataSourceFactory = YtDataSource.createDataSourceFactory(ctx) { videoId, resolved ->
            val loudness = resolved.loudnessDb
            processor.setLoudnessDb(loudness)
            main.post {
                emit(mapOf(
                    "type" to "resolved",
                    "id" to videoId,
                    "client" to resolved.client,
                    "ms" to (resolved.expiresInSec * 1000),
                    "fromCache" to false,
                    "loudnessDb" to loudness
                ))
            }
        }

        val mediaSourceFactory = ProgressiveMediaSource.Factory(dataSourceFactory)

        val p = ExoPlayer.Builder(ctx, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                emitState()
            }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                emitState()
            }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    emit(mapOf("type" to "autoTransition", "mediaId" to (mediaItem?.mediaId ?: "")))
                    // Remove finished media items so that the active item is always at index 0
                    val cur = player?.currentMediaItemIndex ?: 0
                    if (cur > 0) {
                        player?.removeMediaItems(0, cur)
                    }
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                val is403 = error.message?.contains("403") == true || error.errorCodeName.contains("BAD_HTTP_STATUS")
                Log.e("ZenAudioPlugin", "ExoPlayer playback error: ${error.errorCodeName} (code=${error.errorCode}, is403=$is403) - ${error.message}", error)
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

    private fun playMediaId(
        mediaId: String,
        title: String?,
        artist: String?,
        artworkUrl: String?,
        startMs: Long?,
        loudnessDb: Double? = null
    ) {
        processor.setLoudnessDb(loudnessDb)
        val p = ensurePlayer()
        val uri = Uri.parse("zenify://media/$mediaId")
        val metadata = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
            .build()

        val mediaItem = MediaItem.Builder()
            .setMediaId(mediaId)
            .setCustomCacheKey(mediaId)
            .setUri(uri)
            .setMediaMetadata(metadata)
            .build()

        lastDuration = -1L
        p.setMediaItem(mediaItem, startMs ?: 0L)
        p.prepare()
        p.playWhenReady = true
    }

    private fun playUrl(url: String, headers: Map<String, String>? = null) {
        val p = ensurePlayer()
        if (headers != null) {
            activeHeaders = headers
        }
        val mediaItem = MediaItem.fromUri(url)
        lastDuration = -1L
        p.setMediaItem(mediaItem)
        p.prepare()
        p.playWhenReady = true
    }

    private fun setNextMediaId(
        mediaId: String?,
        title: String? = null,
        artist: String? = null,
        artworkUrl: String? = null
    ) {
        val p = player ?: return
        val curIndex = p.currentMediaItemIndex
        val nextIndex = curIndex + 1
        if (mediaId.isNullOrBlank()) {
            if (p.mediaItemCount > nextIndex) {
                p.removeMediaItems(nextIndex, p.mediaItemCount)
            }
        } else {
            val uri = Uri.parse("zenify://media/$mediaId")
            val metadata = MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
                .build()

            val mediaItem = MediaItem.Builder()
                .setMediaId(mediaId)
                .setCustomCacheKey(mediaId)
                .setUri(uri)
                .setMediaMetadata(metadata)
                .build()

            if (p.mediaItemCount > nextIndex) {
                p.replaceMediaItem(nextIndex, mediaItem)
            } else {
                p.addMediaItem(mediaItem)
            }
            YtEngine.prefetch(listOf(mediaId))
        }
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
                    if (!mediaId.isNullOrBlank()) {
                        playMediaId(
                            mediaId = mediaId,
                            title = call.argument<String>("title"),
                            artist = call.argument<String>("artist"),
                            artworkUrl = call.argument<String>("artworkUrl"),
                            startMs = call.argument<Number>("startMs")?.toLong(),
                            loudnessDb = call.argument<Number>("loudnessDb")?.toDouble()
                        )
                    } else {
                        val url = call.argument<String>("url")
                        val rawHeaders = call.argument<Map<String, Any?>>("headers")
                        val headersMap = rawHeaders?.mapNotNull { (k, v) -> if (v != null) k to v.toString() else null }?.toMap()
                        if (!url.isNullOrBlank()) {
                            playUrl(url, headersMap)
                        }
                    }
                    result.success(null)
                }
                "setNext" -> {
                    val mediaId = call.argument<String>("mediaId")
                    val title = call.argument<String>("title")
                    val artist = call.argument<String>("artist")
                    val artworkUrl = call.argument<String>("artworkUrl")
                    setNextMediaId(mediaId, title, artist, artworkUrl)
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
                "clearAllCaches" -> {
                    YtEngine.clearAll(ctx)
                    YtDataSource.clearCache(ctx)
                    result.success(null)
                }
                "pause" -> { player?.pause(); result.success(null) }
                "resume" -> { player?.play(); result.success(null) }
                "stop" -> { player?.stop(); player?.clearMediaItems(); result.success(null) }
                "seek" -> { player?.seekTo(call.argument<Number>("ms")?.toLong() ?: 0L); result.success(null) }
                "setVolume" -> { player?.volume = (call.argument<Number>("v")?.toFloat() ?: 1f).coerceIn(0f, 1f); result.success(null) }
                "setLoudnessDb" -> {
                    val db = call.argument<Number>("loudnessDb")?.toDouble()
                    processor.setLoudnessDb(db)
                    result.success(null)
                }
                "setFx" -> { setFx(call.arguments as Map<String, Any?>); result.success(null) }
                "dispose" -> { player?.release(); player = null; result.success(null) }
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error("zen_audio", e.message, null)
        }
    }
}
