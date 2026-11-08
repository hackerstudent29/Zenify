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
    private val upstream: DataSource,
    private val onRefused: (videoId: String, failedUrl: String?) -> Unit
) : DataSource {
    companion object {
        private const val TAG = "RefusedRetryDataSource"
    }

    private var currentDataSpec: DataSpec? = null
    private var retried = false

    override fun addTransferListener(transferListener: TransferListener) {
        upstream.addTransferListener(transferListener)
    }

    @Throws(IOException::class)
    override fun open(dataSpec: DataSpec): Long {
        currentDataSpec = dataSpec
        retried = false
        try {
            return upstream.open(dataSpec)
        } catch (e: HttpDataSource.InvalidResponseCodeException) {
            if (e.responseCode == 403 && !retried) {
                retried = true
                val videoId = extractVideoId(dataSpec)
                Log.w(TAG, "HTTP 403 on open for videoId=$videoId; retrying with fresh client stream...")
                if (videoId != null) {
                    val failedUrl = e.dataSpec.uri.toString()
                    onRefused(videoId, failedUrl)
                    return upstream.open(dataSpec)
                }
            }
            throw e
        }
    }

    @Throws(IOException::class)
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        return upstream.read(buffer, offset, length)
    }

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    @Throws(IOException::class)
    override fun close() {
        currentDataSpec = null
        upstream.close()
    }

    private fun extractVideoId(dataSpec: DataSpec): String? {
        val custom = dataSpec.customData as? String
        if (!custom.isNullOrBlank()) return custom
        val uri = dataSpec.uri
        if (uri.scheme == "zenify") {
            return uri.lastPathSegment ?: uri.host
        }
        return null
    }

    class Factory(
        private val upstreamFactory: DataSource.Factory,
        private val onRefused: (videoId: String, failedUrl: String?) -> Unit
    ) : DataSource.Factory {
        override fun createDataSource(): DataSource {
            return RefusedRetryDataSource(upstreamFactory.createDataSource(), onRefused)
        }
    }
}
