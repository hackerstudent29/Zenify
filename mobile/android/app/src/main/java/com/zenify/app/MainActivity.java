package com.zenify.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Custom User Agent to bypass Google's WebView block
        // This makes the WebView look like a standard mobile Chrome browser
        WebView webView = (WebView) this.getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        String userAgent = settings.getUserAgentString();
        
        // Removing "Version/X.X" and "wv" (WebView indicator) from User Agent
        // This is often enough to satisfy Google's security check
        userAgent = userAgent.replaceAll("Version/[^\\s/]+\\s*", "");
        userAgent = userAgent.replace("wv", "");
        
        settings.setUserAgentString(userAgent);
    }
}
