package com.zenify.mobile.yt

import okhttp3.Dns
import okhttp3.OkHttpClient
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.TimeUnit

object PreferIpv4Dns : Dns {
    override fun lookup(hostname: String): List<InetAddress> {
        val all = Dns.SYSTEM.lookup(hostname)
        val ipv4 = all.filterIsInstance<Inet4Address>()
        return if (ipv4.isNotEmpty()) ipv4 else all
    }
}

object Net {
    val ok: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .dns(PreferIpv4Dns)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }
}

