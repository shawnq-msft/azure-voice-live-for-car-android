package com.azurevoicelivecar

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MicServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var previousMode: Int = AudioManager.MODE_NORMAL

    override fun getName(): String = "MicService"

    @ReactMethod
    fun start() {
        val intent = Intent(reactContext, MicForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
        val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousMode = am.mode
        am.mode = AudioManager.MODE_IN_COMMUNICATION
    }

    @ReactMethod
    fun stop() {
        reactContext.stopService(Intent(reactContext, MicForegroundService::class.java))
        val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.mode = previousMode
    }
}
