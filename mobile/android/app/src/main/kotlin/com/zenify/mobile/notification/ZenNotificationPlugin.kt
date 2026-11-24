package com.zenify.mobile.notification

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.zenify.mobile.MainActivity
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class ZenNotificationPlugin(private val context: Context, private val channel: MethodChannel) :
    MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL_NAME = "com.zenify.mobile/notifications"

        const val CH_UPDATES = "zenify_updates"
        const val CH_DISCOVERY = "zenify_discovery"
        const val CH_RELEASES = "zenify_releases"
        const val CH_SOCIAL = "zenify_social"
        const val CH_DOWNLOADS = "zenify_downloads"

        private var instance: ZenNotificationPlugin? = null

        fun registerWith(messenger: BinaryMessenger, context: Context): ZenNotificationPlugin {
            val methodChannel = MethodChannel(messenger, CHANNEL_NAME)
            val plugin = ZenNotificationPlugin(context, methodChannel)
            methodChannel.setMethodCallHandler(plugin)
            plugin.createNotificationChannels()
            instance = plugin
            return plugin
        }

        fun onDeepLinkReceived(deepLink: String) {
            instance?.sendDeepLinkToFlutter(deepLink)
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var initialDeepLink: String? = null

    fun setInitialDeepLink(link: String?) {
        if (!link.isNullOrBlank()) {
            initialDeepLink = link
        }
    }

    fun sendDeepLinkToFlutter(deepLink: String) {
        mainHandler.post {
            try {
                channel.invokeMethod("onNotificationOpened", deepLink)
            } catch (_: Exception) {}
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return

            val channels = listOf(
                NotificationChannel(
                    CH_UPDATES,
                    "App Updates",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Zenify app updates and new version releases"
                    enableVibration(true)
                },
                NotificationChannel(
                    CH_DISCOVERY,
                    "Discovery & Replay",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Music Atlas world explorer and listening Replay insights"
                },
                NotificationChannel(
                    CH_RELEASES,
                    "New Releases",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "New singles, albums and music drops from followed artists"
                    enableVibration(true)
                },
                NotificationChannel(
                    CH_SOCIAL,
                    "Room Together",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Live listening parties and Room Together invitations"
                    enableVibration(true)
                },
                NotificationChannel(
                    CH_DOWNLOADS,
                    "Downloads",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Offline audio download completion alerts"
                }
            )

            manager.createNotificationChannels(channels)
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "showNotification" -> {
                val id = call.argument<Int>("id") ?: (System.currentTimeMillis() % 100000).toInt()
                val title = call.argument<String>("title") ?: "Zenify"
                val body = call.argument<String>("body") ?: ""
                val channelId = call.argument<String>("channelId") ?: CH_DISCOVERY
                val deepLink = call.argument<String>("deepLink")
                val imageUrl = call.argument<String>("imageUrl")

                postSystemNotification(id, title, body, channelId, deepLink, imageUrl)
                result.success(true)
            }
            "cancelNotification" -> {
                val id = call.argument<Int>("id")
                if (id != null) {
                    NotificationManagerCompat.from(context).cancel(id)
                }
                result.success(true)
            }
            "hasPermission" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) == PackageManager.PERMISSION_GRANTED
                    result.success(granted)
                } else {
                    result.success(NotificationManagerCompat.from(context).areNotificationsEnabled())
                }
            }
            "getInitialDeepLink" -> {
                val link = initialDeepLink
                initialDeepLink = null
                result.success(link)
            }
            else -> result.notImplemented()
        }
    }

    private fun postSystemNotification(
        id: Int,
        title: String,
        body: String,
        channelId: String,
        deepLink: String?,
        imageUrl: String?
    ) {
        thread(isDaemon = true) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.POST_NOTIFICATIONS
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        return@thread
                    }
                }

                // Resolve small icon
                val smallIcon = context.resources.getIdentifier(
                    "ic_launcher",
                    "mipmap",
                    context.packageName
                ).let { if (it != 0) it else android.R.drawable.ic_dialog_info }

                // Build PendingIntent pointing to MainActivity
                val intent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    if (!deepLink.isNullOrBlank()) {
                        putExtra("zen_deep_link", deepLink)
                    }
                }

                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }

                val pendingIntent = PendingIntent.getActivity(context, id, intent, flags)

                // Optional artwork bitmap download
                var artworkBitmap: Bitmap? = null
                if (!imageUrl.isNullOrBlank() && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))) {
                    try {
                        val connection = (URL(imageUrl).openConnection() as HttpURLConnection).apply {
                            connectTimeout = 6000
                            readTimeout = 6000
                            doInput = true
                            connect()
                        }
                        if (connection.responseCode == 200) {
                            connection.inputStream.use { input ->
                                artworkBitmap = BitmapFactory.decodeStream(input)
                            }
                        }
                    } catch (_: Exception) {}
                }

                val builder = NotificationCompat.Builder(context, channelId)
                    .setSmallIcon(smallIcon)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(
                        if (channelId == CH_UPDATES || channelId == CH_RELEASES || channelId == CH_SOCIAL)
                            NotificationCompat.PRIORITY_HIGH
                        else
                            NotificationCompat.PRIORITY_DEFAULT
                    )

                if (artworkBitmap != null) {
                    builder.setLargeIcon(artworkBitmap)
                    builder.setStyle(
                        NotificationCompat.BigPictureStyle()
                            .bigPicture(artworkBitmap)
                            .setSummaryText(body)
                    )
                }

                val manager = NotificationManagerCompat.from(context)
                manager.notify(id, builder.build())
            } catch (_: Exception) {}
        }
    }
}
