package com.ai.learning.diagnostic

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private var currentUrl: String = BuildConfig.BASE_URL

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(R.layout.activity_main)

        setupViews()
        setupWebView()

        // 加载主页
        webView.loadUrl(currentUrl)
    }

    private fun setupViews() {
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        swipeRefresh = findViewById(R.id.swipeRefresh)

        // 下拉刷新
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        // 下拉刷新颜色
        swipeRefresh.setColorSchemeResources(
            R.color.primary,
            R.color.secondary,
            R.color.accent
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings

        // 基本设置
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.textZoom = 100

        // 缓存策略
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // 混合内容 (http + https)
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        // 媒体自动播放
        settings.mediaPlaybackRequiresUserGesture = false

        // 文件访问
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        // WebView客户端
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false
                url?.let { currentUrl = it }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                return when {
                    // 站内链接 - WebView 内打开
                    url.host == Uri.parse(BuildConfig.BASE_URL).host -> {
                        view?.loadUrl(url.toString())
                        true
                    }
                    // http/https 外链 - 系统浏览器打开
                    url.scheme == "http" || url.scheme == "https" -> {
                        startActivity(Intent(Intent.ACTION_VIEW, url))
                        true
                    }
                    // tel: 拨号
                    url.scheme == "tel" -> {
                        startActivity(Intent(Intent.ACTION_DIAL, url))
                        true
                    }
                    // mailto: 邮件
                    url.scheme == "mailto" -> {
                        startActivity(Intent(Intent.ACTION_SENDTO, url))
                        true
                    }
                    else -> false
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    showErrorPage()
                }
            }
        }

        // Chrome客户端 - 进度条
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                } else {
                    progressBar.visibility = View.VISIBLE
                }
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                // 可以设置标题
            }

            // 文件选择支持（拍照上传）
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserParams?.let { params ->
                    val intent = params.createIntent()
                    // 添加相机选项
                    val captureIntent = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
                    val chooserIntent = Intent.createChooser(intent, "选择图片")
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(captureIntent))
                    filePathCallback?.let { filePathCallbackRef ->
                        // 保存回调引用
                        this@MainActivity.filePathCallback = filePathCallbackRef
                        startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE)
                    }
                }
                return true
            }
        }

        // JS 接口
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidApp")
    }

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val results = if (resultCode == RESULT_OK) {
                val result = data?.data
                if (result != null) arrayOf(result) else null
            } else null
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }
    }

    private fun showErrorPage() {
        val html = """
            <html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f9ff;color:#64748b;font-family:sans-serif;text-align:center;padding:20px;">
                <div style="font-size:64px;margin-bottom:16px;">&#128546;</div>
                <h2 style="color:#0f172a;margin-bottom:8px;">加载失败</h2>
                <p style="margin-bottom:20px;">请检查网络连接后重试</p>
                <button onclick="window.location.reload()" style="padding:12px 28px;background:linear-gradient(135deg,#3b82f6,#06b6d4);color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">重新加载</button>
            </body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onSupportNavigateUp(): Boolean {
        if (webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onSupportNavigateUp()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            // 退出确认
            AlertDialog.Builder(this)
                .setTitle("退出应用")
                .setMessage("确定要退出AI学习诊断吗？")
                .setPositiveButton("退出") { _, _ ->
                    super.onBackPressedDispatcher.onBackPressed()
                }
                .setNegativeButton("取消", null)
                .show()
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_REQUEST_CODE = 1001
    }
}
