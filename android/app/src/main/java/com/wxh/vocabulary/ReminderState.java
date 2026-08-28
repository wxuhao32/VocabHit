package com.wxh.vocabulary;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 通知提醒用的「任务 / 复习状态快照」。
 *
 * 由前端 {@code js/app.js} 的 reminderSnapshot() 生成并推给原生保存；到点时
 * {@link ReminderReceiver} 用本类按与前端完全一致的口径判断两个独立状态：
 *
 *   状态一 今日单词未复习  ←→ 前端 reviewQueue()
 *        生词本内（已收藏）且 nextAt > 0 且 nextAt <= now 的词条数量 > 0
 *        这里保存全部 nextAt 时间戳，到点现算，快照多旧都不会失真
 *
 *   状态二 今日学习任务未完成 ←→ 前端 todayAllDone()
 *        该业务日存在任务，且未全部打卡（total > 0 && done < total）
 *        这里保存任务定义（生效区间/软删除/单日日期）+ 当日打卡 id，
 *        可对任意业务日重新投影，App 几天没打开也能算出当天该不该提醒
 *
 * 业务日边界为本地时间 04:00，与前端 vocabDay() 一致。
 */
public final class ReminderState {

    /** 业务日起点偏移：04:00 前算前一天 */
    private static final long DAY_SHIFT = 4L * 3600L * 1000L;

    public boolean valid;      // 快照解析成功（无快照时为 false → 不发任何通知）
    public String day;         // 快照生成时的业务日（YYYY-MM-DD）
    public long updatedAt;     // 快照生成时间戳
    public long[] reviewAt = new long[0]; // 生词本内全部词条的 nextAt（升序）

    private final List<Item> tasks = new ArrayList<>();
    private final Set<String> done = new HashSet<>();

    static final class Item {
        String id;        // 任务 id
        boolean daily;    // true = 每日任务，false = 单日任务
        String start;     // 每日任务生效开始日（YYYY-MM-DD，可空）
        String end;       // 每日任务生效结束日（可空 = 不限）
        String delDay;    // 每日任务软删除所在业务日（可空 = 未删除）
        boolean keep;     // 软删除当天是否保留（keepDeletedDay）
        String date;      // 单日任务日期
    }

    static ReminderState empty() { return new ReminderState(); }

    /** 解析前端快照；任何异常都返回无效快照（宁可不提醒，也不误提醒） */
    public static ReminderState parse(String json) {
        if (json == null || json.isEmpty()) return empty();
        try {
            ReminderState s = new ReminderState();
            JSONObject o = new JSONObject(json);
            s.day = o.optString("day", null);
            s.updatedAt = o.optLong("ts", 0L);

            JSONArray ra = o.optJSONArray("review");
            if (ra != null) {
                long[] arr = new long[ra.length()];
                int n = 0;
                for (int i = 0; i < ra.length(); i++) {
                    long v = ra.optLong(i, 0L);
                    if (v > 0) arr[n++] = v;
                }
                s.reviewAt = Arrays.copyOf(arr, n);
                Arrays.sort(s.reviewAt);
            }

            JSONArray ta = o.optJSONArray("tasks");
            if (ta != null) {
                for (int i = 0; i < ta.length(); i++) {
                    JSONObject j = ta.optJSONObject(i);
                    if (j == null) continue;
                    Item it = new Item();
                    it.id = j.optString("id", null);
                    it.daily = !"o".equals(j.optString("k", "d"));
                    it.start = j.optString("s", null);
                    it.end = j.optString("e", null);
                    it.delDay = j.optString("x", null);
                    it.keep = j.optInt("xk", 0) == 1;
                    it.date = j.optString("d", null);
                    if (it.id != null) s.tasks.add(it);
                }
            }

            JSONArray da = o.optJSONArray("done");
            if (da != null) {
                for (int i = 0; i < da.length(); i++) {
                    String v = da.optString(i, null);
                    if (v != null) s.done.add(v);
                }
            }

            s.valid = true;
            return s;
        } catch (Throwable e) {
            return empty();
        }
    }

    /** 到期待复习词条数：nextAt <= now（与前端 reviewQueue() 同口径） */
    public int dueCount(long now) {
        int n = 0;
        for (long t : reviewAt) {
            if (t > 0 && t <= now) n++;
        }
        return n;
    }

    /** 指定业务日的学习任务是否「存在但未全部完成」（与前端 todayAllDone() 取反同口径） */
    public boolean taskIncomplete(String dayStr) {
        if (dayStr == null) return false;
        int total = 0, doneCount = 0;
        for (Item it : tasks) {
            if (!visibleOn(it, dayStr)) continue;
            total++;
            if (done.contains(it.id)) doneCount++;
        }
        return total > 0 && doneCount < total;
    }

    /** 与前端 dailyVisibleOn() / tasksOfDay() 同口径 */
    private static boolean visibleOn(Item t, String dayStr) {
        if (t == null || t.id == null) return false;
        if (t.daily) {
            if (t.start != null && dayStr.compareTo(t.start) < 0) return false;
            if (t.end != null && dayStr.compareTo(t.end) > 0) return false;
            if (t.delDay != null) {
                if (dayStr.compareTo(t.delDay) > 0) return false;
                if (dayStr.equals(t.delDay) && !t.keep) return false;
            }
            return true;
        }
        return t.date != null && t.date.equals(dayStr);
    }

    /** 时间戳 → 业务日字符串（本地时区，04:00 为分界，与前端 vocabDay() 一致） */
    public static String bizDay(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis - DAY_SHIFT);
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }
}
