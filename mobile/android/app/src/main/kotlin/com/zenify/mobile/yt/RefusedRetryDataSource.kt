package com.zenify.mobile.yt

import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import java.io.IOException

@OptIn(UnstableApi::class)
class RefusedRetryDataSource(
    private val upstreamFactory: DataSource.Factory,
    private val onRefused: (videoId: String, failedUrl: String?) -> Unit
) : DataSource {
    companion object {
        private const val TAG = "RefusedRetryDataSource"
    }

    private var currentUpstream: DataSource? = null
    private val transferListeners = mutableListOf<TransferListener>()
    private var currentDataSpec: DataSpec? = null
    private var retried = false

    override fun addTransferListener(transferListener: TransferListener) {
        transferListeners.add(transferListener)
        currentUpstream?.addTransferListener(transferListener)
    }

    private fun createAndListenUpstream(): DataSource {
        val s = upstreamFactory.createDataSource()
        for (l in transferListeners) {
            s.addTransferListener(l)
        }
        return s
    }

    @Throws(IOException::class)
    override fun open(dataSpec: DataSpec): Long {
        currentDataSpec = dataSpec
        retried = false
        val initialSource = createAndListenUpstream()
        currentUpstream = initialSource
        try {
            return initialSource.open(dataSpec)
        } catch (e: Exception) {
            val isRetryable = !retried && (
                (e as? HttpDataSource.InvalidResponseCodeException)?.responseCode in listOf(400, 403, 410, 500, 502, 503) ||
                e is java.net.SocketTimeoutException ||
                e is java.net.ConnectException ||
                e is java.net.UnknownHostException ||
                e.message?.contains("403") == true ||
                e.message?.contains("resolve failed") == true ||
                e.message?.contains("timeout") == true
            )
            if (isRetryable) {
                retried = true
                val videoId = extractVideoId(dataSpec)
                Log.w(TAG, "Retryable stream open error (${e.message}) for videoId=$videoId; retrying with fresh client stream...")
                if (videoId != null) {
                    val failedUrl = (e as? HttpDataSource.InvalidResponseCodeException)?.dataSpec?.uri?.toString() ?: dataSpec.uri.toString()
                    onRefused(videoId, failedUrl)
                    try {
                        initialSource.close()
                    } catch (_: Exception) {}
                    val freshSource = createAndListenUpstream()
                    currentUpstream = freshSource
                    try {
                        return freshSource.open(dataSpec)
                    } catch (e2: Exception) {
                        if (e2 is IOException) throw e2
                        throw IOException(e2)
                    }
                }
            }
            if (e is IOException) throw e
            throw IOException(e)
        }
    }

    @Throws(IOException::class)
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        val s = currentUpstream ?: throw IOException("DataSource not open")
        return s.read(buffer, offset, length)
    }

    override fun getUri(): Uri? = currentUpstream?.uri

    override fun getResponseHeaders(): Map<String, List<String>> = currentUpstream?.responseHeaders ?: emptyMap()

    @Throws(IOException::class)
    override fun close() {
        currentDataSpec = null
        try {
            currentUpstream?.close()
        } finally {
            currentUpstream = null
        }
    }

    private fun extractVideoId(dataSpec: DataSpec): String? {
        val custom = dataSpec.customData as? String
        if (!custom.isNullOrBlank()) return custom
        val uri = dataSpec.uri
        if (uri.scheme == "zenify") {
            return uri.lastPathSegment ?: uri.host
        }
        val current = com.zenify.mobile.audio.ZenAudioPlugin.currentMediaId
        if (!current.isNullOrBlank()) return current
        val key = dataSpec.key
        if (!key.isNullOrBlank()) {
            val candidate = key.split("#")[0].trim()
            if (candidate.isNotEmpty() && !candidate.startsWith("http")) {
                return candidate
            }
        }
        val docid = uri.getQueryParameter("docid")
        if (!docid.isNullOrBlank()) return docid
        return null
    }

    class Factory(
        private val upstreamFactory: DataSource.Factory,
        private val onRefused: (videoId: String, failedUrl: String?) -> Unit
    ) : DataSource.Factory {
        override fun createDataSource(): DataSource {
            return RefusedRetryDataSource(upstreamFactory, onRefused)
        }
    }
}
