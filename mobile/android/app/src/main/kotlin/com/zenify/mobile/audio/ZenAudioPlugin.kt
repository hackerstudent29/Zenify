package com.zenify.mobile.audio

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
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
    private val processor = ZenFxProcessor()
    private var player: ExoPlayer? = null
    private var sourceFactory: MediaSource.Factory? = null
    private var events: EventChannel.EventSink? = null
    private var spectrumSink: EventChannel.EventSink? = null
    private var textureRegistry: TextureRegistry? = null
    private var videoTextureEntry: TextureRegistry.SurfaceTextureEntry? = null
    private var videoSurface: Surface? = null
    private var pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var videoJob: Job? = null
    private val videoIds = ConcurrentHashMap.newKeySet<String>() // next tracks that want video
    @Volatile private var retriedId: String? = null
    private val playGeneration = AtomicInteger(0)
    private val nextGeneration = AtomicInteger(0)
    private var lastDuration = -1L
    private var pending = PlaybackParameters(1f, 1f)

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

    private fun stopTicker() {
        isTickerScheduled = false
        main.removeCallbacks(ticker)
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
    }

    private fun getOrCreateVideoTextureId(): Long {
        val existing = videoTextureEntry
        if (existing != null && videoSurface != null) {
            return existing.id()
        }
        val entry = textureRegistry?.createSurfaceTexture() ?: return -1L
        val surface = Surface(entry.surfaceTexture())
        videoTextureEntry = entry
        videoSurface = surface
        return entry.id()
    }

    private fun attachVideoSurface(p: ExoPlayer) {
        if (videoSurface == null) {
            getOrCreateVideoTextureId()
        }
        val surface = videoSurface
        if (surface != null) {
            p.setVideoSurface(surface)
        }
    }

    private fun releaseVideoTexture() {
        try {
            player?.clearVideoSurface()
        } catch (_: Throwable) {}
        try {
            videoSurface?.release()
        } catch (_: Throwable) {}
        try {
            videoTextureEntry?.release()
        } catch (_: Throwable) {}
        videoSurface = null
        videoTextureEntry = null
    }

    private var currentViewportState: String = "full"

    private fun handleVideoViewport(state: String, widthPx: Int, heightPx: Int) {
        currentViewportState = state
        val p = player ?: return
        when (state) {
            "hidden" -> {
                // Detach surface to pause video decoding pipeline while audio continues seamlessly
                try {
                    p.clearVideoSurface()
                } catch (_: Throwable) {}
            }
            "mini", "docked" -> {
                attachVideoSurface(p)
                try {
                    p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                        .setMaxVideoSize(640, 480)
                        .build()
                } catch (_: Throwable) {}
            }
            "full" -> {
                attachVideoSurface(p)
                try {
                    p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                        .clearVideoSizeConstraints()
                        .build()
                } catch (_: Throwable) {}
            }
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
                main.removeCallbacks(spectrumTicker)
                main.post(spectrumTicker)
            }
            override fun onCancel(args: Any?) {
                spectrumSink = null
                processor.hasSpectrumListener = false
                main.removeCallbacks(spectrumTicker)
            }
        })
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        stopTicker()
        main.removeCallbacksAndMessages(null)
        pluginScope.cancel()
        releaseVideoTexture()
        textureRegistry = null
        player?.release()
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

    private fun emit(m: Map<String, Any?>) { events?.success(m) }

    private fun emitState() {
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
            Uri.parse(if (isVideo) "zenify://video/$mediaId" else "zenify://media/$mediaId")
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
                    "ttlMs" to (resolved.expiresInSec * 1000L),
                    "fromCache" to false,
                    "loudnessDb" to loudness
                ))
            }
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)
        sourceFactory = mediaSourceFactory

        // Separate load control for high-resolution video streams: lean startup, safe buffer cap, no back-buffer in RAM
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 6_000,
                /* maxBufferMs = */ 25_000,
                /* bufferForPlaybackMs = */ 500,
                /* bufferForPlaybackAfterRebufferMs = */ 1_500
            )
            .setBackBuffer(0, false)
            .setTargetBufferBytes(48 * 1024 * 1024)
            .setPrioritizeTimeOverSizeThresholds(false)
            .build()

        val p = ExoPlayer.Builder(ctx, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        try {
            // Disable hardware DSP offload so AudioProcessor (Studio FX) and progressive
            // container seeking remain sample-accurate across all devices and streams.
            val offloadPrefs = TrackSelectionParameters.AudioOffloadPreferences.Builder()
                .setAudioOffloadMode(TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED)
                .build()
            p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                .setAudioOffloadPreferences(offloadPrefs)
                .build()
        } catch (_: Throwable) {}

        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                emitState()
                if (state == Player.STATE_READY) {
                    emitProgressSnapshot(p)
                }
                updateTickerState()
            }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (!playWhenReady) {
                    stopTicker()
                }
                emitState()
                emitProgressSnapshot(p)
                updateTickerState()
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (!isPlaying && p.playbackState != Player.STATE_BUFFERING) {
                    stopTicker()
                }
                emitState()
                emitProgressSnapshot(p)
                updateTickerState()
            }
            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                if (playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    p.playWhenReady = false
                    stopTicker()
                }
                emitState()
                emitProgressSnapshot(p)
                updateTickerState()
            }
            override fun onVideoSizeChanged(videoSize: VideoSize) {
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
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    emit(mapOf("type" to "autoTransition", "mediaId" to (mediaItem?.mediaId ?: "")))
                    // Remove finished media items so that the active item is always at index 0
                    val cur = player?.currentMediaItemIndex ?: 0
                    if (cur > 0) {
                        player?.removeMediaItems(0, cur)
                    }
                }
                lastDuration = -1L
                val isVideoItem = mediaItem?.localConfiguration?.tag == "video"
                if (isVideoItem) {
                    attachVideoSurface(p)
                } else {
                    p.clearVideoSurface()
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
                    val client = YtEngine.urlCache.findAnyForVideo(id)?.client ?: "ANDROID_VR"
                    YtEngine.markClientFailed(id, client)
                    YtDataSource.evictMedia(ctx, id)
                    val pos = p.currentPosition.coerceAtLeast(0L)
                    p.setMediaItem(audioItem(id, p.mediaMetadata), pos)
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

    private fun audioItem(id: String, md: MediaMetadata) = MediaItem.Builder()
        .setMediaId(id).setCustomCacheKey(id).setUri(resolveMediaUri(id, false))
        .setMediaMetadata(md).setTag("audio").build()

    private fun startVideoUpgrade(mediaId: String, md: MediaMetadata) {
        val gen = playGeneration.get()
        videoJob?.cancel()
        videoJob = pluginScope.launch {
            val r = try { withTimeoutOrNull(12_000) { YtEngine.resolve(mediaId, wantVideo = true) } }
                    catch (e: CancellationException) { throw e } catch (_: Throwable) { null }
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
                    vu != r.url -> MergingMediaSource(true, true,
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
        isVideo: Boolean = false
    ) {
        val gen = playGeneration.incrementAndGet()
        currentMediaId = mediaId
        processor.setLoudnessDb(loudnessDb)
        val p = ensurePlayer()
        val metadata = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
            .build()

        if (!isVideo) {
            videoJob?.cancel()
            retriedId = null
            p.clearVideoSurface()
            emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
            lastDuration = -1L
            p.setMediaItem(audioItem(mediaId, metadata), startMs ?: 0L)
            p.prepare()
            p.playWhenReady = true
            return
        }

        videoJob?.cancel()
        retriedId = null
        attachVideoSurface(p)
        emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
        lastDuration = -1L
        p.setMediaItem(audioItem(mediaId, metadata), startMs ?: 0L) // audio starts immediately
        p.prepare()
        p.playWhenReady = true
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
        isVideo: Boolean = false
    ) {
        playGeneration.incrementAndGet()
        currentMediaId = mediaId
        processor.setLoudnessDb(loudnessDb)
        val p = ensurePlayer()
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
                .setMediaMetadata(metadata)
                .setTag("video")
                .build()
            val audioItem = MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(metadata)
                .setTag("video")
                .build()
            val merged = MergingMediaSource(
                true,
                true,
                mf.createMediaSource(videoItem),
                mf.createMediaSource(audioItem)
            )
            p.setMediaSource(merged, startMs ?: 0L)
            p.prepare()
            p.playWhenReady = true
        } else {
            if (wantsVideo) {
                attachVideoSurface(p)
            } else {
                p.clearVideoSurface()
            }
            emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
            val mediaItem = MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(metadata)
                .setTag(if (wantsVideo) "video" else "audio")
                .build()
            p.setMediaItem(mediaItem, startMs ?: 0L)
            p.prepare()
            p.playWhenReady = true
        }
    }

    private fun setNextMediaId(
        mediaId: String?,
        title: String? = null,
        artist: String? = null,
        artworkUrl: String? = null,
        isVideo: Boolean = false
    ) {
        val nextGen = nextGeneration.incrementAndGet()
        val p = player ?: return
        val curIndex = p.currentMediaItemIndex
        val nextIndex = curIndex + 1
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
        if (p.mediaItemCount > nextIndex) p.replaceMediaItem(nextIndex, mediaItem) else p.addMediaItem(mediaItem)
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
                    if (!mediaId.isNullOrBlank()) {
                        playMediaId(
                            mediaId = mediaId,
                            title = call.argument<String>("title"),
                            artist = call.argument<String>("artist"),
                            artworkUrl = call.argument<String>("artworkUrl"),
                            startMs = call.argument<Number>("startMs")?.toLong(),
                            loudnessDb = call.argument<Number>("loudnessDb")?.toDouble(),
                            isVideo = isVideo
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
                                isVideo = isVideo
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
                "clearAllCaches" -> {
                    YtEngine.clearAll(ctx)
                    YtDataSource.clearCache(ctx)
                    result.success(null)
                }
                "pause" -> {
                    player?.pause()
                    stopTicker()
                    result.success(null)
                }
                "resume" -> {
                    player?.play()
                    updateTickerState()
                    result.success(null)
                }
                "stop" -> {
                    videoJob?.cancel()
                    videoIds.clear()
                    playGeneration.incrementAndGet()
                    nextGeneration.incrementAndGet()
                    currentMediaId = null
                    player?.stop()
                    player?.clearMediaItems()
                    player?.clearVideoSurface()
                    emit(mapOf("type" to "videoSize", "width" to 0, "height" to 0))
                    stopTicker()
                    result.success(null)
                }
                "seek" -> {
                    val ms = (call.argument<Number>("ms")?.toLong() ?: 0L).coerceAtLeast(0L)
                    val p = player
                    if (p != null) {
                        if (p.playbackState == Player.STATE_IDLE && p.mediaItemCount > 0) {
                            p.seekTo(p.currentMediaItemIndex, ms)
                            p.prepare()
                            p.playWhenReady = true
                        } else if (p.playbackState == Player.STATE_ENDED) {
                            p.seekTo(p.currentMediaItemIndex, ms)
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
                        player?.let {
                            emitState()
                            emitProgressSnapshot(it)
                        }
                        updateTickerState()
                    } else if (!isAppInForeground) {
                        stopTicker()
                    }
                    result.success(null)
                }
                "setVolume" -> { player?.volume = (call.argument<Number>("v")?.toFloat() ?: 1f).coerceIn(0f, 1f); result.success(null) }
                "setLoudnessDb" -> {
                    val db = call.argument<Number>("loudnessDb")?.toDouble()
                    processor.setLoudnessDb(db)
                    result.success(null)
                }
                "setFx" -> { setFx(call.arguments as Map<String, Any?>); result.success(null) }
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
                    player?.release()
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
