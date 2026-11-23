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
    private const val EXCLUDE_TTL_MS = 5 * 60_000L // 5 minutes failure cooldown
    private const val AUDIO_BUDGET_MS = 12_000L
    private const val VIDEO_BUDGET_MS = 12_000L
    private const val BREAKER_TTL_MS = 3 * 60_000L

    @Volatile var videoMaxHeight: Int = 1080 // set from the settings quality

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val inflight = ConcurrentHashMap<String, Deferred<Resolved>>()
    private val excluded = ConcurrentHashMap<String, Pair<Set<String>, Long>>()
    val urlCache = StreamUrlCache()

    private val clientFails = ConcurrentHashMap<String, Pair<Int, Long>>()
    private val negCache = ConcurrentHashMap<String, Long>()
    private val lastCipherRefresh = AtomicLong(0)
    private val prefetching = AtomicInteger(0)

    private fun noteClientFail(c: String) {
        val now = System.currentTimeMillis()
        clientFails.compute(c) { _, o ->
            if (o == null || now - o.second > BREAKER_TTL_MS) 1 to now else (o.first + 1) to now
        }
    }
    private fun noteClientOk(c: String) { clientFails.remove(c) }
    private fun breakerExcluded(): Set<String> {
        val now = System.currentTimeMillis()
        return clientFails.filter { (_, v) -> v.first >= 3 && now - v.second < BREAKER_TTL_MS }.keys
    }

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
                } catch (_: IllegalStateException) {
                    this@withEmbeddedConfigFallback.fetchEmbeddedConfig(videoId, useLoginCookies = false)
                }
        }

    private object ZenifyClientStrategy : ClientFallbackStrategy {
        override fun resolveClients(hints: ContentHints): List<YouTubeClient> {
            return if (hints.wantVideo) {
                listOf(
                    YouTubeClient.IOS,
                    YouTubeClient.TVHTML5,
                    YouTubeClient.TVHTML5_SIMPLY,
                    YouTubeClient.ANDROID_VR_1_65_10,
                    YouTubeClient.ANDROID_VR_NO_AUTH,
                    YouTubeClient.ANDROID,
                    YouTubeClient.WEB,
                    YouTubeClient.WEB_REMIX,
                )
            } else {
                listOf(
                    YouTubeClient.TVHTML5,
                    YouTubeClient.TVHTML5_SIMPLY,
                    YouTubeClient.IOS,
                    YouTubeClient.ANDROID_MUSIC,
                    YouTubeClient.ANDROID_VR_1_65_10,
                    YouTubeClient.ANDROID_VR_NO_AUTH,
                    YouTubeClient.ANDROID,
                    YouTubeClient.WEB_REMIX,
                )
            }
        }
    }

    @Volatile
    private var extractorInstance: InnerTubeExtractor? = null

    fun init(context: Context) {
        if (extractorInstance == null) {
            synchronized(this) {
                if (extractorInstance == null) {
                    val appContext = context.applicationContext
                    val configRepo = AndroidPlayerConfigRepository(appContext)
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

                    extractorInstance = InnerTubeExtractor(
                        configParser = safeParser,
                        cipherService = cipher,
                        innerTube = innerTube,
                        fallbackStrategy = ZenifyClientStrategy,
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
    ): Resolved {
        val effectiveQuality = if (quality.isNotBlank()) quality else currentQuality
        val cacheKey = if (wantVideo) "$videoId#video#$effectiveQuality" else "$videoId#$effectiveQuality"
        if (force) negCache.remove(cacheKey)
        if (!force) {
            urlCache[cacheKey]?.let { cached ->
                if (!wantVideo || !cached.videoUrl.isNullOrBlank()) {
                    return cached.toResolved()
                }
            }
        }
        val d = inflight.getOrPut(cacheKey) {
            scope.async { doResolve(videoId, wantVideo = wantVideo, cacheKey = cacheKey, quality = effectiveQuality) }
        }
        return try {
            d.await()
        } finally {
            inflight.remove(cacheKey, d)
        }
    }

    private suspend fun doResolve(videoId: String, wantVideo: Boolean, cacheKey: String, quality: String): Resolved {
        negCache[cacheKey]?.let {
            val ttl = if (wantVideo) 15_000L else 5_000L
            if (System.currentTimeMillis() - it < ttl) throw IOException("recently failed: $videoId")
            negCache.remove(cacheKey)
        }
        val gen = urlCache.generation(cacheKey)
        val aq = if (quality == "low" || quality == "ultra_low") AudioQuality.LOW else AudioQuality.HIGH

        val result = withTimeoutOrNull(if (wantVideo) VIDEO_BUDGET_MS else AUDIO_BUDGET_MS) {
            val ex = (excludedClients(videoId) + breakerExcluded()).toMutableSet()
            for (attempt in 0 until 3) {
                val s = try {
                    extract(videoId, ex, aq, wantVideo)
                } catch (e: StreamResolveException) {
                    if (attempt == 0 && ex.isNotEmpty()) { ex.clear(); continue }
                    return@withTimeoutOrNull null
                }
                if (s.sabrBootstrap != null) { ex += s.clientName; noteClientFail(s.clientName); continue }
                val h = StreamHeaders.forClient(s.clientName)
                if (!probeStream(s.audioUrl, h)) {
                    excludeClient(videoId, s.clientName); ex += s.clientName; continue
                }
                noteClientOk(s.clientName)
                var r = s.toResolved()
                val vu = r.videoUrl
                if (wantVideo && !vu.isNullOrBlank() && vu != r.url && !probeStream(vu, h)) {
                    r = r.copy(videoUrl = null, videoWidth = null, videoHeight = null) // audio still plays
                }
                return@withTimeoutOrNull r
            }
            null
        }
        if (result == null) {
            negCache[cacheKey] = System.currentTimeMillis()
            throw IOException("resolve failed/timeout: $videoId")
        }
        urlCache.put(cacheKey, result, gen)
        return result
    }

    private fun probeStream(url: String, headers: Map<String, String>): Boolean {
        if (url.isBlank()) return false
        val isHls = url.contains("/manifest/hls") || url.contains(".m3u8")
        val reqBuilder = okhttp3.Request.Builder().url(url)
        if (!isHls) {
            reqBuilder.header("Range", "bytes=0-1")
        }
        headers.forEach { (k, v) -> reqBuilder.header(k, v) }
        return try {
            Net.ok.newCall(reqBuilder.build()).execute().use { resp ->
                val code = resp.code
                if (code in 400..499 && code != 416) {
                    Log.w(TAG, "probeStream $code forbidden/error (attestation gated) for $url")
                    false
                } else if (isHls) {
                    code in 200..399
                } else {
                    code in 200..299 || code == 416
                }
            }
        } catch (e: Throwable) {
            val msg = e.message ?: ""
            if (msg.contains("403") || msg.contains("401") || msg.contains("400")) {
                Log.w(TAG, "probeStream 403/400 exception for $url: $msg")
                false
            } else {
                Log.w(TAG, "probeStream network warning for $url: $msg")
                true
            }
        }
    }

    private suspend fun extract(
        id: String,
        ex: Set<String>,
        q: AudioQuality,
        wantVideo: Boolean = false,
    ): ExtractedStream {
        val hints = ContentHints(
            wantVideo = wantVideo,
            maxVideoHeight = if (wantVideo) videoMaxHeight else null,
        ).withStreamCapabilities(
            allowHls = true,
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
        noteClientFail(client)
        val now = System.currentTimeMillis(); val last = lastCipherRefresh.get()
        if (now - last > 60_000 && lastCipherRefresh.compareAndSet(last, now)) {
            scope.launch { try { cipherService.refreshAfterStreamRejection() } catch (_: Throwable) {} }
        }
    }

    fun markClientFailed(videoId: String, client: String) { // used by playback 403 path
        excludeClient(videoId, client)
        urlCache.invalidate(videoId)
        negCache.remove(videoId)
        negCache.remove("$videoId#video")
        negCache.remove("$videoId#$currentQuality")
        negCache.remove("$videoId#video#$currentQuality")
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
                    if (urlCache[key] != null || inflight.containsKey(key) || negCache.containsKey(key)) continue
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
        negCache.clear()
        clientFails.clear()
    }
}
