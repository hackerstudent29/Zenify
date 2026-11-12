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
    private const val CACHE_SIZE_BYTES = 512L * 1024L * 1024L // 512 MB

    @Volatile
    private var simpleCache: SimpleCache? = null

    @Synchronized
    fun getCache(context: Context): SimpleCache {
        return simpleCache ?: run {
            val cacheDir = File(context.applicationContext.cacheDir, "audio")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val evictor = LeastRecentlyUsedCacheEvictor(CACHE_SIZE_BYTES)
            val cache = SimpleCache(cacheDir, evictor)
            simpleCache = cache
            cache
        }
    }

    @Synchronized
    fun clearCache(context: Context) {
        try {
            simpleCache?.release()
            simpleCache = null
            val cacheDir = File(context.applicationContext.cacheDir, "audio")
            if (cacheDir.exists()) {
                cacheDir.deleteRecursively()
            }
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
            .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

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
                val resolved = runBlocking { YtEngine.resolve(videoId, wantVideo = wantVideo) }
                onResolved?.invoke(videoId, resolved)
                val targetUrl = if (isVideoUri && !resolved.videoUrl.isNullOrBlank()) {
                    resolved.videoUrl
                } else {
                    resolved.url
                }
                val headers = StreamHeaders.forClient(resolved.client)
                dataSpec.buildUpon()
                    .setUri(Uri.parse(targetUrl))
                    .setHttpRequestHeaders(headers)
                    .setCustomData(videoId)
                    .build()
            } else if (uri.host?.contains("googlevideo.com") == true) {
                val headers = StreamHeaders.forClient("WEB_REMIX", com.zenify.mobile.audio.ZenAudioPlugin.activeHeaders)
                dataSpec.buildUpon()
                    .setHttpRequestHeaders(headers)
                    .build()
            } else {
                dataSpec
            }
        }

        // 5. RefusedRetryDataSource: intercepts 403 on open(), marks failed client, and retries once
        return RefusedRetryDataSource.Factory(resolvingFactory) { videoId, failedUrl ->
            val denial = DenialClassifier.classify(failedUrl ?: "")
            Log.w(TAG, "Stream denied: $denial for videoId=$videoId")
            val cached = YtEngine.urlCache["$videoId#video"] ?: YtEngine.urlCache[videoId]
            val client = cached?.client ?: "UNKNOWN"
            YtEngine.markClientFailed(videoId, client)
        }
    }
}
