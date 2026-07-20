package com.logs404.walrus

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.ProgressBar
import android.widget.TextView
import java.io.File

/**
 * 全屏 WebView Activity，加载本地 SillyTavern 服务器页面。
 * 替代外部浏览器，统一渲染引擎，消除浏览器兼容性差异。
 */
class WebViewActivity : Activity() {

    companion object {
        const val EXTRA_URL = "target_url"
        const val DEFAULT_URL = "http://127.0.0.1:8000"
    }

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var loadingText: TextView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST_CODE = 10001

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 全屏沉浸式
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )

        setContentView(R.layout.activity_webview)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        loadingText = findViewById(R.id.loadingText)

        val targetUrl = intent.getStringExtra(EXTRA_URL) ?: DEFAULT_URL

        configureWebView()
        configureWebViewClient()
        configureWebChromeClient()
        configureDownloadListener()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(targetUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings

        // 核心：启用 JavaScript
        settings.javaScriptEnabled = true

        // DOM Storage（localStorage + sessionStorage）
        settings.domStorageEnabled = true

        // 数据库
        settings.databaseEnabled = true

        // 文件访问
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        // 视口适配
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        // 缓存优先（离线场景）
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // 编码
        settings.defaultTextEncodingName = "UTF-8"

        // 自适应屏幕
        settings.layoutAlgorithm = WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING

        // User-Agent 附加标识，便于前端/服务端识别 Android 环境
        settings.userAgentString = settings.userAgentString + " SillyTavernPatch/Android"

        // 允许混合内容（localhost http 场景）
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    }

    private fun configureWebViewClient() {
        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val host = request.url.host
                // 只允许 localhost / 127.0.0.1 在 WebView 内加载
                // 其他外部链接用系统浏览器打开
                if (host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0") {
                    return false // 在 WebView 内继续加载
                }
                // 外部链接跳系统浏览器
                try {
                    val intent = Intent(Intent.ACTION_VIEW, request.url)
                    startActivity(intent)
                } catch (e: Exception) {
                    // 没有浏览器可用时忽略
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // 页面加载完成后隐藏加载指示器
                progressBar.visibility = View.GONE
                loadingText.visibility = View.GONE
            }

            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                // 本地 localhost 连接，信任自签名证书
                if (error?.url?.contains("127.0.0.1") == true || error?.url?.contains("localhost") == true) {
                    handler?.proceed()
                } else {
                    handler?.cancel()
                }
            }
        }
    }

    private fun configureWebChromeClient() {
        webView.webChromeClient = object : WebChromeClient() {

            /**
             * 处理 <input type="file"> 文件选择器
             * SillyTavern 大量使用：角色卡导入、背景上传、预设导入等
             */
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                // 取消上一次未完成的选择
                this@WebViewActivity.filePathCallback?.onReceiveValue(null)
                this@WebViewActivity.filePathCallback = filePathCallback

                try {
                    val intent = fileChooserParams?.createIntent()
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                } catch (e: Exception) {
                    this@WebViewActivity.filePathCallback = null
                    return false
                }
                return true
            }

            /** 进度条更新 */
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                }
            }

            /** JS alert → 原生对话框 */
            override fun onJsAlert(
                view: WebView?, url: String?, message: String?, result: JsResult?
            ): Boolean {
                // 简单实现：使用系统 AlertDialog
                android.app.AlertDialog.Builder(this@WebViewActivity)
                    .setMessage(message)
                    .setPositiveButton("确定") { _, _ -> result?.confirm() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            /** JS confirm → 原生确认框 */
            override fun onJsConfirm(
                view: WebView?, url: String?, message: String?, result: JsResult?
            ): Boolean {
                android.app.AlertDialog.Builder(this@WebViewActivity)
                    .setMessage(message)
                    .setPositiveButton("确定") { _, _ -> result?.confirm() }
                    .setNegativeButton("取消") { _, _ -> result?.cancel() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            /** JS prompt → 原生输入框 */
            override fun onJsPrompt(
                view: WebView?, url: String?, message: String?, defaultValue: String?, result: JsPromptResult?
            ): Boolean {
                val input = android.widget.EditText(this@WebViewActivity)
                input.setText(defaultValue)
                android.app.AlertDialog.Builder(this@WebViewActivity)
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton("确定") { _, _ -> result?.confirm(input.text.toString()) }
                    .setNegativeButton("取消") { _, _ -> result?.cancel() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }
        }
    }

    private fun configureDownloadListener() {
        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            // 下载请求：聊天导出、备份下载等
            // 通过系统浏览器或下载管理器处理
            try {
                val uri = Uri.parse(url)
                if (uri.host == "127.0.0.1" || uri.host == "localhost") {
                    // 本地服务器下载：直接用浏览器 intent 打开
                    val intent = Intent(Intent.ACTION_VIEW, uri)
                    startActivity(intent)
                } else {
                    // 外部下载
                    val intent = Intent(Intent.ACTION_VIEW, uri)
                    startActivity(intent)
                }
            } catch (e: Exception) {
                // 无法处理下载
            }
        }
    }

    /**
     * 文件选择器回调
     */
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
        }
    }

    /**
     * 返回键：优先 WebView 历史后退，无历史时确认退出
     */
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
            // 确认退出
            android.app.AlertDialog.Builder(this)
                .setTitle("退出 SillyTavern")
                .setMessage("确定要停止服务器并退出吗？")
                .setPositiveButton("退出") { _, _ ->
                    // 停止 NodeService
                    val serviceIntent = Intent(this, NodeService::class.java)
                    stopService(serviceIntent)
                    finish()
                }
                .setNegativeButton("取消", null)
                .show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        // 重新应用沉浸式
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
