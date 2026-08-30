package com.wxh.vocabulary;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 通知提醒接收器。
 *
 * 两类职责：
 *   ① 计划恢复：系统重启 / 应用更新 / 时间与时区变更 → 按已保存设置重新排程
 *   ② 到点检查：读取 {@link ReminderState} 快照，判断两个独立状态并发系统通知
 *
 *      状态一（今日单词未复习）→ 「今日单词还未复习，快去复习单词吧！」→ 点击进 Review 页
 *      状态二（今日学习任务未完成）→ 「今日学习任务还未完成，快去完成学习任务吧！」→ 点击进任务页
 *
 *      两者互不干扰：分别判断、分别发通知，可以同时出现，完成其中一个不影响另一个。
 *
 * 全部逻辑在 BroadcastReceiver 内同步完成（仅读 SharedPreferences），
 * 无需 WebView、无需常驻 Service，App 未打开也能正常提醒。
 */
public class ReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "study_reminder";
    private static final int ID_REVIEW = 9101;
    private static final int ID_TASK = 9102;

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context == null ? null : context.getApplicationContext();
        if (c == null) return;
        android.util.Log.d("VHReminder", "onReceive action="
                + (intent == null ? "null" : intent.getAction()));

        // 用户已关闭提醒：取消计划后直接返回（兜底，正常情况下设置变更时已取消）
        if (!ReminderPrefs.isEnabled(c)) {
            ReminderScheduler.cancel(c);
            return;
        }

        String action = intent == null ? null : intent.getAction();
        if (isRescheduleAction(action)) {
            ReminderScheduler.syncFromPrefs(c);
            return;
        }

        // 到点：先排下一天（无论本次是否发通知，循环不中断），再做状态检查
        ReminderScheduler.syncFromPrefs(c);
        checkAndNotify(c);
    }

    private static boolean isRescheduleAction(String action) {
        return Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)
                || (Build.VERSION.SDK_INT >= 24 && Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action));
    }

    private static void checkAndNotify(Context c) {
        // 系统通知被用户关闭：不打扰（计划仍在，用户重新授权后自动恢复）
        if (!androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()) {
            android.util.Log.d("VHReminder", "check skipped: notifications disabled in system");
            return;
        }

        ReminderState st = ReminderState.parse(ReminderPrefs.getSnapshot(c));
        if (!st.valid) { // 从未同步过状态（例如刚装 App）→ 不发没有依据的提醒
            android.util.Log.d("VHReminder", "check skipped: no valid snapshot");
            return;
        }

        long now = System.currentTimeMillis();

        // 状态一：今日单词未复习（与前端 reviewQueue() 同口径）
        int due = st.dueCount(now);
        android.util.Log.d("VHReminder", "check: dueWords=" + due
                + " taskIncomplete=" + st.taskIncomplete(ReminderState.bizDay(now)));
        if (due > 0) {
            post(c, ID_REVIEW, "今日单词还未复习，快去复习单词吧！", ReminderScheduler.GO_REVIEW);
        }

        // 状态二：今日学习任务未完成（与前端 todayAllDone() 同口径，独立判断）
        if (st.taskIncomplete(ReminderState.bizDay(now))) {
            post(c, ID_TASK, "今日学习任务还未完成，快去完成学习任务吧！", ReminderScheduler.GO_TASKS);
        }
    }

    private static void post(Context c, int id, String text, String go) {
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        android.util.Log.d("VHReminder", "post id=" + id + " text=" + text);

        Intent it = new Intent(c, MainActivity.class);
        it.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        it.putExtra(ReminderScheduler.EXTRA_GO, go);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(c, id, it, flags);

        Notification.Builder b = (Build.VERSION.SDK_INT >= 26)
                ? new Notification.Builder(c, CHANNEL_ID)
                : new Notification.Builder(c);
        b.setContentTitle("VocabHit")
                .setContentText(text)
                .setTicker(text)
                .setSmallIcon(R.drawable.ic_stat_reminder)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setDefaults(Notification.DEFAULT_LIGHTS)
                .setPriority(Notification.PRIORITY_DEFAULT);
        if (Build.VERSION.SDK_INT >= 21) {
            b.setCategory(Notification.CATEGORY_REMINDER)
                    .setVisibility(Notification.VISIBILITY_PUBLIC);
        }

        try {
            nm.notify(id, b.build());
        } catch (Throwable ignored) { }
    }

    /** 渠道创建（package 级可调）：MainActivity 启动时预创建，发通知前兜底再查一次 */
    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "学习提醒",
                NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("每日单词复习与学习任务提醒");
        ch.enableVibration(true);
        try {
            nm.createNotificationChannel(ch);
        } catch (Throwable ignored) { }
    }
}
