package com.zenify.mobile.yt

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Generation-guarded LRU stream URL cache.
 * Protects against race conditions where an in-flight slow resolve overwrites
 * an entry that was invalidated by a 403 failure.
 */
class StreamUrlCache(private val maxEntries: Int = 500) {
    data class Entry(
        val url: String,
        val headers: Map<String, String>,
        val client: String,
        val itag: Int?,
        val expiresAtSec: Long,
        val contentLength: Long?,
        val loudnessDb: Double?,
        val title: String?,
        val artist: String?,
        val videoUrl: String? = null,
        val videoWidth: Int? = null,
        val videoHeight: Int? = null,
    ) {
        fun isExpired(nowSec: Long = System.currentTimeMillis() / 1000): Boolean =
            nowSec >= (expiresAtSec - 60) // 60s safety margin

        fun toResolved(): YtEngine.Resolved = YtEngine.Resolved(
            url = url,
            headers = headers,
            client = client,
            itag = itag,
            expiresInSec = (expiresAtSec - (System.currentTimeMillis() / 1000)).coerceAtLeast(0).toInt(),
            contentLength = contentLength,
            loudnessDb = loudnessDb,
            title = title,
            artist = artist,
            videoUrl = videoUrl,
            videoWidth = videoWidth,
            videoHeight = videoHeight,
        )
    }

    private val cache = object : LinkedHashMap<String, Entry>(maxEntries, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Entry>?): Boolean =
            size > maxEntries
    }
    private val generations = ConcurrentHashMap<String, AtomicInteger>()

    @Synchronized
    operator fun get(id: String): Entry? {
        val entry = cache[id] ?: return null
        if (entry.isExpired()) {
            cache.remove(id)
            incrementGeneration(id)
            return null
        }
        return entry
    }

    @Synchronized
    fun put(id: String, resolved: YtEngine.Resolved, expectedGeneration: Int): Boolean {
        val currentGen = generation(id)
        if (currentGen != expectedGeneration) return false // Drop write if invalidated meanwhile
        val expiresAtSec = (System.currentTimeMillis() / 1000) + resolved.expiresInSec
        cache[id] = Entry(
            url = resolved.url,
            headers = resolved.headers,
            client = resolved.client,
            itag = resolved.itag,
            expiresAtSec = expiresAtSec,
            contentLength = resolved.contentLength,
            loudnessDb = resolved.loudnessDb,
            title = resolved.title,
            artist = resolved.artist,
            videoUrl = resolved.videoUrl,
            videoWidth = resolved.videoWidth,
            videoHeight = resolved.videoHeight,
        )
        return true
    }

    @Synchronized
    fun invalidate(id: String) {
        cache.remove(id)
        incrementGeneration(id)
    }

    @Synchronized
    fun generation(id: String): Int =
        generations.computeIfAbsent(id) { AtomicInteger(0) }.get()

    @Synchronized
    private fun incrementGeneration(id: String) {
        generations.computeIfAbsent(id) { AtomicInteger(0) }.incrementAndGet()
    }

    @Synchronized
    fun clear() {
        cache.clear()
        generations.clear()
    }
}

