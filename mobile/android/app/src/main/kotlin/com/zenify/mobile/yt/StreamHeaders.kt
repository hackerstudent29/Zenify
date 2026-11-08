package com.zenify.mobile.yt

object StreamHeaders {
    private val WEB_CLIENTS = setOf(
        "WEB", "MWEB", "WEB_REMIX", "WEB_CREATOR", "WEB_EMBEDDED_PLAYER",
        "TVHTML5", "TVHTML5_SIMPLY_EMBEDDED_PLAYER"
    )

    fun forClient(client: String?, fallbackHeaders: Map<String, String> = emptyMap()): Map<String, String> {
        val h = mutableMapOf<String, String>()
        h["Accept"] = "*/*"
        h["Accept-Encoding"] = "identity" // keeps range math exact

        val c = client?.uppercase() ?: "WEB_REMIX"
        val isWebFamily = c.isEmpty() || WEB_CLIENTS.contains(c)

        if (isWebFamily) {
            h["Origin"] = "https://www.youtube.com"
            h["Referer"] = "https://www.youtube.com/"
            h["Sec-Fetch-Dest"] = "empty"
            h["Sec-Fetch-Mode"] = "cors"
            h["Sec-Fetch-Site"] = "cross-site"
        }

        // Apply fallback/extracted headers (such as User-Agent paired by InnerTubeX)
        for ((k, v) in fallbackHeaders) {
            if (!h.containsKey(k)) {
                h[k] = v
            }
        }

        if (!h.containsKey("User-Agent")) {
            h["User-Agent"] = defaultUaFor(c)
        }

        return h
    }

    private fun defaultUaFor(client: String): String = when {
        client.contains("ANDROID") -> "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip"
        client.contains("IOS") -> "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)"
        else -> "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}

