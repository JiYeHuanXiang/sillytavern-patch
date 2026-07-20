package com.logs404.walrus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.logs404.walrus.common.ExtractAssets
import com.logs404.walrus.common.FileWrite
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * 前台 Service：管理 Node.js 进程的生命周期。
 * - 首次启动时解压 assets 到 filesDir
 * - 启动 node server.js
 * - HTTP 轮询等待服务器就绪后通知 WebViewActivity
 * - 前台通知保活，防止系统杀后台进程
 */
class NodeService : Service() {

    companion object {
        private const val TAG = "NodeService"
        private const val CHANNEL_ID = "sillytavern_node_channel"
        private const val NOTIFICATION_ID = 1001
        private const val SERVER_URL = "http://127.0.0.1:8000"
        private const val POLL_INTERVAL_MS = 1000L
        private const val POLL_MAX_ATTEMPTS = 60 // 最多等 60 秒

        const val ACTION_START = "com.logs404.walrus.ACTION_START"
        const val ACTION_STOP = "com.logs404.walrus.ACTION_STOP"
        const val BROADCAST_SERVER_READY = "com.logs404.walrus.SERVER_READY"
        const val BROADCAST_SERVER_FAILED = "com.logs404.walrus.SERVER_FAILED"
        const val EXTRA_VERSION = "app_version"

        var isRunning = false
            private set
    }

    private var nodeProcess: Process? = null
    private var appVersion: String = "1.0"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopNode()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                appVersion = intent.getStringExtra(EXTRA_VERSION) ?: "1.0"
                startForeground(NOTIFICATION_ID, buildNotification("正在启动 SillyTavern..."))
                isRunning = true
                startNodeAsync()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopNode()
        super.onDestroy()
    }

    // ========== Node 进程管理 ==========

    private fun startNodeAsync() {
        thread(name = "node-starter") {
            try {
                // 1. 解压 assets（仅首次或版本变更时）
                val filesDir = filesDir.absolutePath
                val versionFile = File(filesDir, "sillytavern/.extracted_version")

                if (!versionFile.exists() || versionFile.readText() != appVersion) {
                    updateNotification("正在解压资源文件...")
                    Log.i(TAG, "Extracting assets to $filesDir")
                    val extractAssets = ExtractAssets(this)
                    extractAssets.extractResources("sillytavern")

                    // 设置 node 可执行权限
                    val nodeBin = File(filesDir, "sillytavern/node-bin/node")
                    if (nodeBin.exists()) {
                        nodeBin.setExecutable(true, false)
                        nodeBin.setReadable(true, false)
                        Log.i(TAG, "Node binary set executable: ${nodeBin.absolutePath}")
                    } else {
                        Log.e(TAG, "Node binary not found at: ${nodeBin.absolutePath}")
                    }

                    // 记录已解压版本
                    versionFile.parentFile?.mkdirs()
                    versionFile.writeText(appVersion)
                } else {
                    Log.i(TAG, "Assets already extracted (version $appVersion), skipping")
                }

                // 2. 启动 Node 进程
                updateNotification("正在启动服务器...")
                val nodePath = File(filesDir, "sillytavern/node-bin/node").absolutePath
                val serverPath = File(filesDir, "sillytavern/app/server.js").absolutePath
                val dataRoot = File(filesDir, "sillytavern/data").absolutePath

                // 确保数据目录存在
                File(dataRoot).mkdirs()

                Log.i(TAG, "Starting node: $nodePath $serverPath --dataRoot $dataRoot")

                val processBuilder = ProcessBuilder(nodePath, serverPath, "--dataRoot", dataRoot)
                processBuilder.directory(File(filesDir, "sillytavern/app"))
                processBuilder.environment()["HOME"] = filesDir
                processBuilder.environment()["NODE_ENV"] = "production"
                // 禁用浏览器自动打开（Android 上由 WebView 处理）
                processBuilder.environment()["BROWSER"] = "none"

                nodeProcess = processBuilder.start()

                // 读取 Node 进程输出（日志）
                readProcessOutput(nodeProcess!!)

                // 3. HTTP 轮询等待服务器就绪
                updateNotification("等待服务器就绪...")
                val ready = pollServerReady()

                if (ready) {
                    Log.i(TAG, "Server is ready at $SERVER_URL")
                    updateNotification("SillyTavern 正在运行")
                    // 广播通知 WebViewActivity
                    val readyIntent = Intent(BROADCAST_SERVER_READY)
                    sendBroadcast(readyIntent)
                } else {
                    Log.e(TAG, "Server failed to start within timeout")
                    updateNotification("服务器启动失败")
                    val failIntent = Intent(BROADCAST_SERVER_FAILED)
                    sendBroadcast(failIntent)
                }

            } catch (e: Exception) {
                Log.e(TAG, "Failed to start node", e)
                updateNotification("启动失败: ${e.message}")
                val failIntent = Intent(BROADCAST_SERVER_FAILED)
                sendBroadcast(failIntent)
            }
        }
    }

    private fun readProcessOutput(process: Process) {
        // stdout
        thread(name = "node-stdout", isDaemon = true) {
            try {
                val reader = BufferedReader(InputStreamReader(process.inputStream))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    Log.i(TAG, "[node] $line")
                }
            } catch (e: Exception) {
                Log.d(TAG, "stdout reader exited", e)
            }
        }
        // stderr
        thread(name = "node-stderr", isDaemon = true) {
            try {
                val reader = BufferedReader(InputStreamReader(process.errorStream))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    Log.w(TAG, "[node:err] $line")
                }
            } catch (e: Exception) {
                Log.d(TAG, "stderr reader exited", e)
            }
        }
    }

    /**
     * HTTP 轮询等待服务器就绪，替代固定 sleep 盲等
     */
    private fun pollServerReady(): Boolean {
        for (attempt in 1..POLL_MAX_ATTEMPTS) {
            try {
                val url = URL(SERVER_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 2000
                conn.readTimeout = 2000
                conn.instanceFollowRedirects = false

                val responseCode = conn.responseCode
                conn.disconnect()

                if (responseCode in 200..399) {
                    return true
                }
            } catch (e: Exception) {
                // 服务器还没启动，继续轮询
            }

            try {
                Thread.sleep(POLL_INTERVAL_MS)
            } catch (e: InterruptedException) {
                return false
            }

            if (attempt % 5 == 0) {
                Log.d(TAG, "Polling server... attempt $attempt/$POLL_MAX_ATTEMPTS")
            }
        }
        return false
    }

    private fun stopNode() {
        isRunning = false
        try {
            nodeProcess?.destroy()
            nodeProcess = null
            Log.i(TAG, "Node process destroyed")
        } catch (e: Exception) {
            Log.e(TAG, "Error destroying node process", e)
        }
    }

    // ========== 通知 ==========

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SillyTavern 服务器",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "SillyTavern Node.js 服务器运行状态"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        // 点击通知 → 打开 WebViewActivity
        val contentIntent = Intent(this, WebViewActivity::class.java).apply {
            putExtra(WebViewActivity.EXTRA_URL, SERVER_URL)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this, 0, contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // "停止服务器" 按钮
        val stopIntent = Intent(this, NodeService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("SillyTavern Patch")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(contentPendingIntent)
            .setOngoing(true)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "停止服务器",
                stopPendingIntent
            )
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }
}
