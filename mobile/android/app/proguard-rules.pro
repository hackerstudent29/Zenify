# Proguard rules for Zenify Mobile
-dontwarn meow.nyx.quackjs.**
-dontwarn com.metrolist.innertubex.**
-keep class com.metrolist.innertubex.** { *; }
-keep class meow.nyx.quackjs.** { *; }
-keep class com.zenify.mobile.** { *; }

# Ktor & OkHttp
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
-dontwarn okio.**
-keep class okio.** { *; }

# Media3 & ExoPlayer
-dontwarn androidx.media3.**
-keep class androidx.media3.** { *; }
-dontwarn androidx.media.**
-keep class androidx.media.** { *; }

# Kotlinx Serialization
-keepattributes *Annotation*,InnerClasses,Signature,EnclosingMethod
-dontwarn kotlinx.serialization.**
-keepclassmembers class * {
    @kotlinx.serialization.Serializable <fields>;
}
-keep class kotlinx.serialization.** { *; }

# Timber
-dontwarn com.jakewharton.timber.**
-keep class com.jakewharton.timber.** { *; }

# LiveKit & WebRTC
-dontwarn org.webrtc.**
-keep class org.webrtc.** { *; }
-dontwarn io.livekit.**
-keep class io.livekit.** { *; }


