package com.zenify.mobile.yt

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import kotlinx.coroutines.runBlocking
import java.io.File

@OptIn(UnstableApi::class)
object YtDataSource {
    private const val TAG = "YtDataSource"
    @Volatile
    var cacheSizeBytes: Long = 256L * 1024L * 1024L // 256 MB default live streaming cache

    fun setMaxCacheSizeBytes(bytes: Long) {
        cacheSizeBytes = bytes.coerceIn(50L * 1024L * 1024L, 2048L * 1024L * 1024L)
    }

    @Volatile
    private var simpleCache: SimpleCache? = null

    @Synchronized
    fun getCache(context: Context): SimpleCache {
        return simpleCache ?: run {
            val cacheDir = File(context.applicationContext.cacheDir, "audio")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val evictor = LeastRecentlyUsedCacheEvictor(cacheSizeBytes)
            val cache = SimpleCache(cacheDir, evictor)
            simpleCache = cache
            cache
        }
    }

    @Synchronized
    fun evictMedia(context: Context, mediaId: String) {
        if (mediaId.isBlank()) return
        try {
            val cache = getCache(context.applicationContext)
            val matchingKeys = cache.keys.filter { key ->
                key == mediaId || key.startsWith("$mediaId#")
            }
            for (key in matchingKeys) {
                cache.removeResource(key)
            }
            if (matchingKeys.isNotEmpty()) {
                Log.d(TAG, "Evicted ${matchingKeys.size} cached span(s) for $mediaId")
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Failed evicting cache for $mediaId: ${e.message}")
        }
    }

    @Synchronized
    fun clearCache(context: Context) {
        try {
            simpleCache?.let { cache ->
                for (key in cache.keys.toList()) {
                    try {
                        cache.removeResource(key)
                    } catch (e: Throwable) {}
                }
            } ?: run {
                val cacheDir = File(context.applicationContext.cacheDir, "audio")
                if (cacheDir.exists()) {
                    cacheDir.deleteRecursively()
                }
            }
            // Clear headless WebView disk cache and DOM storage
            try {
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    try {
                        android.webkit.WebStorage.getInstance().deleteAllData()
                        val webView = android.webkit.WebView(context.applicationContext)
                        webView.clearCache(true)
                        webView.destroy()
                    } catch (_: Throwable) {}
                }
            } catch (_: Throwable) {}
        } catch (e: Throwable) {
            Log.w(TAG, "Failed clearing audio cache: ${e.message}")
        }
    }

    fun createDataSourceFactory(
        context: Context,
        onResolved: ((videoId: String, resolved: YtEngine.Resolved) -> Unit)? = null
    ): DataSource.Factory {
        val appContext = context.applicationContext

        // 1. Base HTTP source backed by our single shared OkHttpClient with IPv4 preference
        val okHttpFactory = OkHttpDataSource.Factory(Net.ok)
            .setUserAgent(StreamHeaders.defaultUaFor("IOS"))

        // 2. Default data source (supports assets/raw/file + delegates HTTP to OkHttp)
        val defaultFactory = DefaultDataSource.Factory(appContext, okHttpFactory)

        // 3. 512MB LRU Disk Cache
        val cache = getCache(appContext)
        val cacheFactory = CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(defaultFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

        // 4. ResolvingDataSource: turns zenify://media/$id & zenify://video/$id into signed googlevideo URLs
        val resolvingFactory = ResolvingDataSource.Factory(cacheFactory) { dataSpec ->
            val uri = dataSpec.uri
            if (uri.scheme == "zenify") {
                val isVideoUri = uri.host == "video"
                val wantVideo = isVideoUri || uri.getQueryParameter("v") == "1"
                val videoId = uri.lastPathSegment ?: uri.host ?: error("Invalid zenify URI: $uri")
                val qualityParam = uri.getQueryParameter("q") ?: YtEngine.currentQuality
                val vqParam = uri.getQueryParameter("vq")?.toIntOrNull()
                if (vqParam != null && vqParam > 0) {
                    YtEngine.videoMaxHeight = vqParam
                }
                val resolved = try {
                    runBlocking { YtEngine.resolve(videoId, wantVideo = wantVideo, quality = qualityParam) }
                } catch (e: InterruptedException) {
                    throw java.io.InterruptedIOException("resolve interrupted")
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw java.io.InterruptedIOException("resolve cancelled")
                } catch (e: Throwable) {
                    try {
                        runBlocking { YtEngine.resolve(videoId, force = true, wantVideo = wantVideo, quality = qualityParam) }
                    } catch (e2: Throwable) {
                        throw java.io.IOException("resolve failed: ${e2.message}", e2)
                    }
                }
                onResolved?.invoke(videoId, resolved)
                val targetUrl = if (isVideoUri && !resolved.videoUrl.isNullOrBlank()) {
                    resolved.videoUrl
                } else {
                    resolved.url
                }
                val headers = StreamHeaders.forClient(resolved.client)
                val cacheKey = if ((resolved.itag ?: 0) > 0) {
                    "${videoId}${if (isVideoUri) "#v" else ""}#${resolved.itag}"
                } else {
                    "${videoId}${if (isVideoUri) "#v" else ""}"
                }
                dataSpec.buildUpon()
                    .setUri(Uri.parse(targetUrl))
                    .setKey(cacheKey)
                    .setHttpRequestHeaders(headers)
                    .setCustomData(videoId)
                    .build()
            } else if (uri.host?.contains("googlevideo.com") == true) {
                val active = com.zenify.mobile.audio.ZenAudioPlugin.activeHeaders
                val client = DenialClassifier.clientOf(uri.toString()) ?: "IOS"
                val headers = if (active.isNotEmpty()) {
                    active
                } else {
                    StreamHeaders.forClient(client)
                }
                val curMediaId = com.zenify.mobile.audio.ZenAudioPlugin.currentMediaId
                val b = dataSpec.buildUpon().setHttpRequestHeaders(headers)
                if (dataSpec.key == null && !curMediaId.isNullOrBlank()) {
                    b.setKey(curMediaId)
                }
                b.build()
            } else {
                dataSpec
            }
        }

        // 5. RefusedRetryDataSource: intercepts 403 on open(), marks failed client, and retries once
        return RefusedRetryDataSource.Factory(resolvingFactory) { videoId, failedUrl ->
            val denial = DenialClassifier.classify(failedUrl ?: "")
            Log.w(TAG, "Stream denied: $denial for videoId=$videoId")
            val clientFromUrl = DenialClassifier.clientOf(failedUrl)
            val cached = YtEngine.urlCache.findAnyForVideo(videoId)
            val client = clientFromUrl ?: cached?.client ?: "IOS"
            Log.w(TAG, "Marking client failed for $videoId: $client")
            YtEngine.markClientFailed(videoId, client)
            evictMedia(appContext, videoId)
        }
    }
}
