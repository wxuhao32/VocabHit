/* ============================================================
   Spaced Repetition · FSRS 统一结算 · 数据层 v3
   ------------------------------------------------------------
   挂载到 window.VH_SR.data。
   职责：存储库知识条目的间隔重复状态机（考察方式归属每条条目）。
   数据键：vc-spaced-repetition（独立命名空间，与 vc-review 生词
   复习 / vc-repo 存储库数据完全隔离，互不读写、互不污染）。
   状态字段：
     id / repositoryId / reviewEnabled /
     fsrs（{s,d,dr,reps,lapses,lastReviewedAt,lastElapsed}
           —— 与生词 Review 完全同构的记忆状态）/
     lastReviewAt / nextReviewAt / reviewCount /
     createdAt / updatedAt /
     examType（"question" 提问型 | "cloze" 挖空型 | "" 未设置→旧流程兜底）
     examConfig（提问型 {question,answer} | 挖空型 {blanks:[{start,end}]}）
   调度算法：统一复用生词 Review 的 FSRS（js/fsrs.js · window.VH_FSRS）
   —— 同一套记忆状态 / 稳定性 / 难度 / 间隔计算 / 业务日落盘，
   不另设独立间隔算法。三态判断 → FSRS Rating：
     known（记得/答对） → Good(3)
     fuzzy（模糊）      → Hard(2)
     forgot（遗忘/答错）→ Again(1)
   nextReviewAt 仍按业务日 04:00 边界落盘，到期队列语义不变。
   提问型判分：答案做宽松规范化比较（忽略大小写 / 全半角 / 标点 /
   多余空白），并支持关键字令牌匹配；预设答案可用 | 分隔多个候选。
   v2 → v3 迁移：六档间隔预设退役（intervals / reviewStage 移除），
   既有复习进度由 VH_FSRS.fromLegacy 一次性推导（稳定性 = 旧档位
   间隔，难度按历史插值；旧数据无三态细分，按全部「记得」处理），
   已排的 nextReviewAt 原样保留，下次复习起自然进入 FSRS 结算。
   零删除、零破坏历史数据。
   ============================================================ */
(function () {
  "use strict";
  window.VH_SR = window.VH_SR || {};

  var SR_KEY = "vc-spaced-repetition";
  var LEGACY_INTERVALS = [1, 3, 7, 10, 20, 30]; // v2 六档默认间隔（仅迁移推导用，不再参与调度）

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

  var store = { v: 3, states: {} }; // states：{ entryId: state }

  /** 确保条目具备 FSRS 记忆状态（幂等）。
      · 从未复习 → 空状态，首次评分时由 FSRS w0–w3 初始化
      · 已复习（旧数据迁移）→ 稳定性 = 旧档位间隔，难度由历史插值（VH_FSRS.fromLegacy） */
  function ensureFsrs(st) {
    if (!window.VH_FSRS) return null; // fsrs.js 未加载（异常兜底）
    if (st.fsrs) return st.fsrs;
    if ((st.reviewCount || 0) > 0 && (st.lastReviewAt || 0) > 0) {
      var stage = Math.min(Math.max(st.reviewStage || 1, 1), 6);
      st.fsrs = VH_FSRS.fromLegacy({
        intervalDays: LEGACY_INTERVALS[stage - 1],
        total: st.reviewCount,
        known: st.reviewCount, // 旧数据层无三态细分，按全部「记得」推导（最熟口径，后续复习自然修正）
        fuzzy: 0,
        unknown: 0,
        lastReviewedAt: st.lastReviewAt
      });
    } else {
      st.fsrs = VH_FSRS.newState();
    }
    return st.fsrs;
  }

  function loadAll() {
    try {
      var saved = JSON.parse(localStorage.getItem(SR_KEY) || "null");
      if (saved && saved.v === 1 && saved.states) {
        // v1 → v2 → v3：复习模板概念移除 + 六档间隔退役；既有复习进度完整保留
        store.v = 3;
        store.states = {};
        Object.keys(saved.states).forEach(function (id) {
          var s = saved.states[id];
          if (!s || !s.id) return;
          if ("templateId" in s) delete s.templateId;
          store.states[id] = s;
        });
        migrateV2States(saved.intervals);
        saveAll();
      } else if (saved && saved.v === 2 && saved.states) {
        // v2 → v3：六档间隔预设退役 → FSRS 一次性迁移
        store.v = 3;
        store.states = saved.states;
        migrateV2States(saved.intervals);
        saveAll();
      } else if (saved && saved.v === 3 && saved.states) {
        store.v = 3;
        store.states = saved.states;
      }
    } catch (e) { store.states = {}; }
    return store;
  }

  /** v2 → v3 迁移（幂等）：为每个状态推导 fsrs、移除六档字段。
      旧间隔规则取自用户 v2 存档（自定义过则沿用其值推导），缺省用默认档。 */
  function migrateV2States(savedIntervals) {
    var iv = validLegacyIntervals(savedIntervals) || LEGACY_INTERVALS;
    Object.keys(store.states).forEach(function (id) {
      var s = store.states[id];
      if (!s) return;
      if (!s.fsrs) {
        if ((s.reviewCount || 0) > 0) {
          var stage = Math.min(Math.max(s.reviewStage || 1, 1), 6);
          s.fsrs = window.VH_FSRS
            ? VH_FSRS.fromLegacy({
                intervalDays: iv[stage - 1],
                total: s.reviewCount,
                known: s.reviewCount,
                fuzzy: 0,
                unknown: 0,
                lastReviewedAt: s.lastReviewAt || null
              })
            : null;
        } else {
          s.fsrs = window.VH_FSRS ? VH_FSRS.newState() : null;
        }
      }
      delete s.reviewStage;
    });
  }

  /** v2 宽松校验（仅迁移用）：6 个 1-365 的天数 → 规整副本；否则 null */
  function validLegacyIntervals(arr) {
    if (!Array.isArray(arr) || arr.length !== 6) return null;
    var out = [];
    for (var i = 0; i < 6; i++) {
      var v = Number(arr[i]);
      if (!isFinite(v) || v < 1 || v > 365) return null;
      out.push(Math.round(v));
    }
    return out;
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
   *   question → {question, answer} 均必填（answer 支持 | 分隔多个正确答案）
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

  /** 预设答案候选列表：半角 | 或全角 ｜ 分隔多个正确答案；
      无分隔符的旧数据 → 整串作为唯一候选（完全兼容） */
  function answersOf(examConfig) {
    var raw = String(examConfig && examConfig.answer != null ? examConfig.answer : "");
    var parts = raw.split(/[|｜]/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    return parts;
  }

  /** 答案规范化：全角→半角 → 小写 → 去除全部标点/符号（保留中英文数字）
      → 折叠空白。只用于比较，绝不回写用户数据。 */
  function normalizeAnswer(s) {
    return String(s == null ? "" : s)
      .replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .toLowerCase()
      .replace(/[\u3000\u00B7\u2022\u2027]/g, " ")
      .replace(/[^0-9a-z\u4e00-\u9fff\u3400-\u4dbf]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** 规范化串的语义令牌：拉丁串、数字串分开切（"a2" ≡ "a^2"），连续中文字符串 */
  function tokensOf(norm) {
    return norm.match(/[a-z]+|[0-9]+|[\u4e00-\u9fff\u3400-\u4dbf]+/g) || [];
  }

  /**
   * 提问型判分（宽松但防误判）：
   * ① 规范化全等 → 正确（覆盖大小写/全半角/标点/空白差异）
   * ② 关键字令牌匹配 → 正确：答案的全部令牌均出现在用户作答中
   *    （拉丁/数字令牌要求整词相等，中文令牌要求子串包含），
   *    且用户作答令牌数 ≤ 答案令牌数 + 2 —— 混入大量无关内容
   *    （完全不同的答案）不得判对
   * 任一预设候选命中即正确。返回 { correct, matched }（matched=命中的预设答案）
   */
  function judgeAnswer(userInput, examConfig) {
    var answers = answersOf(examConfig);
    var u = normalizeAnswer(userInput);
    if (!u || !answers.length) return { correct: false, matched: null };
    var uToks = tokensOf(u);
    for (var i = 0; i < answers.length; i++) {
      var a = normalizeAnswer(answers[i]);
      if (!a) continue;
      if (u === a) return { correct: true, matched: answers[i] };
      var aToks = tokensOf(a);
      if (!aToks.length) continue;
      if (uToks.length > aToks.length + 2) continue; // 作答明显偏长 → 防整段无关内容误判
      var allCovered = true;
      for (var j = 0; j < aToks.length; j++) {
        var tok = aToks[j];
        var covered = /^[0-9a-z]+$/.test(tok)
          ? uToks.indexOf(tok) !== -1   // 拉丁/数字：整词匹配
          : u.indexOf(tok) !== -1;       // 中文：子串包含
        if (!covered) { allCovered = false; break; }
      }
      if (allCovered) return { correct: true, matched: answers[i] };
    }
    return { correct: false, matched: null };
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
   * - 新条目 → 空 FSRS 状态（首次评分初始化），nextReviewAt = 1 天后（业务日 04:00 边界），
   *   保存自己的考察方式
   * - 已启用（复习中）→ 记忆状态与进度完全保留；若本次带新考察配置则仅更新考察方式
   * - 已掌握退出（reviewEnabled=false）→ 重新激活从头开始（空 FSRS 状态）
   * 返回 { added, skipped, reactivated }
   */
  function addToReview(entries, libId) {
    var first = window.VH_FSRS ? VH_FSRS.MIN_INTERVAL_DAYS : 1; // 首次复习 = 次日
    var now = Date.now();
    var r = { added: 0, skipped: 0, reactivated: 0 };
    (entries || []).forEach(function (e) {
      if (!e || !e.id) return;
      var ex = e.examType ? validExam(e.examType, e.examConfig, e.content) : { ok: false };
      var type = ex.ok ? e.examType : "";
      var cfg = ex.ok ? ex.config : null;
      var st = store.states[e.id];
      if (st && st.reviewEnabled) {
        // 已在队列：记忆状态与进度不动；本次有新配置则仅替换考察方式
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
        st.fsrs = window.VH_FSRS ? VH_FSRS.newState() : null;
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
          fsrs: window.VH_FSRS ? VH_FSRS.newState() : null,
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

  /** 修改在队列条目的考察方式（不触碰任何记忆状态/调度字段） */
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

  /** 三态结果 → FSRS Rating（与生词 Review 同一映射口径） */
  function ratingOf(result) {
    if (!window.VH_FSRS) return 3;
    if (result === "known") return VH_FSRS.RATING.GOOD;    // 3 记得/答对
    if (result === "fuzzy") return VH_FSRS.RATING.HARD;    // 2 模糊
    return VH_FSRS.RATING.AGAIN;                           // 1 遗忘/答错
  }

  /**
   * 一次复习结算（统一走生词 Review 同款 FSRS · window.VH_FSRS.review）：
   * result = "known" | "fuzzy" | "forgot"
   *   · FSRS 依据既有稳定性/难度/实际经过天数计算新记忆状态与建议间隔
   *   · nextReviewAt = 业务日(now + round(建议间隔))，下限 1 天
   * 与生词 Review 的唯一差异：不叠加生词专属的自适应 scale
   *（该系数由生词复习日志拟合，只属于生词调度层）。
   */
  function answer(entryId, result) {
    var st = store.states[entryId];
    if (!st || !st.reviewEnabled) return null;
    if (!window.VH_FSRS) return st; // fsrs.js 未加载（异常兜底）：不调度
    var f = ensureFsrs(st);
    if (!f) return st;
    var now = Date.now();

    var next = VH_FSRS.review(f, ratingOf(result), now);
    st.fsrs = next.state;
    var days = Math.max(VH_FSRS.MIN_INTERVAL_DAYS, Math.round(next.intervalDays));
    st.nextReviewAt = dayAt(days, now);

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

  /** 已掌握：退出复习队列（reviewEnabled=false），原始条目与记忆状态保留 */
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

  /** FSRS 记忆状态文案（队列/已在队列展示用） */
  function fsrsLabel(st) {
    if (!st) return "";
    var f = st.fsrs;
    if (!f || typeof f.s !== "number" || !(f.s > 0)) return "待首复习";
    var s = f.s >= 100 ? Math.round(f.s) : Math.round(f.s * 10) / 10;
    return "稳定 " + s + " 天";
  }

  loadAll();

  window.VH_SR.data = {
    KEY: SR_KEY,
    loadAll: loadAll,
    saveAll: saveAll,
    dayAt: dayAt,
    // 考察方式（每条目独立）
    validBlanks: validBlanks,
    validExam: validExam,
    answersOf: answersOf,
    normalizeAnswer: normalizeAnswer,
    judgeAnswer: judgeAnswer,
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
    fsrsLabel: fsrsLabel
  };
})();
