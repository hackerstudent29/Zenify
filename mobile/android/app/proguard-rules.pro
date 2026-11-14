# Proguard rules for Zenify Mobile
-dontwarn meow.nyx.quackjs.**
-dontwarn com.metrolist.innertubex.**
-dontwarn com.metrolist.innertube.**
-keep class com.metrolist.innertubex.** { *; }
-keep class com.metrolist.innertube.** { *; }
-keepclassmembers class com.metrolist.innertube.** { *; }
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
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
}
-keepclassmembers class * {
    public static *** Companion;
}
-keepclasseswithmembers class * {
    public static *** Companion;
}
-keepclassmembers class * {
    *** Companion;
}
-keepclassmembers class * {
    @kotlinx.serialization.internal.GeneratedSerializer *;
}
-keepclassmembers class * {
    static ** $serializer;
}
-keep class kotlinx.serialization.** { *; }
-keep class * implements kotlinx.serialization.KSerializer { *; }

# Timber
-dontwarn com.jakewharton.timber.**
-keep class com.jakewharton.timber.** { *; }
