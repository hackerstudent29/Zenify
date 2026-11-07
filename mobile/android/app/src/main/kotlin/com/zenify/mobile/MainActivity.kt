package com.zenify.mobile

import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : AudioServiceActivity() {
    private val CHANNEL = "com.zenify.mobile/audio_fx"
    private var backCallback: OnBackInvokedCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = OnBackInvokedCallback {
                android.util.Log.d("ZenifyNav", "OnBackInvokedCallback: dispatching popRoute to Flutter")
                flutterEngine?.navigationChannel?.popRoute()
            }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                backCallback!!
            )
        }
    }

    override fun onBackPressed() {
        android.util.Log.d("ZenifyNav", "onBackPressed: dispatching popRoute to Flutter")
        flutterEngine?.navigationChannel?.popRoute()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register custom ExoPlayer native audio pipeline with real-time StudioFX
        flutterEngine.plugins.add(com.zenify.mobile.audio.ZenAudioPlugin())

        // Legacy audio_fx channel no-ops gracefully: all DSP is handled natively
        // inside ExoPlayer by ZenFxProcessor with full transparent unity gain.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "setEq3", "setBassBoost", "setVirtualizer", "setReverb", "setBypass" -> {
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
            try {
                onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback!!)
            } catch (e: Exception) {
                // Ignore if already unhooked
            }
        }
        super.onDestroy()
    }
}
