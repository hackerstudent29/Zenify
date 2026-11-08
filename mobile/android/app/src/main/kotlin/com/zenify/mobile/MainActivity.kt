package com.zenify.mobile

import android.content.Intent
import android.net.Uri
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : AudioServiceActivity() {
    private val FX_CHANNEL = "com.zenify.mobile/audio_fx"
    private val APP_CHANNEL = "com.zenify.mobile/app"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register custom ExoPlayer native audio pipeline with real-time StudioFX
        flutterEngine.plugins.add(com.zenify.mobile.audio.ZenAudioPlugin())

        // App utility channel: Native URL launcher and APK update downloader
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
}
