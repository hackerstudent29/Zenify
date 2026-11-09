package com.zenify.mobile.innertube

import android.os.Handler
import android.os.Looper
import com.metrolist.innertube.YouTube
import com.metrolist.innertube.models.AlbumItem
import com.metrolist.innertube.models.ArtistItem
import com.metrolist.innertube.models.PlaylistItem
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
                when (call.method) {
                    "searchSummary" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        val outcome = YouTube.searchSummary(query)
                        outcome.fold(
                            onSuccess = { summaryPage ->
                                val summaries = summaryPage.summaries.map { summary ->
                                    mapOf(
                                        "title" to summary.title,
                                        "items" to summary.items.mapNotNull { ytItemToMap(it) }
                                    )
                                }
                                replySuccess(result, summaries)
                            },
                            onFailure = { err ->
                                replyError(result, "SEARCH_ERROR", err.message, null)
                            }
                        )
                    }

                    "searchSongs" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_SONG)
                        outcome.fold(
                            onSuccess = { searchResult ->
                                val songs = searchResult.items.filterIsInstance<SongItem>().map {
                                    songItemToMap(it) + ("type" to "song")
                                }
                                replySuccess(result, songs)
                            },
                            onFailure = { err ->
                                replyError(result, "SEARCH_SONGS_ERROR", err.message, null)
                            }
                        )
                    }

                    "searchAlbums" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_ALBUM)
                        outcome.fold(
                            onSuccess = { searchResult ->
                                val albums = searchResult.items.filterIsInstance<AlbumItem>().map {
                                    albumItemToMap(it) + ("type" to "album")
                                }
                                replySuccess(result, albums)
                            },
                            onFailure = { err ->
                                replyError(result, "SEARCH_ALBUMS_ERROR", err.message, null)
                            }
                        )
                    }

                    "searchArtists" -> {
                        val query = call.argument<String>("query") ?: ""
                        if (query.isBlank()) {
                            replySuccess(result, emptyList<Map<String, Any?>>())
                            return@launch
                        }
                        val outcome = YouTube.search(query, YouTube.SearchFilter.FILTER_ARTIST)
                        outcome.fold(
                            onSuccess = { searchResult ->
                                val artists = searchResult.items.filterIsInstance<ArtistItem>().map {
                                    artistItemToMap(it) + ("type" to "artist")
                                }
                                replySuccess(result, artists)
                            },
                            onFailure = { err ->
                                replyError(result, "SEARCH_ARTISTS_ERROR", err.message, null)
                            }
                        )
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
                                // Safe serialization: suggestions.queries is List<String>
                                replySuccess(result, suggestions.queries)
                            },
                            onFailure = { err -> replyError(result, "SUGGEST_ERROR", err.message, null) }
                        )
                    }

                    "getArtist" -> {
                        var browseId = call.argument<String>("browseId") ?: ""
                        val artistName = call.argument<String>("name")
                            ?: call.argument<String>("artistName")
                            ?: ""

                        // If browseId is missing, resolve it through YouTube Music artist search
                        if (browseId.isBlank() && artistName.isNotBlank()) {
                            val searchOutcome = YouTube.search(artistName, YouTube.SearchFilter.FILTER_ARTIST)
                            val foundArtist = searchOutcome.getOrNull()?.items
                                ?.filterIsInstance<ArtistItem>()
                                ?.firstOrNull()
                            if (foundArtist != null) {
                                browseId = foundArtist.id
                            } else {
                                val summaryOutcome = YouTube.searchSummary(artistName)
                                val summaryArtist = summaryOutcome.getOrNull()?.summaries
                                    ?.flatMap { it.items }
                                    ?.filterIsInstance<ArtistItem>()
                                    ?.firstOrNull()
                                if (summaryArtist != null) {
                                    browseId = summaryArtist.id
                                }
                            }
                        }

                        if (browseId.isNotBlank()) {
                            val outcome = YouTube.artist(browseId)
                            if (outcome.isSuccess) {
                                val page = outcome.getOrThrow()
                                val artistData = artistItemToMap(page.artist).toMutableMap()
                                if ((artistData["title"] as? String).isNullOrBlank() && artistName.isNotBlank()) {
                                    artistData["title"] = artistName
                                }
                                val artistMap = mapOf(
                                    "artist" to artistData,
                                    "description" to (page.description ?: "Official artist profile for ${artistData["title"] ?: artistName} on Zenify."),
                                    "subscriberCountText" to (page.subscriberCountText ?: "Official Artist"),
                                    "monthlyListenerCount" to page.monthlyListenerCount,
                                    "sections" to page.sections.map { section ->
                                        mapOf(
                                            "title" to section.title,
                                            "items" to section.items.mapNotNull { ytItemToMap(it) }
                                        )
                                    }
                                )
                                replySuccess(result, artistMap)
                                return@launch
                            }
                        }

                        // Robust fallback: if channel browseId fails or is missing, search songs directly
                        val fallbackName = if (artistName.isNotBlank()) artistName else "Unknown Artist"
                        val songsOutcome = YouTube.search(fallbackName, YouTube.SearchFilter.FILTER_SONG)
                        val songs = songsOutcome.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                        val thumb = songs.firstOrNull()?.thumbnail ?: ""
                        val fallbackArtist = mapOf(
                            "id" to browseId,
                            "title" to fallbackName,
                            "thumbnail" to thumb,
                            "channelId" to null,
                            "shareLink" to null
                        )
                        val fallbackMap = mapOf(
                            "artist" to fallbackArtist,
                            "description" to "Official artist profile for $fallbackName on Zenify.",
                            "subscriberCountText" to "Top Artist",
                            "monthlyListenerCount" to null,
                            "sections" to listOf(
                                mapOf(
                                    "title" to "Top Songs",
                                    "items" to songs.map { songItemToMap(it) + ("type" to "song") }
                                )
                            )
                        )
                        replySuccess(result, fallbackMap)
                    }

                    "getAlbum" -> {
                        var browseId = call.argument<String>("browseId") ?: ""
                        val albumTitle = call.argument<String>("title")
                            ?: call.argument<String>("albumTitle")
                            ?: ""
                        val artistName = call.argument<String>("artist")
                            ?: call.argument<String>("artistName")
                            ?: ""

                        if (browseId.isBlank() && albumTitle.isNotBlank()) {
                            val query = if (artistName.isNotBlank()) "$albumTitle $artistName" else albumTitle
                            val albumSearch = YouTube.search(query, YouTube.SearchFilter.FILTER_ALBUM)
                            val albumItem = albumSearch.getOrNull()?.items
                                ?.filterIsInstance<AlbumItem>()
                                ?.firstOrNull()
                            if (albumItem != null) {
                                browseId = albumItem.browseId ?: albumItem.id
                            }
                        }

                        if (browseId.isNotBlank()) {
                            val outcome = YouTube.album(browseId)
                            if (outcome.isSuccess) {
                                val page = outcome.getOrThrow()
                                val albumMap = mapOf(
                                    "album" to albumItemToMap(page.album),
                                    "songs" to page.songs.map { songItemToMap(it) },
                                    "otherVersions" to page.otherVersions.map { albumItemToMap(it) }
                                )
                                replySuccess(result, albumMap)
                                return@launch
                            }
                        }

                        // Fallback: search songs for album title
                        val fallbackTitle = if (albumTitle.isNotBlank()) albumTitle else "Album"
                        val query = if (artistName.isNotBlank()) "$fallbackTitle $artistName" else fallbackTitle
                        val searchSongs = YouTube.search(query, YouTube.SearchFilter.FILTER_SONG)
                        val songs = searchSongs.getOrNull()?.items?.filterIsInstance<SongItem>() ?: emptyList()
                        val thumb = songs.firstOrNull()?.thumbnail ?: ""
                        val fallbackAlbum = mapOf(
                            "id" to browseId,
                            "browseId" to browseId,
                            "playlistId" to null,
                            "title" to fallbackTitle,
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
                        replySuccess(result, fallbackMap)
                    }

                    "getPlaylist" -> {
                        val playlistId = call.argument<String>("playlistId")
                            ?: call.argument<String>("browseId")
                            ?: ""
                        if (playlistId.isBlank()) {
                            replyError(result, "BAD_ARGS", "playlistId cannot be blank", null)
                            return@launch
                        }
                        val outcome = YouTube.playlist(playlistId)
                        outcome.fold(
                            onSuccess = { page ->
                                val map = mapOf(
                                    "playlist" to playlistItemToMap(page.playlist),
                                    "songs" to page.songs.map { songItemToMap(it) }
                                )
                                replySuccess(result, map)
                            },
                            onFailure = { err ->
                                replyError(result, "PLAYLIST_ERROR", err.message, null)
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
            is SongItem -> songItemToMap(item) + ("type" to "song")
            is AlbumItem -> albumItemToMap(item) + ("type" to "album")
            is ArtistItem -> artistItemToMap(item) + ("type" to "artist")
            is PlaylistItem -> playlistItemToMap(item) + ("type" to "playlist")
            else -> mapOf(
                "id" to item.id,
                "title" to item.title,
                "thumbnail" to item.thumbnail,
                "type" to "unknown"
            )
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

    private fun playlistItemToMap(p: PlaylistItem): Map<String, Any?> {
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
