package com.wxh.vocabulary;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 通知提醒：设置与「任务/复习状态快照」的持久化。
 *
 * 存储两份数据（均为 SharedPreferences，进程无关，App 关闭/重启后仍然有效）：
 *   ① 用户设置：是否开启、提醒时间的时/分
 *   ② 状态快照：前端每次任务或复习数据变化后经 AndroidBridge.updateReminderState(json) 推来的
 *      压缩快照（见 {@link ReminderState}）
 *
 * 到点判断完全由 {@link ReminderReceiver} 依据此处的数据完成，不依赖 WebView 存活。
 */
public final class ReminderPrefs {

    private static final String PREF = "vh_reminder";
    private static final String KEY_ON = "on";
    private static final String KEY_HOUR = "hour";
    private static final String KEY_MINUTE = "minute";
    private static final String KEY_SNAPSHOT = "snapshot";

    /** 默认提醒时间（首次使用）：21:00 —— 晚间自检当日学习情况 */
    public static final int DEFAULT_HOUR = 21;
    public static final int DEFAULT_MINUTE = 0;

    private ReminderPrefs() { }

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    public static boolean isEnabled(Context c) {
        return sp(c).getBoolean(KEY_ON, false);
    }

    public static int getHour(Context c) {
        int h = sp(c).getInt(KEY_HOUR, DEFAULT_HOUR);
        return Math.min(23, Math.max(0, h));
    }

    public static int getMinute(Context c) {
        int m = sp(c).getInt(KEY_MINUTE, DEFAULT_MINUTE);
        return Math.min(59, Math.max(0, m));
    }

    /** 保存用户设置（不负责排程，排程统一走 {@link ReminderScheduler#apply}） */
    public static void save(Context c, boolean on, int hour, int minute) {
        sp(c).edit()
                .putBoolean(KEY_ON, on)
                .putInt(KEY_HOUR, Math.min(23, Math.max(0, hour)))
                .putInt(KEY_MINUTE, Math.min(59, Math.max(0, minute)))
                .apply();
    }

    /** 保存前端推来的任务/复习状态快照（覆盖式，只保留最新一份） */
    public static void saveSnapshot(Context c, String json) {
        if (json == null || json.isEmpty()) return;
        try {
            sp(c).edit().putString(KEY_SNAPSHOT, json).apply();
        } catch (Throwable ignored) { /* 存储异常不影响主流程 */ }
    }

    public static String getSnapshot(Context c) {
        try {
            return sp(c).getString(KEY_SNAPSHOT, null);
        } catch (Throwable e) {
            return null;
        }
    }
}
