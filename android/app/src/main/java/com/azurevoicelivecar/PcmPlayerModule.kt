package com.azurevoicelivecar

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Base64
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PcmPlayerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var track: AudioTrack? = null
    private val sampleRate = 24000
    private val lock = Object()

    override fun getName(): String = "PcmPlayer"

    private fun ensureTrack(): AudioTrack {
        var t = track
        if (t != null && t.playState != AudioTrack.PLAYSTATE_STOPPED) return t

        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val bufSize = maxOf(minBuf, sampleRate * 2)

        t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(bufSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        t.play()
        track = t
        return t
    }

    @ReactMethod
    fun write(base64Pcm: String) {
        synchronized(lock) {
            val bytes = Base64.decode(base64Pcm, Base64.DEFAULT)
            val t = ensureTrack()
            var offset = 0
            while (offset < bytes.size) {
                val written = t.write(bytes, offset, bytes.size - offset)
                if (written <= 0) break
                offset += written
            }
        }
    }

    @ReactMethod
    fun stop() {
        synchronized(lock) {
            track?.let {
                try { it.pause() } catch (_: Throwable) {}
                try { it.flush() } catch (_: Throwable) {}
                try { it.stop() } catch (_: Throwable) {}
                try { it.release() } catch (_: Throwable) {}
            }
            track = null
        }
    }
}
