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
import kotlinx.coroutines.launch

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
                        try {
                            val resolved = com.zenify.mobile.yt.YtEngine.resolve(videoId, wantVideo = false, quality = quality)
                            val map = mapOf(
                                "url" to resolved.url,
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
                                    sectionsList.add(
                                        mapOf(
                                            "title" to section.title,
                                            "items" to section.items.mapNotNull { ytItemToMap(it) }
                                        )
                                    )
                                }

                                // Check if top songs are present in sections
                                val hasSongs = sectionsList.any { sec ->
                                    val title = (sec["title"] as? String).orEmpty().lowercase()
                                    val items = sec["items"] as? List<*> ?: emptyList<Any>()
                                    (title.contains("song") || title.contains("popular") || title.contains("track") || title.contains("top")) && items.isNotEmpty()
                                }

                                // If artist channel has no songs shelf (common for playback singers like Tippu), supplement songs
                                if (!hasSongs && artistName.isNotBlank()) {
                                    try {
                                        val songsOutcome = YouTube.search(artistName, YouTube.SearchFilter.FILTER_SONG)
                                        val songs = songsOutcome.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                                        if (songs.isNotEmpty()) {
                                            sectionsList.add(0, mapOf(
                                                "title" to "Songs",
                                                "items" to songs.take(25).map { songItemToMap(it) + ("type" to "song") }
                                            ))
                                        }
                                    } catch (e: Exception) {
                                        Log.w("ZenInnerTube", "Failed to fetch supplemental songs for $artistName: ${e.message}")
                                    }
                                }

                                // Check if albums are present
                                val hasAlbums = sectionsList.any { sec ->
                                    val title = (sec["title"] as? String).orEmpty().lowercase()
                                    val items = sec["items"] as? List<*> ?: emptyList<Any>()
                                    (title.contains("album") || title.contains("release") || title.contains("single")) && items.isNotEmpty()
                                }

                                if (!hasAlbums && artistName.isNotBlank()) {
                                    try {
                                        val albumsOutcome = YouTube.search(artistName, YouTube.SearchFilter.FILTER_ALBUM)
                                        val albums = albumsOutcome.getOrNull()?.items?.filterIsInstance<AlbumItem>() ?: emptyList()
                                        if (albums.isNotEmpty()) {
                                            sectionsList.add(mapOf(
                                                "title" to "Albums",
                                                "items" to albums.take(20).map { albumItemToMap(it) + ("type" to "album") }
                                            ))
                                        }
                                    } catch (e: Exception) {
                                        Log.w("ZenInnerTube", "Failed to fetch supplemental albums for $artistName: ${e.message}")
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
                        Log.d("ZenInnerTube", "getAlbum browseId=$browseId videoId=$videoId title=$albumTitle artist=$artistName songTitle=$songTitle")

                        // 1. If browseId is missing, resolve it from videoId via watch next
                        if (browseId.isBlank() && videoId.isNotBlank()) {
                            try {
                                val nextOutcome = YouTube.next(WatchEndpoint(videoId = videoId))
                                val resolvedItem = nextOutcome.getOrNull()?.items?.firstOrNull { it.id == videoId }
                                    ?: nextOutcome.getOrNull()?.items?.firstOrNull()
                                val resolvedAlbumId = resolvedItem?.album?.id
                                if (!resolvedAlbumId.isNullOrBlank()) {
                                    browseId = resolvedAlbumId
                                    Log.i("ZenInnerTube", "Resolved album browseId from WatchEndpoint(videoId): $browseId")
                                } else {
                                    val radioOutcome = YouTube.next(WatchEndpoint(videoId = videoId, playlistId = "RDAMVM$videoId"))
                                    val radioItem = radioOutcome.getOrNull()?.items?.firstOrNull { it.id == videoId }
                                        ?: radioOutcome.getOrNull()?.items?.firstOrNull()
                                    val radioAlbumId = radioItem?.album?.id
                                    if (!radioAlbumId.isNullOrBlank()) {
                                        browseId = radioAlbumId
                                        Log.i("ZenInnerTube", "Resolved album browseId from Radio next: $browseId")
                                    }
                                }
                                if (browseId.isBlank()) {
                                    val resolvedAlbumName = resolvedItem?.album?.name
                                    if (!resolvedAlbumName.isNullOrBlank() && !resolvedAlbumName.equals("Single", ignoreCase = true)) {
                                        albumTitle = resolvedAlbumName
                                    }
                                }
                            } catch (e: Exception) {
                                Log.w("ZenInnerTube", "Failed to resolve album from videoId=$videoId: ${e.message}")
                            }
                        }

                        // 2. If browseId is still missing, search for album using title & artist
                        if (browseId.isBlank()) {
                            val candidateQuery = when {
                                albumTitle.isNotBlank() && !albumTitle.equals("Single", ignoreCase = true) -> {
                                    if (artistName.isNotBlank() && !albumTitle.contains(artistName, ignoreCase = true)) "$albumTitle $artistName" else albumTitle
                                }
                                songTitle.isNotBlank() -> {
                                    if (artistName.isNotBlank() && !songTitle.contains(artistName, ignoreCase = true)) "$songTitle $artistName" else songTitle
                                }
                                artistName.isNotBlank() -> artistName
                                else -> ""
                            }
                            if (candidateQuery.isNotBlank()) {
                                val albumSearch = YouTube.search(candidateQuery, YouTube.SearchFilter.FILTER_ALBUM)
                                val albumItem = albumSearch.getOrNull()?.items
                                    ?.filterIsInstance<AlbumItem>()
                                    ?.firstOrNull()
                                if (albumItem != null) {
                                    browseId = albumItem.browseId.ifBlank { albumItem.id }
                                    Log.i("ZenInnerTube", "Resolved album browseId from album search query=$candidateQuery: $browseId")
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
                                            "explicit" to false
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

                                // If loaded album only has 1 song (e.g. single release), attempt to find the full parent album/soundtrack
                                if (page.songs.size <= 1) {
                                    val other = page.otherVersions.firstOrNull { it.id != cleanBrowseId }
                                    if (other != null && other.id.isNotBlank()) {
                                        val otherOutcome = YouTube.album(other.id)
                                        if (otherOutcome.isSuccess && otherOutcome.getOrThrow().songs.size > 1) {
                                            val otherPage = otherOutcome.getOrThrow()
                                            val otherMap = mapOf(
                                                "album" to albumItemToMap(otherPage.album),
                                                "songs" to otherPage.songs.map { songItemToMap(it) },
                                                "otherVersions" to otherPage.otherVersions.map { albumItemToMap(it) }
                                            )
                                            Log.i("ZenInnerTube", "getAlbum upgraded single to multi-song version ${other.id}: ${otherPage.songs.size} songs")
                                            replySuccess(result, otherMap)
                                            return@launch
                                        }
                                    }

                                    // Check if songTitle or albumTitle has movie/soundtrack tag: From "..."
                                    val fullTitle = if (songTitle.isNotBlank()) songTitle else albumTitle
                                    val fromRegex = Regex("""(?i)\(From\s+["']?([^"')]+)["']?\)""")
                                    val movieMatch = fromRegex.find(fullTitle)
                                    val soundtrackName = movieMatch?.groupValues?.getOrNull(1)?.trim()
                                    if (!soundtrackName.isNullOrBlank()) {
                                        try {
                                            val albumSearch = YouTube.search("$soundtrackName $artistName", YouTube.SearchFilter.FILTER_ALBUM)
                                            val albumItem = albumSearch.getOrNull()?.items?.filterIsInstance<AlbumItem>()?.firstOrNull()
                                            val fullAlbumId = albumItem?.browseId?.ifBlank { albumItem.id } ?: ""
                                            if (fullAlbumId.isNotBlank() && fullAlbumId != cleanBrowseId) {
                                                val fullOutcome = YouTube.album(fullAlbumId)
                                                if (fullOutcome.isSuccess && fullOutcome.getOrThrow().songs.size > 1) {
                                                    val fullPage = fullOutcome.getOrThrow()
                                                    val fullMap = mapOf(
                                                        "album" to albumItemToMap(fullPage.album),
                                                        "songs" to fullPage.songs.map { songItemToMap(it) },
                                                        "otherVersions" to fullPage.otherVersions.map { albumItemToMap(it) }
                                                    )
                                                    Log.i("ZenInnerTube", "getAlbum resolved full soundtrack album $fullAlbumId from movie name '$soundtrackName': ${fullPage.songs.size} songs")
                                                    replySuccess(result, fullMap)
                                                    return@launch
                                                }
                                            }
                                        } catch (e: Exception) {
                                            Log.w("ZenInnerTube", "Failed to resolve full soundtrack album from movie tag: ${e.message}")
                                        }
                                    }
                                }

                                val albumMap = mapOf(
                                    "album" to albumItemToMap(page.album),
                                    "songs" to page.songs.map { songItemToMap(it) },
                                    "otherVersions" to page.otherVersions.map { albumItemToMap(it) }
                                )
                                Log.i("ZenInnerTube", "getAlbum SUCCESS for $cleanBrowseId: ${page.songs.size} songs")
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
                                                "explicit" to false
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

                        // 4. Fallback: Search songs for this album or song title to extract the album
                        val fallbackSearchQuery = when {
                            albumTitle.isNotBlank() && !albumTitle.equals("Single", ignoreCase = true) -> "$albumTitle $artistName"
                            songTitle.isNotBlank() -> "$songTitle $artistName"
                            else -> artistName
                        }
                        if (fallbackSearchQuery.isNotBlank()) {
                            val searchSongs = YouTube.search(fallbackSearchQuery, YouTube.SearchFilter.FILTER_SONG)
                            val songs = searchSongs.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                            val foundAlbum = songs.firstOrNull { it.album != null && it.album.id.isNotBlank() }?.album
                            if (foundAlbum != null && foundAlbum.id != cleanBrowseId) {
                                val secondAlbumOutcome = YouTube.album(foundAlbum.id)
                                if (secondAlbumOutcome.isSuccess) {
                                    val page = secondAlbumOutcome.getOrThrow()
                                    val albumMap = mapOf(
                                        "album" to albumItemToMap(page.album),
                                        "songs" to page.songs.map { songItemToMap(it) },
                                        "otherVersions" to page.otherVersions.map { albumItemToMap(it) }
                                    )
                                    Log.i("ZenInnerTube", "getAlbum found via song album id ${foundAlbum.id}: ${page.songs.size} songs")
                                    replySuccess(result, albumMap)
                                    return@launch
                                }
                            }

                            if (songs.isNotEmpty()) {
                                val thumb = songs.firstOrNull()?.thumbnail ?: ""
                                val fallbackAlbum = mapOf(
                                    "id" to cleanBrowseId,
                                    "browseId" to cleanBrowseId,
                                    "playlistId" to null,
                                    "title" to (if (albumTitle.isNotBlank()) albumTitle else (songs.firstOrNull()?.album?.name ?: "Album")),
                                    "artists" to listOf(mapOf("id" to null, "name" to (if (artistName.isNotBlank()) artistName else "Various Artists"))),
                                    "year" to 2026,
                                    "thumbnail" to thumb,
                                    "explicit" to false,
                                    "shareLink" to null
                                )
                                val fallbackMap = mapOf(
                                    "album" to fallbackAlbum,
                                    "songs" to songs.map { songItemToMap(it) },
                                    "otherVersions" to emptyList<Map<String, Any?>>()
                                )
                                Log.i("ZenInnerTube", "getAlbum songs fallback SUCCESS for $fallbackSearchQuery: ${songs.size} songs")
                                replySuccess(result, fallbackMap)
                                return@launch
                            }
                        }

                        replyError(result, "ALBUM_NOT_FOUND", "Could not load album for $browseId", null)
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
                                val list = nextResult.items.map { songItemToMap(it) + ("type" to "song") }
                                replySuccess(result, list)
                            },
                            onFailure = { err ->
                                replyError(result, "NEXT_ERROR", err.message, null)
                            }
                        )
                    }

                    "getLyrics" -> {
                        val videoId = call.argument<String>("videoId")?.replace("yt-", "") ?: ""
                        if (videoId.isBlank()) {
                            replySuccess(result, null)
                            return@launch
                        }
                        try {
                            val next = YouTube.next(WatchEndpoint(videoId = videoId)).getOrNull()
                            val endpoint = next?.lyricsEndpoint
                            if (endpoint != null) {
                                val lyrics = YouTube.lyrics(endpoint).getOrNull()
                                if (!lyrics.isNullOrBlank()) {
                                    Log.i("ZenInnerTube", "getLyrics SUCCESS for videoId=$videoId: ${lyrics.length} chars")
                                    replySuccess(result, lyrics)
                                    return@launch
                                }
                            }
                            replySuccess(result, null)
                        } catch (e: Exception) {
                            Log.w("ZenInnerTube", "getLyrics error for videoId=$videoId: ${e.message}")
                            replySuccess(result, null)
                        }
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

    private fun albumItemToMap(a: AlbumItem): Map<String, Any?> {
        return mapOf(
            "id" to a.id,
            "browseId" to a.browseId,
            "playlistId" to a.playlistId,
            "title" to a.title,
            "artists" to a.artists?.map { mapOf("id" to it.id, "name" to it.name) },
            "year" to a.year,
            "thumbnail" to a.thumbnail,
            "explicit" to a.explicit,
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
