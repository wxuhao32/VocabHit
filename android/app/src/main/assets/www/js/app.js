/* ============================================================
   生词本 — App Logic
   本地词典（js/dict.js, 考研词汇便携版 6357 词）
   生词记录（localStorage 持久化, 每日 04:00 重置）
   导出（PDF / Word / PNG）+ Android Bridge（全屏/状态栏/后台悬浮查词）
   ============================================================ */

"use strict";

/* ---------- 本地词典 ---------- */

const DICT_KEYS = Object.keys(DICT_DATA); // 已按词频降序

/** 词典查询（双词库）：考研词书（dict.js）第一优先级，未命中回退 ECDICT 已加载分片。
    返回 { ...词条, source: "kaoyan" | "ecdict" }，未命中 null */
function dictGet(word) {
  const w = String(word).trim().toLowerCase();
  if (!w) return null;
  const k = DICT_DATA[w];
  if (k) return { ...k, source: "kaoyan" };
  const e = window.ECDICT.get(w);
  return e ? { ...e, source: "ecdict" } : null;
}

/** 异步词典查询：考研优先（同步命中直接返回），未命中则加载 ECDICT 对应分片后再查 */
async function dictGetAsync(word) {
  const w = String(word).trim().toLowerCase();
  const d = dictGet(w);
  if (d) return d;
  if (!w) return null;
  const e = await window.ECDICT.getAsync(w);
  return e ? { ...e, source: "ecdict" } : null;
}

/** 候选搜索：只搜考研词书（6000 词，保证输入响应快）；ECDICT 词靠精确查询命中 */
function dictSearch(q, limit = 8) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const exact = [], prefix = [], contains = [];
  for (const w of DICT_KEYS) {
    if (w === q) exact.push(w);
    else if (w.startsWith(q)) prefix.push(w);
    else if (w.includes(q)) contains.push(w);
    if (exact.length + prefix.length + contains.length >= limit * 3) break;
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

/** ECDICT 词条（{p,s}）→ 与考研词书一致的 senses 结构 [[pos, [释义]]]；s 按行解析，行首词性/域标记为 pos */
function ecdictSenses(entry) {
  if (!entry || !entry.s) return [];
  return entry.s.split("\n").map((ln) => {
    ln = ln.trim();
    if (!ln) return ["", []];
    const m = ln.match(/^((?:\[[^\]\n]{1,20}\]|[a-z]{1,8}\.)\s*)(.*)$/i);
    if (m) return [m[1].trim(), [m[2] || ln]];
    return ["", [ln]];
  }).filter(([, defs]) => defs.length);
}

/** 词条释义行结构（考研 senses 或 ECDICT 转 senses） */
function sensesOf(d) {
  return d && d.senses ? d.senses : ecdictSenses(d);
}

/** 词条格式化：首个词性组 → "adj. 临时的；暂时的" */
function briefOf(word) {
  const d = dictGet(word);
  if (!d) return "";
  const [pos, senses] = sensesOf(d)[0] || ["", []];
  return `${pos ? pos + " " : ""}${senses.slice(0, 3).join("；")}`;
}

/** 词条完整释义行数组：["adj. 临时的；暂时的", "n. 临时工"] */
function senseLines(word) {
  const d = dictGet(word);
  if (!d) return [];
  return sensesOf(d).map(([pos, senses]) => `${pos ? pos + " " : ""}${senses.join("；")}`);
}

function phoneticOf(word) {
  const d = dictGet(word);
  return d && (d.ph || d.p) ? `/${(d.ph || d.p)}/` : "";
}

/* ---------- 生词记录系统（词典管释义，记录管次数） ---------- */

const STORE_KEY = "vc-records";
const HISTORY_MAX = 500; // 查询记录页渲染上限（数据永久保存，仅限制单次渲染节点数）
let records = { day: "", history: [], words: {} };

/** 词汇日：04:00 前算前一天（每日重置 04:00） */
function vocabDay(now = new Date()) {
  const s = new Date(now.getTime() - 4 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${s.getFullYear()}-${p(s.getMonth() + 1)}-${p(s.getDate())}`;
}

/** 业务日期字符串（YYYY-MM-DD）→ 中文日期（如 "2026年8月16日"） */
function zhBizDate(dayStr) {
  const [y, m, d] = String(dayStr).split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

/** 当前业务日 + dayOffset 个业务日后的 04:00 时间戳（04:00 为每日业务日切换边界）。
    Review 间隔（3/7/10/20/30/每月、次日、2 天强化）一律按业务日计算，
    保证以凌晨 4:00 作为每日检查点，而非自然时间 + N*24h。 */
function businessDayAt(dayOffset, now = Date.now()) {
  const d = new Date(now - 4 * 3600 * 1000); // 当前业务日 D 的 00:00（本地）
  d.setDate(d.getDate() + dayOffset);        // D + dayOffset 个业务日
  d.setHours(4, 0, 0, 0);                    // 该业务日 04:00（开始时刻）
  return d.getTime();
}

function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && saved.words) records = saved;
  } catch (_) { /* 损坏数据忽略 */ }
  migrateLegacyStarred();
  rolloverIfNeeded();
}

/**
 * 老数据兼容：仅补 firstQueriedAt（无害字段）。
 * 【重要】不再自动把「查询过但未收藏」的词补录为生词本（total>0 && !starred → starred=true 的
 * 旧补录逻辑已移除）——该逻辑每次启动都会执行，会把用户主动删除的词在重启后重新加入生词本，
 * 违反「查询历史 ≠ 生词本」。未收藏的词保持未收藏，用户可随时手动加入。
 */
function migrateLegacyStarred() {
  let changed = false;
  for (const w of Object.keys(records.words)) {
    const r = records.words[w];
    if (!r.firstQueriedAt) { // 老数据无首次查询时间 → 用加入生词本时刻近似
      r.firstQueriedAt = r.starredAt || r.last || Date.now();
      changed = true;
    }
  }
  if (changed) saveRecords();
}

function saveRecords() {
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

/** 跨天重置：仅今日生词计数（today）与今日统计数据清零；查询记录永久保留、累计次数不清零 */
function rolloverIfNeeded() {
  const day = vocabDay();
  if (records.day === day) return;
  records.day = day;
  for (const w of Object.keys(records.words)) records.words[w].today = 0;
  saveRecords();
}

/** 记录一次查询到历史（查询 ≠ 加入生词本：只进历史，不进生词计数） */
function recordHistory(word) {
  const w = String(word).trim().toLowerCase();
  if (!dictGet(w)) return null; // 只记录词典内有效查询
  loadRecords(); // 写前同步最新数据（悬浮窗可能已写入/主应用删除需防覆盖）
  rolloverIfNeeded();
  const p = (n) => String(n).padStart(2, "0");
  const now = new Date();
  records.history.push({ t: `${p(now.getHours())}:${p(now.getMinutes())}`, w, ts: Date.now() });
  saveRecords();
}

/** 确认查询（回车/点击候选）：进入今日生词并累计查询次数；
    首次成为生词时同步建立历史生词记录（words 以单词为 key，天然去重） */
function confirmQuery(word) {
  const w = String(word).trim().toLowerCase();
  if (!dictGet(w)) return null;
  loadRecords(); // 写前同步最新数据（悬浮窗并发写/主应用删除需防覆盖）
  rolloverIfNeeded();
  const rec = records.words[w] || { today: 0, total: 0, first: records.day, last: 0, starred: false, starredAt: 0, firstQueriedAt: 0 };
  if (!rec.firstQueriedAt) rec.firstQueriedAt = Date.now(); // 首次查询时间：永久保存，绝不覆盖
  rec.today += 1;
  rec.total += 1;
  rec.last = Date.now();
  if (!rec.starred && !rec.deleted) { // 首次进入今日生词 → 同步进入历史生词（长期保留）；用户删除过的词不自动加回
    rec.starred = true;
    rec.starredAt = Date.now();
  }
  records.words[w] = rec;
  saveRecords();
  if (rec.starred) ensureReviewEntry(w); // 生词进入 Review 队列（新词次日 04:00 起可复习）；未收藏的词不进 Review
  return rec;
}

/** 确认查询完整路径 = 记历史 + 生词计数 */
function recordQuery(word) {
  recordHistory(word);
  return confirmQuery(word);
}

/** 今日生词（today>0，最近查询在前） */
function todayWords() {
  return Object.keys(records.words)
    .filter((w) => records.words[w].today > 0)
    .sort((a, b) => records.words[b].last - records.words[a].last);
}

function statNew() { return todayWords().filter((w) => records.words[w].first === records.day).length; }
function statQueries() { return records.history.length; }
function wordMeta(word) {
  const r = records.words[word];
  return r ? { today: r.today, total: r.total } : { today: 0, total: 0 };
}

/* ---------- 生词本（历史生词）：确认查询自动加入 + 手动加入，永久保存 ---------- */

/** 历史生词（starred，最近加入在前）；确认查询过的词首次自动进入，也可从查询记录手动加入 */
function starredWords() {
  return Object.keys(records.words)
    .filter((w) => records.words[w].starred)
    .sort((a, b) => (records.words[b].starredAt || 0) - (records.words[a].starredAt || 0));
}

function isStarred(word) {
  return !!(records.words[word] && records.words[word].starred);
}

/** 加入生词本（历史生词）：供仅查询过但未确认的词手动收藏；从未计数过的词也可直接加入。
    手动加入视为用户明确意图 → 清除「已删除」标记，允许重新进入生词本 */
function addStarred(word) {
  const w = String(word).trim().toLowerCase();
  if (!dictGet(w) || isStarred(w)) return;
  loadRecords(); // 写前同步最新数据
  const rec = records.words[w] || { today: 0, total: 0, first: records.day, last: 0, starred: false, starredAt: 0, firstQueriedAt: 0 };
  if (!rec.firstQueriedAt) rec.firstQueriedAt = Date.now(); // 首次时间永久保存
  rec.starred = true;
  rec.starredAt = Date.now();
  rec.deleted = false; // 手动收藏 = 用户明确恢复
  records.words[w] = rec;
  saveRecords();
  ensureReviewEntry(w); // 手动加入生词本 → 进入 Review 队列
  renderAll();
  showToast("已加入生词本");
}

/** 移出生词本（仅取消 starred；查询记录与累计次数保留）；
    标记 deleted=true：删除后即使再次查询也不会自动加回（查询历史 ≠ 生词本）；Review 资格同步移除 */
function removeStarred(word) {
  loadRecords(); // 写前同步最新数据（悬浮窗并发写需防覆盖）
  const r = records.words[word];
  if (!r || !r.starred) return;
  r.starred = false;
  r.deleted = true;
  saveRecords();
  syncReviewWithWords(); // 生词本删除 → Review 同步删除该词（队列/计划/状态全部清除）
  renderAll();
  showToast("已移出生词本");
}

/** 删除单条历史记录（不影响今日生词计数） */
function deleteHistory(ts) {
  loadRecords(); // 写前同步最新数据（悬浮窗并发写需防覆盖）
  records.history = records.history.filter((h) => h.ts !== ts);
  saveRecords();
  renderAll();
  showToast("已删除该记录");
}

/** 从今日生词彻底删除：今日计数清零 + 移出生词本（starred=false + deleted 标记）+ Review 同步失效。
    「删除生词」= 彻底删除（生词本/今日/Review 全部移除），查询记录与累计次数保留（可手动删除记录） */
function deleteTodayWord(word) {
  loadRecords(); // 写前同步最新数据（悬浮窗并发写需防覆盖）
  const r = records.words[word];
  if (!r) return;
  r.today = 0;
  if (r.starred) {
    r.starred = false;
    r.deleted = true;
  }
  saveRecords();
  syncReviewWithWords(); // 生词本删除 → Review 同步删除该词
  renderAll();
  showToast("已删除生词");
}

/** +1 手动计数：用户主动增加一次遇见/查询次数。
    与回车共用同一套 today/total 计数（不受会话去重限制），每点击一次 +1 */
function addOne(word) {
  const w = String(word).trim().toLowerCase();
  if (!dictGet(w)) return;
  loadRecords(); // 写前同步最新数据（悬浮窗并发写/主应用删除需防覆盖）
  rolloverIfNeeded();
  const rec = records.words[w] || { today: 0, total: 0, first: records.day, last: 0, starred: false, starredAt: 0, firstQueriedAt: 0 };
  if (!rec.firstQueriedAt) rec.firstQueriedAt = Date.now(); // 首次时间永久保存
  rec.today += 1;
  rec.total += 1;
  rec.last = Date.now();
  if (!rec.starred && !rec.deleted) { // 成为生词 → 同步进入历史生词；用户删除过的词不自动加回
    rec.starred = true;
    rec.starredAt = Date.now();
  }
  records.words[w] = rec;
  saveRecords();
  if (rec.starred) ensureReviewEntry(w); // 生词进入 Review 队列；未收藏的词不进 Review
  // 刷新当前详情视图（数字立即变化）+ 全局列表
  if (sheetOpen && sheetInput.value.trim().toLowerCase() === w) renderSheetDetail(w);
  renderAll();
}

/* ---------- 工具 ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hasBridge = () => typeof window.AndroidBridge !== "undefined";

/** 时间戳 → "YYYY/MM/DD HH:mm" */
function fmtDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 单词读音（系统 TTS；纯辅助功能，不影响任何计数/阶段/拼写状态） ---------- */

const SPEAKER_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5v5h3l4 3.5v-12L7 7.5H4z"/><path d="M14 8a3.5 3.5 0 0 1 0 4M15.5 6a6 6 0 0 1 0 8"/></svg>`;

/* ================= 单词读音（参考 CET4Prep 机制） =================
   链路：① Web Speech API（WebView 内置/系统引擎，离线可用，声音自然）
        ② 有道在线发音兜底（联网即可出声，不依赖系统 TTS 引擎）
   times=播放次数（Review 判断页自动 2 次）；任何异常均被捕获，绝不影响 App 其他功能 */

let ttsAudioRef = null;   // 在线发音 Audio 引用（ttsStop 时暂停）
let ttsSpeechTimer = null; // Web Speech 启动超时句柄

function ttsSpeak(word, times = 1) {
  const w = String(word).trim().toLowerCase();
  if (!w) return;
  const n = Math.max(1, times);
  // ① Web Speech API：仅当存在可用语音（getVoices 非空）时才走，避免 2.5s 空等
  let canSpeech = false;
  try {
    canSpeech = typeof window.speechSynthesis !== "undefined"
      && typeof window.SpeechSynthesisUtterance !== "undefined"
      && typeof window.speechSynthesis.getVoices === "function"
      && window.speechSynthesis.getVoices().length > 0;
  } catch (_) { canSpeech = false; }
  if (canSpeech) {
    try {
      window.speechSynthesis.cancel();
      let started = false;
      const fallback = () => {
        if (started) return;
        started = true;
        try { window.speechSynthesis.cancel(); } catch (_) {}
        ttsSpeakOnline(w, n);
      };
      for (let i = 0; i < n; i++) {
        const u = new (window.SpeechSynthesisUtterance)(w);
        u.lang = "en-US";
        u.rate = 0.9;
        if (i === 0) u.onstart = () => { started = true; };
        window.speechSynthesis.speak(u);
      }
      if (ttsSpeechTimer) clearTimeout(ttsSpeechTimer);
      ttsSpeechTimer = setTimeout(fallback, 2500); // 2.5s 未开始发声 → 在线兜底
      return;
    } catch (_) { /* 异常则走在线兜底 */ }
  }
  // ② 在线发音兜底（有道词典美音；联网即可出声）
  ttsSpeakOnline(w, n);
}

/** 有道在线发音兜底（不依赖系统 TTS 引擎，联网即可播放） */
function ttsSpeakOnline(w, times) {
  try {
    ttsStopAudio();
    const url = "https://dict.youdao.com/dictvoice?audio=" + encodeURIComponent(w) + "&type=1";
    const a = new Audio(url);
    a.onerror = function () { /* 无网/发音失败静默 */ };
    const p = a.play();
    if (p && p.catch) p.catch(function () {});
    ttsAudioRef = a;
    if (times > 1) {
      let played = 1;
      a.onended = function () {
        if (played >= times) { ttsAudioRef = null; return; }
        played++;
        try {
          const b = new Audio(url);
          const pb = b.play();
          if (pb && pb.catch) pb.catch(function () {});
          ttsAudioRef = b;
        } catch (_) { /* 静默 */ }
      };
    }
  } catch (_) { /* 静默 */ }
}

function ttsStopAudio() {
  if (ttsAudioRef) { try { ttsAudioRef.pause(); } catch (_) {} ttsAudioRef = null; }
}

/** 停止播放（离开当前单词 / 进入拼写阶段等） */
function ttsStop() {
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  if (ttsSpeechTimer) { clearTimeout(ttsSpeechTimer); ttsSpeechTimer = null; }
  ttsStopAudio();
}

function wordHTML(word, count) {
  return `${esc(word)}<sup class="count">${count}</sup>`;
}

const TRASH_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7.2v4M9.3 7.2v4"/></svg>`;

/* ============================================================
   Review 复习系统（独立模块，与查询次数完全分离；vc-review 持久化）
   状态字段：
     known/fuzzy/unknown  认识/模糊/不认识 累计次数（永久累计）
     total                总复习次数
     firstAt/lastAt       首次/最近复习时间
     stage                0=未入长期; 1-5=3/7/10/20/30天档; 6=每月档
     mode                 "long"长期 | "daily"每日循环 | "booster"模糊强化 | ""未初始化
     origStage            强化前原长期阶段（daily/booster 恢复用）
     nextAt               下一次复习时间戳
   核心规则：
     新生词当天不复习，次日 04:00 进队列
     认识：3→7→10→20→30→每月，逐步推进
     首次模糊：2 天后；仍模糊 → 每日
     不认识：次日，循环到认识
     长期中不认识：降为每日（保留原阶段），认识后恢复原阶段
     长期中模糊：booster 强化（保留原阶段），认识后恢复原阶段
   ============================================================ */
const REVIEW_KEY = "vc-review";
const R_INTERVALS = [0, 3, 7, 10, 20, 30, 30]; // stage 1-6（6=每月）
let reviewStore = { words: {} };

function loadReview() {
  try {
    const saved = JSON.parse(localStorage.getItem(REVIEW_KEY) || "null");
    if (saved && saved.words) reviewStore = saved;
  } catch (_) { /* 损坏数据忽略 */ }
}

function saveReview() {
  localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewStore));
}

/** 次日 04:00 时间戳（词汇日 D 的下一天 D+1 从 04:00 开始；新词当天不复习，第二天自动进队列） */
function nextDay4am(now = Date.now()) {
  return businessDayAt(1, now);
}

/**
 * 词成为生词时初始化复习状态（幂等）。
 * 「当天生词当天不复习」严格按「首次加入生词本的日期」（records.words[w].first）判断：
 *   加入日期 = 今天 → nextAt = 次日 04:00（明天才首次复习）
 *   加入日期 < 今天（老词）→ nextAt = 现在（立即进入首次复习）
 */
function ensureReviewEntry(w) {
  if (reviewStore.words[w]) return reviewStore.words[w];
  const r = records.words[w];
  const e = {
    known: 0, fuzzy: 0, unknown: 0, total: 0,
    firstAt: Date.now(), lastAt: 0,
    stage: 0, mode: "", origStage: 0,
    nextAt: (r && r.first === vocabDay()) ? nextDay4am() : Date.now(),
  };
  reviewStore.words[w] = e;
  saveReview();
  return e;
}

/** 老数据迁移：已有历史生词无复习状态 → 按「首次加入日期」安排首次复习（当天加入的明天，老词立即） */
function migrateReview() {
  let changed = false;
  for (const w of Object.keys(records.words)) {
    if (!reviewStore.words[w] && records.words[w].starred) {
      const r = records.words[w];
      reviewStore.words[w] = {
        known: 0, fuzzy: 0, unknown: 0, total: 0,
        firstAt: Date.now(), lastAt: 0,
        stage: 0, mode: "", origStage: 0,
        nextAt: (r.first === vocabDay()) ? nextDay4am() : Date.now(),
      };
      changed = true;
    }
  }
  if (changed) saveReview();
}

/**
 * Review ↔ 生词本动态同步：生词本是 Review 的唯一基础数据源。
 * 不在生词本（records.words 中不存在或已移出生词本 starred=false）的 Review 词 → 立即清除，
 * 包括待复习队列 / 后续计划 / 全部 Review 状态，杜绝历史脏数据残留。
 */
function syncReviewWithWords() {
  let changed = false;
  for (const w of Object.keys(reviewStore.words)) {
    const r = records.words[w];
    if (!r || !r.starred) {
      delete reviewStore.words[w];
      changed = true;
    }
  }
  if (changed) saveReview();
}

/**
 * 清空复习队列：清除全部 Review 状态与复习计划，然后以当前生词本有效单词重建。
 * 不删除生词本 / 查询历史 / 历史生词 / 词典；重建仍遵守「当天生词当天不复习」。
 */
function clearReviewQueue() {
  reviewStore = { words: {} };
  clearReviewSession(); // 丢弃中断的会话
  reviewSession = {
    day: "", queue: [], idx: 0, current: null,
    step: "answer", lastResult: null, snapshot: null,
    spell: { submitted: false, correct: false, input: "" },
    stats: { n: 0, known: 0, fuzzy: 0, unknown: 0 },
  };
  migrateReview(); // 以生词本为基础重建（按 first 日期安排首次复习）
  renderAll();
  showToast("已清空复习队列");
}

/** 待复习队列：生词本内且 nextAt 到期的词（按 nextAt 升序）；移出生词本的词不再安排复习 */
function reviewQueue() {
  const now = Date.now();
  return Object.keys(reviewStore.words)
    .filter((w) => isStarred(w) && reviewStore.words[w].nextAt > 0 && reviewStore.words[w].nextAt <= now)
    .sort((a, b) => reviewStore.words[a].nextAt - reviewStore.words[b].nextAt);
}

/** 复习状态机：应用一次判断（known/fuzzy/unknown），更新计数与下一次复习时间。
    下一次复习时间一律按业务日计算（businessDayAt）：N 天后 = 当前业务日 + N 个业务日的 04:00 */
function answerReview(word, result) {
  const st = reviewStore.words[word];
  if (!st) return null;
  const now = Date.now();
  const firstReview = st.total === 0; // 本次是首次复习

  if (result === "known") {
    if (st.mode === "daily" || st.mode === "booster") {
      // 从每日循环/模糊强化中认识 → 恢复原长期阶段（或首次进长期 3 天）
      st.stage = st.origStage > 0 ? st.origStage : 1;
      st.mode = "long";
    } else if (st.stage === 0) {
      st.stage = 1; // 首次复习即认识 → 3 天后
      st.mode = "long";
    } else {
      if (st.stage < 6) st.stage += 1; // 长期复习认识 → 进入下一档
      st.mode = "long";
    }
    st.origStage = 0;
    st.nextAt = businessDayAt(R_INTERVALS[st.stage], now);
    st.known += 1;
  } else if (result === "fuzzy") {
    if (st.stage > 0 && st.mode !== "daily") {
      // 已有长期阶段 → 短期强化（保留原阶段，下次时间缩短）
      if (st.mode !== "booster") st.origStage = st.stage;
      st.mode = "booster";
      st.nextAt = businessDayAt(2, now); // 2 个业务日后强化；强化中再模糊仍 2 天
    } else {
      // 未入长期：首次模糊 2 个业务日；之后每日复习
      st.mode = "daily";
      st.nextAt = businessDayAt(firstReview ? 2 : 1, now);
    }
    st.fuzzy += 1;
  } else { // unknown
    if (st.stage > 0 && st.mode !== "daily") {
      if (st.mode !== "booster") st.origStage = st.stage; // 保留原长期阶段
    }
    st.mode = "daily"; // 不认识：次日（业务日）复习
    st.nextAt = businessDayAt(1, now);
    st.unknown += 1;
  }

  st.lastAt = now;
  st.total += 1;
  saveReview();
  return st;
}

/* ============================================================
   Review 复习 — 两阶段沉浸式重设计
   Phase 1: 词义复习（主动回忆）→ Phase 2: 拼写复习（随机队列）
   ============================================================ */

const REVIEW_SESSION_KEY = "vc-review-session-v2";

// 新会话状态结构
let reviewSession = {
  day: "",
  phase: "meaning",     // "meaning" | "transition" | "spell" | "done"
  // Phase 1
  queue: [],            // 原始队列顺序
  idx: 0,
  step: "answer",       // "answer" | "detail"
  current: null,
  lastResult: null,
  snapshot: null,
  stats: { n: 0, known: 0, fuzzy: 0, unknown: 0 },
  // Phase 2
  spellQueue: [],       // 随机打乱后的拼写队列
  spellIdx: 0,
  spell: { submitted: false, correct: false, input: "" },
  spellStats: { correct: 0, wrong: 0, skipped: 0 },
};

function saveReviewSession() {
  try { localStorage.setItem(REVIEW_SESSION_KEY, JSON.stringify(reviewSession)); } catch (_) {}
}

function clearReviewSession() {
  try { localStorage.removeItem(REVIEW_SESSION_KEY); } catch (_) {}
}

/** Fisher-Yates 随机打乱数组（返回新数组）*/
function shuffleArray(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 读取并恢复会话 */
function loadReviewSession() {
  try {
    const s = JSON.parse(localStorage.getItem(REVIEW_SESSION_KEY) || "null");
    if (s && s.day === vocabDay() && Array.isArray(s.queue) && s.queue.length > 0) {
      // 与生词本同步：过滤掉已删除的词
      s.queue = s.queue.filter((w) => reviewStore.words[w] && isStarred(w));
      if (s.queue.length === 0) return null;
      
      // Phase 1 恢复
      s.idx = Math.min(s.idx || 0, s.queue.length);
      if (!s.stats) s.stats = { n: 0, known: 0, fuzzy: 0, unknown: 0 };
      
      // Phase 2 恢复（如果已进入拼写阶段）
      if (s.phase === "spell" || s.phase === "done") {
        if (!Array.isArray(s.spellQueue) || s.spellQueue.length === 0) {
          s.spellQueue = shuffleArray(s.queue);
        }
        s.spellQueue = s.spellQueue.filter((w) => reviewStore.words[w] && isStarred(w));
        s.spellIdx = Math.min(s.spellIdx || 0, s.spellQueue.length);
        if (!s.spellStats) s.spellStats = { correct: 0, wrong: 0, skipped: 0 };
        if (!s.spell) s.spell = { submitted: false, correct: false, input: "" };
      }
      
      return s;
    }
  } catch (_) {}
  return null;
}

/** 打开 Review 入口 */
function openReview() {
  rolloverIfNeeded();
  renderAll();
  const saved = loadReviewSession();
  
  if (saved) {
    reviewSession = saved;
  } else {
    const queue = reviewQueue();
    if (queue.length === 0) {
      // 无待复习单词，显示空状态
      switchTab("review");
      rvHideProgress();
      $("#review-body").innerHTML = `<div class="rv-done rv-screen">
        <div class="rv-done-check">✓</div>
        <h2 class="rv-done-title">今日无需复习</h2>
        <p class="rv-done-sub">没有待复习的单词</p>
        <p class="rv-done-hint">继续学习新单词，积累复习任务</p>
        <button class="rv-btn-go" id="review-done-back" type="button">返回首页</button>
      </div>`;
      return;
    }
    
    reviewSession = {
      day: vocabDay(),
      phase: "meaning",
      queue: queue,
      idx: 0,
      step: "answer",
      current: null,
      lastResult: null,
      snapshot: null,
      stats: { n: 0, known: 0, fuzzy: 0, unknown: 0 },
      spellQueue: [],
      spellIdx: 0,
      spell: { submitted: false, correct: false, input: "" },
      spellStats: { correct: 0, wrong: 0, skipped: 0 },
    };
    saveReviewSession();
  }
  
  // 进入沉浸模式
  document.body.classList.add("review-active");
  switchTab("review");
  renderReviewByPhase();
}

/** 按阶段渲染（统一经 rvRender 做轻量切换动画） */
function renderReviewByPhase() {
  const body = $("#review-body");
  
  if (reviewSession.phase === "meaning") {
    if (reviewSession.idx >= reviewSession.queue.length) {
      // Phase 1 完成，进入过渡页
      reviewSession.phase = "transition";
      saveReviewSession();
      return rvRender(() => renderTransition(body));
    }
    reviewSession.current = reviewSession.queue[reviewSession.idx];
    if (reviewSession.step === "detail") {
      return rvRender(() => renderDetail(body));
    }
    return rvRender(() => renderMeaning(body));
  }
  
  if (reviewSession.phase === "spell") {
    if (reviewSession.spellIdx >= reviewSession.spellQueue.length) {
      // Phase 2 完成：清空已结束的会话（勿再 saveReviewSession 回写，否则重启后残留"已完成"会话）
      reviewSession.phase = "done";
      clearReviewSession();
      return rvRender(() => renderDone(body));
    }
    reviewSession.current = reviewSession.spellQueue[reviewSession.spellIdx];
    return rvRender(() => renderSpell(body));
  }
  
  if (reviewSession.phase === "done") {
    return rvRender(() => renderDone(body));
  }
  
  if (reviewSession.phase === "transition") {
    return rvRender(() => renderTransition(body));
  }
}

/* ============================================================
   Review 表现层助手（纯 UI：进度 / 切换动画 / 字号分级 / 释义行）
   不触碰任何业务状态、算法与存储
   ============================================================ */

/** 顶部进度区：显示 cur/total，细进度条平滑填充 */
function rvSetProgress(cur, total) {
  const wrap = $("#rv-topbar");
  const bar = $("#rv-topbar-fill");
  const txt = $("#rv-topbar-count");
  if (!wrap || !bar || !txt) return;
  wrap.hidden = false;
  const pct = total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;
  bar.style.width = pct + "%";
  txt.textContent = `${cur} / ${total}`;
}

/** 隐藏顶部进度区（过渡页 / 完成页 / 空状态不使用进度） */
function rvHideProgress() {
  const wrap = $("#rv-topbar");
  if (wrap) wrap.hidden = true;
}

/** 长单词字号分级：<=12 默认 / 13-15 lg / 16-19 md / 20+ sm */
function rvWordSizeClass(word) {
  const n = String(word).length;
  if (n >= 20) return "rv-word--sm";
  if (n >= 16) return "rv-word--md";
  if (n >= 13) return "rv-word--lg";
  return "";
}

/** 释义行解析：["adj. 临时的；暂时的"] → [{pos:"adj.", meaning:"临时的；暂时的"}] */
function rvSenseRows(word) {
  return senseLines(word).map((line) => {
    const m = line.match(/^([^\s\u4e00-\u9fa5]{1,8}?)\s+(.*)$/);
    if (m && m[2]) return { pos: m[1].trim(), meaning: m[2].trim() };
    return { pos: "", meaning: line.trim() };
  });
}

/** 屏幕切换动画：旧屏淡出 → 新屏淡入（轻微位移，节奏短促；表现层） */
let rvAnimating = false;
function rvRender(fn) {
  const body = $("#review-body");
  if (!body || rvAnimating) { fn(); return; }
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const leaveMs = reduced ? 0 : 110;
  rvAnimating = true;
  const finish = () => {
    fn();
    const next = body.firstElementChild;
    if (next) {
      next.classList.add("rv-enter");
      requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove("rv-enter")));
    }
    rvAnimating = false;
  };
  const cur = body.firstElementChild;
  if (cur) {
    cur.classList.add("rv-leave");
    setTimeout(finish, leaveMs);
  } else {
    finish();
  }
}

/** Phase 1: 词义复习 - 回忆页（单词舞台中央，顶部进度，底部判断区） */
function renderMeaning(body) {
  const word = reviewSession.current;
  const total = reviewSession.queue.length;
  
  rvSetProgress(reviewSession.idx + 1, total);
  
  body.innerHTML = `<div class="rv-meaning rv-screen">
    <div class="rv-stage">
      <div class="rv-word-row">
        <h2 class="rv-word ${rvWordSizeClass(word)}">${esc(word)}</h2>
        <button class="rv-speaker" data-speak="${esc(word)}" aria-label="播放读音" type="button">${SPEAKER_SVG}</button>
      </div>
      <p class="rv-hint">回想它的意思，然后如实判断</p>
      <div class="rv-think-track"><div class="rv-think-fill" id="rv-think-fill"></div></div>
    </div>
    <div class="rv-actions">
      <button class="rv-btn rv-btn-known" data-result="known" type="button" disabled>认识</button>
      <button class="rv-btn rv-btn-fuzzy" data-result="fuzzy" type="button" disabled>模糊</button>
      <button class="rv-btn rv-btn-unknown" data-result="unknown" type="button" disabled>不认识</button>
    </div>
  </div>`;
  
  // 思考引导动画（3 秒）：细线填充 + 按钮解锁
  setTimeout(() => {
    const fill = $("#rv-think-fill");
    if (fill) {
      fill.style.width = "100%";
      fill.style.transition = "width 3s linear";
    }
    // 3 秒后启用按钮
    setTimeout(() => {
      $$(".rv-actions .rv-btn").forEach(btn => btn.disabled = false);
    }, 100);
  }, 50);
  
  // TTS 不自动播放，用户手动点击
}

/** Phase 1: 词义复习 - 释义确认页（单词头部 → 词性/释义列表 → 底部操作） */
function renderDetail(body) {
  const word = reviewSession.current;
  const total = reviewSession.queue.length;
  const last = reviewSession.lastResult;
  
  // 判断印记颜色
  const indicatorClass = last === "known" ? "rv-detail-indicator--known" 
                       : last === "fuzzy" ? "rv-detail-indicator--fuzzy" 
                       : "rv-detail-indicator--unknown";
  
  const senses = rvSenseRows(word);
  const sensesHtml = senses.length
    ? senses.map((s) => `<div class="rv-sense">${s.pos ? `<span class="rv-pos">${esc(s.pos)}</span>` : ""}<p class="rv-sense-meaning">${esc(s.meaning)}</p></div>`).join("")
    : `<div class="rv-sense"><p class="rv-sense-meaning" style="color:var(--text-2);">暂无释义</p></div>`;
  
  rvSetProgress(reviewSession.idx + 1, total);
  
  body.innerHTML = `<div class="rv-detail rv-screen">
    <div class="rv-detail-head">
      <div class="rv-detail-indicator ${indicatorClass}"></div>
      <div class="rv-detail-word-row">
        <h2 class="rv-detail-word ${rvWordSizeClass(word)}">${esc(word)}</h2>
        <button class="rv-speaker rv-speaker-sm" data-speak="${esc(word)}" aria-label="播放读音" type="button">${SPEAKER_SVG}</button>
      </div>
      <p class="rv-detail-ph">${esc(phoneticOf(word))}</p>
    </div>
    <div class="rv-detail-senses">
      ${sensesHtml}
    </div>
    <div class="rv-detail-actions">
      <button class="rv-btn-wrong" id="review-wrong" type="button">记错了</button>
      <button class="rv-btn-next" id="review-next" type="button">下一个</button>
    </div>
  </div>`;
  
  // 自动播放 TTS 一次（帮助音义绑定）
  setTimeout(() => ttsSpeak(word, 1), 200);
}

/** 阶段过渡页 */
function renderTransition(body) {
  const s = reviewSession.stats;
  const total = reviewSession.queue.length;
  
  rvHideProgress();
  
  body.innerHTML = `<div class="rv-transition rv-screen">
    <div class="rv-transition-icon">✓</div>
    <h2 class="rv-transition-title">词义复习完成</h2>
    <p class="rv-transition-sub">已完成 ${total} 个单词的词义复习<br>接下来进行拼写复习</p>
    <div class="rv-transition-stats">
      <div class="rv-transition-stat rv-transition-stat--known">
        <b>${s.known}</b><span>认识</span>
      </div>
      <div class="rv-transition-stat rv-transition-stat--fuzzy">
        <b>${s.fuzzy}</b><span>模糊</span>
      </div>
      <div class="rv-transition-stat rv-transition-stat--unknown">
        <b>${s.unknown}</b><span>不认识</span>
      </div>
    </div>
    <button class="rv-btn-go" id="rv-go-spell" type="button">开始拼写复习</button>
  </div>`;
}

/** Phase 2: 拼写复习 */
function renderSpell(body) {
  const word = reviewSession.current;
  const total = reviewSession.spellQueue.length;
  const sp = reviewSession.spell;
  const defHint = (senseLines(word)[0] || briefOf(word)) || "根据释义拼写单词";
  
  rvSetProgress(reviewSession.spellIdx + 1, total);
  
  const inputClass = sp.submitted && !sp.correct ? "error"
                   : sp.submitted && sp.correct ? "success" : "";
  // 状态化按钮组：未提交 [跳过+确认]；错误 [跳过+重新提交]；正确 [下一个]
  const actionsHtml = sp.submitted && sp.correct
    ? `<button class="rv-btn-next" id="spell-next" type="button">下一个</button>`
    : `<button class="rv-btn-wrong" id="spell-skip" type="button">跳过</button>
       <button class="rv-btn-next" id="spell-submit" type="button">${sp.submitted && !sp.correct ? "重新提交" : "确认"}</button>`;
  
  body.innerHTML = `<div class="rv-spell rv-screen">
    <div class="rv-stage">
      <p class="rv-spell-label">拼写复习</p>
      <button class="rv-speaker rv-speaker-sm" data-speak="${esc(word)}" aria-label="播放读音" type="button">${SPEAKER_SVG}</button>
      <p class="rv-spell-def">${esc(defHint)}</p>
      <input class="rv-spell-input ${inputClass}" 
             id="spell-input" 
             type="text" 
             placeholder="输入英文单词" 
             autocomplete="off" 
             autocapitalize="off" 
             spellcheck="false" 
             value="${esc(sp.input)}" />
      ${sp.submitted ? `<div class="rv-spell-result">
        <div class="rv-spell-result-word ${sp.correct ? 'correct' : 'wrong'}">${esc(word)}</div>
        <p class="rv-spell-result-tip">${sp.correct ? "拼写正确" : "正确拼写如上 · 请重新输入"}</p>
      </div>` : ""}
    </div>
    <div class="rv-spell-actions">
      ${actionsHtml}
    </div>
  </div>`;
  
  const input = $("#spell-input");
  if (input) {
    input.addEventListener("input", () => {
      reviewSession.spell.input = input.value;
      saveReviewSession();
      // 移除错误样式
      input.classList.remove("error");
    });
    setTimeout(() => {
      input.focus();
      if (sp.submitted && !sp.correct) {
        input.select();
      }
    }, 60);
  }
}

/** 完成页 */
function renderDone(body) {
  const s = reviewSession.stats;
  const sp = reviewSession.spellStats;
  const total = reviewSession.queue.length;
  
  rvHideProgress();
  
  body.innerHTML = `<div class="rv-done rv-screen">
    <div class="rv-done-check">✓</div>
    <h2 class="rv-done-title">今日复习完成</h2>
    <p class="rv-done-sub">共复习 ${total} 个单词</p>
    
    <div class="rv-done-stats-block">
      <p class="rv-done-section-title">词义复习</p>
      <div class="rv-done-stats">
        <div class="rv-done-stat rv-done-stat--known">
          <b>${s.known}</b><span>认识</span>
        </div>
        <div class="rv-done-stat rv-done-stat--fuzzy">
          <b>${s.fuzzy}</b><span>模糊</span>
        </div>
        <div class="rv-done-stat rv-done-stat--unknown">
          <b>${s.unknown}</b><span>不认识</span>
        </div>
      </div>
    </div>
    
    <div class="rv-done-stats-block">
      <p class="rv-done-section-title">拼写复习</p>
      <div class="rv-done-stats">
        <div class="rv-done-stat rv-done-stat--correct">
          <b>${sp.correct}</b><span>正确</span>
        </div>
        <div class="rv-done-stat rv-done-stat--wrong">
          <b>${sp.wrong + sp.skipped}</b><span>需强化</span>
        </div>
      </div>
    </div>
    
    <p class="rv-done-hint">坚持就是胜利！</p>
    <button class="rv-btn-go" id="review-done-back" type="button">返回首页</button>
  </div>`;
}

/** 用户点击判断按钮 */
function onReviewAnswer(result) {
  const word = reviewSession.current;
  const st = reviewStore.words[word];
  
  // 记录快照用于回滚
  reviewSession.snapshot = st ? JSON.parse(JSON.stringify(st)) : null;
  
  // 调用记忆曲线算法
  answerReview(word, result);
  
  // 更新会话状态
  reviewSession.lastResult = result;
  reviewSession.step = "detail";
  reviewSession.stats.n += 1;
  reviewSession.stats[result] += 1;
  saveReviewSession();
  
  rvRender(() => renderDetail($("#review-body")));
}

/** 记错了：回滚并按不认识处理 */
function reviewCorrection() {
  const word = reviewSession.current;
  if (!reviewSession.snapshot) return;
  
  reviewStore.words[word] = reviewSession.snapshot;
  reviewSession.snapshot = null;
  answerReview(word, "unknown");
  
  const prev = reviewSession.lastResult;
  if (prev && reviewSession.stats[prev] > 0) reviewSession.stats[prev] -= 1;
  reviewSession.stats.unknown += 1;
  reviewSession.lastResult = "unknown";
  saveReviewSession();
  
  rvRender(() => renderDetail($("#review-body")));
}

/** 进入下一个词或过渡页 */
function reviewNext() {
  ttsStop();
  reviewSession.idx += 1;
  reviewSession.step = "answer";
  reviewSession.lastResult = null;
  reviewSession.snapshot = null;
  saveReviewSession();
  renderReviewByPhase();
}

/** 进入拼写阶段 */
function goToSpellPhase() {
  // 初始化拼写队列（随机打乱）
  reviewSession.spellQueue = shuffleArray(reviewSession.queue.slice());
  reviewSession.spellIdx = 0;
  reviewSession.phase = "spell";
  reviewSession.spell = { submitted: false, correct: false, input: "" };
  saveReviewSession();
  renderReviewByPhase();
}

/** 提交拼写 */
function submitSpell() {
  const word = reviewSession.current;
  const input = $("#spell-input");
  const v = (input ? input.value : reviewSession.spell.input).trim().toLowerCase();
  
  reviewSession.spell.input = v;
  reviewSession.spell.submitted = true;
  reviewSession.spell.correct = (v === word);
  
  if (reviewSession.spell.correct) {
    reviewSession.spellStats.correct += 1;
  } else {
    reviewSession.spellStats.wrong += 1;
  }
  
  saveReviewSession();
  rvRender(() => renderSpell($("#review-body")));
}

/** 跳过拼写 */
function skipSpell() {
  reviewSession.spellStats.skipped += 1;
  reviewSession.spellIdx += 1;
  reviewSession.spell = { submitted: false, correct: false, input: "" };
  saveReviewSession();
  renderReviewByPhase();
}

/** 拼写正确后进入下一个 */
function spellNext() {
  if (reviewSession.spell.correct) {
    reviewSession.spellIdx += 1;
    reviewSession.spell = { submitted: false, correct: false, input: "" };
    saveReviewSession();
  }
  renderReviewByPhase();
}

/* ============================================================
   番茄钟（专注计时）
   - 时间戳驱动：剩余 = 目标结束时间 - 当前时间，切后台/调度延迟不漂移
   - 暂停保存剩余值，继续从原值倒计时
   - Web Audio 合成提示音（本地生成，无网络依赖），阶段切换各播一次
   - 完成记录持久化（专注完成 / 专注时长 / 对应任务 / 完成时间）
   ============================================================ */
const POMO_KEY = "vc-pomo-records";
const POMO_PRESETS = [
  { id: "standard", name: "标准专注", focus: 25, rest: 5 },
  { id: "deep", name: "深度专注", focus: 50, rest: 10 },
  { id: "short", name: "短时专注", focus: 15, rest: 3 },
  { id: "custom", name: "自定义", focus: 25, rest: 5 },
];
let pomoRecords = [];
let pomoPresetSel = "standard";

let pomo = {
  running: false,     // 是否运行中
  paused: false,      // 是否暂停
  phase: "focus",     // focus 专注 | rest 休息
  endAt: 0,           // 目标结束时间戳
  remainMs: 0,        // 暂停时保存的剩余毫秒
  focusMin: 25, restMin: 5,
  task: "",
  timer: null,        // setInterval 句柄
};

function loadPomo() {
  try {
    pomoRecords = JSON.parse(localStorage.getItem(POMO_KEY) || "[]");
    if (!Array.isArray(pomoRecords)) pomoRecords = [];
  } catch (_) { pomoRecords = []; }
}
function savePomo() {
  try { localStorage.setItem(POMO_KEY, JSON.stringify(pomoRecords)); } catch (_) {}
}

function pomoStatsToday() {
  const day = vocabDay();
  const p = (n) => String(n).padStart(2, "0");
  const list = pomoRecords.filter((r) => {
    const d = new Date(r.endedAt - 4 * 3600 * 1000);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` === day;
  });
  return { count: list.length, minutes: list.reduce((s, r) => s + (r.duration || 0), 0) };
}

function renderPomoEntry() {
  const el = $("#pomo-count");
  if (!el) return;
  const s = pomoStatsToday();
  el.textContent = `专注学习 · 今日 ${s.count} 个番茄 · ${s.minutes} 分钟`;
}

/* ---------- 任务模块渲染 ---------- */

/** 首页任务入口卡片：今日任务完成情况 */
function renderTasksEntry() {
  const el = $("#tasks-count");
  if (!el) return;
  const ts = todayTasks();
  if (ts.length === 0) {
    el.textContent = "暂无任务 · 点击添加";
    el.classList.add("muted");
  } else {
    el.textContent = `${todayDoneCount()} / ${ts.length} 已完成`;
    el.classList.remove("muted");
  }
}

/** 首页昨日任务反馈条（昨天有任务才显示；语气积极轻量） */
function renderHomeFeedback() {
  const el = $("#tasks-feedback");
  if (!el) return;
  const fb = yesterdayFeedback();
  if (!fb) { el.style.display = "none"; return; }
  el.style.display = "";
  el.innerHTML = `<span class="feedback-dot ${fb.ok ? "ok" : ""}"></span><span>${esc(fb.text)}</span>`;
}

/** 任务主页渲染（今日任务 / 目标 / 奖励） */
function renderTasks() {
  const body = $("#tasks-body");
  if (!body) return;
  const day = vocabDay();
  const ts = todayTasks();
  const goalSel = taskStore.goals;
  const rewardList = taskStore.rewards;
  const goalOf = (gid) => goalSel.find((g) => g.id === gid);
  const rewardOf = (rid) => rewardList.find((r) => r.id === rid);

  // 今日任务
  const taskRows = ts.map((t, i) => {
    const done = isTaskDone(t.id, day);
    const tag = t.kind === "daily" ? "每日" : "单日";
    const g = t.goalId ? goalOf(t.goalId) : null;
    const r = t.rewardId ? rewardOf(t.rewardId) : null;
    const sub = [g ? `目标：${g.name}` : "", r ? `奖励：${r.content}` : ""].filter(Boolean).join(" · ");
    return `<li class="task-row ${done ? "done" : ""}" style="animation-delay:${i * 30}ms">
      <button class="task-check ${done ? "checked" : ""}" data-task="${esc(t.id)}" aria-label="完成/取消" type="button">${done ? "✓" : ""}</button>
      <span class="row-main">
        <p class="task-name">${esc(t.name)}</p>
        ${sub ? `<p class="task-sub">${esc(sub)}</p>` : ""}
      </span>
      <span class="task-tag ${t.kind === "daily" ? "tag-daily" : "tag-onetime"}">${tag}</span>
      <button class="task-del" data-del-task="${esc(t.id)}" aria-label="删除任务" type="button">${TRASH_SVG}</button>
    </li>`;
  }).join("");

  body.innerHTML = `
    <section class="task-section">
      <div class="task-section-head">
        <p class="section-eyebrow">今日任务</p>
        <button class="task-add-mini" data-newtab="task" type="button">＋ 新建</button>
      </div>
      ${ts.length
        ? `<ul class="task-list">${taskRows}</ul>
           ${todayAllDone() ? `<p class="task-all-done">今日任务全部完成 ✓</p>` : ""}`
        : ""}
    </section>

    <section class="task-section">
      <div class="task-section-head">
        <p class="section-eyebrow">目标</p>
        <button class="task-add-mini" data-newtab="goal" type="button">＋ 新建</button>
      </div>
      ${goalSel.length
        ? `<ul class="goal-list">${goalSel.map((g, i) => {
            const p = goalProgress(g.id);
            const dueTxt = g.due ? `截止 ${fmtDayCN(g.due)}` : "无期限";
            const remain = g.due ? daysUntil(g.due) : null;
            return `<li class="goal-row" style="animation-delay:${i * 30}ms">
              <span class="goal-dot"></span>
              <span class="row-main">
                <p class="goal-name">${esc(g.name)}</p>
                <p class="task-sub">${dueTxt}${remain !== null ? ` · 还剩 ${Math.max(0, remain)} 天` : ""}${p.total ? ` · 今日 ${p.done}/${p.total}` : ""}</p>
              </span>
              <button class="task-del" data-del-goal="${esc(g.id)}" aria-label="删除目标" type="button">${TRASH_SVG}</button>
            </li>`;
          }).join("")}</ul>`
        : `<div class="empty-state" style="padding:20px 0">还没有目标<br><span>设立一个长期目标，让坚持更有方向</span></div>`}
    </section>

    <section class="task-section">
      <div class="task-section-head">
        <p class="section-eyebrow">奖励</p>
        <button class="task-add-mini" data-newtab="reward" type="button">＋ 新建</button>
      </div>
      ${rewardList.length
        ? `<ul class="reward-list">${rewardList.map((r, i) => {
            const cond = r.trigger === "goal" && r.goalId
              ? `达成目标「${goalOf(r.goalId) ? goalOf(r.goalId).name : "已删除"}」后`
              : "完成今天全部任务后";
            return `<li class="reward-row" style="animation-delay:${i * 30}ms">
              <span class="reward-icon">🎯</span>
              <span class="row-main">
                <p class="reward-content">${esc(r.content)}</p>
                <p class="task-sub">${esc(cond)}触发</p>
              </span>
              <button class="task-del" data-del-reward="${esc(r.id)}" aria-label="删除奖励" type="button">${TRASH_SVG}</button>
            </li>`;
          }).join("")}</ul>`
        : `<div class="empty-state" style="padding:20px 0">还没有奖励<br><span>给自己设个小奖励，完成任务更有动力</span></div>`}
    </section>

    <div class="task-form-panel" id="task-form-panel" style="display:none">
      ${taskFormHTML()}
    </div>

    <button class="primary-btn task-new-btn" id="task-new-btn" type="button">＋ 新建任务 / 目标 / 奖励</button>`;
}

/** 日期字符串 → "10月1日" */
function fmtDayCN(dayStr) {
  const [y, m, d] = String(dayStr).split("-").map(Number);
  return `${m}月${d}日`;
}
/** 距今业务日数 */
function daysUntil(dayStr) {
  const [y, m, d] = String(dayStr).split("-").map(Number);
  const target = new Date(y, m - 1, d, 12).getTime();
  return Math.round((target - Date.now()) / 86400000);
}

/** 创建表单 HTML（task/goal/reward 三 tab，右上角 × 关闭） */
function taskFormHTML() {
  const goalOpts = taskStore.goals.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("");
  const today = bizDayStr(0);
  return `<div class="task-form-head">
    <span class="task-form-title">新建</span>
    <button class="task-form-close" id="tf-close" aria-label="关闭" type="button">×</button>
  </div>
  <div class="task-form-tabs">
    <button class="task-form-tab ${taskFormTab === "task" ? "on" : ""}" data-formtab="task" type="button">任务</button>
    <button class="task-form-tab ${taskFormTab === "goal" ? "on" : ""}" data-formtab="goal" type="button">目标</button>
    <button class="task-form-tab ${taskFormTab === "reward" ? "on" : ""}" data-formtab="reward" type="button">奖励</button>
  </div>
  ${taskFormTab === "task" ? `
    <div class="task-form task-form-task">
      <label class="task-field"><span>任务名称</span><input id="tf-name" type="text" placeholder="输入任务名称" maxlength="40" /></label>
      <label class="task-field"><span>类型</span>
        <select id="tf-kind">
          <option value="daily">每日固定任务（每天自动生成）</option>
          <option value="onetime">单日任务（只在指定日期出现）</option>
        </select>
      </label>
      <label class="task-field" id="tf-date-wrap" style="display:none"><span>日期</span><input id="tf-date" type="date" value="${today}" min="${bizDayStr(0)}" /></label>
      <div id="tf-range-wrap">
        <label class="task-field"><span>开始日期</span><input id="tf-start" type="date" value="${today}" min="${bizDayStr(0)}" /></label>
        <label class="task-field"><span>结束日期（可选）</span><input id="tf-end" type="date" min="${bizDayStr(0)}" /></label>
        <p class="task-field-hint">结束日期留空 = 长期有效；结束后每日任务不再生成</p>
      </div>
      <label class="task-field"><span>关联目标（可选）</span>
        <select id="tf-goal"><option value="">不关联</option>${goalOpts}</select>
      </label>
      <button class="primary-btn" id="tf-save-task" type="button">保存任务</button>
    </div>` : taskFormTab === "goal" ? `
    <div class="task-form task-form-goal">
      <label class="task-field"><span>目标名称</span><input id="gf-name" type="text" placeholder="输入目标名称" maxlength="50" /></label>
      <label class="task-field"><span>截止日期（可选）</span><input id="gf-due" type="date" min="${bizDayStr(0)}" /></label>
      <button class="primary-btn" id="gf-save" type="button">保存目标</button>
    </div>` : `
    <div class="task-form task-form-reward">
      <label class="task-field"><span>奖励内容</span><input id="rf-content" type="text" placeholder="输入奖励内容" maxlength="60" /></label>
      <label class="task-field"><span>触发条件</span>
        <select id="rf-trigger">
          <option value="daily-all">完成今天全部任务后</option>
          <option value="goal">达成指定目标后</option>
        </select>
      </label>
      <label class="task-field" id="rf-goal-wrap" style="display:none"><span>关联目标</span>
        <select id="rf-goal">${goalOpts || `<option value="">（请先创建目标）</option>`}</select>
      </label>
      <button class="primary-btn" id="rf-save" type="button">保存奖励</button>
    </div>`}`;
}

/** 坚持看板：当前浏览的月份（{y, m}），null = 当月；支持上/下月切换与点击日期查看 */
let habitsYM = null;
/** 看板当前选中的日期（与下方任务详情实时联动；进入看板默认选中今天） */
let habitsSelDay = null;

function habitsMonthBase() {
  const now = new Date(Date.now() - 4 * 3600 * 1000); // 当前业务日
  return habitsYM ? { y: habitsYM.y, m: habitsYM.m } : { y: now.getFullYear(), m: now.getMonth() };
}

function habitsShift(delta) {
  const { y, m } = habitsMonthBase();
  const d = new Date(y, m + delta, 1);
  habitsYM = { y: d.getFullYear(), m: d.getMonth() };
  renderHabits();
}

function habitsGoToday() {
  habitsYM = null;
  renderHabits();
}

/** 点击月份标题 → 展开/收起快捷年月选择 */
function toggleCalPicker() {
  const el = $("#cal-picker");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "flex" : "none";
}

/** 点击/默认选中某天 → 更新选中态并显示当天任务/打卡详情（与日历实时联动） */
function showHabitDay(dayStr) {
  habitsSelDay = dayStr;
  const cells = $$(".cal-cell[data-day]");
  cells.forEach((c) => c.classList.toggle("selected", c.dataset.day === dayStr));
  const el = $("#habit-day-detail");
  if (!el) return;
  const ts = tasksOfDay(dayStr);
  const all = ts.length > 0 && ts.every((t) => isTaskDone(t.id, dayStr));
  const done = ts.filter((t) => isTaskDone(t.id, dayStr)).length;
  el.innerHTML = `<p class="habit-day-title">${fmtDayCN(dayStr)} · ${ts.length ? `${done}/${ts.length} 完成${all ? " ✓" : ""}` : "当天无任务"}</p>
    ${ts.length ? `<ul class="habit-day-list">${ts.map((t) => `<li class="${isTaskDone(t.id, dayStr) ? "done" : ""}">${esc(t.name)}</li>`).join("")}</ul>` : ""}`;
  el.style.display = "block";
}

/** 坚持看板渲染（连续天数 / 最长 / 已完成 / 可切换月份日历 / 目标日期标记 / 点击日期查看） */
function renderHabits() {
  const body = $("#habits-body");
  if (!body) return;
  const cur = currentStreak();
  const best = bestStreak();
  const total = totalDoneDays();
  const { y: year, m: month } = habitsMonthBase();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 周一开头
  const dim = new Date(year, month + 1, 0).getDate();
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
  const todayStr = vocabDay();
  /* 目标截止日期集合（日历上圆圈标记，随月份切换同步更新） */
  const dueSet = new Set(taskStore.goals.filter((g) => g.due).map((g) => g.due));

  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal-cell blank"></span>`;
  for (let d = 1; d <= dim; d++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const ts = tasksOfDay(dayStr);
    const all = ts.length > 0 && ts.every((t) => isTaskDone(t.id, dayStr));
    const any = ts.length > 0;
    const cls = any ? (all ? "full" : "part") : "none";
    const isToday = dayStr === todayStr;
    const isDue = dueSet.has(dayStr);
    const isSel = dayStr === habitsSelDay;
    cells += `<button class="cal-cell ${cls}${isToday ? " today" : ""}${isDue ? " due" : ""}${isSel ? " selected" : ""}" data-day="${dayStr}" title="${dayStr}${isDue ? "（目标截止）" : ""}" type="button">
      <span class="cal-num">${all ? "✓" : d}</span>
      ${isToday ? `<span class="cal-today-label">今天</span>` : ""}
    </button>`;
  }

  // 目标列表（含截止日期 → 圆圈重点标记）
  const goalRows = taskStore.goals.length
    ? `<ul class="habit-goals">${taskStore.goals.map((g) => {
        const p = goalProgress(g.id);
        const remain = g.due ? daysUntil(g.due) : null;
        return `<li class="habit-goal">
          <span class="row-main">
            <p class="goal-name">${esc(g.name)}</p>
            <p class="task-sub">${g.due
              ? `截止 ${fmtDayCN(g.due)} · 还剩 ${Math.max(0, remain)} 天`
              : "无期限目标"}${p.total ? ` · 今日任务 ${p.done}/${p.total}` : ""}</p>
          </span>
          ${g.due ? `<span class="goal-ring">${fmtDayCN(g.due)}</span>` : ""}
        </li>`;
      }).join("")}</ul>`
    : `<div class="empty-state" style="padding:20px 0">暂无目标</div>`;

  /* 快捷年月选择器选项（当前浏览年 ±6） */
  const curY = new Date(Date.now() - 4 * 3600 * 1000).getFullYear();
  const yearOpts = Array.from({ length: 13 }, (_, i) => curY - 6 + i)
    .map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y} 年</option>`).join("");
  const monthOpts = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}"${m === month + 1 ? " selected" : ""}>${m} 月</option>`).join("");

  body.innerHTML = `
    <section class="habit-stats">
      <div class="habit-stat"><b>${cur}</b><span>当前连续<br>天数</span></div>
      <div class="habit-stat"><b>${best}</b><span>历史最长<br>连续</span></div>
      <div class="habit-stat"><b>${total}</b><span>已完成<br>天数</span></div>
    </section>

    <section class="task-section">
      <div class="task-section-head">
        <div class="cal-nav">
          <button class="cal-nav-btn" data-nav="prev" aria-label="上个月" type="button">‹</button>
          <button class="cal-title" id="cal-title" data-nav="pick" type="button">${year} 年 ${month + 1} 月</button>
          <button class="cal-nav-btn" data-nav="next" aria-label="下个月" type="button">›</button>
        </div>
      </div>
      <div class="cal-week">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <p class="cal-legend">✓ 全部完成 · ○ 部分完成</p>
      <div class="cal-picker" id="cal-picker" style="display:none">
        <span class="cal-picker-label">快捷跳转</span>
        <select id="cal-picker-year" aria-label="选择年份">${yearOpts}</select>
        <span class="cal-picker-word">年</span>
        <select id="cal-picker-month" aria-label="选择月份">${monthOpts}</select>
        <span class="cal-picker-word">月</span>
      </div>
      <div class="habit-day-detail" id="habit-day-detail" style="display:none"></div>
    </section>

    <section class="task-section">
      <div class="task-section-head"><p class="section-eyebrow">目标进度</p></div>
      ${goalRows}
    </section>`;

  /* 快捷选择年月 → 立即切换日历（change 即跳转，无需确定按钮） */
  const py = $("#cal-picker-year"), pm = $("#cal-picker-month");
  if (py && pm) {
    py.onchange = () => {
      habitsYM = { y: Number(py.value), m: Number(pm.value) - 1 };
      renderHabits();
    };
    pm.onchange = () => {
      habitsYM = { y: Number(py.value), m: Number(pm.value) - 1 };
      renderHabits();
    };
  }

  /* 默认选中：当月 → 今天（进入看板直接显示当天任务，无需点击）；其他月 → 该月 1 号 */
  const pad2 = (n) => String(n).padStart(2, "0");
  const monthPrefix = `${year}-${pad2(month + 1)}`;
  if (!habitsSelDay || !habitsSelDay.startsWith(monthPrefix)) {
    habitsSelDay = monthPrefix === todayStr.slice(0, 7) ? todayStr : `${monthPrefix}-01`;
  }
  showHabitDay(habitsSelDay);
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function fmtMMSS(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = (n) => String(n).padStart(2, "0");
  return p(Math.floor(s / 60)) + ":" + p(s % 60);
}

/* 提示音：Web Audio 合成柔和双音（本地生成，柔和不刺耳；每个结束事件只播一次） */
let pomoAudioCtx = null;
function pomoBeep() {
  try {
    pomoAudioCtx = pomoAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (pomoAudioCtx.state === "suspended") pomoAudioCtx.resume();
    const t0 = pomoAudioCtx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = pomoAudioCtx.createOscillator();
      const gain = pomoAudioCtx.createGain();
      const off = i * 0.3;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + off);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + off + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.4);
      osc.connect(gain).connect(pomoAudioCtx.destination);
      osc.start(t0 + off);
      osc.stop(t0 + off + 0.45);
    });
  } catch (_) { /* 无音频环境静默 */ }
}

/* ---------- 配置视图 ---------- */

function openPomo() {
  rolloverIfNeeded();
  renderAll();
  switchTab("pomo");
  renderPomoConfig();
}

function renderPomoConfig() {
  const body = $("#pomo-body");
  const stats = pomoStatsToday();
  const cur = POMO_PRESETS.find((p) => p.id === pomoPresetSel) || POMO_PRESETS[0];
  body.innerHTML = `<div class="pomo-presets">
      ${POMO_PRESETS.map((p) => `
        <button class="pomo-preset ${p.id === pomoPresetSel ? "active" : ""}" data-preset="${p.id}" type="button">
          <p class="pomo-preset-name">${esc(p.name)}</p>
          <p class="pomo-preset-time">${p.focus} 分钟专注 · ${p.rest} 分钟休息</p>
        </button>`).join("")}
    </div>
    <div class="pomo-custom">
      <div class="pomo-field">
        <label>专注（分钟）</label>
        <input id="pomo-focus-min" type="number" inputmode="numeric" min="1" max="180" value="${pomoPresetSel === "custom" ? pomo.focusMin : cur.focus}" />
      </div>
      <div class="pomo-field">
        <label>休息（分钟）</label>
        <input id="pomo-rest-min" type="number" inputmode="numeric" min="0" max="60" value="${pomoPresetSel === "custom" ? pomo.restMin : cur.rest}" />
      </div>
    </div>
    <div class="pomo-task">
      <label>当前任务（可选）</label>
      <input id="pomo-task" type="text" placeholder="输入任务名称" value="${esc(pomo.task)}" />
    </div>
    ${stats.count > 0 ? `<p class="pomo-stats">今日已完成 <b>${stats.count}</b> 个番茄 · 累计 <b>${stats.minutes}</b> 分钟</p>` : ""}
    <button class="primary-btn pomo-start" id="pomo-start" type="button">开始专注</button>`;
  $$(".pomo-preset", body).forEach((b) => b.addEventListener("click", () => {
    pomoPresetSel = b.dataset.preset;
    const p = POMO_PRESETS.find((x) => x.id === pomoPresetSel);
    $("#pomo-focus-min").value = p.focus;
    $("#pomo-rest-min").value = p.rest;
    renderPomoConfig();
  }));
  ["focus-min", "rest-min"].forEach((id) => {
    const el = $("#pomo-" + id);
    el.addEventListener("input", () => {
      pomoPresetSel = "custom"; // 手动修改时长 → 视为自定义
      $$(".pomo-preset", body).forEach((b) => b.classList.toggle("active", b.dataset.preset === "custom"));
    });
  });
  $("#pomo-task").addEventListener("input", (e) => { pomo.task = e.target.value.trim(); });
  $("#pomo-start").addEventListener("click", startPomo);
}

/* ---------- 运行视图（沉浸式全屏） ---------- */

/** 切换沉浸式全屏（隐藏状态栏/导航栏），Web 预览环境静默跳过 */
function setImmersive(on) {
  try {
    if (typeof window.AndroidBridge !== "undefined" && window.AndroidBridge.setImmersive) {
      window.AndroidBridge.setImmersive(on);
    }
  } catch (_) { /* 无桥接环境忽略 */ }
}

function startPomo() {
  pomo.presetId = pomoPresetSel;
  pomo.focusMin = clampInt($("#pomo-focus-min").value, 1, 180);
  pomo.restMin = clampInt($("#pomo-rest-min").value, 0, 60);
  pomo.task = $("#pomo-task").value.trim();
  pomo.phase = "focus";
  pomo.paused = false;
  pomo.endAt = Date.now() + pomo.focusMin * 60000;
  pomo.running = true;
  setImmersive(true); // 进入沉浸式全屏：隐藏状态栏/导航栏
  startPomoTimer();
  renderPomoRun();
}

function renderPomoRun() {
  const remain = pomo.paused ? pomo.remainMs : Math.max(0, pomo.endAt - Date.now());
  const body = $("#pomo-body");
  body.innerHTML = `<div class="pomo-full">
    <div class="pomo-center">
      <p class="pomo-phase">${pomo.phase === "focus" ? "专注中" : "休息中"}</p>
      ${pomo.task ? `<p class="pomo-task-label">${esc(pomo.task)}</p>` : ""}
      <p class="pomo-time" id="pomo-time">${fmtMMSS(remain)}</p>
      <div class="pomo-actions">
        <button class="pomo-btn pomo-btn-pause" id="pomo-pause" type="button">${pomo.paused ? "继续" : "暂停"}</button>
        <button class="pomo-btn pomo-btn-close" id="pomo-close" type="button">关闭</button>
      </div>
    </div>
  </div>`;
  $("#pomo-pause").addEventListener("click", togglePomoPause);
  $("#pomo-close").addEventListener("click", confirmPomoClose);
}

function startPomoTimer() {
  stopPomoTimer();
  pomo.timer = setInterval(pomoTick, 250); // 高频 tick + 时间戳计算 → 不漂移
}
function stopPomoTimer() {
  if (pomo.timer) { clearInterval(pomo.timer); pomo.timer = null; }
}

function pomoTick() {
  if (!pomo.running || pomo.paused) return;
  const remain = pomo.endAt - Date.now();
  if (remain <= 0) { pomoPhaseEnd(); return; }
  const el = $("#pomo-time");
  if (el) el.textContent = fmtMMSS(remain);
}

function pomoPhaseEnd() {
  if (pomo.phase === "focus") {
    pomoRecords.push({ task: pomo.task, duration: pomo.focusMin, endedAt: Date.now() }); // 专注完成记录
    savePomo();
    pomoBeep();
    if (pomo.restMin > 0) {
      pomo.phase = "rest";
      pomo.endAt = Date.now() + pomo.restMin * 60000;
      showToast("放松时间到");
    } else {
      pomo.phase = "focus"; // 无休息 → 直接下一轮专注
      pomo.endAt = Date.now() + pomo.focusMin * 60000;
      showToast("继续学习吧");
    }
  } else {
    pomoBeep();
    pomo.phase = "focus";
    pomo.endAt = Date.now() + pomo.focusMin * 60000;
    showToast("继续学习吧");
  }
  renderPomoRun();
}

function togglePomoPause() {
  if (!pomo.running) return;
  if (pomo.paused) {
    pomo.paused = false;
    pomo.endAt = Date.now() + pomo.remainMs; // 从原剩余继续
  } else {
    pomo.paused = true;
    pomo.remainMs = Math.max(0, pomo.endAt - Date.now()); // 保持当前数值
  }
  renderPomoRun();
}

/** 关闭确认层：继续专注 / 结束（结束不记录未完成的专注） */
function confirmPomoClose() {
  if (!pomo.running) return;
  const body = $("#pomo-body");
  body.innerHTML = `<div class="pomo-full">
    <div class="pomo-center">
      <p class="pomo-phase">结束当前番茄钟？</p>
      <p class="pomo-task-label">本次专注不会被记录</p>
      <div class="pomo-actions">
        <button class="pomo-btn pomo-btn-close" id="pomo-confirm-no" type="button">继续专注</button>
        <button class="pomo-btn pomo-btn-pause" id="pomo-confirm-yes" type="button">结束</button>
      </div>
    </div>
  </div>`;
  $("#pomo-confirm-no").addEventListener("click", renderPomoRun); // 计时器在确认期间继续运行
  $("#pomo-confirm-yes").addEventListener("click", pomoClose);
}

function pomoClose() {
  stopPomoTimer();
  pomo.running = false;
  pomo.paused = false;
  setImmersive(false); // 退出沉浸式全屏，恢复状态栏/导航栏
  renderAll();
  renderPomoConfig();
}

/* ================= 待办任务 / 目标 / 奖励 / 打卡 =================
   数据模型（vc-tasks）：
   {
     daily:   [ { id, name, goalId|null, rewardId|null, createdAt } ],          // 每日固定任务（每天自动生成）
     onetime: [ { id, name, date:"YYYY-MM-DD", goalId|null, rewardId|null, createdAt } ], // 单日任务
     goals:   [ { id, name, due:"YYYY-MM-DD"|null, createdAt } ],               // 长期目标（due 可选）
     rewards: [ { id, content, trigger:"daily-all"|"goal", goalId|null, createdAt } ],   // 奖励（用户自定义）
     checkins:{ "YYYY-MM-DD": [taskId...] }                                      // 每日完成打卡
   }
   番茄钟预留：任务对象含稳定 id，后续可加 pomoMinutes/taskId 关联专注记录（本期仅数据结构预留）。 */

const TASKS_KEY = "vc-tasks";
let taskStore = { daily: [], onetime: [], goals: [], rewards: [], checkins: {} };
let taskFormTab = "task"; // 创建面板当前表单：task | goal | reward

function loadTasks() {
  try {
    const s = JSON.parse(localStorage.getItem(TASKS_KEY) || "null");
    if (s && Array.isArray(s.daily)) taskStore = s;
    else taskStore = { daily: [], onetime: [], goals: [], rewards: [], checkins: {} };
  } catch (_) { taskStore = { daily: [], onetime: [], goals: [], rewards: [], checkins: {} }; }
}
function saveTasks() {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(taskStore)); } catch (_) {}
}
function taskUid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 时间戳 → 所在业务日字符串（YYYY-MM-DD，04:00 为业务日边界） */
function bizDayOf(ts) {
  const d = new Date((ts || 0) - 4 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 每日任务在指定业务日是否可见：
    ① 生效区间 [startAt, endAt]（startAt 缺省 = 创建所在业务日；endAt 空 = 不限）
    ② 软删除后：删除日之前的历史日期仍可见（完成记录保留），删除日当天视删除时完成状态决定，之后不再生成 */
function dailyVisibleOn(t, day) {
  const start = t.startAt || bizDayOf(t.createdAt);
  if (day < start) return false;
  if (t.endAt && day > t.endAt) return false;
  if (t.deletedAt) {
    const delDay = t.deleteDay || bizDayOf(t.deletedAt);
    if (day > delDay) return false;
    if (day === delDay && !t.keepDeletedDay) return false; // 删除当天未完成 → 立即从当日待办消失
  }
  return true;
}

/** 某业务日的任务集合：
    每日任务按生效区间 + 软删除状态过滤；单日任务按 date 精确匹配 */
function tasksOfDay(day) {
  return [
    ...taskStore.daily
      .filter((t) => dailyVisibleOn(t, day))
      .map((t) => ({ ...t, kind: "daily" })),
    ...taskStore.onetime.filter((t) => t.date === day).map((t) => ({ ...t, kind: "onetime" })),
  ];
}
/** 今日任务 */
function todayTasks() { return tasksOfDay(vocabDay()); }
function doneIdsOn(day) { return taskStore.checkins[day] || []; }
function isTaskDone(taskId, day) { return doneIdsOn(day).indexOf(taskId) !== -1; }

/** 切换完成状态（今日） */
function toggleTaskDone(taskId) {
  const day = vocabDay();
  taskStore.checkins[day] = taskStore.checkins[day] || [];
  const arr = taskStore.checkins[day];
  const i = arr.indexOf(taskId);
  if (i >= 0) arr.splice(i, 1); else arr.push(taskId);
  saveTasks();
  renderAll();
}
function todayDoneCount() { return todayTasks().filter((t) => isTaskDone(t.id, vocabDay())).length; }
/** 今日全部完成（有任务且全部打卡） */
function todayAllDone() {
  const ts = todayTasks();
  return ts.length > 0 && ts.every((t) => isTaskDone(t.id, vocabDay()));
}
/** 某业务日是否全部完成（坚持打卡成功日） */
function dayAllDone(day) {
  const ts = tasksOfDay(day);
  return ts.length > 0 && ts.every((t) => isTaskDone(t.id, day));
}

/** 业务日期字符串（偏移 N 个业务日） */
function bizDayStr(offset, now = Date.now()) {
  const d = new Date(now - 4 * 3600 * 1000);
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 昨日任务反馈（昨天无任务 → null；全完成 → 表扬；有未完成 → 积极鼓励） */
function yesterdayFeedback() {
  const yday = bizDayStr(-1);
  const ts = tasksOfDay(yday);
  if (ts.length === 0) return null;
  const all = ts.every((t) => isTaskDone(t.id, yday));
  return all
    ? { ok: true, text: "昨日任务都完成啦，太棒了！" }
    : { ok: false, text: "昨日任务未完成，下次要加油哦！" };
}

/** 连续打卡天数（从某业务日往前连续全部完成） */
function streakFrom(dayStr) {
  let n = 0;
  let d = new Date(String(dayStr).split("-").map(Number)[0], String(dayStr).split("-").map(Number)[1] - 1, String(dayStr).split("-").map(Number)[2], 12);
  while (true) {
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dayAllDone(day)) { n += 1; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
function currentStreak() { return streakFrom(vocabDay()); }

/** 历史最长连续打卡（扫描全部有记录的日期） */
function bestStreak() {
  const days = Object.keys(taskStore.checkins).filter(dayAllDone).sort();
  let best = 0, cur = 0, prev = null;
  for (const day of days) {
    const [y, m, dd] = day.split("-").map(Number);
    const ts = new Date(y, m - 1, dd, 12).getTime();
    if (prev !== null && ts - prev === 86400000) cur += 1; else cur = 1;
    if (cur > best) best = cur;
    prev = ts;
  }
  return best;
}
function totalDoneDays() { return Object.keys(taskStore.checkins).filter(dayAllDone).length; }

/* ---------- 创建任务 / 目标 / 奖励 ---------- */

/** 新增每日固定任务：startAt/endAt 为生效区间（YYYY-MM-DD，endAt 空 = 不限截止） */
function addDailyTask(name, goalId, rewardId, startAt, endAt) {
  taskStore.daily.push({ id: taskUid("d"), name, goalId: goalId || null, rewardId: rewardId || null, startAt: startAt || null, endAt: endAt || null, createdAt: Date.now() });
  saveTasks();
}
function addOneTimeTask(name, date, goalId, rewardId) {
  taskStore.onetime.push({ id: taskUid("o"), name, date, goalId: goalId || null, rewardId: rewardId || null, createdAt: Date.now() });
  saveTasks();
}
/** 删除任务：
    每日任务 → 软删除（只停止未来生成；删除日前的完成记录保留；删除当天视当时是否已完成：
    未完成则立即从当日待办消失，已完成则保留当日完成状态；次日不再生成）。
    单日任务 → 直接移除（已完成记录随任务移除）。 */
function deleteTask(taskId) {
  const d = taskStore.daily.find((t) => t.id === taskId);
  if (d) {
    d.deletedAt = Date.now();
    d.deleteDay = vocabDay();
    d.keepDeletedDay = isTaskDone(taskId, vocabDay()); // 删除时当天已完成 → 当天保留完成状态
    saveTasks();
    renderAll();
    return;
  }
  taskStore.onetime = taskStore.onetime.filter((t) => t.id !== taskId);
  saveTasks();
  renderAll();
}
function addGoal(name, due) {
  taskStore.goals.push({ id: taskUid("g"), name, due: due || null, createdAt: Date.now() });
  saveTasks();
}
function deleteGoal(goalId) {
  taskStore.goals = taskStore.goals.filter((g) => g.id !== goalId);
  saveTasks();
  renderAll();
}
/** 目标进度：关联任务完成度（已软删除的每日任务不再计入） */
function goalProgress(goalId) {
  const ts = taskStore.daily.filter((t) => t.goalId === goalId && !t.deletedAt);
  const done = ts.filter((t) => isTaskDone(t.id, vocabDay())).length;
  return { total: ts.length, done };
}
function addReward(content, trigger, goalId) {
  taskStore.rewards.push({ id: taskUid("r"), content, trigger, goalId: goalId || null, createdAt: Date.now() });
  saveTasks();
}
function deleteReward(rewardId) {
  taskStore.rewards = taskStore.rewards.filter((r) => r.id !== rewardId);
  saveTasks();
  renderAll();
}

/* ---------- 渲染 ---------- */

function renderReviewEntry() {
  const n = reviewQueue().length;
  const el = $("#review-count");
  if (!el) return;
  el.textContent = n > 0 ? String(n) : "今日无需复习";
  el.classList.toggle("muted", n === 0);
}

/** 统计数字轻反馈：值变化时弹跳一次（首次渲染与值不变时不触发） */
function bumpStat(el, val) {
  if (!el) return;
  const s = String(val);
  if (el.textContent === s) return;
  const first = el.textContent === "";
  el.textContent = s;
  if (first) return;
  el.classList.remove("bump");
  void el.offsetWidth; // 重启动画
  el.classList.add("bump");
}

function renderHome() {
  const list = todayWords();
  bumpStat($("#stat-new"), statNew());
  bumpStat($("#stat-queries"), statQueries());
  renderReviewEntry();
  renderPomoEntry();
  renderTasksEntry();
  renderHomeFeedback();
  const el = $("#home-word-list");
  el.innerHTML = list.length
    ? list.slice(0, 4).map((w, i) => `
        <li><button class="word-item" data-word="${esc(w)}" data-review="1" style="animation-delay:${i * 40}ms" type="button">
          <span class="row-main">
            <p class="word-line"><span class="word">${wordHTML(w, wordMeta(w).total)}</span></p>
            <p class="word-meaning">${esc(briefOf(w))}</p>
          </span>
          <span class="speaker-btn" data-speak="${esc(w)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
        </button></li>`).join("")
    : `<li class="empty-state">今天还没有遇到生词<br><span>搜索单词开始记录</span></li>`;
}

/* 生词页视图：today = 今日生词（每日 04:00 重置）；starred = 历史生词（生词本，永久） */
let wordsView = "today";

function renderWords() {
  const seg = $("#words-seg");
  if (seg) $$(".seg-btn", seg).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.value === wordsView)));

  const el = $("#words-list");
  if (wordsView === "starred") {
    const list = starredWords();
    $("#words-count").textContent = list.length;
    $("#words-sub-label").textContent = "永久保存 · 按加入时间倒序";
    el.innerHTML = list.length
      ? list.map((w, i) => {
          const m = wordMeta(w);
          const r = records.words[w];
          const firstQ = r && r.firstQueriedAt ? fmtDateTime(r.firstQueriedAt) : "";
          return `<li>
            <button class="word-item" data-word="${esc(w)}" data-review="1" style="animation-delay:${i * 30}ms" type="button">
              <span class="row-main">
                <p class="word-line">
                  <span class="word">${esc(w)}</span>
                  <span class="word-phonetic">${esc(phoneticOf(w))}</span>
                </p>
                <p class="word-meaning">${esc(briefOf(w))}</p>
                <p class="word-meta">${firstQ ? `首次查询：${esc(firstQ)} · ` : ""}累计 ${m.total} 次查询</p>
              </span>
              <span class="speaker-btn" data-speak="${esc(w)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
            </button>
            <button class="del-btn" data-del="star" data-word="${esc(w)}" aria-label="移出生词本" type="button">${TRASH_SVG}</button>
          </li>`;
        }).join("")
      : `<li class="empty-state">生词本还是空的<br><span>确认查询过的单词会自动收藏</span></li>`;
    return;
  }

  const list = todayWords();
  $("#words-count").textContent = list.length;
  $("#words-sub-label").textContent = `共 ${statQueries()} 条查询记录（永久）`;
  el.innerHTML = list.length
    ? list.map((w, i) => {
        const m = wordMeta(w);
        return `<li>
          <button class="word-item" data-word="${esc(w)}" data-review="1" style="animation-delay:${i * 30}ms" type="button">
            <span class="row-main">
              <p class="word-line">
                <span class="word">${wordHTML(w, m.total)}</span>
                <span class="word-phonetic">${esc(phoneticOf(w))}</span>
              </p>
              <p class="word-meaning">${esc(briefOf(w))}</p>
              <p class="word-meta">今日 ${m.today} 次 · 累计 ${m.total} 次</p>
            </span>
            <span class="speaker-btn" data-speak="${esc(w)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
          </button>
          <button class="del-btn" data-del="word" data-word="${esc(w)}" aria-label="删除生词" type="button">${TRASH_SVG}</button>
        </li>`;
      }).join("")
    : `<li class="empty-state">今天还没有遇到生词</li>`;
}

function renderHistory() {
  const el = $("#history-list");
  const feed = [...records.history].reverse();
  // 长历史全量渲染会在每次 renderAll（输入即查命中）时重建数千节点导致输入卡顿：
  // 只渲染最近 HISTORY_MAX 条，数据永久保存不变，底部保留总数标注
  const shown = feed.slice(0, HISTORY_MAX);
  el.innerHTML = shown.length
    ? shown.map((h, i) => {
        const starred = isStarred(h.w);
        const action = starred
          ? `<span class="star-chip">已加入</span>`
          : `<button class="star-btn" data-star="${esc(h.w)}" type="button">加入</button>`;
        return `<li>
          <button class="history-item" data-word="${esc(h.w)}" data-review="1" style="animation-delay:${Math.min(i, 20) * 25}ms" type="button">
            <span class="history-word">${esc(h.w)}</span>
            <span class="history-def">${esc(briefOf(h.w).split("；")[0])}</span>
            <span class="history-time">${esc(fmtDateTime(h.ts))}</span>
          </button>
          ${action}
          <button class="del-btn" data-del="history" data-ts="${h.ts}" aria-label="删除记录" type="button">${TRASH_SVG}</button>
        </li>`;
      }).join("") + `<li class="history-more">${feed.length > HISTORY_MAX ? `已显示最近 ${HISTORY_MAX} 条 · ` : ""}共 ${statQueries()} 条查询记录（永久保存）</li>`
    : `<li class="history-item" style="border-bottom:none;"><span class="history-def" style="margin:0;">还没有查询记录</span></li>`;
}

function renderGreeting() {
  const h = new Date().getHours();
  $("#greeting").textContent = h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
}

function renderAll() {
  rolloverIfNeeded(); // 任何渲染路径先做跨天检查：App 进程存活跨过 04:00 时，确保今日生词/今日次数及时切换
  renderHome();
  renderWords();
  renderHistory();
  renderExportMeta();
}

/* ---------- 页面切换 ---------- */

function switchTab(name) {
  // 切换页面时清理全局浮层（词典搜索面板），避免残留叠加到其他页面
  if (typeof closeSheet === "function" && sheetOpen) closeSheet();
  $$(".page").forEach((p) => p.classList.remove("active"));
  const page = $(`#page-${name}`);
  void page.offsetWidth;
  page.classList.add("active");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  window.scrollTo({ top: 0 });
}

$$(".tab").forEach((t) => t.addEventListener("click", () => { rolloverIfNeeded(); renderAll(); switchTab(t.dataset.tab); }));
$$("[data-back='home']").forEach((b) => b.addEventListener("click", () => {
  if (document.body.classList.contains("review-active")) {
    ttsStop();
    exitReview();
  }
  switchTab("home");
  renderAll();
}));
$$("[data-back='settings']").forEach((b) => b.addEventListener("click", () => switchTab("settings")));
$("#view-all").addEventListener("click", () => switchTab("words"));
$("#export-entry").addEventListener("click", () => switchTab("export"));

/* Review 复习：入口卡片 + 页面内交互（两阶段沉浸式设计）
   Phase 1: 词义复习（主动回忆）→ 过渡页 → Phase 2: 拼写复习（随机队列）→ 完成
   快速连点防护：300ms 操作冷却 + 步骤门控 */
let reviewActionAt = 0;
$("#review-entry").addEventListener("click", openReview);
$("#review-clear").addEventListener("click", confirmClearReview);
$("#review-body").addEventListener("click", (e) => {
  const now = Date.now();
  const ready = now - reviewActionAt >= 300;
  const fire = (ok, fn) => { if (ok) { reviewActionAt = now; fn(); } };
  
  // Phase 1: 判断按钮（认识/模糊/不认识）
  const ans = e.target.closest(".rv-btn[data-result]");
  if (ans && reviewSession.phase === "meaning") {
    fire(ready && reviewSession.step === "answer", () => onReviewAnswer(ans.dataset.result));
    return;
  }
  
  // Phase 1: 记错了
  if (e.target.closest("#review-wrong")) {
    fire(ready && reviewSession.phase === "meaning" && reviewSession.step === "detail", reviewCorrection);
    return;
  }
  
  // Phase 1: 下一个（释义确认后）
  if (e.target.closest("#review-next")) {
    fire(ready && reviewSession.phase === "meaning" && reviewSession.step === "detail", reviewNext);
    return;
  }
  
  // 过渡页：开始拼写复习
  if (e.target.closest("#rv-go-spell")) {
    fire(ready && reviewSession.phase === "transition", goToSpellPhase);
    return;
  }
  
  // Phase 2: 提交拼写
  if (e.target.closest("#spell-submit")) {
    fire(ready && reviewSession.phase === "spell", submitSpell);
    return;
  }
  
  // Phase 2: 跳过拼写
  if (e.target.closest("#spell-skip")) {
    fire(ready && reviewSession.phase === "spell", skipSpell);
    return;
  }
  
  // Phase 2: 下一个（拼写正确后）
  if (e.target.closest("#spell-next")) {
    fire(ready && reviewSession.phase === "spell", spellNext);
    return;
  }
  
  // 完成页：返回首页
  if (e.target.closest("#review-done-back")) {
    exitReview();
    switchTab("home");
    renderAll();
    return;
  }
  
  // 清空队列确认
  if (e.target.closest("#clear-no")) { renderReviewByPhase(); return; }
  if (e.target.closest("#clear-yes")) {
    clearReviewQueue();
    renderReviewByPhase();
    return;
  }
});

/** 退出 Review 沉浸模式 */
function exitReview() {
  document.body.classList.remove("review-active");
}

/** 清空复习队列确认层 */
function confirmClearReview() {
  const body = $("#review-body");
  rvHideProgress();
  body.innerHTML = `<div class="rv-transition rv-screen">
    <div class="rv-transition-icon" style="background:rgba(255,149,0,.13);color:#FF9500;">!</div>
    <h2 class="rv-transition-title">清空复习队列？</h2>
    <p class="rv-transition-sub">将清除全部 Review 复习状态与计划，并以当前生词本重新建立<br>不会删除生词本 · 查询记录 · 历史生词</p>
    <div class="rv-detail-actions" style="margin-top:30px;justify-content:center;">
      <button class="rv-btn-wrong" id="clear-no" type="button">取消</button>
      <button class="rv-btn-go" id="clear-yes" type="button" style="background:var(--text-2);color:#fff;">确认清空</button>
    </div>
  </div>`;
}

/* 番茄钟：入口卡片 → 配置视图；运行视图按钮在渲染时绑定 */
$("#pomo-entry").addEventListener("click", openPomo);

/* ---------- 任务模块：入口 + 页面交互 ---------- */

function openTasks() {
  rolloverIfNeeded();
  renderAll();
  switchTab("tasks");
  renderTasks();
}
function openHabits() {
  rolloverIfNeeded();
  renderAll();
  switchTab("habits");
  renderHabits();
}

$("#tasks-entry").addEventListener("click", openTasks);
$("#habits-entry").addEventListener("click", openHabits);
$("#habits-body").addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    if (nav.dataset.nav === "prev") habitsShift(-1);
    else if (nav.dataset.nav === "next") habitsShift(1);
    else if (nav.dataset.nav === "pick") toggleCalPicker();
    return;
  }
  const day = e.target.closest(".cal-cell[data-day]");
  if (day) { showHabitDay(day.dataset.day); return; }
});
$("#tasks-body").addEventListener("click", (e) => {
  const check = e.target.closest(".task-check");
  if (check) {
    toggleTaskDone(check.dataset.task);
    renderTasks();
    renderAll();
    const el = $(`.task-check[data-task="${check.dataset.task}"]`);
    if (el && el.classList.contains("checked")) { // 勾选完成：✓ 轻弹反馈（取消勾选不动画）
      el.classList.remove("just-checked");
      void el.offsetWidth;
      el.classList.add("just-checked");
    }
    return;
  }
  const delT = e.target.closest("[data-del-task]");
  if (delT) { deleteTask(delT.dataset.delTask); renderTasks(); renderAll(); return; }
  const delG = e.target.closest("[data-del-goal]");
  if (delG) { deleteGoal(delG.dataset.delGoal); renderTasks(); renderAll(); return; }
  const delR = e.target.closest("[data-del-reward]");
  if (delR) { deleteReward(delR.dataset.delReward); renderTasks(); renderAll(); return; }
  const newTab = e.target.closest("[data-newtab]");
  if (newTab) {
    taskFormTab = newTab.dataset.newtab;
    renderTasks();
    const panel = $("#task-form-panel");
    if (panel) { panel.style.display = "block"; panel.scrollIntoView({ behavior: "smooth", block: "center" }); }
    return;
  }
  const formTab = e.target.closest("[data-formtab]");
  if (formTab) {
    taskFormTab = formTab.dataset.formtab;
    renderTasks();
    const panel = $("#task-form-panel");
    if (panel) panel.style.display = "block";
    return;
  }
  if (e.target.closest("#tf-save-task")) {
    const name = ($("#tf-name").value || "").trim();
    if (!name) { showToast("请输入任务名称"); return; }
    const kind = $("#tf-kind").value;
    const date = $("#tf-date").value || bizDayStr(0);
    if (kind === "onetime" && date < bizDayStr(0)) { showToast("单日任务日期不能早于今天"); return; }
    const goalId = $("#tf-goal").value;
    if (kind === "daily") {
      const start = $("#tf-start").value || bizDayStr(0);
      const end = $("#tf-end").value || null;
      if (start < bizDayStr(0)) { showToast("开始日期不能早于今天"); return; }
      if (end && end < start) { showToast("结束日期不能早于开始日期"); return; }
      addDailyTask(name, goalId, null, start, end);
    } else {
      addOneTimeTask(name, date, goalId, null);
    }
    $("#task-form-panel").style.display = "none";
    renderTasks(); renderAll();
    showToast("已添加任务");
    return;
  }
  if (e.target.closest("#gf-save")) {
    const name = ($("#gf-name").value || "").trim();
    if (!name) { showToast("请输入目标名称"); return; }
    const due = $("#gf-due").value || null;
    if (due && due < bizDayStr(0)) { showToast("目标截止日期不能早于今天"); return; }
    addGoal(name, due);
    $("#task-form-panel").style.display = "none";
    renderTasks(); renderAll();
    showToast("已创建目标");
    return;
  }
  if (e.target.closest("#rf-save")) {
    const content = ($("#rf-content").value || "").trim();
    if (!content) { showToast("请输入奖励内容"); return; }
    const trigger = $("#rf-trigger").value;
    const goalId = trigger === "goal" ? ($("#rf-goal").value || null) : null;
    addReward(content, trigger, goalId);
    $("#task-form-panel").style.display = "none";
    renderTasks(); renderAll();
    showToast("已创建奖励");
    return;
  }
  if (e.target.closest("#task-new-btn")) {
    const panel = $("#task-form-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    if (panel.style.display === "block") panel.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  // 创建面板 × 关闭（不保存未提交内容）
  if (e.target.closest("#tf-close")) {
    $("#task-form-panel").style.display = "none";
    return;
  }
});
/* select 用 change 事件（click 时 value 还是旧值，会导致显示状态偶发错乱）：
   任务类型切换（每日区间 / 单日日期）+ 奖励触发条件切换（是否显示关联目标） */
$("#tasks-body").addEventListener("change", (e) => {
  if (e.target.closest("#tf-kind")) {
    const isOne = $("#tf-kind").value === "onetime";
    $("#tf-date-wrap").style.display = isOne ? "" : "none";
    $("#tf-range-wrap").style.display = isOne ? "none" : "";
    return;
  }
  if (e.target.closest("#rf-trigger")) {
    $("#rf-goal-wrap").style.display = $("#rf-trigger").value === "goal" ? "" : "none";
    return;
  }
});
/* 任务/奖励/目标输入框输入时，确保词典查询面板不叠加（输入状态互相独立） */
$("#tasks-body").addEventListener("input", (e) => {
  if (sheetOpen && e.target.closest("#task-form-panel")) closeSheet();
});
$("#habits-body").addEventListener("click", () => {});

/* Android 返回键 / 全面屏手势返回：统一返回上一层；Review/番茄钟返回均保留状态 */
window.__back = function () {
  if (pomo.running) { pomoClose(); return true; } // 番茄钟运行中 → 关闭并退出全屏
  if (sheetOpen) { closeSheet(); return true; }
  const active = $(".page.active");
  if (active && active.id === "page-review") {
    ttsStop();
    exitReview();
    switchTab("home");
    renderAll();
    return true;
  }
  if (active && active.id !== "page-home") { switchTab("home"); renderAll(); return true; }
  return false; // 首页无上层：交由系统处理（默认退出）
};

/* 生词页二级视图切换：今日生词 | 历史生词（平级） */
$("#words-seg").addEventListener("click", (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn || btn.dataset.value === wordsView) return;
  wordsView = btn.dataset.value;
  renderWords();
});

/* ---------- Bottom Sheet（词典查询入口） ---------- */

const sheet = $("#sheet");
const sheetOverlay = $("#sheet-overlay");
const sheetInput = $("#sheet-input");
const sheetBody = $("#sheet-body");
let sheetOpen = false;

/* 查询计数会话去重（一次独立查询最多记录一次）：
   sessionWord      本次输入会话已记入历史查询的词（typing 精确命中或回车确认均算）
   sessionConfirmed 本次输入会话已确认计数（进入今日生词）的词
   连续按 Enter / 重复点候选均不重复记录；用户修改输入或重新打开面板 = 新会话。 */
let sessionWord = null;
let sessionConfirmed = null;

function openSheet({ focus = true, hint = true } = {}) {
  sheetOpen = true;
  sheet.classList.add("open");
  sheetOverlay.classList.add("visible");
  sheet.setAttribute("aria-hidden", "false");
  if (hint) renderSheetHint();
  if (focus) setTimeout(() => sheetInput.focus(), 250);
}

function closeSheet() {
  sheetOpen = false;
  sessionWord = null; // 面板关闭 = 会话结束
  sessionConfirmed = null;
  sheet.classList.remove("open");
  sheetOverlay.classList.remove("visible");
  sheet.setAttribute("aria-hidden", "true");
  sheetInput.value = "";
  sheetInput.blur();
}

function renderSheetHint() {
  sheetBody.innerHTML = `<p class="sheet-hint">输入单词查询，例如 temporary</p>`;
}

function renderSheetResults(query) {
  const q = query.trim();
  const matches = dictSearch(q);
  if (!q) return renderSheetHint();
  if (!matches.length) {
    // 考研候选为空 → 异步查 ECDICT 兜底（精确命中显示详情，否则提示未收录）
    const v = q.toLowerCase();
    if (/^[a-z][a-z' .\-]*$/.test(v)) {
      dictGetAsync(v).then((d) => {
        if (!d) {
          if (sheetInput.value.trim().toLowerCase() === v)
            sheetBody.innerHTML = `<p class="sheet-hint">词典未收录「${esc(q)}」</p>`;
          return;
        }
        if (sheetInput.value.trim().toLowerCase() === v) renderSheetDetail(v);
      });
      sheetBody.innerHTML = `<p class="sheet-hint">正在查询词典…</p>`;
    } else {
      sheetBody.innerHTML = `<p class="sheet-hint">词典未收录「${esc(q)}」</p>`;
    }
    return;
  }
  sheetBody.innerHTML = matches.map((w, i) => {
    const m = wordMeta(w);
    return `<button class="result-row" data-word="${esc(w)}" style="animation-delay:${i * 30}ms" type="button">
      <span class="row-main">
        <p class="word-line">
          <span class="word">${m.total ? wordHTML(w, m.total) : esc(w)}</span>
          <span class="word-phonetic">${esc(phoneticOf(w))}</span>
        </p>
        <p class="word-meaning">${esc(briefOf(w))}</p>
      </span>
      <span class="speaker-btn" data-speak="${esc(w)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
    </button>`;
  }).join("");
}

function renderSheetDetail(word) {
  const d = dictGet(word);
  if (!d) {
    sheetBody.innerHTML = `<p class="sheet-hint">词典未收录「${esc(word)}」</p>`;
    return;
  }
  const m = wordMeta(word);
  sheetBody.innerHTML = `<div class="result-detail">
    <p class="detail-word">
      <span class="word">${wordHTML(word, m.total)}</span>
      <span class="detail-word-actions">
        <span class="speaker-btn" data-speak="${esc(word)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
        <button class="add-one-btn" data-addone="${esc(word)}" type="button">+1</button>
      </span>
    </p>
    <p class="detail-phonetic">${esc(phoneticOf(word))}</p>
    ${senseLines(word).map((l) => `<p class="detail-meaning">${esc(l)}</p>`).join("")}
    <div class="detail-meta">
      <span class="meta-chip"><span class="chip-label">今日</span>${m.today} 次</span>
      <span class="meta-chip"><span class="chip-label">累计</span>${m.total} 次</span>
    </div>
  </div>`;
}

/** 确认一次查询（回车/点击候选）：记历史 + 进入今日生词；同一会话内同词不重复 */
function commitQuery(word) {
  if (word !== sessionWord) {
    recordHistory(word);
    sessionWord = word;
  }
  if (word !== sessionConfirmed) {
    confirmQuery(word);
    sessionConfirmed = word;
  }
  renderSheetDetail(word);
  sheetInput.value = word;
  renderAll();
}

$("#search-entry").addEventListener("click", () => openSheet());
$("#sheet-close").addEventListener("click", closeSheet);
sheetOverlay.addEventListener("click", closeSheet);

sheetInput.addEventListener("input", (e) => {
  const v = e.target.value.trim().toLowerCase();
  // 内容与已记录词不同 = 旧会话失效（之后再次命中算新查询）
  if (v !== sessionWord) {
    sessionWord = null;
    sessionConfirmed = null;
  }
  // 输入即查：输入内容精确命中词典 = 查询已实际完成 → 记入历史查询记录（不进生词本）
  if (v && v !== sessionWord) {
    const hit = dictGet(v); // 考研或 ECDICT 已加载分片
    if (hit) {
      recordHistory(v);
      sessionWord = v;
      renderAll();
    } else if (/^[a-z][a-z' .\-]*$/.test(v)) {
      // ECDICT 分片未加载：异步确认后补记（输入已变化则作废，防竞态）
      dictGetAsync(v).then((d) => {
        if (d && v !== sessionWord && sheetInput.value.trim().toLowerCase() === v) {
          recordHistory(v);
          sessionWord = v;
          renderAll();
        }
      });
    }
  }
  renderSheetResults(e.target.value);
});

sheetInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const q = sheetInput.value.trim().toLowerCase();
  let target = dictGet(q) ? q : null; // 考研 / ECDICT 已加载
  if (!target) target = (await dictGetAsync(q)) ? q : null; // ECDICT 兜底
  if (!target) target = dictSearch(q, 1)[0]; // 考研候选
  if (target) commitQuery(target);
});

/* 点击词条：搜索结果行 = 查询（记录）；生词列表/历史行 = 回顾（不记录） */
document.addEventListener("click", (e) => {
  const spk = e.target.closest(".speaker-btn, .rv-speaker");
  if (spk) {
    e.stopPropagation(); // 不触发词条点击/查询
    ttsSpeak(spk.dataset.speak, 1); // 手动播放读音（纯辅助，不影响数据）
    // Review 扬声器：极轻的缩放反馈（表现层）
    if (spk.classList.contains("rv-speaker")) {
      spk.classList.remove("pop");
      void spk.offsetWidth;
      spk.classList.add("pop");
      setTimeout(() => spk.classList.remove("pop"), 450);
    }
    return;
  }
  const one = e.target.closest(".add-one-btn");
  if (one) {
    e.stopPropagation();
    one.classList.remove("pulsed");
    void one.offsetWidth;
    one.classList.add("pulsed"); // 轻反馈：按钮脉冲动画（数字变化由 addOne 重渲染完成）
    addOne(one.dataset.addone);
    return;
  }
  const star = e.target.closest(".star-btn");
  if (star) {
    e.stopPropagation();
    addStarred(star.dataset.star);
    return;
  }
  const del = e.target.closest(".del-btn");
  if (del) {
    e.stopPropagation();
    if (del.dataset.del === "history") deleteHistory(Number(del.dataset.ts));
    else if (del.dataset.del === "word") deleteTodayWord(del.dataset.word);
    else if (del.dataset.del === "star") removeStarred(del.dataset.word);
    return;
  }
  const hit = e.target.closest("[data-word]");
  if (!hit) return;
  const word = hit.dataset.word;
  if (hit.hasAttribute("data-review")) {
    sheetInput.value = word;
    if (!sheetOpen) openSheet({ focus: false, hint: false });
    renderSheetDetail(word); // 回顾不增加次数
  } else {
    if (!sheetOpen) openSheet({ focus: false, hint: false });
    commitQuery(word); // 搜索结果 → 正式查询
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (sheetOpen) closeSheet();
  }
});

/* 任务模块输入框获得焦点时，确保词典搜索面板不叠加显示（输入状态互相独立） */
document.addEventListener("focusin", (e) => {
  if (!e.target || !e.target.closest) return;
  if (e.target.closest("#task-form-panel") || e.target.closest("#pomo-config")) {
    if (sheetOpen) closeSheet();
  }
});

/* ---------- 设置：外观 / 后台悬浮查词（系统级 Overlay） ---------- */

const html = document.documentElement;
const metaTheme = $('meta[name="theme-color"]');

function applyTheme(mode, persist = true) {
  html.dataset.theme = mode;
  const dark =
    mode === "dark" ||
    (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  metaTheme.content = dark ? "#131315" : "#F7F7F8";
  if (persist) localStorage.setItem("vc-theme", mode);
  $$("#appearance-seg .seg-btn").forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.value === mode))
  );
  if (hasBridge()) window.AndroidBridge.setSystemBarsDark(dark); // 状态栏图标随主题
}

$$("#appearance-seg .seg-btn").forEach((b) =>
  b.addEventListener("click", () => applyTheme(b.dataset.value))
);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (html.dataset.theme === "system") applyTheme("system", false);
});

/* 后台悬浮查词（系统级 Overlay，仅 APK 内可用） */
let overlayPending = false;

function applyOverlayUI(on) {
  $("#overlay-switch").setAttribute("aria-checked", String(on));
  $("#overlay-value").textContent = on ? "开" : "关";
}

function applyOverlay(on, persist = true) {
  applyOverlayUI(on);
  if (persist) localStorage.setItem("vc-overlay", on ? "1" : "0");
  if (!hasBridge()) return;
  if (on && !window.AndroidBridge.canDrawOverlays()) {
    overlayPending = true;
    window.AndroidBridge.requestOverlayPermission();
    showToast("请授权「显示在其他应用上层」");
    return;
  }
  window.AndroidBridge.setOverlayEnabled(on);
}

$("#overlay-switch").addEventListener("click", () => {
  applyOverlay($("#overlay-switch").getAttribute("aria-checked") !== "true");
});

function initOverlay() {
  if (!hasBridge()) return; // Web 预览隐藏该项
  $("#overlay-item").hidden = false;
  const saved = localStorage.getItem("vc-overlay") === "1";
  if (saved && window.AndroidBridge.canDrawOverlays()) {
    window.AndroidBridge.setOverlayEnabled(true);
    applyOverlayUI(true);
  } else {
    applyOverlayUI(false);
  }
}

/* ---------- 导出（内容：今日/历史生词 + 词典释义 + 查询次数） ---------- */

function bindSegmented(sel, onChange) {
  const seg = $(sel);
  $$(".seg-btn", seg).forEach((b) =>
    b.addEventListener("click", () => {
      $$(".seg-btn", seg).forEach((x) => x.setAttribute("aria-checked", "false"));
      b.setAttribute("aria-checked", "true");
      onChange(b.dataset.value);
    })
  );
}

const exportState = { content: "today", format: "pdf", style: "clean" };
bindSegmented("#content-seg", (v) => { exportState.content = v; renderExportMeta(); });
bindSegmented("#format-seg", (v) => (exportState.format = v));
bindSegmented("#style-seg", (v) => (exportState.style = v));

/** 当前导出内容对应的生词列表：今日生词 | 历史生词 */
function exportWords() {
  return exportState.content === "starred" ? starredWords() : todayWords();
}

/** 当前导出内容的查询次数：今日=当前业务日的查询条数（按 ts 归日）；历史=历史生词累计查询总数 */
function exportQueries() {
  if (exportState.content === "starred")
    return exportWords().reduce((s, w) => s + (wordMeta(w).total || 0), 0);
  const day = records.day || vocabDay();
  return records.history.filter((h) => h && h.ts && bizDayOf(h.ts) === day).length;
}

function renderExportMeta() {
  rolloverIfNeeded(); // 跨 04:00 先滚动业务日，保证「今日」= 当前业务日
  const el = $("#export-meta-count");
  if (el) el.textContent = `${exportWords().length} 个生词 · ${
    exportState.content === "starred"
      ? `累计 ${exportQueries()} 次查询`
      : `今日 ${exportQueries()} 次查询`}`;
  const dEl = $("#export-meta-date");
  if (dEl) dEl.textContent = zhBizDate(vocabDay()); // 业务日期（04:00 切换点）
}

/** 导出文档 HTML（自包含样式，统一视觉网格：列对齐 / 等长分割线 / 一致间距）。
    文件内日期一律使用业务日期（04:00 切换点），而非系统自然日期。
    【数据完整性】导出前先异步确保每个词的词典数据可用（加载 ECDICT 分片）：
    前端查询走 dictGetAsync（分片按需加载后显示完整）；若导出时仍用同步 dictGet，
    重启后未加载分片的词会缺音标/释义 —— 这里统一 await 预加载后再生成。 */
async function buildExportHTML(style) {
  rolloverIfNeeded(); // 跨 04:00 先滚动，导出数据与日期口径一致
  const bizDate = zhBizDate(vocabDay());
  const isStarred = exportState.content === "starred";
  const words = exportWords();
  // 关键：确保考研词书未收录的词，其 ECDICT 分片已加载（音标/释义完整随导出带出）
  await Promise.all(words.map((w) => dictGetAsync(w)));
  const compact = style === "compact";
  const notes = style === "notes";
  const wordFs = compact ? 15 : 17;
  const senseFs = compact ? 12.5 : 13.5;
  const rowPad = compact ? "9px 0 7px" : notes ? "15px 0 12px" : "13px 0 10px";
  const sensePad = compact ? "0 0 11px" : notes ? "0 0 17px" : "0 0 14px";
  const maxLines = compact ? 2 : 99;

  const rows = words.map((w) => {
    const m = wordMeta(w);
    const lines = senseLines(w).slice(0, maxLines)
      .map((l) => `<div>${esc(l)}</div>`)
      .join("");
    return `
      <tr class="entry">
        <td class="td-word">${esc(w)}<sup>${m.total}</sup></td>
        <td class="td-ph">${esc(phoneticOf(w))}</td>
        <td class="td-cnt">${isStarred ? `累计 ${m.total} 次查询` : `今日 ${m.today} 次 · 累计 ${m.total} 次`}</td>
      </tr>
      <tr class="senses"><td colspan="3">${lines}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Inter, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #fff; color: #1D1D1F; }
    .doc { max-width: 640px; margin: 0 auto; padding: 40px 32px 48px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #B0B0B5; }
    .title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-top: 6px; }
    .meta { font-size: 13px; color: #86868B; margin-top: 7px; }
    .head-rule { height: 1px; background: #ECECEE; margin: 18px 0 2px; }
    table.entries { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.entries col.c-word { width: 34%; }
    table.entries col.c-ph { width: 27%; }
    table.entries col.c-cnt { width: 39%; }
    .entry, .senses { page-break-inside: avoid; }
    .td-word { font-size: ${wordFs}px; font-weight: 620; letter-spacing: -0.01em; padding: ${rowPad}; vertical-align: baseline; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .td-word sup { color: #5856D6; font-size: 0.6em; font-weight: 650; margin-left: 2px; }
    .td-ph { font-size: 12px; color: #86868B; padding: ${rowPad}; vertical-align: baseline; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .td-cnt { font-size: 11.5px; font-weight: 520; color: #A0A0A6; text-align: right; padding: ${rowPad}; vertical-align: baseline; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .senses td { padding: ${sensePad}; border-bottom: 1px solid #E8E8EC; }
    .senses div { font-size: ${senseFs}px; line-height: 1.6; color: #55555C; }
    .empty { color: #A0A0A6; font-size: 13px; padding: 28px 0; }
    @media print { .doc { padding: 32px 28px 40px; } }
  </style></head>
  <body>
  <div class="doc">
    <div class="eyebrow">${isStarred ? "历史生词" : "今日生词"}</div>
    <div class="title">生词本 · ${bizDate}</div>
    <div class="meta">${words.length} 个生词 · ${
      isStarred ? `累计 ${exportQueries()} 次查询` : `今日 ${exportQueries()} 次查询`
    } · 考研词汇便携版</div>
    <div class="head-rule"></div>
    ${rows
      ? `<table class="entries"><colgroup><col class="c-word"><col class="c-ph"><col class="c-cnt"></colgroup>${rows}</table>`
      : `<div class="empty">${isStarred ? "历史生词本暂无记录" : "今天暂无生词记录"}</div>`}
  </div></body></html>`;
}

/* Web 回退下载 */
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* PNG：SVG foreignObject → canvas（离线可用） */
function htmlToPng(html) {
  const W = 720;
  // <style> 位于 <head>，需一并提取进 foreignObject，否则 PNG 丢失排版
  const styles = (html.match(/<style[\s\S]*?<\/style>/g) || []).join("");
  const body = html.replace(/^[\s\S]*?<body|<\/body>[\s\S]*$/g, "");
  // 先离屏测量真实内容高度：固定高度会把长生词列表截断（数据完整性）
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;left:-9999px;top:0;width:${W}px;background:#fff;`;
  probe.innerHTML = styles + body;
  document.body.appendChild(probe);
  const H = Math.max(600, Math.ceil(probe.scrollHeight) + 8);
  probe.remove();
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${styles}${body}</div></foreignObject></svg>`;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

function printHTML(html) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  iframe.onload = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } finally {
      setTimeout(() => iframe.remove(), 60000);
    }
  };
}

const toast = $("#toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

$("#export-btn").addEventListener("click", async () => {
  rolloverIfNeeded(); // 跨 04:00 先滚动业务日（与导出内容口径一致）
  const html = await buildExportHTML(exportState.style); // await：先确保词典数据完整再导出
  const dateStr = vocabDay(); // 业务日期（04:00 切换点），非 UTC/自然日期
  const fmt = exportState.format;
  const name = exportState.content === "starred" ? `生词本-历史-${dateStr}` : `生词本-${dateStr}`;
  try {
    if (hasBridge()) { // Android APK：原生导出
      window.AndroidBridge.exportFile(name, fmt, html);
      showToast(`导出中 · ${fmt.toUpperCase()}…`);
      return;
    }
    if (fmt === "pdf") {
      printHTML(html);
      showToast("已打开打印 · 可另存为 PDF");
    } else if (fmt === "word") {
      downloadBlob(new Blob(["\ufeff" + html], { type: "application/msword" }), `${name}.doc`);
      showToast(`已导出 ${name}.doc`);
    } else {
      const blob = await htmlToPng(html);
      downloadBlob(blob, `${name}.png`);
      showToast(`已导出 ${name}.png`);
    }
  } catch (err) {
    showToast("导出失败，请重试");
  }
});

/* ---------- 初始化 ---------- */

renderGreeting();
loadRecords();
loadReview();
syncReviewWithWords(); // 生词本 = Review 唯一数据源：清除不在生词本的残留脏数据
migrateReview(); // 为生词本内无复习状态的词补建（按「首次加入日期」安排首次复习）
loadPomo();
loadTasks(); // 待办任务 / 目标 / 奖励 / 打卡
renderAll();

applyTheme(localStorage.getItem("vc-theme") || "system", false);
initOverlay();

/* 回到前台：检查跨天重置 + 重载记录（与后台悬浮查词互通）+ 悬浮查词授权结果 */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  loadRecords(); // 后台悬浮查词可能已写入新记录
  rolloverIfNeeded();
  // 悬浮查词期间生词本已变化（新增/删除）：与启动时同样的同步流程，
  // 否则悬浮条确认的生词要等下次重启才会进入 Review 队列
  syncReviewWithWords();
  migrateReview();
  renderAll();
  if (overlayPending && hasBridge()) {
    overlayPending = false;
    if (window.AndroidBridge.canDrawOverlays()) {
      window.AndroidBridge.setOverlayEnabled(true);
      applyOverlayUI(true);
      localStorage.setItem("vc-overlay", "1");
      showToast("后台悬浮查词已开启");
    } else {
      applyOverlayUI(false);
      localStorage.setItem("vc-overlay", "0");
      showToast("未获得悬浮窗权限");
    }
  }
});
