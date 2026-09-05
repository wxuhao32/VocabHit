/* ============================================================
   Stats · 学习统计（坚持看板底部统计区）
   ------------------------------------------------------------
   挂载到 window.VH_STATS。独立命名空间 vc-stats，最小化扩展：
     { v: 1, base: { vocab, entry }, days: { "YYYY-MM-DD": { v, e, sec } } }
   数据来源（全部真实本地数据，零模拟）：
     - 生词复习：今日/每日增量由 app.js 复习答题时上报；
       历史累计基线 = vc-review 中全部 words[].total 之和（首次初始化时冻结）
     - 知识条目复习：由 spaced-repetition 模块 answer() 上报（可选钩子，无钩子零副作用）；
       历史累计基线 = vc-spaced-repetition 中全部 states[].reviewCount 之和
     - 学习时长 = 复习有效时长（答题间隔，封顶 3 分钟/次）+ 专注番茄时长（vc-pomo-records 按天归档）
   业务日统一按 04:00 边界（与 vocabDay 一致）。
   「近 7 天」仅是图表滚动窗口；累计数据永久连续，不随窗口重置。
   ============================================================ */
(function () {
  "use strict";

  var KEY = "vc-stats";
  var POMO_KEY = "vc-pomo-records";
  var REVIEW_KEY = "vc-review";
  var SR_KEY = "vc-spaced-repetition";
  var MAX_GAP_MS = 180000; // 单次答题间隔封顶 3 分钟（防挂机虚增时长）

  var store = null;
  var storeVerified = false; // 数据安全加固：store 是否为「确认读取成功」或「确认首次初始化」的结果
  var lastTouch = 0; // 上次复习活动时间戳（会话开始时重置，答题时结算有效时长）

  function dayKey(ts) {
    var d = new Date((ts || Date.now()) - 4 * 3600 * 1000); // 04:00 业务日边界
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function save() {
    if (!store || !storeVerified) return; // 数据安全加固：未确认的数据不落盘（防空统计覆盖）
    if (window.VH_STG && window.VH_STG.writeBlocked && window.VH_STG.writeBlocked(KEY)) return; // 存储层故障/整库读空期间同样拦截，防空统计覆盖
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  function load() {
    if (store && storeVerified) return;
    /* 数据安全加固：读取未确认（unverified）时保持未初始化状态等待重试；
       「真·首次使用」的判定要求 absent 且无任何其他未确认键 —— 否则基线会按
       空数据冻结成 0，把用户真实累计统计永久清零。 */
    var r = window.VH_STG.safeRead(KEY, null);
    if (r.status === "unverified") { store = null; storeVerified = false; return; }
    if (r.status === "ok" && r.value && r.value.days) {
      store = r.value;
      if (!store.base) store.base = { vocab: 0, entry: 0 };
      storeVerified = true;
      return;
    }
    if (r.status !== "absent" || window.VH_STG.anyFailed()) { store = null; storeVerified = false; return; }
    /* 首次初始化：以既有真实数据冻结累计基线（历史无逐日明细，只能取总量） */
    var baseVocab = 0, baseEntry = 0;
    var rv = readJSON(REVIEW_KEY, null);
    if (rv && rv.words) {
      Object.keys(rv.words).forEach(function (w) { baseVocab += rv.words[w].total || 0; });
    }
    var sr = readJSON(SR_KEY, null);
    if (sr && sr.states) {
      Object.keys(sr.states).forEach(function (id) { baseEntry += sr.states[id].reviewCount || 0; });
    }
    store = { v: 1, base: { vocab: baseVocab, entry: baseEntry }, days: {} };
    storeVerified = true;
    save();
  }

  function dayBucket(day) {
    if (!store.days[day]) store.days[day] = { v: 0, e: 0, sec: 0 };
    return store.days[day];
  }

  /* ---------- 写入（由复习流程调用） ---------- */

  /** 会话开始：重置活动计时，避免跨会话的空档被计入时长 */
  function touch() { lastTouch = Date.now(); }

  /** 结算距上次活动的有效秒数（封顶 3 分钟）并重置计时 */
  function elapsed() {
    var now = Date.now();
    var ms = lastTouch ? Math.min(now - lastTouch, MAX_GAP_MS) : 0;
    lastTouch = now;
    return Math.max(0, Math.round(ms / 1000));
  }

  /** 记录一次复习活动：vocab=生词复习数 entry=知识条目复习数 sec=有效秒数 */
  function add(delta) {
    load();
    if (!store) return; // 数据安全加固：统计读取未确认时本次活动不计（宁缺勿错）
    var b = dayBucket(dayKey());
    if (delta) {
      if (delta.vocab) b.v += delta.vocab;
      if (delta.entry) b.e += delta.entry;
      if (delta.sec) b.sec += delta.sec;
    }
    save();
  }

  /* ---------- 读取（统计卡片 + 图表） ---------- */

  function pomoMinutes() { // [{ day, minutes }]
    var list = readJSON(POMO_KEY, []);
    var map = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      var d = dayKey(r.endedAt || 0);
      map[d] = (map[d] || 0) + (r.duration || 0);
    });
    return map;
  }

  function sumDays(fn) {
    var s = 0;
    Object.keys(store.days).forEach(function (d) { s += fn(store.days[d]); });
    return s;
  }

  /** 卡片数据：今日/累计（词、条、分钟） */
  function snapshot() {
    load();
    if (!store) return { today: { vocab: 0, entry: 0, min: 0 }, total: { vocab: 0, entry: 0, min: 0 } };
    var today = dayKey();
    var pm = pomoMinutes();
    var tb = store.days[today] || { v: 0, e: 0, sec: 0 };
    return {
      today: {
        vocab: tb.v,
        entry: tb.e,
        min: tb.sec / 60 + (pm[today] || 0)
      },
      total: {
        vocab: store.base.vocab + sumDays(function (d) { return d.v || 0; }),
        entry: store.base.entry + sumDays(function (d) { return d.e || 0; }),
        min: sumDays(function (d) { return (d.sec || 0) / 60; }) +
          Object.keys(pm).reduce(function (s, d) { return s + pm[d]; }, 0)
      }
    };
  }

  /** 近 7 天滚动窗口（图表用）：
      每项 { day, label, isToday, vocab, entry, dailyMin, cumMin }
      cumMin 永久连续：窗口前所有历史时长（专注+复习）先行累加，再逐日累加窗口内净值 */
  function last7() {
    load();
    if (!store) return []; // 数据安全加固：统计读取未确认时图表置空（不落任何盘）
    var pm = pomoMinutes();
    var days = [];
    var now = Date.now();
    for (var i = 6; i >= 0; i--) {
      var ts = now - i * 86400000;
      days.push(dayKey(ts));
    }
    var first = days[0];
    /* 窗口之前的全部历史时长（专注按天归档 + 复习逐日记录） */
    var before = 0;
    Object.keys(pm).forEach(function (d) { if (d < first) before += pm[d]; });
    Object.keys(store.days).forEach(function (d) {
      if (d < first) before += (store.days[d].sec || 0) / 60;
    });

    var out = [];
    var cum = before;
    var todayKey = dayKey();
    days.forEach(function (d) {
      var b = store.days[d] || { v: 0, e: 0, sec: 0 };
      var dailyMin = (b.sec || 0) / 60 + (pm[d] || 0);
      cum += dailyMin;
      var parts = d.split("-");
      out.push({
        day: d,
        label: parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10),
        isToday: d === todayKey,
        vocab: b.v || 0,
        entry: b.e || 0,
        dailyMin: dailyMin,
        cumMin: cum
      });
    });
    return out;
  }

  window.VH_STATS = {
    add: add,
    touch: touch,
    elapsed: elapsed,
    snapshot: snapshot,
    last7: last7,
    dayKey: dayKey
  };
})();
