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

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var currentUrl: String = BuildConfig.BASE_URL

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)

        setupWebView()
        webView.loadUrl(currentUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.textZoom = 100

        settings.userAgentString = settings.userAgentString + " AILearningApp/1.0.3 Android"

        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                url?.let { currentUrl = it }
                view?.evaluateJavascript(APP_INJECT_JS, null)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                return when {
                    url.host == Uri.parse(BuildConfig.BASE_URL).host -> {
                        view?.loadUrl(url.toString())
                        true
                    }
                    url.scheme == "http" || url.scheme == "https" -> {
                        startActivity(Intent(Intent.ACTION_VIEW, url))
                        true
                    }
                    url.scheme == "tel" -> {
                        startActivity(Intent(Intent.ACTION_DIAL, url))
                        true
                    }
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

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                } else {
                    progressBar.visibility = View.VISIBLE
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserParams?.let { params ->
                    val intent = params.createIntent()
                    val captureIntent = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
                    val chooserIntent = Intent.createChooser(intent, "选择图片")
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(captureIntent))
                    filePathCallback?.let { ref ->
                        this@MainActivity.filePathCallback = ref
                        startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE)
                    }
                }
                return true
            }
        }

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
            <html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f1f5f9;color:#64748b;font-family:sans-serif;text-align:center;padding:20px;">
                <div style="font-size:64px;margin-bottom:16px;">&#128546;</div>
                <h2 style="color:#0f172a;margin-bottom:8px;">加载失败</h2>
                <p style="margin-bottom:20px;">请检查网络连接后重试</p>
                <button onclick="window.location.reload()" style="padding:12px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">重新加载</button>
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

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
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

        // JS：App 端布局重构——隐藏不需要的元素，重写导航和底部
        private val APP_INJECT_JS = """
(function(){
  document.documentElement.setAttribute('data-app','android');

  // 1. 隐藏所有下载相关入口
  document.querySelectorAll('a[href*="downloads"],a[href*="download"]').forEach(function(el){
    el.style.display='none';
  });
  document.querySelectorAll('.nav-buttons .btn-outline').forEach(function(btn){
    if(btn.textContent.includes('下载')||(btn.getAttribute('onclick')||'').includes('downloads')) btn.style.display='none';
  });
  document.querySelectorAll('.hero-cta a[href*="downloads"]').forEach(function(el){el.style.display='none';});
  document.querySelectorAll('.footer-col a[href*="downloads"]').forEach(function(el){el.style.display='none';});

  // 2. 下载页重定向到首页
  if(location.pathname.includes('downloads')){location.href='/';return;}

  // 3. 移除导航栏中"客户端下载"链接
  document.querySelectorAll('.nav-links a').forEach(function(a){
    if(a.textContent.includes('下载')||a.getAttribute('href').includes('downloads')){
      a.style.display='none';
    }
  });

  // 4. App端注入CSS——适配移动端布局
  var style=document.createElement('style');
  style.textContent=[
    'html{scroll-behavior:smooth;-webkit-tap-highlight-color:transparent;}',
    'body{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;}',
    // 导航栏适配
    '@media(max-width:768px){',
    '.navbar{position:sticky;top:0;z-index:1000;padding:8px 12px;}',
    '.nav-links{display:none;}',
    '.logo img{width:32px!important;height:32px!important;}',
    '.logo-text{font-size:16px!important;}',
    '.nav-buttons .btn-primary{padding:6px 14px;font-size:13px;}',
    '}',
    // Hero 区域适配
    '@media(max-width:768px){',
    '.hero{padding:40px 16px 30px;}',
    '.hero h1{font-size:24px!important;line-height:1.3!important;}',
    '.hero p{font-size:14px!important;}',
    '.hero-badges{gap:6px!important;flex-wrap:wrap!important;}',
    '.hero-badges span{padding:4px 10px!important;font-size:11px!important;}',
    '}',
    // 卡片网格适配
    '@media(max-width:768px){',
    '.features-grid,.roles-grid{grid-template-columns:1fr!important;gap:12px!important;padding:0 12px!important;}',
    '.feature-card,.role-card{padding:16px!important;}',
    '.feature-card .icon,.role-card .icon{width:40px!important;height:40px!important;font-size:20px!important;}',
    '}',
    // 数据洞察适配
    '@media(max-width:768px){',
    '.charts-section{padding:30px 12px!important;}',
    '.charts-grid{grid-template-columns:1fr!important;gap:12px!important;}',
    '.chart-card{padding:12px!important;}',
    '}',
    // 工作原理适配
    '@media(max-width:768px){',
    '.how-it-works{padding:30px 12px!important;}',
    '.steps{flex-direction:column!important;gap:16px!important;}',
    '.step{flex:1 1 100%!important;}',
    '}',
    // Footer 适配
    '@media(max-width:768px){',
    '.footer-content{grid-template-columns:1fr!important;gap:16px!important;padding:0 12px!important;}',
    '.footer-brand{flex-direction:column!important;align-items:flex-start!important;gap:8px!important;}',
    '.footer-bottom{flex-direction:column!important;gap:8px!important;text-align:center!important;}',
    '}',
    // 内容区域适配
    '@media(max-width:768px){',
    '.content-section,.container{padding:16px 12px!important;}',
    '.modal-content{width:92%!important;padding:20px 16px!important;margin:10px!important;}',
    '.form-group{margin-bottom:12px!important;}',
    '.form-control{padding:8px 12px!important;font-size:15px!important;}',
    '.btn{min-height:44px;font-size:14px;padding:8px 16px;}',
    '}',
    // 触摸优化
    '@media(max-width:768px){',
    'a,button,.btn,.card{touch-action:manipulation;}',
    'input,select,textarea{font-size:15px!important;}',
    '}'
  ].join('\\n');
  document.head.appendChild(style);
})();
        """.trimIndent()
    }
}
