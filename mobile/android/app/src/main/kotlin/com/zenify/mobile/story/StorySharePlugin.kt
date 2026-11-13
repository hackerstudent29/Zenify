package com.zenify.mobile.story

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import java.io.OutputStream

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
                if (path.isNullOrBlank()) {
                    result.error("BAD_ARGS", "filePath is missing", null)
                    return
                }
                handleInstagramStory(path, topColor, bottomColor, result)
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
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(
                    packageName,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(packageName, 0)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun getFileUri(file: File): Uri {
        val authority = "${context.packageName}.story_file_provider"
        return FileProvider.getUriForFile(context, authority, file)
    }

    private fun handleInstagramStory(
        filePath: String,
        topColor: String?,
        bottomColor: String?,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.error("FILE_NOT_FOUND", "Story image file does not exist", null)
            return
        }

        if (!isPackageInstalled("com.instagram.android")) {
            result.error("NOT_INSTALLED", "Instagram is not installed", null)
            return
        }

        try {
            val contentUri = getFileUri(file)
            val intent = Intent("com.instagram.share.ADD_TO_STORY").apply {
                setDataAndType(contentUri, "image/png")
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

            context.grantUriPermission(
                "com.instagram.android",
                contentUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )

            context.startActivity(intent)
            result.success(true)
        } catch (e: Exception) {
            result.error("SHARE_FAILED", e.message, null)
        }
    }

    private fun handleFacebookStory(
        filePath: String,
        appId: String?,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.error("FILE_NOT_FOUND", "Story image file does not exist", null)
            return
        }

        val fbInstalled = isPackageInstalled("com.facebook.katana")
        if (!fbInstalled) {
            result.error("NOT_INSTALLED", "Facebook is not installed", null)
            return
        }

        try {
            val contentUri = getFileUri(file)

            // If a valid Meta App ID is provided, use the dedicated story intent
            if (!appId.isNullOrBlank()) {
                val storyIntent = Intent("com.facebook.stories.ADD_TO_STORY").apply {
                    setDataAndType(contentUri, "image/png")
                    flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("com.facebook.platform.extra.APPLICATION_ID", appId)
                    putExtra("interactive_asset_uri", contentUri)
                }
                context.grantUriPermission(
                    "com.facebook.katana",
                    contentUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
                context.startActivity(storyIntent)
                result.success(true)
                return
            }

            // Fallback: Share directly as an image intent targeting Facebook
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                setPackage("com.facebook.katana")
                putExtra(Intent.EXTRA_STREAM, contentUri)
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.grantUriPermission(
                "com.facebook.katana",
                contentUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            context.startActivity(sendIntent)
            result.success(true)
        } catch (e: Exception) {
            result.error("SHARE_FAILED", e.message, null)
        }
    }

    private fun handleWhatsApp(
        filePath: String,
        text: String?,
        result: MethodChannel.Result
    ) {
        val file = File(filePath)
        if (!file.exists()) {
            result.error("FILE_NOT_FOUND", "Story image file does not exist", null)
            return
        }

        val waPkg = when {
            isPackageInstalled("com.whatsapp") -> "com.whatsapp"
            isPackageInstalled("com.whatsapp.w4b") -> "com.whatsapp.w4b"
            else -> null
        }

        if (waPkg == null) {
            result.error("NOT_INSTALLED", "WhatsApp is not installed", null)
            return
        }

        try {
            val contentUri = getFileUri(file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                setPackage(waPkg)
                putExtra(Intent.EXTRA_STREAM, contentUri)
                if (!text.isNullOrBlank()) {
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.grantUriPermission(
                waPkg,
                contentUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            context.startActivity(intent)
            result.success(true)
        } catch (e: Exception) {
            result.error("SHARE_FAILED", e.message, null)
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

                // Notify media scanner
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

