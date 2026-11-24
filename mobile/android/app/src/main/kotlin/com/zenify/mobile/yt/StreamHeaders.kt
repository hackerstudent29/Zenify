package com.zenify.mobile.yt

object StreamHeaders {
    private val WEB_CLIENTS = setOf(
        "WEB", "MWEB", "WEB_REMIX", "WEB_CREATOR", "WEB_EMBEDDED_PLAYER",
        "TVHTML5", "TVHTML5_SIMPLY", "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "TVHTML5_DOWNGRADED"
    )

    fun forClient(client: String?, fallbackHeaders: Map<String, String> = emptyMap()): Map<String, String> {
        val h = mutableMapOf<String, String>()
        h["Accept"] = "*/*"
        h["Accept-Encoding"] = "identity" // keeps range math exact

        val c = client?.uppercase() ?: "IOS"
        val isWebFamily = c.isEmpty() || WEB_CLIENTS.contains(c)

        if (isWebFamily) {
            val isMusic = c.contains("REMIX") || c.contains("MUSIC")
            val base = if (isMusic) "https://music.youtube.com" else "https://www.youtube.com"
            h["Origin"] = base
            h["Referer"] = "$base/"
            h["Sec-Fetch-Dest"] = "empty"
            h["Sec-Fetch-Mode"] = "cors"
            h["Sec-Fetch-Site"] = "cross-site"
        }

        // Apply fallback/extracted headers
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

    fun defaultUaFor(client: String): String {
        val c = client.uppercase()
        return when {
            c.contains("VISIONOS") -> "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 visionOS/1.0"
            c.contains("IOS") -> "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)"
            c.contains("VR") -> "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12; Quest 3) gzip"
            c.contains("TV") -> "Mozilla/5.0 (ChromiumStylePlatform; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
            c.contains("ANDROID") -> "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip"
            else -> "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        }
    }
}

