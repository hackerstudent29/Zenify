package com.zenify.mobile.yt

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.metrolist.innertubex.extraction.PoTokenResult
import com.metrolist.innertubex.extraction.TokenProvider
import com.metrolist.innertubex.extraction.TokenProviderCapabilities
import com.metrolist.innertubex.extraction.strategy.PoTokenProviderKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

class PoTokenGenerator(private val context: Context) : TokenProvider {
    companion object {
        private const val TAG = "PoTokenGenerator"
        private const val TIMEOUT_MS = 8_000L
    }

    override val capabilities: TokenProviderCapabilities =
        TokenProviderCapabilities(setOf(PoTokenProviderKind.WEB_BOTGUARD), true)

    @Volatile
    private var cachedResult: PoTokenResult? = null

    @Volatile
    private var webView: WebView? = null

    override suspend fun getPoToken(
        videoId: String,
        visitorData: String,
        cookie: String?
    ): PoTokenResult? {
        cachedResult?.let { res ->
            if (res.visitorData == visitorData) {
                return res
            }
        }

        return try {
            withTimeoutOrNull(TIMEOUT_MS) {
                withContext(Dispatchers.Main) {
                    generateWebClientPoToken(videoId, visitorData)
                }
            }
        } catch (e: Throwable) {
            Log.w(TAG, "PO token generation failed or timed out: ${e.message}")
            null
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun generateWebClientPoToken(
        videoId: String,
        visitorData: String
    ): PoTokenResult? = suspendCancellableCoroutine { cont ->
        try {
            var view = webView
            if (view == null) {
                view = WebView(context.applicationContext).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.cacheMode = WebSettings.LOAD_DEFAULT
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(v: WebView?, url: String?) {
                            // Page loaded, attempt botguard evaluation if available
                            v?.evaluateJavascript(
                                "(function() { return (window._botguard && typeof window._botguard.bg === 'function'); })();"
                            ) { hasBg ->
                                if (hasBg == "true") {
                                    v.evaluateJavascript(
                                        "(function() { try { var b = new window._botguard.bg(); return b.invoke(); } catch(e) { return null; } })();"
                                    ) { token ->
                                        val cleanToken = token?.trim('\"')
                                        if (!cleanToken.isNullOrBlank() && cleanToken != "null") {
                                            val result = PoTokenResult(
                                                playerRequestToken = cleanToken,
                                                streamingDataToken = cleanToken,
                                                visitorData = visitorData
                                            )
                                            cachedResult = result
                                            try {
                                                v?.stopLoading()
                                                v?.pauseTimers()
                                            } catch (_: Throwable) {}
                                            if (cont.isActive) cont.resume(result)
                                        } else {
                                            if (cont.isActive) cont.resume(null)
                                        }
                                    }
                                } else {
                                    if (cont.isActive) cont.resume(null)
                                }
                            }
                        }
                    }
                }
                webView = view
            }

            // Load YouTube minimal page for botguard script evaluation
            view.loadUrl("https://www.youtube.com/embed/$videoId")

            cont.invokeOnCancellation {
                try {
                    view.stopLoading()
                } catch (_: Throwable) {}
            }
        } catch (e: Throwable) {
            Log.w(TAG, "WebView initialization failed: ${e.message}")
            if (cont.isActive) cont.resume(null)
        }
    }

    override suspend fun prewarm(cookie: String?) {
        // Optional prewarm: load background webview if desired
    }

    override suspend fun invalidateAttestation() {
        cachedResult = null
    }

    override suspend fun close() {
        withContext(Dispatchers.Main) {
            try {
                webView?.destroy()
                webView = null
            } catch (e: Throwable) {
                Log.w(TAG, "Error releasing WebView: ${e.message}")
            }
        }
    }
}
