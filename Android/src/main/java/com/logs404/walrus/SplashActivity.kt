package com.logs404.walrus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.ProgressBar
import android.widget.TextView
import android.app.Activity

/**
 * 启动页：显示 Logo + 进度状态，自动编排 Node 启动 → WebView 加载流程。
 *
 * 流程：
 * 1. 显示 Logo
 * 2. 启动 NodeService（解压资源 + 启动 Node）
 * 3. 监听 SERVER_READY 广播
 * 4. 启动 WebViewActivity
 */
class SplashActivity : Activity() {

    private lateinit var statusText: TextView
    private lateinit var progressBar: ProgressBar

    private val serverReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                NodeService.BROADCAST_SERVER_READY -> {
                    runOnUiThread {
                        statusText.text = "服务器已就绪，正在打开..."
                    }
                    openWebView()
                }
                NodeService.BROADCAST_SERVER_FAILED -> {
                    runOnUiThread {
                        statusText.text = "服务器启动失败，请查看日志"
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 全屏
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        setContentView(R.layout.activity_splash)

        statusText = findViewById(R.id.statusText)
        progressBar = findViewById(R.id.splashProgressBar)

        // 注册广播接收器
        val filter = IntentFilter().apply {
            addAction(NodeService.BROADCAST_SERVER_READY)
            addAction(NodeService.BROADCAST_SERVER_FAILED)
        }
        registerReceiver(serverReceiver, filter)

        // 如果 NodeService 已在运行（Service 保活恢复场景），直接打开 WebView
        if (NodeService.isRunning) {
            openWebView()
            return
        }

        // 启动 NodeService
        statusText.text = "正在启动 SillyTavern..."
        val serviceIntent = Intent(this, NodeService::class.java).apply {
            action = NodeService.ACTION_START
            putExtra(NodeService.EXTRA_VERSION, packageManager
                .getPackageInfo(packageName, 0).versionName)
        }
        startService(serviceIntent)
    }

    private fun openWebView() {
        val intent = Intent(this, WebViewActivity::class.java).apply {
            putExtra(WebViewActivity.EXTRA_URL, "http://127.0.0.1:8000")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(serverReceiver)
        } catch (e: Exception) {
            // 未注册时忽略
        }
        super.onDestroy()
    }
}
