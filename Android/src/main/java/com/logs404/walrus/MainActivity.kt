package com.logs404.walrus

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * 保留的原始 Activity，当前未作为入口使用。
 * 启动入口已改为 SplashActivity → WebViewActivity。
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 当前无独立 UI，启动后直接跳转 SplashActivity
        val intent = Intent(this, SplashActivity::class.java)
        startActivity(intent)
        finish()
    }
}
