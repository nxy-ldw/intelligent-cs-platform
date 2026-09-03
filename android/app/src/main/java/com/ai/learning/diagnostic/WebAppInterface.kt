package com.ai.learning.diagnostic

import android.content.Context
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

/**
 * JavaScript 与原生交互接口
 * 通过 window.AndroidApp 调用
 */
class WebAppInterface(private val context: Context) {

    /**
     * 显示原生 Toast
     */
    @JavascriptInterface
    fun showToast(message: String, duration: Int = 0) {
        val toastDuration = if (duration == 1) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
        Toast.makeText(context, message, toastDuration).show()
    }

    /**
     * 显示原生对话框
     */
    @JavascriptInterface
    fun showAlert(title: String, message: String) {
        AlertDialog.Builder(context)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("确定", null)
            .show()
    }

    /**
     * 获取应用版本号
     */
    @JavascriptInterface
    fun getAppVersion(): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    /**
     * 判断是否为App环境
     */
    @JavascriptInterface
    fun isApp(): Boolean = true

    /**
     * 获取平台名称
     */
    @JavascriptInterface
    fun getPlatform(): String = "android"

    /**
     * 退出应用
     */
    @JavascriptInterface
    fun exitApp() {
        (context as? MainActivity)?.finish()
    }
}
