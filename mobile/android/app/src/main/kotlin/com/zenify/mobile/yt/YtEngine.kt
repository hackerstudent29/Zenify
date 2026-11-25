package com.zenify.mobile.yt

import android.content.Context
import android.util.Log
import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.InnerTubeLogger
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.ExtractedStream
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.StreamResolveException
import com.metrolist.innertubex.extraction.YtConfigParser
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.extraction.strategy.ClientFallbackStrategy
import com.metrolist.innertubex.extraction.strategy.ClientHealthMonitor
import com.metrolist.innertubex.models.YouTubeClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

object YtEngine {
    private const val TAG = "YtEngine"
    private const val EXCLUDE_TTL_MS = 2 * 60_000L // 2 minutes failure cooldown per video
    private const val AUDIO_BUDGET_MS = 20_000L
    private const val VIDEO_BUDGET_MS = 20_000L

    @Volatile var videoMaxHeight: Int = 1080 // set from the settings quality

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val inflight = ConcurrentHashMap<String, Deferred<Resolved>>()
    private val excluded = ConcurrentHashMap<String, Pair<Set<String>, Long>>()
    val urlCache = StreamUrlCache()

    private val lastCipherRefresh = AtomicLong(0)
    private val prefetching = AtomicInteger(0)

    @Volatile
    var currentQuality: String = "high"

    data class Resolved(
        val url: String,
        val headers: Map<String, String>,
        val client: String,
        val itag: Int?,
        val expiresInSec: Int,
        val contentLength: Long?,
        val loudnessDb: Double?,
        val title: String?,
        val artist: String?,
        val videoUrl: String? = null,
        val videoWidth: Int? = null,
        val videoHeight: Int? = null,
        val isHls: Boolean = false,
    )

    private val ktorClient: HttpClient by lazy {
        HttpClient(OkHttp) {
            engine {
                preconfigured = Net.api
            }
            install(ContentNegotiation) {
                json(Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                })
            }
        }
    }

    private val innerTube: InnerTube by lazy {
        InnerTube(httpClient = ktorClient)
    }

    @Volatile
    private var cipherServiceInstance: YouTubeCipherService? = null

    private val cipherService: YouTubeCipherService
        get() = cipherServiceInstance ?: synchronized(this) {
            cipherServiceInstance ?: YouTubeCipherService(httpClient = ktorClient).also { cipherServiceInstance = it }
        }

    private class AndroidPlayerConfigRepository(context: Context) : PlayerConfigRepository {
        private val preferences = context.getSharedPreferences("innertubex_player_config", Context.MODE_PRIVATE)

        override val enabled: Boolean = true
        override val sourceUrl: String = PLAYER_CONFIG_URL
        override val defaultSourceUrl: String = PLAYER_CONFIG_URL
        override var cachedJson: String
            get() = preferences.getString("json", "").orEmpty()
            set(value) = preferences.edit().putString("json", value).apply()
        override var cachedAtMs: Long
            get() = preferences.getLong("cached_at_ms", 0L)
            set(value) = preferences.edit().putLong("cached_at_ms", value).apply()
        override var cachedSourceUrl: String
            get() = preferences.getString("source_url", "").orEmpty()
            set(value) = preferences.edit().putString("source_url", value).apply()
        override var cachedEtag: String
            get() = preferences.getString("etag", "").orEmpty()
            set(value) = preferences.edit().putString("etag", value).apply()

        private companion object {
            const val PLAYER_CONFIG_URL =
                "https://raw.githubusercontent.com/MetrolistGroup/faraday/master/registry/player_configs.json"
        }
    }

    private fun YtConfigParser.withEmbeddedConfigFallback(): YtConfigParser =
        object : YtConfigParser by this {
            override suspend fun fetchConfig(
                videoId: String,
                useLoginCookies: Boolean,
            ) =
                try {
                    this@withEmbeddedConfigFallback.fetchConfig(videoId, useLoginCookies)
                } catch (e: IllegalStateException) {
                    this@withEmbeddedConfigFallback.fetchEmbeddedConfig(videoId, useLoginCookies = false)
                }
        }

    private object ZenifyClientStrategy : ClientFallbackStrategy {
        override fun resolveClients(hints: ContentHints): List<YouTubeClient> {
            return if (hints.wantVideo) {
                listOf(
                    YouTubeClient.IOS,
                    YouTubeClient.ANDROID_VR_NO_AUTH,
                    YouTubeClient.VISIONOS,
                    YouTubeClient.ANDROID,
                    YouTubeClient.TVHTML5_SIMPLY,
                    YouTubeClient.WEB,
                    YouTubeClient.WEB_REMIX,
                )
            } else {
                listOf(
                    YouTubeClient.IOS,
                    YouTubeClient.ANDROID_VR_NO_AUTH,
                    YouTubeClient.VISIONOS,
                    YouTubeClient.ANDROID_MUSIC,
                    YouTubeClient.TVHTML5_SIMPLY,
                    YouTubeClient.WEB_REMIX,
                )
            }
        }
    }

    @Volatile
    private var poTokenGenerator: PoTokenGenerator? = null

    @Volatile
    var appContext: Context? = null
    @Volatile
    private var extractorInstance: InnerTubeExtractor? = null

    fun init(context: Context) {
        val appCtx = context.applicationContext
        appContext = appCtx
        if (extractorInstance == null) {
            synchronized(this) {
                if (extractorInstance == null) {
                    val configRepo = AndroidPlayerConfigRepository(appCtx)
                    val remoteStore = RemotePlayerConfigStore(ktorClient, configRepo, InnerTubeLogger.NONE)
                    val cipher = YouTubeCipherService(
                        httpClient = ktorClient,
                        remotePlayerConfigStore = remoteStore,
                        logger = InnerTubeLogger.NONE
                    )
                    cipherServiceInstance = cipher

                    val rawParser = YtConfigParserImpl(
                        httpClient = ktorClient,
                        innerTube = innerTube,
                        cipherService = cipher
                    )
                    val safeParser = rawParser.withEmbeddedConfigFallback()

                    val poTokenGen = PoTokenGenerator(appCtx)
                    poTokenGenerator = poTokenGen

                    extractorInstance = InnerTubeExtractor(
                        configParser = safeParser,
                        cipherService = cipher,
                        innerTube = innerTube,
                        fallbackStrategy = ZenifyClientStrategy,
                        tokenProvider = poTokenGen,
                        clientHealthMonitor = ClientHealthMonitor.NONE,
                        logger = InnerTubeLogger.NONE,
                    )
                }
            }
        }
    }

    private fun getExtractor(): InnerTubeExtractor {
        return extractorInstance ?: error("YtEngine must be initialized with Context via init(context)")
    }

    suspend fun resolve(
        videoId: String,
        force: Boolean = false,
        wantVideo: Boolean = false,
        quality: String = currentQuality,
        maxVideoHeight: Int? = null,
        allowHls: Boolean = true,
    ): Resolved {
        val effectiveQuality = if (quality.isNotBlank()) quality else currentQuality
        val effectiveMaxHeight = (maxVideoHeight ?: videoMaxHeight).coerceAtLeast(144)
        val hlsTag = if (allowHls) "" else "#nohls"
        val cacheKey = if (wantVideo) {
            "$videoId#video#${effectiveMaxHeight}p#$effectiveQuality$hlsTag"
        } else {
            "$videoId#$effectiveQuality"
        }
        if (force) {
            urlCache.invalidate(videoId)
            excluded.remove(videoId)
        } else {
            urlCache[cacheKey]?.let { cached ->
                val videoOk = !wantVideo ||
                    (!cached.videoUrl.isNullOrBlank() &&
                        (allowHls || (!cached.videoUrl.contains("/manifest/hls") && !cached.videoUrl.contains(".m3u8"))))
                if (videoOk) {
                    return cached.toResolved()
                }
            }
        }
        val d = inflight.getOrPut(cacheKey) {
            scope.async {
                doResolve(
                    videoId,
                    wantVideo = wantVideo,
                    cacheKey = cacheKey,
                    quality = effectiveQuality,
                    maxVideoHeight = effectiveMaxHeight,
                    allowHls = allowHls,
                )
            }
        }
        return try {
            d.await()
        } finally {
            inflight.remove(cacheKey, d)
        }
    }

    private suspend fun doResolve(
        videoId: String,
        wantVideo: Boolean,
        cacheKey: String,
        quality: String,
        maxVideoHeight: Int = videoMaxHeight,
        allowHls: Boolean = true,
    ): Resolved {
        val gen = urlCache.generation(cacheKey)
        val aq = if (quality == "low" || quality == "ultra_low") AudioQuality.LOW else AudioQuality.HIGH
        val maxAttempts = if (wantVideo && !allowHls) 5 else 3

        val result = withTimeoutOrNull(if (wantVideo) VIDEO_BUDGET_MS else AUDIO_BUDGET_MS) {
            var ex = excludedClients(videoId).toMutableSet()
            for (attempt in 0 until maxAttempts) {
                val s = try {
                    extract(videoId, ex, aq, wantVideo, maxVideoHeight, allowHls)
                } catch (e: StreamResolveException) {
                    if (ex.isNotEmpty()) {
                        ex.clear()
                        excluded.remove(videoId)
                        continue
                    }
                    return@withTimeoutOrNull null
                } catch (e: Throwable) {
                    if (ex.isNotEmpty()) {
                        ex.clear()
                        excluded.remove(videoId)
                        continue
                    }
                    return@withTimeoutOrNull null
                }
                if (s.sabrBootstrap != null) {
                    excludeClient(videoId, s.clientName)
                    ex += s.clientName
                    continue
                }
                if (s.audioUrl.isBlank()) {
                    excludeClient(videoId, s.clientName)
                    ex += s.clientName
                    continue
                }
                if (wantVideo && !allowHls) {
                    val vu = s.videoUrl
                    val isHlsUrl = vu.isNullOrBlank() || vu.contains("/manifest/hls") || vu.contains(".m3u8")
                    if (isHlsUrl) {
                        excludeClient(videoId, s.clientName)
                        ex += s.clientName
                        continue
                    }
                }
                // Return immediately without blocking network probe; ExoPlayer handles native byte ranges
                return@withTimeoutOrNull s.toResolved()
            }
            null
        }
        if (result == null) {
            throw IOException("resolve failed/timeout: $videoId")
        }
        urlCache.put(cacheKey, result, gen)
        return result
    }

    private suspend fun extract(
        id: String,
        ex: Set<String>,
        q: AudioQuality,
        wantVideo: Boolean = false,
        maxVideoHeight: Int = videoMaxHeight,
        allowHls: Boolean = true,
    ): ExtractedStream {
        val hints = ContentHints(
            wantVideo = wantVideo,
            maxVideoHeight = if (wantVideo) maxVideoHeight else null,
        ).withStreamCapabilities(
            allowHls = allowHls,
            allowSabr = false,
            allowBoundedRange = true, // Must allow bounded range: YouTube video streams require byte range requests
        )
        return getExtractor().extract(
            videoId = id,
            hints = hints,
            excludedClients = ex,
            audioQuality = q,
            clientPlaybackNonce = UUID.randomUUID().toString(),
        ) ?: throw StreamResolveException(
            StreamResolveException.Reason.NO_PLAYABLE_STREAM,
            "No playable stream found for $id"
        )
    }

    private fun ExtractedStream.toResolved(): Resolved {
        val headers = StreamHeaders.forClient(clientName)
        val now = System.currentTimeMillis()
        val expiresMs = expiresAt?.toEpochMilliseconds() ?: (now + 6 * 3600 * 1000L)
        val expiresInSec = ((expiresMs - now) / 1000).coerceAtLeast(0).toInt()
        val isHls = (videoUrl ?: "").let { it.contains("/manifest/hls") || it.contains(".m3u8") }
        return Resolved(
            url = audioUrl,
            headers = headers,
            client = clientName,
            itag = itag,
            expiresInSec = expiresInSec,
            contentLength = contentLengthBytes,
            loudnessDb = loudnessDb,
            title = mediaMetadata?.title,
            artist = mediaMetadata?.author,
            videoUrl = videoUrl,
            videoWidth = videoWidth,
            videoHeight = videoHeight,
            isHls = isHls,
        )
    }

    private fun excludeClient(videoId: String, client: String) {
        excluded.compute(videoId) { _, e -> ((e?.first ?: emptySet()) + client) to System.currentTimeMillis() }
        val now = System.currentTimeMillis(); val last = lastCipherRefresh.get()
        if (now - last > 60_000 && lastCipherRefresh.compareAndSet(last, now)) {
            scope.launch { try { cipherService.refreshAfterStreamRejection() } catch (e: Throwable) {} }
        }
    }

    fun markClientFailed(videoId: String, client: String) { // used by playback 403 path
        excludeClient(videoId, client)
        urlCache.invalidate(videoId)
    }

    private fun excludedClients(videoId: String): Set<String> {
        val entry = excluded[videoId] ?: return emptySet()
        val (set, timestamp) = entry
        return if (System.currentTimeMillis() - timestamp < EXCLUDE_TTL_MS) {
            set
        } else {
            excluded.remove(videoId)
            emptySet()
        }
    }

    fun prefetch(videoIds: List<String>) {
        if (!prefetching.compareAndSet(0, 1)) return
        scope.launch {
            try {
                for (id in videoIds.take(2)) {
                    val key = "$id#$currentQuality"
                    if (urlCache[key] != null || inflight.containsKey(key)) continue
                    try { resolve(id) } catch (e: Throwable) {
                        if (e is CancellationException) throw e
                        Log.w(TAG, "Prefetch skipped $id: ${e.message}")
                    }
                }
            } finally { prefetching.set(0) }
        }
    }

    fun prewarm() {
        scope.launch {
            try {
                extractorInstance?.prewarm()
                cipherService.prewarmEjs()
            } catch (e: Throwable) {
                Log.w(TAG, "Prewarm failed: ${e.message}")
            }
        }
    }

    fun clearAll(context: Context) {
        urlCache.clear()
        excluded.clear()
        scope.launch {
            try {
                poTokenGenerator?.invalidateAttestation()
            } catch (e: Throwable) {}
        }
    }
}
