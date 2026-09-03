# Add project specific ProGuard rules here.
-keepattributes *Annotation*
-keepattributes JavascriptInterface

# Keep WebView
-keep class android.webkit.** { *; }

# Keep custom JS interfaces
-keepclassmembers class com.ai.learning.diagnostic.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}

# Material Design
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**
