package com.zenify.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : AudioServiceActivity() {
    private val FX_CHANNEL = "com.zenify.mobile/audio_fx"
    private val APP_CHANNEL = "com.zenify.mobile/app"

    private var pendingPermissionResult: MethodChannel.Result? = null
    private val PERM_NOTIF_REQ = 1001
    private val PERM_BT_REQ = 1002
    private val PERM_STORAGE_REQ = 1003

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val lp = window.attributes
        lp.rotationAnimation = WindowManager.LayoutParams.ROTATION_ANIMATION_SEAMLESS
        window.attributes = lp
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        unlockHighRefreshRate()
    }

    private fun unlockHighRefreshRate() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    display
                } else {
                    @Suppress("DEPRECATION")
                    windowManager.defaultDisplay
                } ?: return

                val modes = display.supportedModes ?: return
                val highestRefreshRateMode = modes.maxByOrNull { it.refreshRate }
                if (highestRefreshRateMode != null && highestRefreshRateMode.refreshRate > 60f) {
                    val layoutParams = window.attributes
                    layoutParams.preferredDisplayModeId = highestRefreshRateMode.modeId
                    window.attributes = layoutParams
                }
            } catch (_: Exception) {}
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register custom ExoPlayer native audio pipeline with real-time StudioFX
        flutterEngine.plugins.add(com.zenify.mobile.audio.ZenAudioPlugin())

        // Register Metrolist InnerTube native client
        flutterEngine.plugins.add(com.zenify.mobile.innertube.ZenInnerTubePlugin())

        // Register Story & Social sharing plugin
        com.zenify.mobile.story.StorySharePlugin.registerWith(flutterEngine.dartExecutor.binaryMessenger, this)

        // Register Native System Notifications engine
        val notifPlugin = com.zenify.mobile.notification.ZenNotificationPlugin.registerWith(
            flutterEngine.dartExecutor.binaryMessenger,
            this
        )
        val initialLink = intent?.getStringExtra("zen_deep_link")
        if (!initialLink.isNullOrBlank()) {
            notifPlugin.setInitialDeepLink(initialLink)
        }

        // App utility channel: Native URL launcher, permissions, and APK update downloader
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, APP_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "openUrl" -> {
                    val url = call.argument<String>("url")
                    if (!url.isNullOrBlank()) {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            startActivity(intent)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("OPEN_FAILED", e.message, null)
                        }
                    } else {
                        result.error("BAD_ARGS", "URL is null or blank", null)
                    }
                }
                "requestNotificationPermission" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                            result.success(true)
                        } else {
                            pendingPermissionResult = result
                            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), PERM_NOTIF_REQ)
                        }
                    } else {
                        result.success(true)
                    }
                }
                "requestBluetoothPermission" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
                            result.success(true)
                        } else {
                            pendingPermissionResult = result
                            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.BLUETOOTH_CONNECT), PERM_BT_REQ)
                        }
                    } else {
                        result.success(true)
                    }
                }
                "requestAudioStoragePermission" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            result.success(true)
                        } else {
                            pendingPermissionResult = result
                            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.READ_MEDIA_AUDIO), PERM_STORAGE_REQ)
                        }
                    } else {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
                            result.success(true)
                        } else {
                            pendingPermissionResult = result
                            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE), PERM_STORAGE_REQ)
                        }
                    }
                }
                "hasNotificationPermission" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        result.success(ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
                    } else {
                        result.success(true)
                    }
                }
                else -> result.notImplemented()
            }
        }

        // Legacy audio_fx channel no-ops gracefully: all DSP is handled natively
        // inside ExoPlayer by ZenFxProcessor with full transparent unity gain.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, FX_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "setEq3", "setBassBoost", "setVirtualizer", "setReverb", "setBypass" -> {
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        pendingPermissionResult?.success(granted)
        pendingPermissionResult = null
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val deepLink = intent.getStringExtra("zen_deep_link")
        if (!deepLink.isNullOrBlank()) {
            com.zenify.mobile.notification.ZenNotificationPlugin.onDeepLinkReceived(deepLink)
        }
    }
}
