package com.zenify.mobile

import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : AudioServiceActivity() {
    private val CHANNEL = "com.zenify.mobile/audio_fx"

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
}
