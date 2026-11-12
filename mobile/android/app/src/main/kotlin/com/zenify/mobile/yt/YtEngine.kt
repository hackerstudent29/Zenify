package com.zenify.mobile.yt

import android.content.Context
import android.util.Log
import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.InnerTubeLogger
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.ExtractedStream
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.StreamResolveException
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.extraction.strategy.ContentAwareFallbackStrategy
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

object YtEngine {
    private const val TAG = "YtEngine"
    private const val EXCLUDE_TTL_MS = 5 * 60_000L // 5 minutes failure cooldown
    private const val RESOLVE_TIMEOUT_MS = 15_000L // 15 seconds budget

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val inflight = ConcurrentHashMap<String, Deferred<Resolved>>()
    private val excluded = ConcurrentHashMap<String, Pair<Set<String>, Long>>()
    val urlCache = StreamUrlCache()

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
    )

    private val ktorClient: HttpClient by lazy {
        HttpClient(OkHttp) {
            engine {
                preconfigured = Net.ok
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

    private val cipherService: YouTubeCipherService by lazy {
        YouTubeCipherService(httpClient = ktorClient)
    }

    private val parser: YtConfigParserImpl by lazy {
        YtConfigParserImpl(
            httpClient = ktorClient,
            innerTube = innerTube,
            cipherService = cipherService
        )
    }

    @Volatile
    private var tokenProvider: PoTokenGenerator? = null

    @Volatile
    private var extractorInstance: InnerTubeExtractor? = null

    fun init(context: Context) {
        if (tokenProvider == null) {
            synchronized(this) {
                if (tokenProvider == null) {
                    val tp = PoTokenGenerator(context.applicationContext)
                    tokenProvider = tp
                    extractorInstance = InnerTubeExtractor(
                        configParser = parser,
                        cipherService = cipherService,
                        innerTube = innerTube,
                        tokenProvider = tp
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
    ): Resolved {
        val cacheKey = if (wantVideo) "$videoId#video" else videoId
        if (!force) {
            urlCache[cacheKey]?.let { cached ->
                if (!wantVideo || !cached.videoUrl.isNullOrBlank()) {
                    return cached.toResolved()
                }
            }
        }
        val d = inflight.getOrPut(cacheKey) {
            scope.async { doResolve(videoId, wantVideo = wantVideo, cacheKey = cacheKey) }
        }
        return try {
            d.await()
        } finally {
            inflight.remove(cacheKey, d)
        }
    }

    private suspend fun doResolve(
        videoId: String,
        wantVideo: Boolean = false,
        cacheKey: String = videoId,
    ): Resolved = withTimeout(RESOLVE_TIMEOUT_MS) {
        val gen = urlCache.generation(cacheKey)
        val ex = excludedClients(videoId)

        val stream = try {
            extract(videoId, ex, AudioQuality.HIGH, wantVideo = wantVideo)
        } catch (e: StreamResolveException) {
            if (ex.isEmpty() || e.reason != StreamResolveException.Reason.NO_PLAYABLE_STREAM) {
                throw e
            }
            // Retry with exclusions cleared and lower quality
            extract(videoId, emptySet(), AudioQuality.LOW, wantVideo = wantVideo)
        }

        check(stream.sabrBootstrap == null) { "SABR-only stream; not supported by this player yet" }
        val r = stream.toResolved()
        urlCache.put(cacheKey, r, gen)
        r
    }

    private suspend fun extract(
        id: String,
        ex: Set<String>,
        q: AudioQuality,
        wantVideo: Boolean = false,
    ): ExtractedStream {
        val hints = ContentHints(
            wantVideo = wantVideo,
            maxVideoHeight = if (wantVideo) 720 else null,
        ).withStreamCapabilities(
            allowHls = false,
            allowSabr = false,
            allowBoundedRange = false,
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
        )
    }

    fun markClientFailed(videoId: String, client: String) {
        Log.w(TAG, "Marking client failed for $videoId: $client")
        excluded.compute(videoId) { _, existing ->
            val set = (existing?.first ?: emptySet()) + client
            Pair(set, System.currentTimeMillis())
        }
        urlCache.invalidate(videoId)
        urlCache.invalidate("$videoId#video")
        scope.launch {
            try {
                cipherService.refreshAfterStreamRejection()
            } catch (e: Throwable) {
                Log.w(TAG, "Cipher refresh error: ${e.message}")
            }
        }
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
        videoIds.forEach { id ->
            if (urlCache[id] == null && !inflight.containsKey(id)) {
                scope.launch {
                    try {
                        resolve(id)
                    } catch (e: Throwable) {
                        Log.w(TAG, "Prefetch failed for $id: ${e.message}")
                    }
                }
            }
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
                tokenProvider?.invalidateAttestation()
            } catch (e: Throwable) {
                Log.w(TAG, "Failed to invalidate attestation: ${e.message}")
            }
        }
    }
}
