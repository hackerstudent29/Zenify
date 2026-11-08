package com.zenify.mobile.yt

enum class Denial { URL_EXPIRED, ATTESTATION_GATED, TOKEN_REJECTED, UNKNOWN }

object DenialClassifier {
    fun classify(url: String?, nowSec: Long = System.currentTimeMillis() / 1000): Denial {
        val expire = param(url, "expire")?.toLongOrNull() ?: return Denial.UNKNOWN
        if (expire - nowSec <= 30) return Denial.URL_EXPIRED // 30 s clock-skew grace
        return if (param(url, "pot").isNullOrEmpty()) Denial.ATTESTATION_GATED else Denial.TOKEN_REJECTED
    }

    fun clientOf(url: String?): String? = param(url, "c")?.uppercase()
    fun itagOf(url: String?): String? = param(url, "itag")

    fun param(url: String?, key: String): String? {
        if (url == null) return null
        val queryStart = url.indexOf('?').takeIf { it != -1 } ?: return null
        val query = url.substring(queryStart + 1)
        for (part in query.split('&')) {
            val idx = part.indexOf('=')
            if (idx != -1) {
                val k = part.substring(0, idx)
                if (k.equals(key, ignoreCase = true)) {
                    return try {
                        java.net.URLDecoder.decode(part.substring(idx + 1), "UTF-8")
                    } catch (_: Exception) {
                        part.substring(idx + 1)
                    }
                }
            }
        }
        return null
    }
}

