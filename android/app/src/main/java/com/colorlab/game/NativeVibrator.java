package com.colorlab.game;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 原生震动插件：让 APK 的震动不依赖浏览器 API */
@CapacitorPlugin(name = "NativeVibrator")
public class NativeVibrator extends Plugin {

    private Vibrator getVibrator() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        String pattern = call.getString("pattern", "tap");
        long[] timing = parsePattern(pattern);
        Vibrator v = getVibrator();
        if (v == null || !v.hasVibrator()) {
            call.resolve();
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(timing, -1));
            } else {
                v.vibrate(timing, -1);
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    private long[] parsePattern(String p) {
        switch (p) {
            case "step":   return new long[]{12};
            case "success":return new long[]{40, 35, 70};
            case "fail":   return new long[]{110, 60, 110, 60, 180};
            case "penalty":return new long[]{140, 55, 140, 55, 260};
            case "star":   return new long[]{28};
            case "level":  return new long[]{45, 45, 45, 45, 180};
            case "tap":
            default:       return new long[]{18};
        }
    }
}
