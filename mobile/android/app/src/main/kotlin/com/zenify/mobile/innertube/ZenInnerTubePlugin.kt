package com.zenify.mobile.innertube

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.metrolist.innertube.YouTube
import com.metrolist.innertube.models.AlbumItem
import com.metrolist.innertube.models.ArtistItem
import com.metrolist.innertube.models.EpisodeItem
import com.metrolist.innertube.models.PlaylistItem
import com.metrolist.innertube.models.PodcastItem
import com.metrolist.innertube.models.SongItem
import com.metrolist.innertube.models.WatchEndpoint
import com.metrolist.innertube.models.YTItem
import com.metrolist.innertube.models.YouTubeLocale
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * ZenInnerTubePlugin connects the Android Metrolist InnerTube Kotlin pipeline
 * (InnerTubeX on WEB_REMIX YouTube Music) to the Zenify Flutter front-end
 * over the 'zenify/innertube' MethodChannel.
 *
 * All network calls run on Dispatchers.IO to maintain 60-120fps UI smoothness,
 * returning structured, type-safe data to Dart.
 */
class ZenInnerTubePlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var channel: MethodChannel
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun <V> lru(n: Int) = java.util.Collections.synchronizedMap(
        object : LinkedHashMap<String, V>(n, 0.75f, true) {
            override fun removeEldestEntry(e: MutableMap.MutableEntry<String, V>?) = size > n
        }
    )
    private val lyricsEp = lru<com.metrolist.innertube.models.BrowseEndpoint>(64)
    private val lyricsText = lru<String>(64) // "" = confirmed none
    private val lyricsInflight = java.util.concurrent.ConcurrentHashMap<String, kotlinx.coroutines.Deferred<String?>>()
    private val videoDetailsCache = lru<Map<String, Any?>>(150)

    private fun extractRunsOrSimpleText(obj: org.json.JSONObject?): String {
        if (obj == null) return ""
        val simple = obj.optString("simpleText", "").trim()
        if (simple.isNotEmpty()) return simple
        val runs = obj.optJSONArray("runs") ?: return ""
        val sb = StringBuilder()
        for (i in 0 until runs.length()) {
            val t = runs.optJSONObject(i)?.optString("text", "") ?: ""
            if (t.isNotEmpty()) sb.append(t)
        }
        return sb.toString().trim()
    }

    private fun scanMusicInfoRows(node: Any?, out: MutableMap<String, String>) {
        when (node) {
            is org.json.JSONObject -> {
                val infoRow = node.optJSONObject("infoRowRenderer")
                if (infoRow != null) {
                    val label = extractRunsOrSimpleText(infoRow.optJSONObject("title")).lowercase()
                    val value = extractRunsOrSimpleText(infoRow.optJSONObject("defaultMetadata"))
                        .ifBlank { extractRunsOrSimpleText(infoRow.optJSONObject("expandedMetadata")) }
                    if (value.isNotBlank()) {
                        when {
                            label == "song" && !out.containsKey("song") -> out["song"] = value
                            (label == "artist" || label == "artists") && !out.containsKey("artist") -> out["artist"] = value
                            label == "album" && !out.containsKey("album") -> out["album"] = value
                        }
                    }
                }
                val keys = node.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    if (k == "infoRowRenderer") continue
                    scanMusicInfoRows(node.opt(k), out)
                    if (out.containsKey("song") && out.containsKey("artist")) break
                }
            }
            is org.json.JSONArray -> {
                for (i in 0 until node.length()) {
                    scanMusicInfoRows(node.opt(i), out)
                    if (out.containsKey("song") && out.containsKey("artist")) break
                }
            }
        }
    }

    private fun fetchMusicPanelFromNext(videoId: String): Map<String, String> {
        val out = mutableMapOf<String, String>()
        try {
            val jsonBody = """{"context":{"client":{"clientName":"WEB","clientVersion":"2.20240101.01.00","hl":"en","gl":"IN"}},"videoId":"$videoId"}"""
            val request = okhttp3.Request.Builder()
                .url("https://www.youtube.com/youtubei/v1/next?prettyPrint=false")
                .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
                .header("Content-Type", "application/json")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .header("Origin", "https://www.youtube.com")
                .header("Referer", "https://www.youtube.com/")
                .build()
            val body = com.zenify.mobile.yt.Net.api.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return out
                response.body.string()
            }
            val root = org.json.JSONObject(body)
            val panels = root.optJSONArray("engagementPanels") ?: return out
            for (i in 0 until panels.length()) {
                val p = panels.optJSONObject(i) ?: continue
                scanMusicInfoRows(p, out)
                if (out.containsKey("song") && out.containsKey("artist")) break
            }
        } catch (_: Exception) {}
        return out
    }

    private suspend fun fetchLyrics(videoId: String): String? = try {
        val ep = lyricsEp[videoId]
            ?: YouTube.next(WatchEndpoint(videoId = videoId)).getOrNull()?.lyricsEndpoint?.also { lyricsEp[videoId] = it }
        val t = ep?.let { YouTube.lyrics(it).getOrNull() }?.takeIf { it.isNotBlank() }
        lyricsText[videoId] = t ?: ""
        t
    } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { null }

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, "zenify/innertube")
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        scope.launch {
            try {
                Log.d("ZenInnerTube", "onMethodCall: ${call.method}")
                when (call.method) {
                    "getStreamUrl" -> {
                        val rawVideoId = call.argument<String>("videoId")
                        val videoId = rawVideoId?.removePrefix("yt-")?.trim()
                        if (videoId.isNullOrBlank()) {
                            replyError(result, "INVALID_ARG", "videoId is required", null)
                            return@launch
                        }
                        val quality = call.argument<String>("quality") ?: com.zenify.mobile.yt.YtEngine.currentQuality
                        val wantVideo = call.argument<Boolean>("wantVideo") ?: false
                        val maxVideoHeight = call.argument<Number>("maxVideoHeight")?.toInt()
                        val allowHls = call.argument<Boolean>("allowHls") ?: true
                        try {
                            val resolved = com.zenify.mobile.yt.YtEngine.resolve(
                                videoId,
                                wantVideo = wantVideo,
                                quality = quality,
                                maxVideoHeight = maxVideoHeight,
                                allowHls = allowHls,
                            )
                            val map = mapOf(
                                "url" to resolved.url,
                                "videoUrl" to resolved.videoUrl,
                                "videoWidth" to resolved.videoWidth,
                                "videoHeight" to resolved.videoHeight,
                                "isHls" to resolved.isHls,
                                "headers" to resolved.headers,
                                "client" to resolved.client,
                                "itag" to resolved.itag,
                                "contentLength" to resolved.contentLength,
                                "expiresInSec" to resolved.expiresInSec
                            )
                            replySuccess(result, map)
                        } catch (e: Exception) {
                            Log.w("ZenInnerTube", "getStreamUrl failed for $videoId: ${e.message}")
                            replyError(result, "RESOLVE_FAILED", e.message, null)
                        }
                    }
                    "searchSummary" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        try {
                            val outcome = YouTube.searchSummary(query)
                            val summaryList = outcome.getOrNull()?.summaries?.map { summary ->
                                val isVideoSection = summary.title.contains("video", ignoreCase = true)
                                mapOf(
                                    "title" to summary.title,
                                    "items" to summary.items.mapNotNull { item ->
                                        val mapped = ytItemToMap(item)
                                        if (mapped != null && isVideoSection) {
                                            mapped + ("type" to "video")
                                        } else {
                                            mapped
                                        }
                                    }
                                )
                            }?.filter { (it["items"] as? List<*>)?.isNotEmpty() == true } ?: emptyList()

                            if (summaryList.isNotEmpty()) {
                                val summaryDesc = summaryList.joinToString { "${it["title"]}: ${(it["items"] as? List<*>)?.size ?: 0}" }
                                Log.i("ZenInnerTube", "searchSummary SUCCESS: ${summaryList.size} sections for $query -> $summaryDesc")
                                replySuccess(result, summaryList)
                                return@launch
                            }

                            // Fallback: If searchSummary yielded 0 sections, query songs directly
                            Log.i("ZenInnerTube", "searchSummary had 0 items for '$query', querying songs fallback...")
                            val songsOutcome = YouTube.search(query, YouTube.SearchFilter.FILTER_SONG)
                            val fallbackSongs = songsOutcome.getOrNull()?.items?.filterIsInstance<SongItem>()?.map {
                                songItemToMap(it) + ("type" to "song")
                            } ?: emptyList()

                            if (fallbackSongs.isNotEmpty()) {
                                val fallbackSections = listOf(
                                    mapOf(
                                        "title" to "Songs",
                                        "items" to fallbackSongs
                                    )
                                )
                                Log.i("ZenInnerTube", "searchSummary fallback to songs SUCCESS: ${fallbackSongs.size} songs for $query")
                                replySuccess(result, fallbackSections)
                                return@launch
                            }

                            replySuccess(result, emptyList<Map<String, Any?>>())
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "searchSummary error for $query: ${e.message}", e)
                            try {
                                val songsOutcome = YouTube.search(query, YouTube.SearchFilter.FILTER_SONG)
                                val fallbackSongs = songsOutcome.getOrNull()?.items?.filterIsInstance<SongItem>()?.map {
                                    songItemToMap(it) + ("type" to "song")
                                } ?: emptyList()
                                if (fallbackSongs.isNotEmpty()) {
                                    replySuccess(result, listOf(mapOf("title" to "Songs", "items" to fallbackSongs)))
                                    return@launch
                                }
                            } catch (_: Exception) {}
                            replySuccess(result, emptyList<Map<String, Any?>>())
                        }
                    }

                    "searchSongs" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        try {
                            val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_SONG)
                            val songs = outcome.getOrNull()?.items?.filterIsInstance<SongItem>()?.map {
                                songItemToMap(it) + ("type" to "song")
                            } ?: emptyList()
                            Log.i("ZenInnerTube", "searchSongs SUCCESS: ${songs.size} songs for $query")
                            replySuccess(result, songs)
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "searchSongs FAILED for $query: ${e.message}", e)
                            replySuccess(result, emptyList<Map<String, Any?>>())
                        }
                    }

                    "searchAlbums" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        try {
                            val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_ALBUM)
                            val albums = outcome.getOrNull()?.items?.filterIsInstance<AlbumItem>()?.map {
                                albumItemToMap(it) + ("type" to "album")
                            } ?: emptyList()
                            Log.i("ZenInnerTube", "searchAlbums SUCCESS: ${albums.size} albums for $query")
                            replySuccess(result, albums)
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "searchAlbums FAILED for $query: ${e.message}", e)
                            replySuccess(result, emptyList<Map<String, Any?>>())
                        }
                    }

                    "searchArtists" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        try {
                            val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_ARTIST)
                            val artists = outcome.getOrNull()?.items?.filterIsInstance<ArtistItem>()?.map {
                                artistItemToMap(it) + ("type" to "artist")
                            } ?: emptyList()
                            Log.i("ZenInnerTube", "searchArtists SUCCESS: ${artists.size} artists for $query")
                            replySuccess(result, artists)
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "searchArtists FAILED for $query: ${e.message}", e)
                            replySuccess(result, emptyList<Map<String, Any?>>())
                        }
                    }

                    "searchPlaylists" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        try {
                            val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_FEATURED_PLAYLIST)
                            val playlists = outcome.getOrNull()?.items?.filterIsInstance<PlaylistItem>()?.map {
                                playlistItemToMap(it) + ("type" to "playlist")
                            } ?: emptyList()
                            Log.i("ZenInnerTube", "searchPlaylists SUCCESS: ${playlists.size} playlists for $query")
                            replySuccess(result, playlists)
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "searchPlaylists FAILED for $query: ${e.message}", e)
                            replySuccess(result, emptyList<Map<String, Any?>>())
                        }
                    }

                    "searchVideos" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        try {
                            val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_VIDEO)
                            val videos = outcome.getOrNull()?.items?.mapNotNull { item ->
                                when (item) {
                                    is SongItem -> songItemToMap(item) + ("type" to "video")
                                    else -> ytItemToMap(item)?.let { it + ("type" to "video") }
                                }
                            } ?: emptyList()
                            Log.i("ZenInnerTube", "searchVideos SUCCESS: ${videos.size} videos for $query")
                            replySuccess(result, videos)
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "searchVideos FAILED for $query: ${e.message}", e)
                            replySuccess(result, emptyList<Map<String, Any?>>())
                        }
                    }

                    "searchSuggestions" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<String>())
                            return@launch
                        }
                        val outcome = YouTube.searchSuggestions(query)
                        outcome.fold(
                            onSuccess = { suggestions ->
                                replySuccess(result, suggestions.queries)
                            },
                            onFailure = { err ->
                                Log.e("ZenInnerTube", "searchSuggestions FAILED for $query: ${err.message}", err)
                                replyError(result, "SUGGEST_ERROR", err.message, null)
                            }
                        )
                    }

                    "getArtist" -> {
                        var browseId = call.argument<String>("browseId") ?: ""
                        val artistName = call.argument<String>("name")
                            ?: call.argument<String>("artistName")
                            ?: ""
                        Log.d("ZenInnerTube", "getArtist browseId=$browseId artistName=$artistName")

                        // 1. If browseId is missing, resolve it through YouTube Music artist search or song credits
                        if (browseId.isBlank() && artistName.isNotBlank()) {
                            try {
                                val searchOutcome = YouTube.search(artistName, YouTube.SearchFilter.FILTER_ARTIST)
                                val foundArtist = searchOutcome.getOrNull()?.items
                                    ?.filterIsInstance<ArtistItem>()
                                    ?.firstOrNull()
                                if (foundArtist != null && foundArtist.id.isNotBlank()) {
                                    browseId = foundArtist.id
                                } else {
                                    val summaryOutcome = YouTube.searchSummary(artistName)
                                    val summaryArtist = summaryOutcome.getOrNull()?.summaries
                                        ?.flatMap { it.items }
                                        ?.filterIsInstance<ArtistItem>()
                                        ?.firstOrNull()
                                    if (summaryArtist != null && summaryArtist.id.isNotBlank()) {
                                        browseId = summaryArtist.id
                                    }
                                }
                            } catch (e: Exception) {
                                Log.w("ZenInnerTube", "Artist search failed: ${e.message}")
                            }

                            // If still blank, search songs by artist and extract the artist's real channel ID from song credits
                            if (browseId.isBlank()) {
                                try {
                                    val songsOutcome = YouTube.search(artistName, YouTube.SearchFilter.FILTER_SONG)
                                    val songs = songsOutcome.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                                    val matched = songs.flatMap { it.artists }
                                        .firstOrNull { it.id != null && it.id.isNotBlank() && it.name.contains(artistName, ignoreCase = true) }
                                    if (matched != null && !matched.id.isNullOrBlank()) {
                                        browseId = matched.id
                                        Log.i("ZenInnerTube", "Resolved artist browseId from song artist credit: $browseId (${matched.name})")
                                    }
                                } catch (e: Exception) {
                                    Log.w("ZenInnerTube", "Song credits artist search failed: ${e.message}")
                                }
                            }
                        }

                        // 2. If browseId is resolved, load artist channel
                        if (browseId.isNotBlank()) {
                            val outcome = YouTube.artist(browseId)
                            if (outcome.isSuccess) {
                                val page = outcome.getOrThrow()
                                val artistData = artistItemToMap(page.artist).toMutableMap()
                                if ((artistData["title"] as? String).isNullOrBlank() && artistName.isNotBlank()) {
                                    artistData["title"] = artistName
                                }
                                val bannerUrl = (artistData["thumbnail"] as? String).orEmpty()
                                if (bannerUrl.isNotBlank()) {
                                    artistData["banner"] = bannerUrl
                                }

                                val sectionsList = ArrayList<Map<String, Any?>>()
                                for (section in page.sections) {
                                    val secLower = section.title.lowercase()
                                    val secIsSingle = secLower.contains("single") || secLower.contains("ep")
                                    sectionsList.add(
                                        mapOf(
                                            "title" to section.title,
                                            "items" to section.items.mapNotNull { item ->
                                                val mapped = ytItemToMap(item)
                                                if (mapped != null && item is AlbumItem && item.albumType == null && secIsSingle) {
                                                    mapped + ("albumType" to "Single") + ("isSingle" to true)
                                                } else {
                                                    mapped
                                                }
                                            }
                                        )
                                    )
                                }

                                // If artist channel has no songs or albums shelf, fetch missing shelves in parallel
                                val needsSongs = sectionsList.none { sec ->
                                    val title = (sec["title"] as? String).orEmpty().lowercase()
                                    val items = sec["items"] as? List<*> ?: emptyList<Any>()
                                    (title.contains("song") || title.contains("popular") || title.contains("track") || title.contains("top")) && items.isNotEmpty()
                                }
                                val needsAlbums = sectionsList.none { sec ->
                                    val title = (sec["title"] as? String).orEmpty().lowercase()
                                    val items = sec["items"] as? List<*> ?: emptyList<Any>()
                                    (title.contains("album") || title.contains("release") || title.contains("single")) && items.isNotEmpty()
                                }

                                if ((needsSongs || needsAlbums) && artistName.isNotBlank()) {
                                    val songsDef: kotlinx.coroutines.Deferred<List<SongItem>>? = if (needsSongs) {
                                        scope.async {
                                            try {
                                                YouTube.search(artistName, YouTube.SearchFilter.FILTER_SONG).getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                                            } catch (e: Exception) {
                                                Log.w("ZenInnerTube", "Failed supplemental songs for $artistName: ${e.message}")
                                                emptyList()
                                            }
                                        }
                                    } else {
                                        null
                                    }
                                    val albumsDef: kotlinx.coroutines.Deferred<List<AlbumItem>>? = if (needsAlbums) {
                                        scope.async {
                                            try {
                                                YouTube.search(artistName, YouTube.SearchFilter.FILTER_ALBUM).getOrNull()?.items?.filterIsInstance<AlbumItem>() ?: emptyList()
                                            } catch (e: Exception) {
                                                Log.w("ZenInnerTube", "Failed supplemental albums for $artistName: ${e.message}")
                                                emptyList()
                                            }
                                        }
                                    } else {
                                        null
                                    }
                                    val supSongs = songsDef?.await() ?: emptyList()
                                    val supAlbums = albumsDef?.await() ?: emptyList()
                                    if (supSongs.isNotEmpty()) {
                                        sectionsList.add(0, mapOf(
                                            "title" to "Songs",
                                            "items" to supSongs.take(25).map { songItemToMap(it) + ("type" to "song") }
                                        ))
                                    }
                                    if (supAlbums.isNotEmpty()) {
                                        sectionsList.add(mapOf(
                                            "title" to "Albums",
                                            "items" to supAlbums.take(20).map { albumItemToMap(it) + ("type" to "album") }
                                        ))
                                    }
                                }

                                val artistMap = mapOf(
                                    "artist" to artistData,
                                    "banner" to bannerUrl,
                                    "description" to (page.description ?: "Official artist profile for ${artistData["title"] ?: artistName} on Zenify."),
                                    "subscriberCountText" to (page.subscriberCountText ?: "Official Artist"),
                                    "monthlyListenerCount" to page.monthlyListenerCount,
                                    "sections" to sectionsList
                                )
                                Log.i("ZenInnerTube", "getArtist SUCCESS for $artistName ($browseId): ${sectionsList.size} sections")
                                replySuccess(result, artistMap)
                                return@launch
                            }
                        }

                        // 3. Fallback when browseId cannot be resolved or YouTube.artist failed
                        val fallbackName = if (artistName.isNotBlank()) artistName else "Artist"
                        var songs = emptyList<SongItem>()
                        var albums = emptyList<AlbumItem>()
                        try {
                            val songsOutcome = YouTube.search(fallbackName, YouTube.SearchFilter.FILTER_SONG)
                            songs = songsOutcome.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                        } catch (e: Exception) {
                            Log.w("ZenInnerTube", "Fallback songs search failed: ${e.message}")
                        }
                        try {
                            val albumsOutcome = YouTube.search(fallbackName, YouTube.SearchFilter.FILTER_ALBUM)
                            albums = albumsOutcome.getOrNull()?.items?.filterIsInstance<AlbumItem>() ?: emptyList()
                        } catch (e: Exception) {
                            Log.w("ZenInnerTube", "Fallback albums search failed: ${e.message}")
                        }

                        val thumb = songs.firstOrNull()?.thumbnail ?: albums.firstOrNull()?.thumbnail ?: ""
                        val fallbackSections = ArrayList<Map<String, Any?>>()
                        if (songs.isNotEmpty()) {
                            fallbackSections.add(mapOf(
                                "title" to "Songs",
                                "items" to songs.take(25).map { songItemToMap(it) + ("type" to "song") }
                            ))
                        }
                        if (albums.isNotEmpty()) {
                            fallbackSections.add(mapOf(
                                "title" to "Albums",
                                "items" to albums.take(20).map { albumItemToMap(it) + ("type" to "album") }
                            ))
                        }

                        val fallbackMap = mapOf(
                            "artist" to mapOf(
                                "id" to browseId,
                                "title" to fallbackName,
                                "thumbnail" to thumb,
                                "channelId" to browseId,
                                "shareLink" to ""
                            ),
                            "banner" to thumb,
                            "description" to "Official artist profile for $fallbackName on Zenify.",
                            "subscriberCountText" to "Official Artist",
                            "monthlyListenerCount" to null,
                            "sections" to fallbackSections
                        )
                        Log.i("ZenInnerTube", "getArtist fallback SUCCESS for $fallbackName: ${songs.size} songs, ${albums.size} albums")
                        replySuccess(result, fallbackMap)
                    }

                    "getAlbum" -> {
                        var browseId = call.argument<String>("browseId") ?: ""
                        val videoId = call.argument<String>("videoId")?.replace("yt-", "") ?: ""
                        var albumTitle = call.argument<String>("title")
                            ?: call.argument<String>("albumTitle")
                            ?: ""
                        val artistName = call.argument<String>("artist")
                            ?: call.argument<String>("artistName")
                            ?: ""
                        val songTitle = call.argument<String>("songTitle") ?: ""
                        val isSingle = call.argument<Boolean>("isSingle") ?: false
                        val isVideo = call.argument<Boolean>("isVideo") ?: false
                        val sourceContext = "$songTitle $albumTitle".trim()
                        Log.d(
                            "ZenInnerTube",
                            "getAlbum browseId=$browseId videoId=$videoId title=$albumTitle artist=$artistName songTitle=$songTitle isSingle=$isSingle isVideo=$isVideo"
                        )

                        if (isVideo) {
                            replyError(result, "VIDEO_NO_ALBUM", "Video songs remain on their video single page", null)
                            return@launch
                        }

                        // 1. If browseId is missing, resolve strictly from the matching videoId item via watch next
                        if (browseId.isBlank() && videoId.isNotBlank()) {
                            try {
                                val nextOutcome = YouTube.next(WatchEndpoint(videoId = videoId))
                                val resolvedItem = nextOutcome.getOrNull()?.items?.firstOrNull { it.id == videoId }
                                val resolvedAlbum = resolvedItem?.album
                                if (resolvedAlbum != null &&
                                    resolvedAlbum.id.isNotBlank() &&
                                    !isVariantConflict(sourceContext, resolvedAlbum.name)
                                ) {
                                    browseId = resolvedAlbum.id
                                    Log.i("ZenInnerTube", "Resolved album browseId strictly from WatchEndpoint(videoId): $browseId (${resolvedAlbum.name})")
                                } else {
                                    val radioOutcome = YouTube.next(WatchEndpoint(videoId = videoId, playlistId = "RDAMVM$videoId"))
                                    val radioItem = radioOutcome.getOrNull()?.items?.firstOrNull { it.id == videoId }
                                    val radioAlbum = radioItem?.album
                                    if (radioAlbum != null &&
                                        radioAlbum.id.isNotBlank() &&
                                        !isVariantConflict(sourceContext, radioAlbum.name)
                                    ) {
                                        browseId = radioAlbum.id
                                        Log.i("ZenInnerTube", "Resolved album browseId strictly from Radio next: $browseId (${radioAlbum.name})")
                                    } else {
                                        val candidateName = resolvedAlbum?.name ?: radioAlbum?.name
                                        if (!candidateName.isNullOrBlank() &&
                                            !candidateName.equals("Single", ignoreCase = true) &&
                                            !isVariantConflict(sourceContext, candidateName)
                                        ) {
                                            albumTitle = candidateName
                                        }
                                    }
                                }
                            } catch (e: Exception) {
                                Log.w("ZenInnerTube", "Failed to resolve album from videoId=$videoId: ${e.message}")
                            }
                        }

                        // 2. If browseId is still missing, search albums and strictly validate candidates (reject Unplugged / Remix / wrong artist)
                        if (browseId.isBlank()) {
                            val cleanAlb = if (albumTitle.equals("Single", ignoreCase = true)) "" else albumTitle.trim()
                            val cleanSong = songTitle.trim()
                            val candidateQuery = when {
                                cleanAlb.isNotBlank() -> {
                                    if (artistName.isNotBlank() && !cleanAlb.contains(artistName, ignoreCase = true)) "$cleanAlb $artistName" else cleanAlb
                                }
                                cleanSong.isNotBlank() -> {
                                    if (artistName.isNotBlank() && !cleanSong.contains(artistName, ignoreCase = true)) "$cleanSong $artistName" else cleanSong
                                }
                                else -> ""
                            }
                            if (candidateQuery.isNotBlank()) {
                                val albumSearch = YouTube.search(candidateQuery, YouTube.SearchFilter.FILTER_ALBUM)
                                val candidates = albumSearch.getOrNull()?.items
                                    ?.filterIsInstance<AlbumItem>()
                                    ?.map { it to scoreAlbumCandidate(it, cleanAlb, cleanSong, artistName, preferSingle = isSingle) }
                                    ?.filter { it.second > 0 }
                                    ?.sortedByDescending { it.second }
                                    ?.take(4)
                                    ?: emptyList()

                                for ((cand, score) in candidates) {
                                    val candId = cand.browseId.ifBlank { cand.id }
                                    if (candId.isBlank()) continue
                                    val checkPage = YouTube.album(candId).getOrNull()
                                    if (checkPage != null &&
                                        !isVariantConflict(sourceContext, checkPage.album.title) &&
                                        (cleanSong.isBlank() || songContainedInAlbum(checkPage.songs, cleanSong, artistName))
                                    ) {
                                        browseId = candId
                                        Log.i("ZenInnerTube", "Validated album browseId=$browseId title='${checkPage.album.title}' score=$score")
                                        break
                                    }
                                }
                            }
                        }

                        // 3. Normalize browseId if it starts with OLAK5uy_ (prefix with VL for playlist browsing)
                        var cleanBrowseId = browseId
                        if (cleanBrowseId.startsWith("OLAK5uy_")) {
                            cleanBrowseId = "VL$cleanBrowseId"
                        }

                        if (cleanBrowseId.isNotBlank()) {
                            if (cleanBrowseId.startsWith("VL") || cleanBrowseId.startsWith("PL") || cleanBrowseId.startsWith("RD")) {
                                val outcome = YouTube.playlist(cleanBrowseId)
                                if (outcome.isSuccess) {
                                    val page = outcome.getOrThrow()
                                    val p = page.playlist
                                    val albumMap = mapOf(
                                        "album" to mapOf(
                                            "id" to p.id,
                                            "browseId" to cleanBrowseId,
                                            "playlistId" to p.id,
                                            "title" to p.title,
                                            "artists" to listOf(mapOf("id" to null, "name" to (p.author?.name ?: artistName))),
                                            "thumbnail" to (p.thumbnail ?: ""),
                                            "year" to 2026,
                                            "explicit" to false,
                                            "albumType" to (if (isSingle || page.songs.size <= 1) "Single" else "Album"),
                                            "isSingle" to (isSingle || page.songs.size <= 1)
                                        ),
                                        "songs" to page.songs.map { songItemToMap(it) },
                                        "otherVersions" to emptyList<Map<String, Any?>>()
                                    )
                                    Log.i("ZenInnerTube", "getAlbum playlist SUCCESS for $cleanBrowseId: ${page.songs.size} songs")
                                    replySuccess(result, albumMap)
                                    return@launch
                                }
                            }

                            val outcome = YouTube.album(cleanBrowseId)
                            if (outcome.isSuccess) {
                                val page = outcome.getOrThrow()

                                // If opening from an Albums / Song context (NOT a Singles tap) and this release only has 1 song,
                                // look ONLY for a strictly validated multi-song parent album (never Unplugged / Lofi / Remix / wrong album).
                                if (!isSingle && page.songs.size <= 1) {
                                    val verifiedSongTarget = if (songTitle.isNotBlank()) songTitle else (page.songs.firstOrNull()?.title ?: "")
                                    val otherCandidates = page.otherVersions
                                        .filter { other ->
                                            other.id != cleanBrowseId &&
                                                !isVariantConflict(sourceContext.ifBlank { verifiedSongTarget }, other.title) &&
                                                !other.albumType.equals("Single", ignoreCase = true) &&
                                                artistMatches(artistName, other.artists?.map { it.name }.orEmpty())
                                        }
                                    for (other in otherCandidates.take(3)) {
                                        if (other.id.isBlank()) continue
                                        val otherOutcome = YouTube.album(other.id)
                                        val otherPage = otherOutcome.getOrNull()
                                        if (otherPage != null &&
                                            otherPage.songs.size > 1 &&
                                            !isVariantConflict(sourceContext.ifBlank { verifiedSongTarget }, otherPage.album.title) &&
                                            songContainedInAlbum(otherPage.songs, verifiedSongTarget, artistName)
                                        ) {
                                            val otherMap = mapOf(
                                                "album" to albumItemToMap(otherPage.album),
                                                "songs" to otherPage.songs.map { songItemToMap(it) },
                                                "otherVersions" to otherPage.otherVersions.map { albumItemToMap(it) }
                                            )
                                            Log.i("ZenInnerTube", "getAlbum upgraded single to validated multi-song album ${other.id}: ${otherPage.songs.size} songs")
                                            replySuccess(result, otherMap)
                                            return@launch
                                        }
                                    }

                                    // Check if songTitle or albumTitle has explicit movie/soundtrack tag: From "..."
                                    val fullTitle = if (songTitle.isNotBlank()) songTitle else albumTitle
                                    val fromRegex = Regex("""(?i)\(From\s+["']?([^"')]+)["']?\)""")
                                    val movieMatch = fromRegex.find(fullTitle)
                                    val soundtrackName = movieMatch?.groupValues?.getOrNull(1)?.trim()
                                    if (!soundtrackName.isNullOrBlank()) {
                                        try {
                                            val albumSearch = YouTube.search("$soundtrackName $artistName", YouTube.SearchFilter.FILTER_ALBUM)
                                            val candidates = albumSearch.getOrNull()?.items
                                                ?.filterIsInstance<AlbumItem>()
                                                ?.map { it to scoreAlbumCandidate(it, soundtrackName, verifiedSongTarget, artistName, preferSingle = false) }
                                                ?.filter { it.second > 0 }
                                                ?.sortedByDescending { it.second }
                                                ?.take(3)
                                                ?: emptyList()
                                            for ((cand, _) in candidates) {
                                                val fullAlbumId = cand.browseId.ifBlank { cand.id }
                                                if (fullAlbumId.isBlank() || fullAlbumId == cleanBrowseId) continue
                                                val fullPage = YouTube.album(fullAlbumId).getOrNull()
                                                if (fullPage != null &&
                                                    fullPage.songs.size > 1 &&
                                                    !isVariantConflict(sourceContext.ifBlank { verifiedSongTarget }, fullPage.album.title) &&
                                                    songContainedInAlbum(fullPage.songs, verifiedSongTarget, artistName)
                                                ) {
                                                    val fullMap = mapOf(
                                                        "album" to albumItemToMap(fullPage.album),
                                                        "songs" to fullPage.songs.map { songItemToMap(it) },
                                                        "otherVersions" to fullPage.otherVersions.map { albumItemToMap(it) }
                                                    )
                                                    Log.i("ZenInnerTube", "getAlbum resolved validated soundtrack album $fullAlbumId for '$soundtrackName': ${fullPage.songs.size} songs")
                                                    replySuccess(result, fullMap)
                                                    return@launch
                                                }
                                            }
                                        } catch (e: Exception) {
                                            Log.w("ZenInnerTube", "Failed to resolve soundtrack album: ${e.message}")
                                        }
                                    }
                                }

                                val albumMap = mapOf(
                                    "album" to albumItemToMap(page.album),
                                    "songs" to page.songs.map { songItemToMap(it) },
                                    "otherVersions" to page.otherVersions.map { albumItemToMap(it) }
                                )
                                Log.i("ZenInnerTube", "getAlbum SUCCESS for $cleanBrowseId (isSingle=$isSingle): ${page.songs.size} songs")
                                replySuccess(result, albumMap)
                                return@launch
                            } else {
                                Log.w("ZenInnerTube", "YouTube.album failed for $cleanBrowseId: ${outcome.exceptionOrNull()?.message}")
                                if (cleanBrowseId.startsWith("MPREb_")) {
                                    val vlId = "VL$cleanBrowseId"
                                    val vlOutcome = YouTube.playlist(vlId)
                                    if (vlOutcome.isSuccess) {
                                        val page = vlOutcome.getOrThrow()
                                        val p = page.playlist
                                        val albumMap = mapOf(
                                            "album" to mapOf(
                                                "id" to p.id,
                                                "browseId" to cleanBrowseId,
                                                "playlistId" to p.id,
                                                "title" to p.title,
                                                "artists" to listOf(mapOf("id" to null, "name" to (p.author?.name ?: artistName))),
                                                "thumbnail" to (p.thumbnail ?: ""),
                                                "year" to 2026,
                                                "explicit" to false,
                                                "albumType" to (if (isSingle || page.songs.size <= 1) "Single" else "Album"),
                                                "isSingle" to (isSingle || page.songs.size <= 1)
                                            ),
                                            "songs" to page.songs.map { songItemToMap(it) },
                                            "otherVersions" to emptyList<Map<String, Any?>>()
                                        )
                                        Log.i("ZenInnerTube", "getAlbum VL-playlist fallback SUCCESS for $vlId: ${page.songs.size} songs")
                                        replySuccess(result, albumMap)
                                        return@launch
                                    }
                                }
                            }
                        }

                        // 4. Strictly validated song-based album lookup fallback (never dumps unrelated search songs as fake album)
                        val cleanFallbackAlb = if (albumTitle.equals("Single", ignoreCase = true)) "" else albumTitle.trim()
                        val fallbackSearchQuery = when {
                            cleanFallbackAlb.isNotBlank() -> "$cleanFallbackAlb $artistName".trim()
                            songTitle.isNotBlank() -> "$songTitle $artistName".trim()
                            else -> ""
                        }
                        if (fallbackSearchQuery.isNotBlank()) {
                            val searchSongs = YouTube.search(fallbackSearchQuery, YouTube.SearchFilter.FILTER_SONG)
                            val songs = searchSongs.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                            val matchingSongs = songs.filter { s ->
                                val candText = "${s.title} ${s.album?.name.orEmpty()}"
                                !isVariantConflict(sourceContext, candText) &&
                                    artistMatches(artistName, s.artists.map { it.name }) &&
                                    (songTitle.isBlank() || normalizedTitleMatch(songTitle, s.title))
                            }
                            for (s in matchingSongs.take(4)) {
                                val foundAlbum = s.album ?: continue
                                if (foundAlbum.id.isBlank() || foundAlbum.id == cleanBrowseId) continue
                                if (isVariantConflict(sourceContext, foundAlbum.name)) continue
                                val secondPage = YouTube.album(foundAlbum.id).getOrNull()
                                if (secondPage != null &&
                                    !isVariantConflict(sourceContext, secondPage.album.title) &&
                                    (songTitle.isBlank() || songContainedInAlbum(secondPage.songs, songTitle, artistName))
                                ) {
                                    val albumMap = mapOf(
                                        "album" to albumItemToMap(secondPage.album),
                                        "songs" to secondPage.songs.map { songItemToMap(it) },
                                        "otherVersions" to secondPage.otherVersions.map { albumItemToMap(it) }
                                    )
                                    Log.i("ZenInnerTube", "getAlbum validated via song album id ${foundAlbum.id}: ${secondPage.songs.size} songs")
                                    replySuccess(result, albumMap)
                                    return@launch
                                }
                            }
                        }

                        replyError(result, "ALBUM_NOT_FOUND", "Could not load validated album for $browseId", null)
                    }

                    "getSong" -> {
                        val videoId = call.argument<String>("videoId")?.removePrefix("yt-")?.trim() ?: ""
                        if (videoId.isBlank()) {
                            replyError(result, "BAD_ARGS", "videoId cannot be blank", null)
                            return@launch
                        }
                        try {
                            val nextOutcome = YouTube.next(WatchEndpoint(videoId = videoId))
                            val nextSongs = nextOutcome.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                            val match = nextSongs.firstOrNull { it.id == videoId } ?: nextSongs.firstOrNull()
                            if (match != null) {
                                replySuccess(result, songItemToMap(match))
                                return@launch
                            }
                        } catch (e: Exception) {
                            Log.w("ZenInnerTube", "getSong next fallback: ${e.message}")
                        }

                        val quality = call.argument<String>("quality") ?: com.zenify.mobile.yt.YtEngine.currentQuality
                        try {
                            val resolved = com.zenify.mobile.yt.YtEngine.resolve(videoId, wantVideo = false, quality = quality)
                            val songMap = mapOf(
                                "id" to videoId,
                                "title" to (resolved.title ?: "YouTube Track"),
                                "artists" to listOf(mapOf("name" to (resolved.artist ?: "YouTube Music"))),
                                "thumbnail" to "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
                                "duration" to 210
                            )
                            replySuccess(result, songMap)
                            return@launch
                        } catch (e: Exception) {
                            Log.e("ZenInnerTube", "getSong error for $videoId: ${e.message}")
                            replyError(result, "SONG_ERROR", e.message, null)
                        }
                    }

                    "getVideoDetails" -> {
                        val videoId = call.argument<String>("videoId")?.removePrefix("yt-")?.trim() ?: ""
                        if (videoId.isBlank()) {
                            replyError(result, "BAD_ARGS", "videoId cannot be blank", null)
                            return@launch
                        }
                        videoDetailsCache[videoId]?.let { cached ->
                            replySuccess(result, cached)
                            return@launch
                        }
                        try {
                            val jsonBody = """{"context":{"client":{"clientName":"WEB","clientVersion":"2.20240101.01.00","hl":"en","gl":"IN"}},"videoId":"$videoId"}"""
                            val request = okhttp3.Request.Builder()
                                .url("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
                                .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
                                .header("Content-Type", "application/json")
                                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                                .header("Origin", "https://www.youtube.com")
                                .header("Referer", "https://www.youtube.com/")
                                .build()
                            val response = com.zenify.mobile.yt.Net.api.newCall(request).execute()
                            val body = response.body.string()
                            val json = org.json.JSONObject(body)
                            val mf = json.optJSONObject("microformat")?.optJSONObject("playerMicroformatRenderer")
                            val vd = json.optJSONObject("videoDetails")
                            val publishDate = mf?.optString("publishDate")
                            val uploadDate = mf?.optString("uploadDate")
                            var year = ""
                            if (!publishDate.isNullOrBlank() && publishDate.length >= 4) {
                                year = publishDate.substring(0, 4)
                            } else if (!uploadDate.isNullOrBlank() && uploadDate.length >= 4) {
                                year = uploadDate.substring(0, 4)
                            }
                            val author = vd?.optString("author") ?: ""
                            val title = vd?.optString("title") ?: ""
                            val desc = vd?.optString("shortDescription") ?: ""

                            val descHasCredits = desc.contains(Regex("""(?im)^\s*(singers?|vocals?|sung\s*by|artists?|music(\s*director|\s*by)?|composed\s*by|provided\s*to\s*youtube\s*by)\b"""))
                            val panel = if (!descHasCredits) fetchMusicPanelFromNext(videoId) else emptyMap()

                            val map = mutableMapOf<String, Any?>(
                                "videoId" to videoId,
                                "title" to title,
                                "author" to author,
                                "publishDate" to (publishDate ?: ""),
                                "uploadDate" to (uploadDate ?: ""),
                                "year" to year,
                                "description" to desc,
                                "musicPanelSong" to (panel["song"] ?: ""),
                                "musicPanelArtist" to (panel["artist"] ?: ""),
                                "musicPanelAlbum" to (panel["album"] ?: "")
                            )
                            videoDetailsCache[videoId] = map
                            replySuccess(result, map)
                            return@launch
                        } catch (e: Exception) {
                            Log.w("ZenInnerTube", "getVideoDetails error for $videoId: ${e.message}")
                            replyError(result, "VIDEO_DETAILS_FAILED", e.message, null)
                        }
                    }

                    "getPlaylist" -> {
                        val playlistId = call.argument<String>("playlistId")
                            ?: call.argument<String>("browseId")
                            ?: ""
                        if (playlistId.isBlank()) {
                            replyError(result, "BAD_ARGS", "playlistId cannot be blank", null)
                            return@launch
                        }
                        val cleanPlaylistId = playlistId.removePrefix("VL").trim()

                        // 1. If browse ID represents an album (OLAK... or MPREb_...)
                        if (cleanPlaylistId.startsWith("OLAK") || cleanPlaylistId.startsWith("MPREb_")) {
                            try {
                                val albumOutcome = YouTube.album(cleanPlaylistId)
                                var handled = false
                                albumOutcome.onSuccess { albumPage ->
                                    val map = mapOf(
                                        "playlist" to mapOf(
                                            "id" to albumPage.album.id,
                                            "title" to albumPage.album.title,
                                            "author" to (albumPage.album.artists?.firstOrNull()?.name ?: "Artist"),
                                            "thumbnail" to albumPage.album.thumbnail
                                        ),
                                        "songs" to albumPage.songs.map { songItemToMap(it) }
                                    )
                                    replySuccess(result, map)
                                    handled = true
                                }
                                if (handled) return@launch
                            } catch (e: Exception) {
                                Log.w("ZenInnerTube", "getPlaylist album branch failed for $cleanPlaylistId: ${e.message}")
                            }
                        }

                        // 2. If browse ID represents a radio / mix (RD...)
                        if (cleanPlaylistId.startsWith("RD")) {
                            try {
                                val nextOutcome = YouTube.next(WatchEndpoint(playlistId = cleanPlaylistId))
                                var handled = false
                                nextOutcome.onSuccess { nextPage ->
                                    val songs = nextPage.items.filterIsInstance<SongItem>()
                                    if (songs.isNotEmpty()) {
                                        val map = mapOf(
                                            "playlist" to mapOf(
                                                "id" to cleanPlaylistId,
                                                "title" to (nextPage.title ?: "YouTube Mix"),
                                                "thumbnail" to songs.firstOrNull()?.thumbnail
                                            ),
                                            "songs" to songs.map { songItemToMap(it) }
                                        )
                                        replySuccess(result, map)
                                        handled = true
                                    }
                                }
                                if (handled) return@launch
                            } catch (e: Exception) {
                                Log.w("ZenInnerTube", "getPlaylist radio branch failed for $cleanPlaylistId: ${e.message}")
                            }
                        }

                        // 3. Standard playlist resolution with album fallback
                        val outcome = YouTube.playlist(cleanPlaylistId)
                        outcome.fold(
                            onSuccess = { page ->
                                val map = mapOf(
                                    "playlist" to playlistItemToMap(page.playlist),
                                    "songs" to page.songs.map { songItemToMap(it) }
                                )
                                replySuccess(result, map)
                            },
                            onFailure = { err ->
                                Log.w("ZenInnerTube", "getPlaylist failed for $cleanPlaylistId: ${err.message}, trying album fallback...")
                                val albumOutcome = YouTube.album(cleanPlaylistId)
                                albumOutcome.fold(
                                    onSuccess = { albumPage ->
                                        val map = mapOf(
                                            "playlist" to mapOf(
                                                "id" to albumPage.album.id,
                                                "title" to albumPage.album.title,
                                                "author" to (albumPage.album.artists?.firstOrNull()?.name ?: "Artist"),
                                                "thumbnail" to albumPage.album.thumbnail
                                            ),
                                            "songs" to albumPage.songs.map { songItemToMap(it) }
                                        )
                                        replySuccess(result, map)
                                    },
                                    onFailure = {
                                        replyError(result, "PLAYLIST_ERROR", err.message, null)
                                    }
                                )
                            }
                        )
                    }

                    "getHomeFeed" -> {
                        val outcome = YouTube.home()
                        outcome.fold(
                            onSuccess = { homePage ->
                                val sections = homePage.sections.map { section ->
                                    mapOf(
                                        "title" to section.title,
                                        "label" to section.label,
                                        "thumbnail" to section.thumbnail,
                                        "items" to section.items.mapNotNull { ytItemToMap(it) }
                                    )
                                }
                                replySuccess(result, sections)
                            },
                            onFailure = { err ->
                                replyError(result, "HOME_ERROR", err.message, null)
                            }
                        )
                    }

                    "getCharts" -> {
                        val countryCode = call.argument<String>("countryCode")
                        if (!countryCode.isNullOrBlank()) {
                            YouTube.locale = YouTubeLocale(gl = countryCode, hl = YouTube.locale.hl)
                        }
                        val outcome = YouTube.getChartsPage()
                        outcome.fold(
                            onSuccess = { chartsPage ->
                                val sections = chartsPage.sections.map { section ->
                                    mapOf(
                                        "title" to section.title,
                                        "chartType" to section.chartType.name,
                                        "items" to section.items.mapNotNull { ytItemToMap(it) }
                                    )
                                }
                                replySuccess(result, sections)
                            },
                            onFailure = { err ->
                                replyError(result, "CHARTS_ERROR", err.message, null)
                            }
                        )
                    }

                    "getExplore" -> {
                        val outcome = YouTube.explore()
                        outcome.fold(
                            onSuccess = { explorePage ->
                                val exploreMap = mapOf(
                                    "newReleaseAlbums" to explorePage.newReleaseAlbums.map { albumItemToMap(it) },
                                    "moodAndGenres" to explorePage.moodAndGenres.map { item ->
                                        mapOf(
                                            "title" to item.title,
                                            "endpoint" to item.endpoint.browseId,
                                            "stripeColor" to item.stripeColor
                                        )
                                    }
                                )
                                replySuccess(result, exploreMap)
                            },
                            onFailure = { err ->
                                replyError(result, "EXPLORE_ERROR", err.message, null)
                            }
                        )
                    }

                    "getNext" -> {
                        val videoId = call.argument<String>("videoId") ?: ""
                        val playlistId = call.argument<String>("playlistId")
                        if (videoId.isBlank()) {
                            replyError(result, "BAD_ARGS", "videoId cannot be blank", null)
                            return@launch
                        }
                        val endpoint = WatchEndpoint(
                            videoId = videoId,
                            playlistId = playlistId ?: "RDAMVM$videoId"
                        )
                        val outcome = YouTube.next(endpoint)
                        outcome.fold(
                            onSuccess = { nextResult ->
                                nextResult.lyricsEndpoint?.let { lyricsEp[videoId] = it }
                                val list = nextResult.items.map { songItemToMap(it) + ("type" to "song") }
                                replySuccess(result, list)
                            },
                            onFailure = { err ->
                                replyError(result, "NEXT_ERROR", err.message, null)
                            }
                        )
                    }

                    "getLyrics" -> {
                        val videoId = call.argument<String>("videoId")?.removePrefix("yt-")?.trim().orEmpty()
                        if (videoId.isBlank()) { replySuccess(result, null); return@launch }
                        lyricsText[videoId]?.let { replySuccess(result, it.ifEmpty { null }); return@launch }
                        val d = lyricsInflight.getOrPut(videoId) { scope.async { fetchLyrics(videoId) } }
                        val text = try { d.await() } finally { lyricsInflight.remove(videoId, d) }
                        replySuccess(result, text)
                    }

                    "setLocale" -> {
                        val gl = call.argument<String>("gl") ?: "US"
                        val hl = call.argument<String>("hl") ?: "en"
                        YouTube.locale = YouTubeLocale(gl = gl, hl = hl)
                        replySuccess(result, true)
                    }

                    else -> {
                        mainHandler.post { result.notImplemented() }
                    }
                }
            } catch (e: Exception) {
                replyError(result, "EXCEPTION", e.message, null)
            }
        }
    }

    private fun replySuccess(result: MethodChannel.Result, data: Any?) {
        mainHandler.post {
            try {
                result.success(data)
            } catch (e: Throwable) {
                result.error("SERIALIZATION_ERROR", e.message, null)
            }
        }
    }

    private fun replyError(result: MethodChannel.Result, code: String, msg: String?, details: Any?) {
        mainHandler.post {
            try {
                result.error(code, msg, details)
            } catch (_: Throwable) {}
        }
    }

    private fun ytItemToMap(item: YTItem): Map<String, Any?>? {
        return when (item) {
            is SongItem -> songItemToMap(item) + ("type" to if (item.isVideoSong) "video" else "song")
            is AlbumItem -> albumItemToMap(item) + ("type" to "album")
            is ArtistItem -> artistItemToMap(item) + ("type" to "artist")
            is PlaylistItem -> playlistItemToMap(item) + ("type" to "playlist")
            is PodcastItem -> mapOf(
                "id" to item.id,
                "title" to item.title,
                "thumbnail" to item.thumbnail,
                "channelId" to item.channelId,
                "type" to "podcast"
            )
            is EpisodeItem -> songItemToMap(item.asSongItem()) + ("type" to "episode")
        }
    }

    private fun songItemToMap(s: SongItem): Map<String, Any?> {
        return mapOf(
            "id" to s.id,
            "title" to s.title,
            "artists" to s.artists.map { mapOf("id" to it.id, "name" to it.name) },
            "album" to s.album?.let { mapOf("id" to it.id, "name" to it.name) },
            "duration" to s.duration,
            "thumbnail" to s.thumbnail,
            "explicit" to s.explicit,
            "shareLink" to s.shareLink
        )
    }

    private val variantRegex = Regex(
        """\b(unplugged|lofi|lo-fi|slowed|reverb|sped\s*up|speed\s*up|acoustic|remix|cover|karaoke|instrumental|8d|mashup|tribute|live|concert|session|ringtone|bgm)\b""",
        RegexOption.IGNORE_CASE
    )

    private fun isVariantConflict(sourceText: String, candidateText: String): Boolean {
        val srcMarkers = variantRegex.findAll(sourceText).map { it.value.lowercase().replace("\\s+".toRegex(), " ") }.toSet()
        val candMarkers = variantRegex.findAll(candidateText).map { it.value.lowercase().replace("\\s+".toRegex(), " ") }.toSet()
        return candMarkers.any { it !in srcMarkers }
    }

    private fun normalizeTextForMatch(raw: String): String {
        var s = raw.lowercase()
            .replace(Regex("""\([^)]*from\s+[^)]*\)""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""\[[^\]]*\]"""), " ")
            .replace(Regex("""\([^)]*(feat|ft|official|lyric|audio|video|hd|4k)[^)]*\)""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""-\s*single\b""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""[^\p{L}\p{N}\s]"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim()
        return s
    }

    private fun artistMatches(expectedArtist: String, candidateArtists: List<String>): Boolean {
        val cleanedExpected = expectedArtist.split(Regex("""[,&]|(?i)\b(feat\.?|ft\.?|x)\b"""))
            .map { it.trim().lowercase() }
            .filter {
                it.isNotEmpty() &&
                    it != "unknown artist" &&
                    it != "various artists" &&
                    it != "artist" &&
                    !it.contains("sony music") &&
                    !it.contains("t-series") &&
                    !it.contains("think music") &&
                    !it.contains("zee music") &&
                    !it.contains("saregama") &&
                    !it.contains("aditya music")
            }
        if (cleanedExpected.isEmpty()) return true
        val candLower = candidateArtists.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        if (candLower.isEmpty()) return false
        for (exp in cleanedExpected) {
            for (cand in candLower) {
                if (cand == exp || (exp.length >= 3 && cand.contains(exp)) || (cand.length >= 3 && exp.contains(cand))) {
                    return true
                }
            }
        }
        return false
    }

    private fun normalizedTitleMatch(expectedTitle: String, candidateTitle: String): Boolean {
        val a = normalizeTextForMatch(expectedTitle)
        val b = normalizeTextForMatch(candidateTitle)
        if (a.isEmpty() || b.isEmpty()) return false
        if (a == b) return true
        if (a.length >= 4 && b.contains(a)) return true
        if (b.length >= 4 && a.contains(b)) return true
        return false
    }

    private fun songContainedInAlbum(
        songs: List<SongItem>,
        expectedSongTitle: String,
        expectedArtist: String
    ): Boolean {
        if (expectedSongTitle.isBlank()) return true
        return songs.any { s ->
            !isVariantConflict(expectedSongTitle, s.title) &&
                normalizedTitleMatch(expectedSongTitle, s.title) &&
                (expectedArtist.isBlank() ||
                    s.artists.isEmpty() ||
                    artistMatches(expectedArtist, s.artists.map { it.name }))
        }
    }

    private fun scoreAlbumCandidate(
        candidate: AlbumItem,
        expectedAlbumTitle: String,
        expectedSongTitle: String,
        expectedArtist: String,
        preferSingle: Boolean
    ): Int {
        val sourceContext = "$expectedSongTitle $expectedAlbumTitle".trim()
        if (isVariantConflict(sourceContext, candidate.title)) return -1

        val candArtists = candidate.artists?.map { it.name }.orEmpty()
        val hasArtistMatch = artistMatches(expectedArtist, candArtists)
        val targetTitle = if (expectedAlbumTitle.isNotBlank()) expectedAlbumTitle else expectedSongTitle
        val titleMatches = targetTitle.isNotBlank() && normalizedTitleMatch(targetTitle, candidate.title)

        // Reject candidates that match neither artist nor target title
        if (!hasArtistMatch && !titleMatches) return -1

        var score = 0
        if (normalizeTextForMatch(candidate.title) == normalizeTextForMatch(targetTitle) && targetTitle.isNotBlank()) {
            score += 100
        } else if (titleMatches) {
            score += 50
        }
        if (hasArtistMatch) score += 45 else score -= 25

        val candIsSingle = candidate.albumType.equals("Single", ignoreCase = true) ||
            candidate.title.lowercase().endsWith("- single")
        if (preferSingle && candIsSingle) score += 25
        if (!preferSingle && !candIsSingle) score += 20

        return score
    }

    private fun albumItemToMap(a: AlbumItem): Map<String, Any?> {
        val inferredType = a.albumType
            ?: if (a.title.lowercase().trimEnd().endsWith("- single")) "Single" else null
        return mapOf(
            "id" to a.id,
            "browseId" to a.browseId,
            "playlistId" to a.playlistId,
            "title" to a.title,
            "artists" to a.artists?.map { mapOf("id" to it.id, "name" to it.name) },
            "year" to a.year,
            "thumbnail" to a.thumbnail,
            "explicit" to a.explicit,
            "albumType" to (inferredType ?: "Album"),
            "isSingle" to inferredType.equals("Single", ignoreCase = true),
            "shareLink" to a.shareLink
        )
    }

    private fun artistItemToMap(ar: ArtistItem): Map<String, Any?> {
        return mapOf(
            "id" to ar.id,
            "title" to ar.title,
            "thumbnail" to ar.thumbnail,
            "channelId" to ar.channelId,
            "shareLink" to ar.shareLink
        )
    }

    private fun playlistItemToMap(p: PlaylistItem?): Map<String, Any?> {
        if (p == null) return emptyMap()
        return mapOf(
            "id" to p.id,
            "title" to p.title,
            "author" to p.author?.let { mapOf("id" to it.id, "name" to it.name) },
            "songCountText" to p.songCountText,
            "thumbnail" to p.thumbnail,
            "description" to p.description,
            "shareLink" to p.shareLink
        )
    }
}
