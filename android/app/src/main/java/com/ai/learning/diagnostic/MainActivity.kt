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

        // 自定义 User-Agent，让服务端识别 App 环境
        settings.userAgentString = settings.userAgentString + " AILearningApp/1.0.2 Android"

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
                view?.evaluateJavascript(PULL_TO_REFRESH_JS + APP_LAYOUT_JS, null)
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

        // JS：纯前端下拉刷新——仅在 window.scrollY===0 时生效，不影响正常滚动
        private val PULL_TO_REFRESH_JS = """
(function(){
  if(window.__ptrInstalled) return;
  window.__ptrInstalled = true;
  var pulling=false, startY=0, currentY=0;
  var indicator=document.createElement('div');
  indicator.id='__ptr_indicator';
  indicator.style.cssText='position:fixed;top:0;left:0;right:0;height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#64748b;font-size:13px;font-weight:600;z-index:99999;transition:height 0.25s ease;pointer-events:none;';
  var spinner=document.createElement('div');
  spinner.style.cssText='width:22px;height:22px;border:2.5px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:__ptrSpin 0.7s linear infinite;margin-right:8px;';
  var style=document.createElement('style');
  style.textContent='@keyframes __ptrSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
  var text=document.createElement('span');
  text.textContent='下拉刷新';
  indicator.appendChild(spinner);
  indicator.appendChild(text);
  function showIndicator(h){indicator.style.height=h+'px';}
  document.addEventListener('touchstart',function(e){
    if(window.scrollY<=0&&e.touches.length===1){
      pulling=true;
      startY=e.touches[0].clientY;
      currentY=startY;
      if(!indicator.parentElement) document.body.appendChild(indicator);
      spinner.style.animation='none';
    }
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!pulling) return;
    currentY=e.touches[0].clientY;
    var diff=currentY-startY;
    if(diff>0){
      var h=Math.min(diff*0.5,80);
      showIndicator(h);
      if(h>60){text.textContent='松开刷新';}
      else{text.textContent='下拉刷新';}
    }
  },{passive:true});
  document.addEventListener('touchend',function(){
    if(!pulling) return;
    pulling=false;
    var diff=currentY-startY;
    if(diff>60){
      showIndicator(50);
      spinner.style.animation='__ptrSpin 0.7s linear infinite';
      text.textContent='刷新中…';
      setTimeout(function(){
        indicator.style.height='0';
        setTimeout(function(){ if(indicator.parentElement) indicator.parentElement.removeChild(indicator); },300);
        location.reload();
      },400);
    } else {
      indicator.style.height='0';
      setTimeout(function(){ if(indicator.parentElement) indicator.parentElement.removeChild(indicator); },300);
    }
  },{passive:true});
})();
        """.trimIndent()

        // JS：隐藏下载相关元素，适配 App 端布局
        private val APP_LAYOUT_JS = """
(function(){
  document.documentElement.setAttribute('data-app','android');
  document.querySelectorAll('a[href*="downloads"],a[href*="download"]').forEach(function(el){
    var p=el.parentElement;
    if(p&&p.classList.contains('nav-links')) el.style.display='none';
  });
  document.querySelectorAll('.nav-buttons .btn-outline').forEach(function(btn){
    if(btn.textContent.includes('下载')||(btn.getAttribute('onclick')||'').includes('downloads')) btn.style.display='none';
  });
  document.querySelectorAll('.hero-cta a[href*="downloads"]').forEach(function(el){el.style.display='none';});
  document.querySelectorAll('.footer-col a[href*="downloads"]').forEach(function(el){el.style.display='none';});
  if(location.pathname.includes('downloads')){location.href='/';}
})();
        """.trimIndent()
    }
}
