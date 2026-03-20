package com.zenify.app.native_ui

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativePlayer")
class NativePlayerPlugin : Plugin() {
    private var composeView: ComposeView? = null
    
    // Observed state for the Compose UI
    private var trackTitle by mutableStateOf("")
    private var artistName by mutableStateOf("")
    private var coverUrl by mutableStateOf("")
    private var isPlaying by mutableStateOf(false)
    private var currentTime by mutableStateOf(0f)
    private var duration by mutableStateOf(1f)

    @PluginMethod
    fun showPlayer(call: PluginCall) {
        val title = call.getString("title") ?: ""
        val artist = call.getString("artist") ?: ""
        val cover = call.getString("cover") ?: ""
        
        activity.runOnUiThread {
            trackTitle = title
            artistName = artist
            coverUrl = cover
            
            if (composeView == null) {
                val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
                composeView = ComposeView(context).apply {
                    setContent {
                        NativePlayerSheet(
                            trackTitle = trackTitle,
                            artistName = artistName,
                            coverUrl = coverUrl,
                            isPlaying = isPlaying,
                            currentTime = currentTime,
                            duration = duration,
                            onTogglePlay = {
                                notifyListeners("togglePlay", JSObject())
                            },
                            onClose = {
                                hidePlayerUi()
                            }
                        )
                    }
                }
                rootView.addView(composeView)
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun updateState(call: PluginCall) {
        activity.runOnUiThread {
            isPlaying = call.getBoolean("isPlaying") ?: false
            currentTime = call.getFloat("currentTime") ?: 0f
            duration = call.getFloat("duration") ?: 1f
            call.resolve()
        }
    }

    private fun hidePlayerUi() {
        activity.runOnUiThread {
            val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
            rootView.removeView(composeView)
            composeView = null
            notifyListeners("onClose", JSObject())
        }
    }
}
