package com.codexu.freecell

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.annotation.Keep
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var gameWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    requestedOrientation = getPreferences(MODE_PRIVATE)
      .getInt("gameOrientation", ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)
    super.onCreate(savedInstanceState)
    updateSystemBars()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    gameWebView = webView
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      publishSafeArea(insets)
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  // Invoked on the UI thread by the Tauri orientation command.
  @Keep
  fun setGameOrientation(orientation: Int) {
    if (orientation != ActivityInfo.SCREEN_ORIENTATION_PORTRAIT &&
        orientation != ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE) return
    getPreferences(MODE_PRIVATE).edit().putInt("gameOrientation", orientation).apply()
    requestedOrientation = orientation
    updateSystemBars()
    refreshGameSafeArea()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) updateSystemBars()
  }

  private fun updateSystemBars() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    if (requestedOrientation == ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE) {
      controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      controller.show(WindowInsetsCompat.Type.systemBars())
    }
  }

  @Keep
  fun refreshGameSafeArea() {
    gameWebView?.let { webView ->
      ViewCompat.getRootWindowInsets(webView)?.let { publishSafeArea(it) }
      ViewCompat.requestApplyInsets(webView)
    }
  }

  private fun publishSafeArea(insets: WindowInsetsCompat) {
    val webView = gameWebView ?: return
    val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    val cutoutSafe = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
    val density = resources.displayMetrics.density
    val cutout = maxOf(safe.top, safe.left, safe.right) / density
    val script = "(() => { document.documentElement.style.setProperty('--native-safe-top','${safe.top / density}px');" +
      "document.documentElement.style.setProperty('--native-safe-right','${safe.right / density}px');" +
      "document.documentElement.style.setProperty('--native-safe-bottom','${safe.bottom / density}px');" +
      "document.documentElement.style.setProperty('--native-safe-left','${safe.left / density}px');" +
      "document.documentElement.style.setProperty('--native-cutout-top','${cutoutSafe.top / density}px');" +
      "document.documentElement.style.setProperty('--native-cutout-right','${cutoutSafe.right / density}px');" +
      "document.documentElement.style.setProperty('--native-cutout-bottom','${cutoutSafe.bottom / density}px');" +
      "document.documentElement.style.setProperty('--native-cutout-left','${cutoutSafe.left / density}px');" +
      "const style = document.documentElement.style; const cutout = Math.max(parseFloat(style.getPropertyValue('--device-cutout-inset')) || 0, $cutout);" +
      "style.setProperty('--device-cutout-inset', cutout + 'px'); })();"
    webView.evaluateJavascript(script, null)
  }
}
