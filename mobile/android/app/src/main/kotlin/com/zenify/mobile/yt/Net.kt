package com.zenify.mobile.yt

import okhttp3.ConnectionPool
import okhttp3.Dispatcher
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
    val dispatcher = Dispatcher().apply {
        maxRequests = 64
        maxRequestsPerHost = 16
    }

    val ok: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .dns(PreferIpv4Dns)
            .dispatcher(dispatcher)
            .connectionPool(ConnectionPool(8, 10, TimeUnit.MINUTES))
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }

    val api: OkHttpClient by lazy {
        ok.newBuilder()
            .callTimeout(8, TimeUnit.SECONDS)
            .build()
    }
}

