package com.zenify.mobile.innertube

import android.os.Handler
import android.os.Looper
import com.metrolist.innertube.YouTube
import com.metrolist.innertube.models.AlbumItem
import com.metrolist.innertube.models.ArtistItem
import com.metrolist.innertube.models.PlaylistItem
import com.metrolist.innertube.models.SongItem
import com.metrolist.innertube.models.YTItem
import com.metrolist.innertube.models.YouTubeLocale
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * ZenInnerTubePlugin connects the Android Metrolist InnerTube Kotlin pipeline
 * to the Zenify Flutter front-end over the 'zenify/innertube' MethodChannel.
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
                                        "items" to summary.items.map { ytItemToMap(it) }
                                    )
                                }
                                replySuccess(result, summaries)
                            },
                            onFailure = { err ->
                                replyError(result, "SEARCH_ERROR", err.message, null)
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
                            onSuccess = { list -> replySuccess(result, list) },
                            onFailure = { err -> replyError(result, "SUGGEST_ERROR", err.message, null) }
                        )
                    }

                    "getArtist" -> {
                        val browseId = call.argument<String>("browseId") ?: ""
                        if (browseId.isBlank()) {
                            replyError(result, "BAD_ARGS", "browseId cannot be blank", null)
                            return@launch
                        }
                        val outcome = YouTube.artist(browseId)
                        outcome.fold(
                            onSuccess = { page ->
                                val artistMap = mapOf(
                                    "artist" to artistItemToMap(page.artist),
                                    "description" to page.description,
                                    "subscriberCountText" to page.subscriberCountText,
                                    "monthlyListenerCount" to page.monthlyListenerCount,
                                    "sections" to page.sections.map { section ->
                                        mapOf(
                                            "title" to section.title,
                                            "items" to section.items.map { ytItemToMap(it) }
                                        )
                                    }
                                )
                                replySuccess(result, artistMap)
                            },
                            onFailure = { err ->
                                replyError(result, "ARTIST_ERROR", err.message, null)
                            }
                        )
                    }

                    "getAlbum" -> {
                        val browseId = call.argument<String>("browseId") ?: ""
                        if (browseId.isBlank()) {
                            replyError(result, "BAD_ARGS", "browseId cannot be blank", null)
                            return@launch
                        }
                        val outcome = YouTube.album(browseId)
                        outcome.fold(
                            onSuccess = { page ->
                                val albumMap = mapOf(
                                    "album" to albumItemToMap(page.album),
                                    "songs" to page.songs.map { songItemToMap(it) },
                                    "otherVersions" to page.otherVersions.map { albumItemToMap(it) }
                                )
                                replySuccess(result, albumMap)
                            },
                            onFailure = { err ->
                                replyError(result, "ALBUM_ERROR", err.message, null)
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
                                        "items" to section.items.map { ytItemToMap(it) }
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
                                        "items" to section.items.map { ytItemToMap(it) }
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
                                    "newReleaseAlbums" to explorePage.newReleaseAlbums.map { albumItemToMap(it) }
                                )
                                replySuccess(result, exploreMap)
                            },
                            onFailure = { err ->
                                replyError(result, "EXPLORE_ERROR", err.message, null)
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
        mainHandler.post { result.success(data) }
    }

    private fun replyError(result: MethodChannel.Result, code: String, msg: String?, details: Any?) {
        mainHandler.post { result.error(code, msg, details) }
    }

    private fun ytItemToMap(item: YTItem): Map<String, Any?> {
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
