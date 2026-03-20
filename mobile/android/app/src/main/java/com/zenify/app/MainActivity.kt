package com.zenify.app

import android.os.Bundle
import android.webkit.WebSettings
import com.getcapacitor.BridgeActivity
import com.zenify.app.native_ui.NativePlayerPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        registerPlugin(NativePlayerPlugin::class.java)
        
        // Custom User Agent to bypass Google's WebView block
        val webView = bridge.webView
        val settings = webView.settings
        var userAgent = settings.userAgentString
        
        // Removing "Version/X.X" and "wv" from User Agent
        userAgent = userAgent.replace("Version/[^\\s/]+\\s*".toRegex(), "")
        userAgent = userAgent.replace("wv", "")
        
        settings.userAgentString = userAgent
    }
}
