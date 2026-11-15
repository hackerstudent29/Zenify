package com.zenify.mobile.story

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class StorySharePlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL_NAME = "com.zenify.mobile/story_share"

        fun registerWith(messenger: BinaryMessenger, context: Context): StorySharePlugin {
            val channel = MethodChannel(messenger, CHANNEL_NAME)
            val plugin = StorySharePlugin(context)
            channel.setMethodCallHandler(plugin)
            return plugin
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "isAppInstalled" -> {
                val pkg = call.argument<String>("packageName")
                if (pkg.isNullOrBlank()) {
                    result.success(false)
                } else {
                    result.success(isPackageInstalled(pkg))
                }
            }
            "shareToInstagramStory" -> {
                val path = call.argument<String>("filePath")
                val topColor = call.argument<String>("topBackgroundColor")
                val bottomColor = call.argument<String>("bottomBackgroundColor")
                val asSticker = call.argument<Boolean>("asSticker") ?: false
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleInstagramStory(path, topColor, bottomColor, asSticker, result)
            }
            "shareToFacebookStory" -> {
                val path = call.argument<String>("filePath")
                val appId = call.argument<String>("appId")
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleFacebookStory(path, appId, result)
            }
            "shareToWhatsApp" -> {
                val path = call.argument<String>("filePath")
                val text = call.argument<String>("text")
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleWhatsApp(path, text, result)
            }
            "shareToSnapchat" -> {
                val path = call.argument<String>("filePath")
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleSnapchat(path, result)
            }
            "shareToTelegram" -> {
                val path = call.argument<String>("filePath")
                val text = call.argument<String>("text")
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleTelegram(path, text, result)
            }
            "shareToSystemChooser" -> {
                val path = call.argument<String>("filePath")
                val text = call.argument<String>("text")
                val title = call.argument<String>("title") ?: "Share Story"
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleSystemChooser(path, text, title, result)
            }
            "saveToGallery" -> {
                val path = call.argument<String>("filePath")
                val title = call.argument<String>("title") ?: "Zenify_Story"
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleSaveToGallery(path, title, result)
            }
            else -> result.notImplemented()
        }
    }

    private fun isPackageInstalled(packageName: String): Boolean {
        val pm = context.packageManager
        return try {
            if (pm.getLaunchIntentForPackage(packageName) != null) {
                return true
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(packageName, 0)
            }
            true
        } catch (_: Exception) {
            try {
                val testIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/*"
                    setPackage(packageName)
                }
                pm.queryIntentActivities(testIntent, 0).isNotEmpty()
            } catch (_: Exception) {
                false
            }
        }
    }

    private fun getFileUri(file: File): Uri {
        val authority = "${context.packageName}.story_file_provider"
        return FileProvider.getUriForFile(context, authority, file)
    }

    private fun grantPermissionsAndAttachClipData(intent: Intent, uri: Uri) {
        intent.clipData = ClipData.newRawUri("Zenify Story Media", uri)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        // Unconditionally grant permission directly to the target package if set
        intent.`package`?.let { pkg ->
            try {
                context.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: Exception) {}
        }

        // Also pre-grant to common social targets so the receiving app can read the media
        val targets = listOf(
            "com.instagram.android",
            "com.facebook.katana",
            "com.facebook.lite",
            "com.whatsapp",
            "com.whatsapp.w4b",
            "com.snapchat.android",
            "org.telegram.messenger",
            "org.thunderdog.challegram",
            "org.telegram.messenger.web"
        )
        for (pkg in targets) {
            try {
                context.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: Exception) {}
        }

        try {
            val resInfoList = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.queryIntentActivities(
                    intent,
                    PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong())
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            }
            for (resolveInfo in resInfoList) {
                val packageName = resolveInfo.activityInfo.packageName
                context.grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } catch (_: Exception) {}
    }

    private fun handleInstagramStory(
        filePath: String,
        topColor: String?,
        bottomColor: String?,
        asSticker: Boolean,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.success(false)
            return
        }

        val igPkg = "com.instagram.android"
        try {
            val contentUri = getFileUri(file)

            if (!asSticker) {
                // Background Asset Mode (Full-bleed 1080x1920 story card)
                val storyIntent = Intent("com.instagram.share.ADD_TO_STORY").apply {
                    setDataAndType(contentUri, "image/png")
                    setPackage(igPkg)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("source_application", context.packageName)
                }
                grantPermissionsAndAttachClipData(storyIntent, contentUri)

                try {
                    context.startActivity(storyIntent)
                    result.success(true)
                    return
                } catch (e: Exception) {
                    android.util.Log.w("StorySharePlugin", "Instagram story intent direct launch failed: ${e.message}")
                }
            } else {
                // Sticker Asset Mode (Square or sticker with top/bottom background colors)
                val stickerIntent = Intent("com.instagram.share.ADD_TO_STORY").apply {
                    type = "image/png"
                    setPackage(igPkg)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("interactive_asset_uri", contentUri)
                    if (!topColor.isNullOrBlank()) {
                        putExtra("top_background_color", topColor)
                    }
                    if (!bottomColor.isNullOrBlank()) {
                        putExtra("bottom_background_color", bottomColor)
                    }
                    putExtra("source_application", context.packageName)
                }
                grantPermissionsAndAttachClipData(stickerIntent, contentUri)

                try {
                    context.startActivity(stickerIntent)
                    result.success(true)
                    return
                } catch (e: Exception) {
                    android.util.Log.w("StorySharePlugin", "Instagram sticker intent direct launch failed: ${e.message}")
                }
            }

            // Fallback 1: Direct Instagram Image Send Intent
            try {
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    setPackage(igPkg)
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                }
                grantPermissionsAndAttachClipData(sendIntent, contentUri)
                context.startActivity(sendIntent)
                result.success(true)
                return
            } catch (e: Exception) {
                android.util.Log.w("StorySharePlugin", "Instagram ACTION_SEND launch failed: ${e.message}")
            }

            // Fallback 2: System chooser
            handleSystemChooser(filePath, null, "Share to Instagram", result)
        } catch (_: Exception) {
            handleSystemChooser(filePath, null, "Share Story", result)
        }
    }

    private fun handleFacebookStory(
        filePath: String,
        appId: String?,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.success(false)
            return
        }

        val fbPkg = when {
            isPackageInstalled("com.facebook.katana") -> "com.facebook.katana"
            isPackageInstalled("com.facebook.lite") -> "com.facebook.lite"
            else -> "com.facebook.katana"
        }

        try {
            val contentUri = getFileUri(file)

            // Dedicated story intent if Meta App ID is configured
            if (!appId.isNullOrBlank() && fbPkg == "com.facebook.katana") {
                val storyIntent = Intent("com.facebook.stories.ADD_TO_STORY").apply {
                    setDataAndType(contentUri, "image/png")
                    setPackage(fbPkg)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("com.facebook.platform.extra.APPLICATION_ID", appId)
                }
                grantPermissionsAndAttachClipData(storyIntent, contentUri)
                try {
                    context.startActivity(storyIntent)
                    result.success(true)
                    return
                } catch (e: Exception) {
                    android.util.Log.w("StorySharePlugin", "Facebook story intent failed: ${e.message}")
                }
            }

            // Fallback 1: Direct image send intent targeting Facebook
            try {
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    setPackage(fbPkg)
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                }
                grantPermissionsAndAttachClipData(sendIntent, contentUri)
                context.startActivity(sendIntent)
                result.success(true)
                return
            } catch (e: Exception) {
                android.util.Log.w("StorySharePlugin", "Facebook ACTION_SEND launch failed: ${e.message}")
            }

            // Fallback 2: System chooser
            handleSystemChooser(filePath, null, "Share to Facebook", result)
        } catch (_: Exception) {
            handleSystemChooser(filePath, null, "Share Story", result)
        }
    }

    private fun handleWhatsApp(
        filePath: String,
        text: String?,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.success(false)
            return
        }

        val pkgs = listOf("com.whatsapp", "com.whatsapp.w4b")
        try {
            val contentUri = getFileUri(file)

            for (pkg in pkgs) {
                try {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "image/png"
                        setPackage(pkg)
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        if (!text.isNullOrBlank()) {
                            putExtra(Intent.EXTRA_TEXT, text)
                        }
                        flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    grantPermissionsAndAttachClipData(intent, contentUri)
                    context.startActivity(intent)
                    result.success(true)
                    return
                } catch (_: Exception) {}
            }

            // Fallback: System chooser
            handleSystemChooser(filePath, text, "Share to WhatsApp", result)
        } catch (_: Exception) {
            handleSystemChooser(filePath, text, "Share Story", result)
        }
    }

    private fun handleSnapchat(
        filePath: String,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.success(false)
            return
        }

        val snapPkg = "com.snapchat.android"
        try {
            val contentUri = getFileUri(file)

            // Try Snapchat Creative Kit content intent
            try {
                val snapIntent = Intent("com.snapchat.add.CONTENT").apply {
                    setDataAndType(contentUri, "image/png")
                    setPackage(snapPkg)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                }
                grantPermissionsAndAttachClipData(snapIntent, contentUri)
                context.startActivity(snapIntent)
                result.success(true)
                return
            } catch (_: Exception) {}

            // Fallback 1: Direct image send intent targeting Snapchat
            try {
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    setPackage(snapPkg)
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                }
                grantPermissionsAndAttachClipData(sendIntent, contentUri)
                context.startActivity(sendIntent)
                result.success(true)
                return
            } catch (_: Exception) {}

            // Fallback 2: System chooser
            handleSystemChooser(filePath, null, "Share to Snapchat", result)
        } catch (_: Exception) {
            handleSystemChooser(filePath, null, "Share Story", result)
        }
    }

    private fun handleTelegram(
        filePath: String,
        text: String?,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.success(false)
            return
        }

        val pkgs = listOf(
            "org.telegram.messenger",
            "org.thunderdog.challegram",
            "org.telegram.messenger.web"
        )
        try {
            val contentUri = getFileUri(file)

            for (pkg in pkgs) {
                try {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "image/png"
                        setPackage(pkg)
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        if (!text.isNullOrBlank()) {
                            putExtra(Intent.EXTRA_TEXT, text)
                        }
                        flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    grantPermissionsAndAttachClipData(intent, contentUri)
                    context.startActivity(intent)
                    result.success(true)
                    return
                } catch (_: Exception) {}
            }

            // Fallback: System chooser
            handleSystemChooser(filePath, text, "Share to Telegram", result)
        } catch (_: Exception) {
            handleSystemChooser(filePath, text, "Share Story", result)
        }
    }

    private fun handleSystemChooser(
        filePath: String,
        text: String?,
        title: String,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.success(false)
            return
        }

        try {
            val contentUri = getFileUri(file)
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                if (!text.isNullOrBlank()) {
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            grantPermissionsAndAttachClipData(sendIntent, contentUri)

            val chooser = Intent.createChooser(sendIntent, title).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                clipData = sendIntent.clipData
            }
            context.startActivity(chooser)
            result.success(true)
        } catch (_: Exception) {
            result.success(false)
        }
    }

    private fun handleSaveToGallery(
        filePath: String,
        title: String,
        result: MethodChannel.Result
    ) {
        val srcFile = File(filePath)
        if (!srcFile.exists()) {
            result.error("FILE_NOT_FOUND", "Source image file does not exist", null)
            return
        }

        try {
            val timestamp = System.currentTimeMillis()
            val fileName = "${title}_$timestamp.png"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Zenify")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }

                val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                if (uri == null) {
                    result.error("SAVE_FAILED", "Failed to create MediaStore entry", null)
                    return
                }

                resolver.openOutputStream(uri).use { out ->
                    if (out == null) throw IllegalStateException("Cannot open output stream for $uri")
                    FileInputStream(srcFile).use { input ->
                        input.copyTo(out)
                    }
                }

                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)

                result.success(true)
            } else {
                @Suppress("DEPRECATION")
                val picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                val zenifyDir = File(picturesDir, "Zenify")
                if (!zenifyDir.exists()) {
                    zenifyDir.mkdirs()
                }
                val destFile = File(zenifyDir, fileName)
                FileInputStream(srcFile).use { input ->
                    FileOutputStream(destFile).use { out ->
                        input.copyTo(out)
                    }
                }

                val mediaScanIntent = Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE).apply {
                    data = Uri.fromFile(destFile)
                }
                context.sendBroadcast(mediaScanIntent)

                result.success(true)
            }
        } catch (e: Exception) {
            result.error("SAVE_FAILED", e.message, null)
        }
    }
}
