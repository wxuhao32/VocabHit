/* ============================================================
   Spaced Repetition · 自适应间隔算法 · 数据层 v2
   ------------------------------------------------------------
   挂载到 window.VH_SR.data。
   职责：存储库知识条目的间隔重复状态机（考察方式归属每条条目）。
   数据键：vc-spaced-repetition（独立命名空间，与 vc-review 生词
   复习 / vc-repo 存储库数据完全隔离，互不读写、互不污染）。
   状态字段：
     id / repositoryId / reviewEnabled / reviewStage /
     lastReviewAt / nextReviewAt / reviewCount /
     createdAt / updatedAt /
     examType（"question" 提问型 | "cloze" 挖空型 | "" 未设置→旧流程兜底）
     examConfig（提问型 {question,answer} | 挖空型 {blanks:[{start,end}]}）
   间隔重复规则（六档间隔可自定义，默认与生词 Review 默认一致：1·3·7·10·20·30，
   即首复习次日、认识 3→7→10→20→30→每月；修改仅影响存储库间隔重复，
   生词 Review 算法与数据零影响，两套规则完全独立）：
     记得 → 阶段 +1（上限 6=长期重复），间隔取档位[新阶段-1]
     模糊 → 阶段不变，间隔减半（保守延长，最少 1 天）
     忘记 → 阶段回退（最少 1），次日复习
     已掌握 → reviewEnabled=false 退出队列（数据保留，可重新加入）
   每条目完全独立：加入时间/阶段/下次复习时间互不共享。
   v1 → v2 迁移：旧「复习模板」概念移除（templates/libBindings 丢弃），
   既有 states 进度完整保留（间隔回退固定六档）。
   ============================================================ */
(function () {
  "use strict";
  window.VH_SR = window.VH_SR || {};

  var SR_KEY = "vc-spaced-repetition";
  var DEFAULT_INTERVALS = [1, 3, 7, 10, 20, 30]; // 与生词 Review 默认一致：首复习次日；认识 3→7→10→20→30→每月

  /* ---------- 业务日计算：优先复用 app.js 全局 businessDayAt（04:00 边界），
                无则回退到同逻辑内置实现（Node 测试环境） ---------- */
  function fallbackDayAt(dayOffset, now) {
    var d = new Date((now || Date.now()) - 4 * 3600 * 1000);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(4, 0, 0, 0);
    return d.getTime();
  }
  function dayAt(dayOffset, now) {
    if (typeof businessDayAt === "function") return businessDayAt(dayOffset, now || Date.now());
    return fallbackDayAt(dayOffset, now || Date.now());
  }

  /* ---------- 存储 ---------- */

  var store = { v: 2, intervals: DEFAULT_INTERVALS.slice(), states: {} }; // intervals：六档间隔规则（用户可改）；states：{ entryId: state }

  function loadAll() {
    try {
      var saved = JSON.parse(localStorage.getItem(SR_KEY) || "null");
      if (saved && saved.v === 1 && saved.states) {
        // v1 → v2：复习模板概念移除；既有复习进度（阶段/次数/时间）完整保留
        store.v = 2;
        store.states = {};
        Object.keys(saved.states).forEach(function (id) {
          var s = saved.states[id];
          if (!s || !s.id) return;
          if ("templateId" in s) delete s.templateId;
          store.states[id] = s;
        });
        store.intervals = DEFAULT_INTERVALS.slice(); // v1 无间隔设置 → 播种默认
        saveAll();
      } else if (saved && saved.v === 2 && saved.states) {
        store.v = 2;
        store.states = saved.states;
        store.intervals = validIntervals(saved.intervals) || DEFAULT_INTERVALS.slice();
      }
    } catch (e) { store.states = {}; store.intervals = DEFAULT_INTERVALS.slice(); }
    return store;
  }

  function saveAll() {
    try { localStorage.setItem(SR_KEY, JSON.stringify(store)); } catch (e) { /* 存储满忽略 */ }
  }

  /* ---------- 考察方式（归属每条条目，与调度完全独立） ---------- */

  /** 挖空偏移合法性：过滤越界/倒置区间并按起点排序（不修改原数组） */
  function validBlanks(content, blanks) {
    var len = String(content || "").length;
    if (!Array.isArray(blanks)) return [];
    var out = blanks
      .filter(function (b) {
        return b && typeof b.start === "number" && typeof b.end === "number" &&
          b.start >= 0 && b.end > b.start && b.end <= len;
      })
      .map(function (b) { return { start: b.start, end: b.end }; });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  /**
   * 考察方式校验（content = 条目原文，用于挖空偏移边界校验）：
   *   question → {question, answer} 均必填
   *   cloze    → blanks 至少 1 个合法偏移
   * 返回 {ok, config} 或 {error}
   */
  function validExam(examType, examConfig, content) {
    if (examType === "question") {
      var q = examConfig ? String(examConfig.question || "").trim() : "";
      var a = examConfig ? String(examConfig.answer || "").trim() : "";
      if (!q) return { error: "请输入预设问题" };
      if (!a) return { error: "请输入正确答案" };
      return { ok: true, config: { question: q, answer: a } };
    }
    if (examType === "cloze") {
      var bs = validBlanks(content, examConfig && examConfig.blanks);
      if (!bs.length) return { error: "请先在原文中选择要隐藏的部分" };
      return { ok: true, config: { blanks: bs } };
    }
    return { error: "请选择考察方式" };
  }

  function examTypeLabel(t) {
    if (t === "question") return "提问型";
    if (t === "cloze") return "挖空型";
    return "未设置";
  }

  /**
   * 挖空判分：answers[i] 对应 blanks[i]（忽略大小写与多余空白）。
   * 返回 { results:[bool], correct, total, allCorrect }
   */
  function judgeCloze(content, blanks, answers) {
    var bs = validBlanks(content, blanks);
    var norm = function (s) {
      return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
    };
    var results = bs.map(function (b, i) {
      return norm(content.slice(b.start, b.end)) === norm((answers || [])[i]);
    });
    var correct = results.filter(Boolean).length;
    return {
      results: results,
      correct: correct,
      total: bs.length,
      allCorrect: bs.length > 0 && correct === bs.length
    };
  }

  /* ---------- 间隔设置（存储库间隔重复自有规则，与生词 Review 完全独立） ---------- */

  /** 宽松校验（loadAll 恢复用）：6 个 1-365 的天数 → 规整副本；否则 null */
  function validIntervals(arr) {
    if (!Array.isArray(arr) || arr.length !== 6) return null;
    var out = [];
    for (var i = 0; i < 6; i++) {
      var v = Number(arr[i]);
      if (!isFinite(v) || v < 1 || v > 365) return null;
      out.push(Math.round(v));
    }
    return out;
  }

  /** 当前间隔规则（返回副本，外部修改不影响内部状态） */
  function intervals() { return store.intervals.slice(); }

  /** 修改间隔规则：恰好 6 个 1-365 的天数；仅影响后续调度，条目既有排期不变 */
  function setIntervals(arr) {
    if (!Array.isArray(arr) || arr.length !== 6) return { error: "间隔设置需要 6 个值" };
    for (var i = 0; i < 6; i++) {
      var v = Number(arr[i]);
      if (!isFinite(v) || v < 1 || v > 365) {
        return { error: "第 " + (i + 1) + " 个间隔需为 1-365 的天数" };
      }
    }
    store.intervals = validIntervals(arr);
    saveAll();
    return { ok: true, intervals: store.intervals.slice() };
  }

  /** 恢复默认间隔（与生词 Review 默认一致） */
  function resetIntervals() {
    store.intervals = DEFAULT_INTERVALS.slice();
    saveAll();
    return { ok: true, intervals: store.intervals.slice() };
  }

  /* ---------- 复习状态 ---------- */

  function stateOf(entryId) { return store.states[entryId] || null; }

  function activeStates() {
    return Object.keys(store.states)
      .map(function (id) { return store.states[id]; })
      .filter(function (s) { return s.reviewEnabled; });
  }

  /** 到期队列：reviewEnabled 且 nextReviewAt <= now（按到期时间升序） */
  function dueStates(now) {
    var t = now || Date.now();
    return activeStates()
      .filter(function (s) { return s.nextReviewAt > 0 && s.nextReviewAt <= t; })
      .sort(function (a, b) { return a.nextReviewAt - b.nextReviewAt; });
  }

  /** 队列总览（全部启用状态，按 nextReviewAt 升序） */
  function queueStates() {
    return activeStates().sort(function (a, b) { return a.nextReviewAt - b.nextReviewAt; });
  }

  function statesOfLibrary(libId) {
    return Object.keys(store.states)
      .map(function (id) { return store.states[id]; })
      .filter(function (s) { return s.repositoryId === libId && s.reviewEnabled; });
  }

  /**
   * 批量加入间隔重复队列：entries = [{id, content, examType, examConfig}...]。
   * 每条独立：加入时间各自计算首次复习日期，互不共享。
   * - 新条目 → stage=1，nextReviewAt = 1 天后（业务日 04:00 边界），保存自己的考察方式
   * - 已启用（复习中）→ 进度完全保留；若本次带新考察配置则仅更新考察方式
   * - 已掌握退出（reviewEnabled=false）→ 重新激活从头开始（stage=1）
   * 返回 { added, skipped, reactivated }
   */
  function addToReview(entries, libId) {
    var first = store.intervals[0]; // 首次复习间隔跟随当前间隔规则（默认 1 天 = 次日）
    var now = Date.now();
    var r = { added: 0, skipped: 0, reactivated: 0 };
    (entries || []).forEach(function (e) {
      if (!e || !e.id) return;
      var ex = e.examType ? validExam(e.examType, e.examConfig, e.content) : { ok: false };
      var type = ex.ok ? e.examType : "";
      var cfg = ex.ok ? ex.config : null;
      var st = store.states[e.id];
      if (st && st.reviewEnabled) {
        // 已在队列：进度不动；本次有新配置则仅替换考察方式
        if (cfg) {
          st.examType = type;
          st.examConfig = cfg;
          st.updatedAt = now;
        }
        r.skipped++;
        return;
      }
      if (st) {
        // 已掌握退出 → 重新进入，从头开始（考察方式按本次配置）
        st.reviewEnabled = true;
        st.reviewStage = 1;
        st.nextReviewAt = dayAt(first, now);
        st.lastReviewAt = 0;
        st.reviewCount = 0;
        st.repositoryId = libId;
        st.examType = type;
        st.examConfig = cfg;
        st.updatedAt = now;
        r.reactivated++;
      } else {
        store.states[e.id] = {
          id: e.id,
          repositoryId: libId,
          reviewEnabled: true,
          reviewStage: 1,
          lastReviewAt: 0,
          nextReviewAt: dayAt(first, now),
          reviewCount: 0,
          examType: type,
          examConfig: cfg,
          createdAt: now,
          updatedAt: now
        };
        r.added++;
      }
    });
    saveAll();
    return r;
  }

  /** 修改在队列条目的考察方式（不触碰任何复习进度/调度字段） */
  function setExamConfig(entryId, examType, examConfig, content) {
    var st = store.states[entryId];
    if (!st) return { error: "该条目尚未加入队列" };
    var ex = validExam(examType, examConfig, content);
    if (!ex.ok) return ex;
    st.examType = examType;
    st.examConfig = ex.config;
    st.updatedAt = Date.now();
    saveAll();
    return { ok: true };
  }

  /**
   * 一次复习判断（间隔重复调度，与考察方式无关）：
   * result = "known" | "fuzzy" | "forgot"
   *   known  → 阶段 +1（≤6），间隔 = 档位[新阶段-1]（第 6 档 = 长期重复）
   *   fuzzy  → 阶段不变，间隔 = 当前档一半（≥1 天，保守延长）
   *   forgot → 阶段回退（≥1），次日复习
   */
  function answer(entryId, result) {
    var st = store.states[entryId];
    if (!st || !st.reviewEnabled) return null;
    var iv = store.intervals; // 当前间隔规则（默认与生词 Review 一致，用户可在间隔设置修改）
    var now = Date.now();
    var stage = st.reviewStage;

    if (result === "known") {
      stage = Math.min(6, stage + 1);
      st.reviewStage = stage;
      st.nextReviewAt = dayAt(iv[Math.min(stage, 6) - 1], now);
    } else if (result === "fuzzy") {
      var cur = iv[Math.min(stage, 6) - 1];
      st.nextReviewAt = dayAt(Math.max(1, Math.round(cur / 2)), now);
    } else { // forgot
      st.reviewStage = Math.max(1, stage - 1);
      st.nextReviewAt = dayAt(1, now);
    }

    st.lastReviewAt = now;
    st.reviewCount = (st.reviewCount || 0) + 1;
    st.updatedAt = now;
    saveAll();
    // 学习统计钩子（可选）：由全局统计模块（js/stats.js）注入；无钩子（如测试环境）→ 零副作用
    if (window.VH_STATS && typeof window.VH_STATS.add === "function") {
      try { window.VH_STATS.add({ entry: 1, sec: window.VH_STATS.elapsed() }); } catch (e) {}
    }
    return st;
  }

  /** 已掌握：退出复习队列（reviewEnabled=false），原始条目与状态记录保留 */
  function markMastered(entryId) {
    var st = store.states[entryId];
    if (!st) return null;
    st.reviewEnabled = false;
    st.updatedAt = Date.now();
    saveAll();
    return st;
  }

  /** 彻底移出复习（删除状态记录） */
  function removeFromReview(entryId) {
    if (!store.states[entryId]) return false;
    delete store.states[entryId];
    saveAll();
    return true;
  }

  /** 统计：正在复习数 / 到期数 */
  function counts(now) {
    var t = now || Date.now();
    var act = activeStates();
    return {
      active: act.length,
      due: act.filter(function (s) { return s.nextReviewAt > 0 && s.nextReviewAt <= t; }).length
    };
  }

  /** 状态阶段文案（用户可理解） */
  function stageLabel(st) {
    if (!st) return "";
    if (st.reviewStage >= 6) return "长期重复";
    return "第 " + st.reviewStage + " 阶段";
  }

  loadAll();

  window.VH_SR.data = {
    KEY: SR_KEY,
    DEFAULT_INTERVALS: DEFAULT_INTERVALS,
    loadAll: loadAll,
    saveAll: saveAll,
    dayAt: dayAt,
    // 间隔设置（存储库间隔重复自有规则，默认与生词 Review 一致，可独立修改）
    validIntervals: validIntervals,
    intervals: intervals,
    setIntervals: setIntervals,
    resetIntervals: resetIntervals,
    // 考察方式（每条目独立）
    validBlanks: validBlanks,
    validExam: validExam,
    judgeCloze: judgeCloze,
    examTypeLabel: examTypeLabel,
    // 状态
    stateOf: stateOf,
    activeStates: activeStates,
    dueStates: dueStates,
    queueStates: queueStates,
    statesOfLibrary: statesOfLibrary,
    addToReview: addToReview,
    setExamConfig: setExamConfig,
    answer: answer,
    markMastered: markMastered,
    removeFromReview: removeFromReview,
    counts: counts,
    stageLabel: stageLabel
  };
})();
