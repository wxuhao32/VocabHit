package com.wxh.vocabulary;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

/**
 * 通知提醒的排程中心（AlarmManager）。
 *
 * 设计要点：
 *   - 用系统 AlarmManager 精确闹钟，App 进程被杀、WebView 未打开均不影响触发
 *     （不依赖任何前台页面 / Service 常驻）
 *   - apply() 统一入口：开 = 先取消旧计划再按新时间排；关 = 取消计划
 *     用户改时间 → 走同一入口，旧闹钟被同一个 PendingIntent 覆盖替换，不会重复提醒
 *   - syncFromPrefs() 用于「无用户操作」的恢复场景：App 启动、系统重启、
 *     应用更新、系统时间/时区变更（见 {@link ReminderReceiver}）
 *   - 到点触发后由 ReminderReceiver 再次调用 syncFromPrefs() 排下一天，形成每日循环
 */
public final class ReminderScheduler {

    static final String ACTION_CHECK = "com.wxh.vocabulary.action.REMINDER_CHECK";

    /** 通知点击后的落地页（MainActivity 读取） */
    public static final String EXTRA_GO = "vh_go";
    public static final String GO_REVIEW = "review";
    public static final String GO_TASKS = "tasks";

    private static final int REQ_CHECK = 7301;
    /** 无法使用精确闹钟时的容错窗口 */
    private static final long WINDOW_MS = 15 * 60 * 1000L;

    private ReminderScheduler() { }

    private static PendingIntent pending(Context c) {
        Intent it = new Intent(c, ReminderReceiver.class).setAction(ACTION_CHECK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, REQ_CHECK, it, flags);
    }

    /** 下一次触发时刻：当天该时刻已过则顺延到明天同一时刻 */
    public static long nextTrigger(int hour, int minute, long now) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        cal.set(Calendar.HOUR_OF_DAY, Math.min(23, Math.max(0, hour)));
        cal.set(Calendar.MINUTE, Math.min(59, Math.max(0, minute)));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= now) cal.add(Calendar.DAY_OF_YEAR, 1);
        return cal.getTimeInMillis();
    }

    /** 用户设置变更的唯一入口：保存设置 → 排程或取消 */
    public static void apply(Context c, boolean on, int hour, int minute) {
        ReminderPrefs.save(c, on, hour, minute);
        if (!on) {
            cancel(c);
            return;
        }
        schedule(c, hour, minute);
    }

    /** 按已保存设置恢复/校正排程（不修改设置） */
    public static void syncFromPrefs(Context c) {
        if (!ReminderPrefs.isEnabled(c)) {
            cancel(c);
            return;
        }
        schedule(c, ReminderPrefs.getHour(c), ReminderPrefs.getMinute(c));
    }

    private static void schedule(Context c, int hour, int minute) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long trigger = nextTrigger(hour, minute, System.currentTimeMillis());
        PendingIntent pi = pending(c);
        try {
            boolean exactAllowed = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exactAllowed) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
            } else {
                // 用户/系统关闭了精确闹钟权限：退化为时间窗，仍然会到点（最多延迟一个窗口）
                am.setWindow(AlarmManager.RTC_WAKEUP, trigger, WINDOW_MS, pi);
            }
        } catch (SecurityException e) {
            try {
                am.setWindow(AlarmManager.RTC_WAKEUP, trigger, WINDOW_MS, pi);
            } catch (Throwable ignored) { }
        } catch (Throwable ignored) { }
    }

    /** 取消已设定的提醒 */
    public static void cancel(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            am.cancel(pending(c));
        } catch (Throwable ignored) { }
    }
}
