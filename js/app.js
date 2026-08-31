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

/* ---------- 中文释义反向查询：中文关键词 → 释义符合的多个英文词条 ----------
   双向查询：英文 → 释义（原有）；中文 → 英文词汇（新增）。
   仅含中文时触发，英文查询路径零改动；只检索考研词书（本地 6000 词，
   词频降序），索引惰性构建一次后常驻内存，同步查询毫秒级。 */

function isChineseQuery(q) {
  return /[\u4e00-\u9fff]/.test(String(q || ""));
}

let REVERSE_INDEX = null; // [{w, text(全部释义小写拼接), first(首个释义小写)}]，按词频降序

function reverseIndex() {
  if (REVERSE_INDEX) return REVERSE_INDEX;
  REVERSE_INDEX = DICT_KEYS.map((w) => {
    const defs = [];
    ((DICT_DATA[w] || {}).senses || []).forEach(([, arr]) => {
      (arr || []).forEach((s) => defs.push(s));
    });
    return { w, text: defs.join("；").toLowerCase(), first: (defs[0] || "").toLowerCase() };
  });
  return REVERSE_INDEX;
}

/** 反查匹配排序：首释义完全等于关键词 > 首释义以关键词开头 > 任一释义包含关键词；
    同级保持词频降序（考研高频优先）；limit 控制返回量避免长列表卡顿 */
function reverseSearch(q, limit = 30) {
  const kw = String(q || "").trim().toLowerCase();
  if (!kw) return [];
  const exact = [], prefix = [], contain = [];
  for (const it of reverseIndex()) {
    if (it.text.indexOf(kw) === -1) continue;
    if (it.first === kw) exact.push(it.w);
    else if (it.first.startsWith(kw)) prefix.push(it.w);
    else contain.push(it.w);
    if (exact.length + prefix.length + contain.length >= limit) break;
  }
  return [...exact, ...prefix, ...contain].slice(0, limit);
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

/** 词典详情 / 相关释义卡片：释义分级 HTML。
    考研词书 → 每行「词性 + 逐条等级着色释义 + 「僻」角标」（全局同一套等级数据）；
    ECDICT / 其他来源 → 保持原有纯文本释义行（本功能不涉及）。 */
function detailMeaningsHtml(word) {
  const g = window.KY ? KY.kyLevel(word) : null;
  if (!g) return senseLines(word).map((l) => `<p class="detail-meaning">${esc(l)}</p>`).join("");
  return g.rows.map((row) =>
    `<p class="detail-meaning">${row.pos ? `${esc(row.pos)} ` : ""}${KY.kyJoin(row.meanings)}</p>`
  ).join("");
}

function phoneticOf(word) {
  const d = dictGet(word);
  return d && (d.ph || d.p) ? `/${(d.ph || d.p)}/` : "";
}

/* ---------- 生词记录系统（词典管释义，记录管次数） ---------- */

const STORE_KEY = "vc-records";
const HISTORY_MAX = 500; // 查询记录页渲染上限（数据永久保存，仅限制单次渲染节点数）
const HISTORY_KEEP = 2000; // 查询历史存储上限：超出自动淘汰最早记录；今日/累计查询次数走独立计数器，不受淘汰影响
let historyRange = "all"; // 查询记录页时间筛选：all | day | week | month（仅影响列表展示）
const HISTORY_RANGE_MS = { week: 7 * 86400000, month: 30 * 86400000 }; // 近一周 / 近一月
const HISTORY_RANGE_NAME = { day: "本日内", week: "近一周", month: "近一月" };
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
  migrateQueryCounters();
  if (trimHistory()) saveRecords();
  rolloverIfNeeded();
}

/** 查询次数计数迁移：老数据无独立计数器 → 从 history 派生一次基线。
    此后今日/累计查询次数独立累计，历史上限淘汰（trimHistory）不再影响任何统计 */
function migrateQueryCounters() {
  if (typeof records.qTotal !== "number") records.qTotal = records.history.length;
  if (!records.qToday) {
    const day = records.day || vocabDay();
    let n = 0;
    for (const h of records.history) if (h && h.ts && bizDayOf(h.ts) === day) n++;
    records.qToday = { day, n };
  }
}

/** 历史存储上限：只保留最近 HISTORY_KEEP 条，淘汰最早的记录（只裁历史，不动任何计数） */
function trimHistory() {
  const over = records.history.length - HISTORY_KEEP;
  if (over <= 0) return false;
  records.history.splice(0, over);
  return true;
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
  records.qToday = { day, n: 0 }; // 今日查询次数随业务日清零（累计 qTotal 不清零）
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
  records.qTotal = (typeof records.qTotal === "number" ? records.qTotal : records.history.length) + 1;
  if (records.qToday && records.qToday.day === records.day) records.qToday.n += 1;
  else records.qToday = { day: records.day, n: 1 };
  trimHistory(); // 超过 HISTORY_KEEP：自动淘汰最早的历史记录，查询计数不受影响
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
function statQueries() { return typeof records.qTotal === "number" ? records.qTotal : records.history.length; }
function wordMeta(word) {
  const r = records.words[word];
  return r ? { today: r.today || 0, total: r.total || 0 } : { today: 0, total: 0 };
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
  const victim = records.history.find((h) => h.ts === ts);
  records.history = records.history.filter((h) => h.ts !== ts);
  // 手动删除沿用旧口径：计数原由 history 派生，删除记录会同步扣减今日/累计查询次数
  if (victim) {
    if (typeof records.qTotal === "number") records.qTotal = Math.max(0, records.qTotal - 1);
    if (records.qToday && records.qToday.n > 0 && victim.ts && bizDayOf(victim.ts) === records.qToday.day) records.qToday.n--;
  }
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

/* ---------- 下一题提示音（「滴」声，用户提供的本地 MP3） ----------
   仅在词义复习释义确认后 / 拼写正确后点「下一个」进入下一条时播放，
   每次点击重置到开头播放一次；独立 Audio 通道，与 TTS/在线发音
   （ttsSpeak/ttsStop，Web Speech + 有道音频）互不影响 */
const nextSoundRef = new Audio("audio/next.mp3");
function playNextSound() {
  try {
    nextSoundRef.currentTime = 0;
    const p = nextSoundRef.play();
    if (p && p.catch) p.catch(() => {}); // 自动播放策略拦截时静默
  } catch (_) { /* 静默 */ }
}

/* ---------- MCQ 选择题音效 ----------
   答对：复用 next.mp3（与拼写正确的「滴」声一致）
   答错：用户提供的「错误提示音.mp3」 */
const errorSoundRef = new Audio("%E9%94%99%E8%AF%AF%E6%8F%90%E7%A4%BA%E9%9F%B3.mp3");
function playCorrectSound() { playNextSound(); }
function playErrorSound() {
  try {
    errorSoundRef.currentTime = 0;
    const p = errorSoundRef.play();
    if (p && p.catch) p.catch(() => {});
  } catch (_) { /* 静默 */ }
}

function wordHTML(word, count) {
  return `${esc(word)}<sup class="count">${count}</sup>`;
}

const TRASH_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7.2v4M9.3 7.2v4"/></svg>`;
const MAG_SVG = `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="4.6"/><path d="M11.4 11.4L15 15"/></svg>`;
// 目标行图标：靶子（同心圆 + 实心靶心）
const GOAL_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.2"/><circle cx="10" cy="10" r="3.9"/><circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none"/></svg>`;
// 奖励行图标：宝箱（拱形盖 + 箱体 + 中央锁扣）
const REWARD_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5v6A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-6"/><path d="M3.5 9.5C3.5 6.2 6 4 10 4s6.5 2.2 6.5 5.5"/><path d="M3.5 9.5h13"/><path d="M8.6 9.5h2.8v2.4a1.4 1.4 0 0 1-2.8 0z" fill="currentColor" stroke="none"/></svg>`;

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
/** 旧六档间隔表：Review 生词复习底层算法已迁移为 FSRS（js/fsrs.js）。
    本表不再参与任何调度计算，仅用于：
      ① 旧数据迁移时反推初始记忆状态（ensureFsrsState）
      ② 兼容仍读取 st.stage 的旧展示逻辑（VH_FSRS.stageFromInterval） */
const R_INTERVALS = [0, 3, 7, 10, 20, 30, 30];
let reviewStore = { words: {} };

function loadReview() {
  try {
    const saved = JSON.parse(localStorage.getItem(REVIEW_KEY) || "null");
    if (saved && saved.words) reviewStore = saved;
  } catch (_) { /* 损坏数据忽略 */ }
}

function saveReview() {
  localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewStore));
  pushReminderState(); // 通知提醒：复习进度变化 → 同步快照给原生（到点判断是否已复习完）
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
    fsrs: null, // FSRS 记忆状态（首次结算时由 ensureFsrsState 填充）
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
        fsrs: null, // FSRS 记忆状态（首次结算时由 ensureFsrsState 填充）
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
    answeredToday: {}, initialCount: 0,
    mcqFirst: {}, spellSettled: {},
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

/* ============================================================
   FSRS 记忆状态：旧数据兼容迁移 + 娴熟毕业
   ============================================================ */

/** 确保单个生词条目具备 FSRS 记忆状态（幂等，只新增字段、不改写既有字段）。
    升级前创建的旧条目没有 .fsrs 字段 → 由既有 stage / 三态计数器一次性推导：
      · 从未复习（total=0 或无有效间隔）→ 空状态，首次评分时由 FSRS w0–w3 初始化
      · 已复习 → 稳定性 = 旧排期间隔，难度由历史失败占比插值（VH_FSRS.fromLegacy）
    推导完成后旧字段（stage/mode/origStage/known/fuzzy/unknown/total）原样保留，
    学习历史零丢失、零破坏。 */
function ensureFsrsState(st) {
  if (st.fsrs) return st;
  if (!window.VH_FSRS) { st.fsrs = { s: null, d: null, dr: 0.9, reps: 0, lapses: 0, lastReviewedAt: null, lastElapsed: null }; return st; }
  const stage = st.stage || 0;
  // 旧间隔口径：入长期用档位表；仍处于 daily/booster 循环但未入长期按 1 天
  const intervalDays = stage > 0 ? R_INTERVALS[stage] : (st.total > 0 ? 1 : 0);
  st.fsrs = VH_FSRS.fromLegacy({
    intervalDays: intervalDays,
    total: st.total,
    known: st.known,
    fuzzy: st.fuzzy,
    unknown: st.unknown,
    lastReviewedAt: st.lastAt || null,
  });
  return st;
}

/** 旧算法间隔 → FSRS 迁移（一次性、幂等）：
    升级到 FSRS 后，旧版本遗留在 vc-review 的 nextAt 是旧六档间隔算法算出的业务日，
    且 fsrs 字段为 null（从未用 FSRS 结算过）。本函数对这类旧词：
      ① ensureFsrsState 由既有 stage / 三态计数器一次性推导 FSRS 记忆状态（s/d，保留全部历史）；
      ② 用 FSRS 计算结果（intervalFor(s, dr)）重算 nextAt —— 以「真实上次复习时间 lastAt」为基准，
         替换旧算法遗留间隔，使展示/队列/提醒全部统一为 FSRS 口径；
      ③ 同步 stage 兼容展示字段。
    已具备 fsrs 状态（新版本已结算过）或已毕业（mastered，nextAt=0）的词一律不动；
    从未复习（total=0）的词保持首次复习安排不动。零删除、零破坏历史数据。 */
function migrateLegacyIntervalsToFsrs() {
  if (!window.VH_FSRS) return;
  let changed = false;
  for (const w of Object.keys(reviewStore.words)) {
    const st = reviewStore.words[w];
    if (!st || !st.nextAt) continue;                 // 无排期（含毕业词 nextAt=0）→ 不动
    if (st.fsrs) continue;                           // 已有 FSRS 状态 → 已是 FSRS 结果
    ensureFsrsState(st);                             // 由历史推导 FSRS 状态
    const f = st.fsrs;
    if (!f || typeof f.s !== "number" || !(f.s > 0)) continue; // 从未复习/无有效稳定性 → 保持首次安排
    const dr = f.dr || VH_FSRS.DEFAULT_DR;
    const intervalDays = Math.max(VH_FSRS.MIN_INTERVAL_DAYS, Math.round(VH_FSRS.intervalFor(f.s, dr)));
    const base = st.lastAt || Date.now();            // 以真实上次复习时间为基准，保留实际经过
    st.nextAt = businessDayAt(intervalDays, base);
    st.stage = VH_FSRS.stageFromInterval(intervalDays);
    changed = true;
  }
  if (changed) saveReview();
}

/** 是否已标记「娴熟」毕业（已毕业的词不再进入 Review 队列） */
function isReviewMastered(word) {
  const st = reviewStore.words[word];
  return !!(st && st.mastered);
}

/** 「娴熟」毕业：当前单词彻底退出 Review 调度。
    · 标记 mastered 并把 nextAt 清零 → reviewQueue() 的 nextAt>0 过滤直接排除，
      之后 FSRS 调度不会再安排该词
    · 不删除生词本记录（records.words[w].starred 保持不变）
    · 不删除任何学习历史（known/fuzzy/unknown/total/fsrs 全部保留，可随时查看）
    · ensureReviewEntry 对已存在条目幂等返回；migrateReview 只为「无复习状态」的词建条
      → 已毕业词不会因迁移而复活
    · 设置 → 自适应间隔算法 → 生词本 同样按 nextAt>0 过滤 → 已毕业词不再显示排期 */
function reviewMastered(word) {
  const st = reviewStore.words[word];
  if (!st) return;
  st.mastered = true;
  st.masteredAt = Date.now();
  st.nextAt = 0;
  saveReview();
}

/** Review 会话内点击「娴熟」：标记毕业 + 跳过该词剩余全部任务并前进。
    覆盖三处入口：词义回忆页 / 词义详情页 / 选择题页（Phase 1）与拼写页（Phase 2）。
    毕业的词不进入 answerReview 结算（不再产生新的 FSRS 排期）。 */
function reviewMasteredFromSession() {
  const word = reviewSession.current;
  if (!word) return;
  reviewMastered(word);

  if (reviewSession.phase === "spell") {
    // 拼写阶段：「娴熟」= 彻底毕业 → 当前进度（spellIdx）不变，
    // 该词从拼写队列移除（总进度 -1），不再出现。
    ttsStop();
    reviewSession.spellQueue = reviewSession.spellQueue.filter((w) => w !== word);
    reviewSession.spell = { submitted: false, correct: false, input: "" };
    saveReviewSession();
    renderReviewByPhase();
    return;
  }

  // Phase 1：把该词三态全部标记完成（含可能已入队的重复任务），不再重复出现
  reviewSession.completed[word + "|recall"] = true;
  reviewSession.completed[word + "|w2m"] = true;
  reviewSession.completed[word + "|m2w"] = true;
  if (!reviewSession.wordResults[word]) reviewSession.wordResults[word] = {};
  reviewSession.wordResults[word].mastered = true;
  // wordsDone 置位：彻底阻断 tryCompleteWord 的结算路径（毕业词不再产生 FSRS 排期）
  reviewSession.wordsDone[word] = true;
  // 「娴熟」= 彻底毕业：把该词全部任务（3 态 + 已入队的队尾重复任务，无论是否已完成）
  // 从任务池中永久移除 → 进度分母 = 队列剩余任务数（总进度 -3），进度分子 answeredCount 不变。
  // 注意：不能先标记 completed 再按「未完成任务」过滤 —— 三态 completed 已全部置真，
  // 该过滤条件恒为假会导致任务池纹丝不动；此处一律按单词整体移除。
  reviewSession.queue = reviewSession.queue.filter((t) => !(t && t.word === word));
  saveReviewSession();

  // 从回忆页/详情页/选择题页前进：毕业词不经 tryCompleteWord 结算，直接推进。
  // 当前任务已被移除，下一个任务左移到位，因此不再手动 idx+1
  //（renderReviewByPhase 会跳过已完成任务并定位到下一个有效任务）。
  reviewSession.detailCtx = null;
  reviewSession.mcqData = null;
  reviewSession.lastResult = null;
  reviewSession.snapshot = null;
  saveReviewSession();
  playNextSound();
  renderReviewByPhase();
}

/* ============================================================
   复习状态机（FSRS 调度）
   ============================================================ */

/** 复习状态机：应用一次判断（known/fuzzy/unknown），更新记忆状态与下一次复习时间。
    ★ 底层间隔算法已迁移为 FSRS（js/fsrs.js），三态评价 → FSRS Rating → 调度：
        known   → FSRS Good (3)   「记得」
        fuzzy   → FSRS Hard  (2)  「想起来但吃力」
        unknown → FSRS Again (1)  「忘了」
    FSRS 依据记忆稳定性 S / 难度 D / 实际经过天数计算新状态与建议间隔：
      · 连续正确 → 稳定性增长 → 间隔逐渐拉长
      · 遗忘 / 困难 → 稳定性下降 → 间隔重新变短
      · 迟到复习按真实经过天数计算可提取性 → 天然获得迟到补偿
    nextAt 仍统一按业务日落盘（businessDayAt）：队列筛选、首页计数、
    设置页展示与原生提醒快照全部沿用既有 nextAt 口径，零改动零分叉。
    保留 known/fuzzy/unknown/total/stage/mode/origStage 字段用于向后兼容展示与旧数据推导。 */
function answerReview(word, rating, opts) {
  const st = reviewStore.words[word];
  if (!st) return null;
  const now = Date.now();

  if (!window.VH_FSRS) { /* fsrs.js 未加载（异常兜底）：不调度，保持现排期 */ return st; }
  ensureFsrsState(st);
  opts = opts || {};
  const isPrimary = opts.phase !== "spell"; // T1 主结算 vs T2 拼写证据
  const r = Math.max(1, Math.min(3, rating | 0));
  const sBefore = st.fsrs && typeof st.fsrs.s === "number" ? st.fsrs.s : null;
  const dBefore = st.fsrs && typeof st.fsrs.d === "number" ? st.fsrs.d : null;
  const deltaDays = (st.fsrs && st.fsrs.lastReviewedAt)
    ? Math.max(0, Math.round((now - st.fsrs.lastReviewedAt) / 86400000))
    : 0;

  // FSRS 计算新记忆状态 + 建议间隔（T2 拼写证据在同一业务日内走短期稳定性公式）
  const next = VH_FSRS.review(st.fsrs, r, now, { countRep: isPrimary });
  st.fsrs = next.state;

  // 自适应缩放 → 最终业务日间隔（scale 由用户历史拟合，默认 1.0）
  const scale = adaptive.enabled && adaptive.scale > 0 ? adaptive.scale : 1.0;
  const scaled = Math.max(1, Math.round(next.intervalDays * scale));
  st.nextAt = businessDayAt(Math.max(VH_FSRS.MIN_INTERVAL_DAYS, scaled), now);

  if (isPrimary) {
    const result = resultLabel(r);
    // 兼容字段：stage 由新间隔反推；mode 按词义结果映射（long=认识/booster=模糊/daily=不认识），
    // 使 deriveLegacyTodayRecord() 的旧版本数据推导语义继续成立
    st.stage = VH_FSRS.stageFromInterval(next.intervalDays * scale);
    st.mode = result === "known" ? "long" : result === "fuzzy" ? "booster" : "daily";
    st.origStage = 0;
    // 计数器：保留原三态口径（完成页与统计展示用）
    if (result === "known") st.known += 1;
    else if (result === "fuzzy") st.fuzzy += 1;
    else st.unknown += 1;
    st.lastAt = now;
    st.total += 1;
  } else {
    // 拼写证据：仅更新 fsrs 与 nextAt，不改 mode/计数器（整词轮次口径不变）
    st.stage = VH_FSRS.stageFromInterval(next.intervalDays * scale);
  }
  saveReview();

  // 复习日志（同一词同业务日 T2 覆盖 T1 的拼写证据与最终状态，见 upsertReviewLog）
  const entry = {
    word: word,
    day: vocabDay(),
    ts: now,
    phase: isPrimary ? "meaning" : "spell",
    ratings: roundRatingsOf(word),
    sBefore: sBefore,
    dBefore: dBefore,
    sAfter: st.fsrs.s,
    dAfter: st.fsrs.d,
    intervalDays: scaled,
    nextAt: st.nextAt,
    deltaDays: deltaDays,
  };
  if (isPrimary) entry.combo = r;
  else entry.spellRating = r;
  upsertReviewLog(entry);

  return st;
}

/* ============================================================
   四态统一全局 FSRS · 辅助层
   组合评分表（T1）/ 拼写证据（T2）/ 复习日志 / 个性化自适应
   ============================================================ */

/** rating(1-3) → 三态标签（统计/记录用） */
function resultLabel(rating) {
  const r = Math.max(1, Math.min(3, rating | 0));
  return r === 3 ? "known" : r === 2 ? "fuzzy" : "unknown";
}

/** T1 组合评分表（词义三态 → 全局评分）：
    - 词义不认识 → Again(1)
    - 两道选择题均首次答错 → Again(1)
    - 词义模糊且任一选择题首次错 → Again(1)
    - 词义模糊（选择题全对）→ Hard(2)
    - 任一选择题首次错（词义认识）→ Hard(2)（降级不归零）
    - 三态全通过 → Good(3)
    选择题以首次作答为准（mcqFirst 记录，重试答对不洗白）。
    弱态惩罚：自适应识别出的薄弱态失败时评分额外降一级（个性化敏感度）。 */
function comboRatingFor(word) {
  const wr = reviewSession.wordResults[word] || {};
  const mFirst = (reviewSession.mcqFirst || {})[word] || {};
  const recall = wr.recall || "known";
  const w2mFail = mFirst.w2m === false;
  const m2wFail = mFirst.m2w === false;
  let rating;
  if (recall === "unknown") {
    rating = VH_FSRS.RATING.AGAIN;
  } else if (w2mFail && m2wFail) {
    rating = VH_FSRS.RATING.AGAIN;
  } else if (recall === "fuzzy" && (w2mFail || m2wFail)) {
    rating = VH_FSRS.RATING.AGAIN;
  } else if (recall === "fuzzy") {
    rating = VH_FSRS.RATING.HARD;
  } else if (w2mFail || m2wFail) {
    rating = VH_FSRS.RATING.HARD;
  } else {
    rating = VH_FSRS.RATING.GOOD;
  }
  // 弱态惩罚：薄弱态失败 → 额外降一级
  const weak = (adaptive && adaptive.weakStates) || {};
  const weakFail = (weak.w2m && w2mFail) || (weak.m2w && m2wFail);
  if (weakFail && rating === VH_FSRS.RATING.GOOD) rating = VH_FSRS.RATING.HARD;
  else if (weakFail && rating === VH_FSRS.RATING.HARD) rating = VH_FSRS.RATING.AGAIN;
  return rating;
}

/** 当前会话中某词四态首次评分快照（供 Revlog/诊断；spell 未落定前为 null） */
function roundRatingsOf(word) {
  const wr = reviewSession.wordResults[word] || {};
  const mFirst = (reviewSession.mcqFirst || {})[word] || {};
  const out = {
    recall: wr.recall === "known" ? 3 : wr.recall === "fuzzy" ? 2 : (wr.recall ? 1 : null),
    w2m: typeof mFirst.w2m === "boolean" ? (mFirst.w2m ? 3 : 1) : null,
    m2w: typeof mFirst.m2w === "boolean" ? (mFirst.m2w ? 3 : 1) : null,
    spell: null,
  };
  const sr = (reviewSession.spellResults || {})[word];
  if (sr) out.spell = sr === "correct" ? 3 : 1;
  return out;
}

/* ---------- 复习日志 Revlog（自适应层训练数据源） ----------
   追加式、只增不改：每次正式结算（T1/T2）记录一次，同词同业务日幂等合并
   （T1 写入轮次初始状态与组合评分，T2 覆盖最终状态与拼写证据）。 */

let reviewRevlogs = [];

function loadReviewRevlogs() {
  try {
    const s = JSON.parse(localStorage.getItem(REVIEW_REVLOG_KEY) || "[]");
    if (Array.isArray(s)) reviewRevlogs = s;
  } catch (_) { reviewRevlogs = []; }
}

function saveReviewRevlogs() {
  try { localStorage.setItem(REVIEW_REVLOG_KEY, JSON.stringify(reviewRevlogs)); } catch (_) {}
}

/** 幂等合并：同词同业务日保留一条；T2（phase=spell）只覆盖最终状态与拼写字段 */
function upsertReviewLog(entry) {
  if (!Array.isArray(reviewRevlogs)) reviewRevlogs = [];
  const idx = reviewRevlogs.findIndex((r) => r.word === entry.word && r.day === entry.day);
  if (idx >= 0) {
    const old = reviewRevlogs[idx];
    if (entry.phase === "spell") {
      reviewRevlogs[idx] = {
        ...old,
        ts: entry.ts, phase: entry.phase,
        spellRating: entry.spellRating,
        ratings: entry.ratings,
        sAfter: entry.sAfter, dAfter: entry.dAfter,
        intervalDays: entry.intervalDays, nextAt: entry.nextAt,
      };
    } else {
      reviewRevlogs[idx] = { ...old, ...entry };
    }
  } else {
    reviewRevlogs.push(entry);
  }
  saveReviewRevlogs();
  maybeFitAdaptive();
}

/* ---------- 自适应参数（FSRS + VocabHit 个性化优化层） ----------
   冷启动门槛：<100 条不启用；100-300 仅调 scale；300-400 加 dr；≥400 加弱态识别。
   回退保护：候选参数损失不严格优于当前则拒绝采纳（参考 Anki compute_params 的 log_loss 回退）。
   只调整 VocabHit 层参数（scale/dr/弱态），FSRS 核心公式参数 w0-w18 保持全局默认。 */

const ADAPTIVE_DEFAULTS = {
  version: 1, trainedAt: 0, sampleCount: 0, enabled: false,
  scale: 1.0,        // 全局间隔缩放系数（0.5-1.5）
  dr: 0.9,           // 期望保留率（0.85-0.95）
  weakStates: {},    // { recall:false, w2m:false, m2w:false, spell:false } 薄弱态
};

let adaptive = { ...ADAPTIVE_DEFAULTS };

function loadAdaptive() {
  try {
    const s = JSON.parse(localStorage.getItem(FSRS_ADAPTIVE_KEY) || "null");
    if (s && s.version === 1) {
      adaptive = {
        ...ADAPTIVE_DEFAULTS, ...s,
        weakStates: { ...ADAPTIVE_DEFAULTS.weakStates, ...(s.weakStates || {}) },
      };
    }
  } catch (_) { adaptive = { ...ADAPTIVE_DEFAULTS }; }
}

function saveAdaptive() {
  try { localStorage.setItem(FSRS_ADAPTIVE_KEY, JSON.stringify(adaptive)); } catch (_) {}
}

function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** 从 Revlog 计算自适应统计：整体实际保留率 + 各态通过率 */
function computeAdaptiveStats() {
  let n = 0, pass = 0;
  const byState = { recall: 0, w2m: 0, m2w: 0, spell: 0 };
  const byStateTotal = { recall: 0, w2m: 0, m2w: 0, spell: 0 };
  for (const r of reviewRevlogs) {
    const ratings = r.ratings || {};
    if (typeof r.combo === "number") { n += 1; if (r.combo >= 2) pass += 1; }
    for (const k of ["recall", "w2m", "m2w", "spell"]) {
      const v = ratings[k];
      if (typeof v === "number") {
        byStateTotal[k] += 1;
        if (v >= 2) byState[k] += 1;
      }
    }
  }
  const rates = {};
  for (const k of ["recall", "w2m", "m2w", "spell"]) {
    rates[k] = byStateTotal[k] ? byState[k] / byStateTotal[k] : null;
  }
  return { retention: n ? pass / n : 0, byState: rates };
}

/** 损失评估：预测间隔（intervalDays×scale）与用户实际间隔（deltaDays）的归一化平均绝对偏差。
    候选参数损失严格更小才被采纳（回退保护）。
    注意：不依赖 enabled——首次启用时（enabled=false）也必须用候选 scale 真实评估，
    否则候选缩放永远被当作默认 1.0 而无法通过回退保护。 */
function evaluateAdaptiveLoss(params) {
  const scale = params && typeof params.scale === "number" && params.scale > 0 ? params.scale : 1.0;
  let err = 0, cnt = 0;
  for (const r of reviewRevlogs) {
    if (typeof r.intervalDays !== "number" || typeof r.deltaDays !== "number") continue;
    if (r.intervalDays <= 0 || r.deltaDays <= 0) continue;
    err += Math.abs(r.intervalDays * scale - r.deltaDays) / Math.max(1, r.deltaDays);
    cnt += 1;
  }
  return cnt ? err / cnt : 0;
}

/** 自适应拟合（后台任务，不阻塞结算）：按冷启动门槛分档调整 scale/dr/弱态。 */
function fitAdaptiveParams() {
  const n = reviewRevlogs.length;
  if (n < 100) return;
  const stats = computeAdaptiveStats();
  const candidate = { ...adaptive, weakStates: { ...adaptive.weakStates } };

  // 1) scale：实际保留率偏离目标 → 朝目标方向微调（步进 0.05，钳制 0.5-1.5）
  const gap = stats.retention - candidate.dr;
  if (Math.abs(gap) > 0.05) {
    candidate.scale = clampNum(candidate.scale + Math.sign(gap) * 0.05, 0.5, 1.5);
  }
  // 2) dr：样本≥300 且长期偏差大 → 向实际保留率靠拢（钳制 0.85-0.95）
  if (n >= 300 && Math.abs(gap) > 0.08) {
    candidate.dr = clampNum(candidate.dr + Math.sign(gap) * 0.01, 0.85, 0.95);
  }
  // 3) 弱态识别：样本≥400 → 各态通过率显著低于均值 → 记为薄弱态
  if (n >= 400) {
    const rates = stats.byState;
    const keys = ["recall", "w2m", "m2w", "spell"];
    const present = keys.filter((k) => rates[k] != null);
    const avg = present.length
      ? present.reduce((s, k) => s + rates[k], 0) / present.length
      : 1;
    keys.forEach((k) => {
      candidate.weakStates[k] = rates[k] != null && rates[k] < avg - 0.15;
    });
  }

  // 4) 回退保护：候选损失不严格优于当前 → 保留当前参数
  const curLoss = evaluateAdaptiveLoss(adaptive);
  const newLoss = evaluateAdaptiveLoss(candidate);
  if (newLoss < curLoss) {
    adaptive = { ...candidate, trainedAt: Date.now(), sampleCount: n, enabled: true };
  } else {
    adaptive = { ...adaptive, trainedAt: Date.now(), sampleCount: n, enabled: true };
  }
  saveAdaptive();
}

/** 触发自适应重拟合（防抖 + 最小间隔）：样本≥100 且距上次拟合超过 6 小时才触发（后台执行） */
let adaptiveFitTimer = null;
function maybeFitAdaptive() {
  if (reviewRevlogs.length < 100) return;
  const now = Date.now();
  if (now - (adaptive.trainedAt || 0) < 6 * 3600 * 1000) return;
  if (adaptiveFitTimer) return;
  adaptiveFitTimer = setTimeout(() => {
    adaptiveFitTimer = null;
    fitAdaptiveParams();
  }, 3000);
}

/* ============================================================
   Review 复习 — 两阶段沉浸式重设计
   Phase 1: 词义复习（主动回忆）→ Phase 2: 拼写复习（随机队列）
   ============================================================ */

const REVIEW_SESSION_KEY = "vc-review-session-v2";
const REVIEW_TODAY_KEY = "vc-review-today";
const REVIEW_DAYS_KEY = "vc-review-days"; // 连续 Review 天数记录：{ "YYYY-MM-DD": 1 }（当天 Review 全部完成时标记）
const REVIEW_REVLOG_KEY = "vc-review-revlogs"; // 追加式复习日志（四态证据 + 结算状态，自适应层训练数据源）
const FSRS_ADAPTIVE_KEY = "vc-fsrs-adaptive";  // 自适应参数（scale/dr/弱态，用户级个性化）
let reviewDays = {};

function loadReviewDays() {
  try {
    const s = JSON.parse(localStorage.getItem(REVIEW_DAYS_KEY) || "null");
    if (s && typeof s === "object" && !Array.isArray(s)) reviewDays = s;
  } catch (_) { /* 损坏数据忽略 */ }
}

// 新会话状态结构（task pool 任务池模式）
// 每个单词拆为 3 个独立任务（recall / w2m / m2w），全部打乱后统一排队。
// 任务池随机出题，用户无法预测下一题类型。
// 每种状态独立完成：答错只重复该状态，不影响其他两种。
let reviewSession = {
  day: "",
  phase: "meaning",     // "meaning" | "transition" | "spell" | "done"
  // Phase 1 — 任务池
  queue: [],            // 任务池 [{word, step:"recall"|"w2m"|"m2w"}]
  idx: 0,               // 当前任务索引
  current: null,         // 当前单词（便捷引用）
  currentTask: null,     // 当前任务对象
  lastResult: null,      // 最近一次 recall 判断（known/fuzzy/unknown）
  snapshot: null,        // 记错了回滚快照
  stats: { n: 0, known: 0, fuzzy: 0, unknown: 0 },
  // MCQ 选择题
  mcqData: null,         // 当前 MCQ 题目数据
  mcqStats: { w2mCorrect: 0, m2wCorrect: 0, w2mTotal: 0, m2wTotal: 0 },
  // 任务完成跟踪
  completed: {},         // { "word|step": true } 已完成的任务
  wordResults: {},       // { word: { recall:"known"|"fuzzy"|"unknown", w2m:true|false, m2w:true|false } }
  wordsDone: {},         // { word: true } 三种全部完成的单词
  // 详情页上下文（MCQ 答错后进入详情页，需要知道返回后做什么）
  detailCtx: null,       // { task, action:"complete"|"retry" }
  // 当天会话状态
  answeredToday: {},
  initialCount: 0,
  // Phase 2
  spellQueue: [],
  spellIdx: 0,
  spell: { submitted: false, correct: false, input: "" },
  spellStats: { correct: 0, wrong: 0, skipped: 0 },
  // 今日复习记录（按词记录实际发生的作答结果，供完成页列表展示；
  // 只增不改语义：mcqRecord 一天内出现过错误即记 "wrong"，spellResults 记 correct/wrong/skipped）
  mcqRecord: {},        // { word: "correct"|"wrong" } 今天实际做过的选择题结果
  spellResults: {},     // { word: "correct"|"wrong"|"skipped" } 今天实际发生过的拼写结果
  // 词义复习态队尾重复机制：未达「认识」的词反复入队尾，直到最终选择认识
  recallAttempts: {},   // { word: 尝试次数 }；间隔算法结果以第一次判断为准（记错了修正首次判断除外）
  mcqFirst: {},         // { word: { w2m:true|false, m2w:true|false } } 选择题首次作答结果（重试答对不洗白，供组合评分）
  spellSettled: {},     // { word: true } 拼写证据已结算标记（同词同业务日仅结算一次）
  baseTaskTotal: 0,     // 会话初始任务总数（保留兼容字段）
  answeredCount: 0,     // 进度分子 = 本次已作答任务数（对错都算一次）；分母 = 队列任务总数（答错的重复任务计入，总进度随之 +1）
};

function saveReviewSession() {
  try { localStorage.setItem(REVIEW_SESSION_KEY, JSON.stringify(reviewSession)); } catch (_) {}
}

function clearReviewSession() {  try { localStorage.removeItem(REVIEW_SESSION_KEY); } catch (_) {}
}

/* ---------- 今日复习记录：完成页列表的真实数据源 ----------
   只记录今天真实发生过的作答（wordResults / mcqRecord / spellResults），
   不根据 reviewStore 当前状态反推；按词天然去重，重复态不产生重复行。
   跨会话同日合并：一天内多次完成（如清空队列重建后再次复习）时累加，不清掉早前结果。 */

/** 同一天内选择题/拼写状态合并：出现过错或跳过则保留（-red），否则 correct（绿） */
function mergeReviewStatus(a, b) {
  if (a === "wrong" || b === "wrong") return "wrong";
  if (a === "skipped" || b === "skipped") return "skipped";
  return "correct";
}

/** 从当前会话提取今日复习记录（仅真实发生过的数据；phase=done 时调用） */
function buildTodayRecord() {
  const meaning = {}, mcq = {}, spell = {};
  for (const w of Object.keys(reviewSession.wordResults)) {
    const r = reviewSession.wordResults[w];
    if (r && r.recall) meaning[w] = r.recall; // 词义复习最终实际结果（含「记错了」修正）
  }
  for (const [w, s] of Object.entries(reviewSession.mcqRecord || {})) mcq[w] = s;
  for (const [w, s] of Object.entries(reviewSession.spellResults || {})) spell[w] = s;
  return { day: vocabDay(), meaning, mcq, spell };
}

/** 保存今日复习记录：与同日已有记录合并（词义取最终结果，选择题/拼写保错留红） */
function saveReviewTodayRecord(rec) {
  try {
    const prev = loadReviewTodayRecord();
    if (prev) {
      rec.meaning = { ...prev.meaning, ...rec.meaning };
      for (const w of Object.keys(prev.mcq)) {
        rec.mcq[w] = mergeReviewStatus(prev.mcq[w], rec.mcq[w]);
      }
      for (const w of Object.keys(prev.spell)) {
        rec.spell[w] = mergeReviewStatus(prev.spell[w], rec.spell[w]);
      }
    }
    localStorage.setItem(REVIEW_TODAY_KEY, JSON.stringify(rec));
    reviewDays[rec.day] = 1; // 连续 Review 天数：当天 Review 会话完整走完 → 标记（幂等，同日多次合并不重复计）
    try { localStorage.setItem(REVIEW_DAYS_KEY, JSON.stringify(reviewDays)); } catch (_) {}
  } catch (_) {}
}

/** 读取今日复习记录：仅限当天（跨天自动失效）；无记录返回 null */
function loadReviewTodayRecord() {
  try {
    const r = JSON.parse(localStorage.getItem(REVIEW_TODAY_KEY) || "null");
    if (r && r.day === vocabDay() && r.meaning && r.mcq && r.spell) return r;
  } catch (_) {}
  return null;
}

/** 旧版本兼容：从既有 Review 数据（vc-review）推导「今天已完成过 Review」的记录，仅用于展示，不落盘。
    依据：完成今日 Review 时每个到期词都会被 answerReview 结算——lastAt 记为今天、nextAt 推向未来，
    待复习队列随之清空。因此「lastAt 为今天（业务日）的词」即今天真实复习过的词
    （新版本完成后同样成立，用于补齐今日记录中缺失的词）。
    词义结果按结算后的 SR 状态反推（旧版本留下的唯一结果线索）：
      mode=long → 认识；mode=booster → 模糊；mode=daily → 不认识
    （「模糊后停留 daily」的少数场景与不认识无法区分，按需强化显示，不影响状态判断）。
    选择题/拼写明细旧版本未记录 → 留空（列表显示"今天没有…记录"）。 */
function deriveLegacyTodayRecord() {
  const day = vocabDay();
  const meaning = {};
  for (const w of Object.keys(reviewStore.words)) {
    const st = reviewStore.words[w];
    if (!st || !st.lastAt || bizDayOf(st.lastAt) !== day) continue;
    if (st.mode === "long") meaning[w] = "known";
    else if (st.mode === "booster") meaning[w] = "fuzzy";
    else meaning[w] = "unknown";
  }
  if (Object.keys(meaning).length === 0) return null;
  return { day, meaning, mcq: {}, spell: {} };
}

/** 今日复习记录统一入口：新版本精确记录优先，旧版本推导结果补齐缺失的词。
    供首页状态判断与完成页列表使用；只读，不写任何数据。 */
function getTodayReviewRecord() {
  const rec = loadReviewTodayRecord();
  const legacy = deriveLegacyTodayRecord();
  if (!rec) return legacy;
  if (!legacy) return rec;
  return {
    day: rec.day,
    meaning: { ...legacy.meaning, ...rec.meaning },
    mcq: { ...rec.mcq },
    spell: { ...rec.spell },
  };
}

/** 今日复习记录中的实际复习词数（三态并集去重，供完成页「共复习 N 个单词」） */
function todayRecordWordCount(rec) {
  const set = new Set([...Object.keys(rec.meaning), ...Object.keys(rec.mcq), ...Object.keys(rec.spell)]);
  return set.size;
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

/* ============================================================
   MCQ 选择题 — 干扰项生成算法
   ------------------------------------------------------------
   两种选择题共用词典数据（DICT_KEYS / DICT_DATA / ECDICT），
   纯只读查询，绝不修改任何词典或会话状态。
   ============================================================ */

/** 中文释义→纯释义文本（去掉词性前缀），用于长度/字符比较 */
function stripPos(meaning) {
  return String(meaning).replace(/^[^\u4e00-\u9fa5a-zA-Z]*[a-z]+\.\s*/, "").trim();
}

/** 两个中文字符串共享的字符数 */
function sharedChineseChars(a, b) {
  let count = 0;
  const setB = new Set(b);
  for (const ch of a) { if (setB.has(ch)) count++; }
  return count;
}

/**
 * 提取单词的前 N 条释义，拼接为单行文本（用于 MCQ 选项显示）
 * @param {string} word 单词
 * @param {number} maxSenses 最多取几条（默认 2）
 * @returns {string} 拼接后的释义文本，如 "制造商；生产商" 
 */
function topSensesText(word, maxSenses = 2) {
  const d = dictGet(word);
  if (!d) return "";
  const senses = sensesOf(d);
  const parts = [];
  for (const [, defs] of senses) {
    for (const def of (defs || [])) {
      parts.push(def);
      if (parts.length >= maxSenses) return parts.join("；");
    }
  }
  return parts.join("；");
}

/**
 * 提取单词的全部释义，拼接为多行文本（用于 MCQ 题目显示）
 * @param {string} word 单词
 * @returns {string} 全部释义拼接（用换行分隔）
 */
function allSensesText(word) {
  const d = dictGet(word);
  if (!d) return "";
  const senses = sensesOf(d);
  const parts = [];
  for (const [, defs] of senses) {
    for (const def of (defs || [])) {
      parts.push(def);
    }
  }
  return parts.join("；");
}

/**
 * 单词→选释义：生成 3 个干扰项，每项包含 2 条释义 + 源单词（用于长按）
 * 形近干扰逻辑（本次修正）：
 *   正确逻辑：用户看到目标英文单词 → 从 4 个中文释义中选正确释义。
 *   - 1 个为目标单词的真实释义（Top2 主要释义完整显示）
 *   - 另外 3 个干扰项来自「拼写/外形与目标单词相似，但实际含义完全不同」的其他英文单词
 *   - 干扰项优先从考研词书（DICT_KEYS / DICT_DATA）中选择
 *   - 利用现有形近静态对照（editDistance / 长度差 / 首字母等）优先寻找候选
 *   - 排除同词根/派生/词形变化（sameRoot）及语义明显相关的词（中文释义共享字符≥2）
 *   - 将这些形近但意思无关的词对应的中文释义（Top2）作为干扰项
 *   - 若形近候选不足 3 个，则随机兜底补齐（仍排除同根与语义相关），确保始终 4 选 1
 * @returns {{text: string, word: string}[]}  干扰项数组
 */
function generateMeaningDistractors(word, correctMeaning, count = 3) {
  const target = String(word || "").trim().toLowerCase();
  if (!target) return [];
  const dTarget = dictGet(target);
  if (!dTarget) return [];
  // 正确释义文本（用于语义去重/过滤）：Top2 展示文本 + 首条去词性纯中文
  const correctDisplay = topSensesText(target, 2);
  const sensesTarget = sensesOf(dTarget);
  const firstRaw = (correctMeaning && String(correctMeaning).trim())
    || (sensesTarget[0] && sensesTarget[0][1] && sensesTarget[0][1][0])
    || (correctDisplay.split("；")[0] || "");
  const correctFirst = stripPos(firstRaw);
  const correctCombined = stripPos(correctDisplay);
  if (!correctFirst && !correctCombined) return [];

  // 语义关联判定：共享中文字符≥2 视为明显相关，予以排除（"的"等单字共有不算）
  function isSemanticallyRelated(candFirst) {
    if (!candFirst || !correctFirst) return false;
    if (candFirst === correctFirst || candFirst === correctCombined) return true;
    if (sharedChineseChars(candFirst, correctFirst) >= 2) return true;
    if (correctCombined && sharedChineseChars(candFirst, correctCombined) >= 3) return true;
    return false;
  }

  const candidates = [];
  for (const w of DICT_KEYS) {
    if (w === target) continue;
    if (sameRoot(w, target)) continue; // 排除同词根/派生/词形变化
    const lenDiff = Math.abs(w.length - target.length);
    if (lenDiff > 3) continue; // 形近：长度差太大直接排除
    const d = DICT_DATA[w];
    if (!d || !d.senses || !d.senses.length) continue;
    const firstDefs = d.senses[0] && d.senses[0][1];
    if (!firstDefs || !firstDefs.length) continue;
    const candFirst = stripPos(firstDefs[0]);
    if (!candFirst) continue;
    if (isSemanticallyRelated(candFirst)) continue; // 排除语义相关
    const ed = editDistance(w, target);
    let score = -ed * 2 - lenDiff;
    if (w[0] === target[0]) score += 3;
    if (w.length > 1 && target.length > 1 && w[1] === target[1]) score += 1;
    candidates.push({ w, score, ed, candFirst });
  }
  candidates.sort((a, b) => b.score - a.score || Math.random() - 0.5);

  const seen = new Set();
  if (correctDisplay) seen.add(correctDisplay);
  if (correctFirst) seen.add(correctFirst);
  if (correctCombined) seen.add(correctCombined);

  const result = [];
  for (const c of candidates) {
    const display = topSensesText(c.w, 2) || stripPos(DICT_DATA[c.w].senses[0][1][0]);
    if (!display) continue;
    const key = stripPos(display.split("；")[0]);
    if (seen.has(display) || seen.has(key)) continue;
    if (isSemanticallyRelated(key)) continue;
    seen.add(display);
    seen.add(key);
    result.push({ text: display, word: c.w });
    if (result.length >= count) break;
  }

  // 兜底：形近候选不足时，随机补齐（仍排除同根与语义相关，去重）
  if (result.length < count) {
    const existing = new Set(result.map(r => r.word));
    existing.add(target);
    const pool = [];
    for (const w of DICT_KEYS) {
      if (existing.has(w)) continue;
      if (sameRoot(w, target)) continue;
      const d = DICT_DATA[w];
      if (!d || !d.senses || !d.senses.length) continue;
      const firstDefs = d.senses[0] && d.senses[0][1];
      if (!firstDefs || !firstDefs.length) continue;
      const candFirst = stripPos(firstDefs[0]);
      if (!candFirst) continue;
      if (isSemanticallyRelated(candFirst)) continue;
      const display = topSensesText(w, 2);
      if (!display) continue;
      const key = stripPos(display.split("；")[0]);
      if (seen.has(display) || seen.has(key)) continue;
      pool.push({ w, display, key });
    }
    // Fisher-Yates 随机打乱
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const p of pool) {
      if (result.length >= count) break;
      if (seen.has(p.display) || seen.has(p.key)) continue;
      seen.add(p.display);
      seen.add(p.key);
      result.push({ text: p.display, word: p.w });
    }
  }
  return result;
}

/**
 * 两个英文单词的编辑距离（简化版：仅用于相似度评分）
 */
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * 判断两个英文单词是否同词根/词形变化（排除为干扰项）
 * 规则：共享前缀长度 > min(len)*0.6 视为同根
 */
function sameRoot(a, b) {
  const la = a.toLowerCase(), lb = b.toLowerCase();
  let prefixLen = 0;
  const minLen = Math.min(la.length, lb.length);
  for (let i = 0; i < minLen; i++) {
    if (la[i] === lb[i]) prefixLen++;
    else break;
  }
  return prefixLen > minLen * 0.6;
}

/**
 * 释义→选单词：生成 3 个英文干扰项
 * @param {string} word   目标单词
 * @param {number} count  干扰项数量（默认 3）
 * @returns {string[]}    干扰项单词数组（不含正确单词）
 */
function generateWordDistractors(word, count = 3) {
  const target = word.toLowerCase();
  const targetLen = target.length;
  if (targetLen === 0) return [];

  const candidates = [];
  for (const w of DICT_KEYS) {
    if (w === target) continue;
    if (sameRoot(w, target)) continue; // 排除同词根/词形变化
    const lenDiff = Math.abs(w.length - targetLen);
    if (lenDiff > 3) continue; // 长度差太大
    // 评分：长度差越小越好 + 首字母相同加分 + 编辑距离越小越好
    const ed = editDistance(w, target);
    let score = -ed * 2 - lenDiff;
    if (w[0] === target[0]) score += 3; // 首字母相同加分
    candidates.push({ word: w, score });
  }

  candidates.sort((a, b) => b.score - a.score || Math.random() - 0.5);
  const result = [];
  for (const c of candidates) {
    result.push(c.word);
    if (result.length >= count) break;
  }
  return result;
}

/**
 * 构建 MCQ 题目数据
 * @param {"w2m"|"m2w"} type  题目类型
 * @param {string} word        目标单词
 * @returns {object|null}      { question, options[], correctIdx, optionWords[] }
 *   optionWords[i] = 该选项对应的单词（w2m 时为选项释义所属单词，m2w 时为选项单词）
 */
function buildMcqData(type, word) {
  const d = dictGet(word);
  if (!d) return null;

  if (type === "w2m") {
    // 单词→选释义：每个选项展示 2 条释义
    const senses = sensesOf(d);
    if (!senses.length || !senses[0][1] || !senses[0][1].length) return null;
    const firstMeaning = senses[0][1][0];
    const correctText = topSensesText(word, 2); // 正确选项：前 2 条释义
    const distractors = generateMeaningDistractors(word, firstMeaning, 3);
    if (distractors.length < 1) return null;
    // 构建选项数组：{text: 显示文本, word: 对应单词}
    const correctOpt = { text: correctText, word: word };
    const allOpts = shuffleArray([correctOpt, ...distractors]);
    const correctIdx = allOpts.indexOf(correctOpt);
    const optionTexts = allOpts.map(o => o.text);
    const optionWords = allOpts.map(o => o.word);
    return { question: word, options: optionTexts, correctIdx, type: "w2m", optionWords };
  }

  if (type === "m2w") {
    // 释义→选单词：题目显示完整释义集合
    const senses = sensesOf(d);
    if (!senses.length || !senses[0][1] || !senses[0][1].length) return null;
    const fullQuestion = allSensesText(word); // 全部释义
    const distractors = generateWordDistractors(word, 3);
    if (distractors.length < 1) return null;
    const options = shuffleArray([word, ...distractors]);
    const correctIdx = options.indexOf(word);
    return { question: fullQuestion, options, correctIdx, type: "m2w", optionWords: options };
  }

  return null;
}

/** 构建任务池（三态队列）：
    第一段 = 第一态「回忆」：严格按当天待复习顺序逐词一次（A→B→C→…）；
    第二段 = 后两态「看词选义 + 看义选词」：所有单词的两种考察混入同一队列完全随机打乱，
    且同一单词的两态不相邻（不连续考察同一个词）。拼写仍是独立阶段，不进本队列。 */
function buildTaskPool(words) {
  const tasks = [];
  // 第一态：按原本待复习顺序，每词仅判断一次
  words.forEach(w => tasks.push({ word: w, step: "recall" }));
  // 后两态：同一混合队列，完全随机且同词不相邻（承接最后一词的回忆，避免回忆→选择题同词相连）
  const mixed = [];
  words.forEach(w => {
    mixed.push({ word: w, step: "w2m" });
    mixed.push({ word: w, step: "m2w" });
  });
  return tasks.concat(buildMixedQueue(mixed, words.length ? words[words.length - 1] : null));
}

/** 后两态混合队列：完全随机打乱（Fisher-Yates 拒绝采样），同一单词的两种考察不相邻。
    每词恰有两个任务时单词数 ≥2 必有解，随机排列命中率高（n≥5 几乎一次通过）；
    仅 1 词时无法避免相邻，兜底随机顺序。 */
function buildMixedQueue(tasks, prevWord) {
  if (tasks.length <= 1) return tasks.slice();
  const ok = (arr) => arr.every((t, i) =>
    t.word !== (i === 0 ? prevWord : arr[i - 1].word));
  for (let tries = 0; tries < 1000; tries++) {
    const arr = shuffleArray(tasks);
    if (ok(arr)) return arr;
  }
  return shuffleArray(tasks); // 理论上不可达（每词两任务且 ≥2 词必有解）
}

/** 识别旧版任务池（三任务整体打乱、无「先回忆后混合」结构）：
    新格式中未完成的 recall 必连续位于剩余队列最前段，且保持当天待复习相对顺序。
    带 repeat 标记的任务是「词义态队尾重复」（新机制产物），不参与旧格式识别。 */
function isStaleTaskPool(s) {
  let sawNonRecall = false;
  for (let i = s.idx; i < s.queue.length; i++) {
    const t = s.queue[i];
    if (t.repeat) continue;
    const key = t.word + "|" + t.step;
    if (s.completed[key]) continue;
    if (t.step !== "recall") { sawNonRecall = true; continue; }
    if (sawNonRecall) return true; // 混合段之后仍有未完成的回忆任务 → 旧格式（或结构损坏）
  }
  return false;
}

/** 读取并恢复会话（支持旧格式迁移） */
function loadReviewSession() {
  try {
    const s = JSON.parse(localStorage.getItem(REVIEW_SESSION_KEY) || "null");
    if (s && s.day === vocabDay() && Array.isArray(s.queue) && s.queue.length > 0) {
      // 检测旧格式（queue 元素是字符串而非对象）→ 废弃旧会话，重建
      if (typeof s.queue[0] === "string") {
        return null; // 旧格式 → 返回 null 让 openReview 重建
      }

      // 与生词本同步：过滤掉已删除的词
      s.queue = s.queue.filter(t => t && t.word && reviewStore.words[t.word] && isStarred(t.word));
      if (s.queue.length === 0) return null;

      // 旧版「三任务整体打乱」任务池不符合新三态结构（第一态顺序 + 后两态混合）→ 废弃重建；
      // 判断仅在当天首次回忆前调用，重建不会造成重复计入记忆曲线（answerReview 延迟到单词三态全部完成）
      if (isStaleTaskPool(s)) return null;

      // Phase 1 恢复
      s.idx = Math.min(s.idx || 0, s.queue.length);
      if (!s.stats) s.stats = { n: 0, known: 0, fuzzy: 0, unknown: 0 };
      if (!s.answeredToday || typeof s.answeredToday !== "object") s.answeredToday = {};
      if (!s.initialCount || s.initialCount < 1) s.initialCount = Math.ceil(s.queue.length / 3);
      if (!s.completed || typeof s.completed !== "object") s.completed = {};
      if (!s.wordResults || typeof s.wordResults !== "object") s.wordResults = {};
      if (!s.wordsDone || typeof s.wordsDone !== "object") s.wordsDone = {};
      if (!s.mcqStats) s.mcqStats = { w2mCorrect: 0, m2wCorrect: 0, w2mTotal: 0, m2wTotal: 0 };
      if (!s.mcqRecord || typeof s.mcqRecord !== "object") s.mcqRecord = {};
      if (!s.spellResults || typeof s.spellResults !== "object") s.spellResults = {};
      if (!s.recallAttempts || typeof s.recallAttempts !== "object") s.recallAttempts = {};
      if (!s.mcqFirst || typeof s.mcqFirst !== "object") s.mcqFirst = {};
      if (!s.spellSettled || typeof s.spellSettled !== "object") s.spellSettled = {};
      // 进度分母兜底：老会话无 baseTaskTotal → 用当前队列长度（含已产生的重复任务，仅为兼容）
      if (!s.baseTaskTotal || s.baseTaskTotal < 1) s.baseTaskTotal = s.queue.length;
      if (typeof s.answeredCount !== "number") s.answeredCount = 0;
      // 恢复当前任务引用
      if (s.idx < s.queue.length) {
        s.currentTask = s.queue[s.idx];
        s.current = s.currentTask.word;
      }
      // MCQ 数据恢复
      if (s.currentTask && s.currentTask.step !== "recall" && !s.mcqData) {
        // MCQ 任务但无题目数据 → 重建
        const mcqType = s.currentTask.step;
        s.mcqData = buildMcqData(mcqType, s.currentTask.word);
        if (!s.mcqData) {
          // 词典数据不足 → 跳过该任务
          s.completed[s.currentTask.word + "|" + s.currentTask.step] = true;
          s.idx++;
          s.currentTask = s.idx < s.queue.length ? s.queue[s.idx] : null;
          s.current = s.currentTask ? s.currentTask.word : null;
        }
      }
      
      // Phase 2 恢复
      if (s.phase === "spell" || s.phase === "done") {
        const uniqueWords = [...new Set(s.queue.map(t => t.word))];
        if (!Array.isArray(s.spellQueue) || s.spellQueue.length === 0) {
          s.spellQueue = shuffleArray(uniqueWords);
        }
        s.spellQueue = s.spellQueue.filter(w => reviewStore.words[w] && isStarred(w));
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
  pushPageSnapshot(); // Review 属 home 子页：快照离开前的页面状态，返回时恢复
  renderAll();
  if (window.VH_STATS) VH_STATS.touch(); // 学习统计：会话开始，重置有效时长计时
  const saved = loadReviewSession();
  
  if (saved) {
    reviewSession = saved;
  } else {
    const queue = reviewQueue();
    if (queue.length === 0) {
      switchTab("review");
      rvHideProgress();
      // 首页状态区分「今日本来就没有任务」与「今天已完成」：
      // getTodayReviewRecord = 新版本今日记录 ∪ 旧版本数据推导（vc-review 的 lastAt/nextAt 痕迹），
      // 旧版本完成今日 Review 后更新到新版本，也能识别出「今天已完成」而不是误判为无需复习。
      // 两个状态页均在沉浸模式之外渲染 → 正常显示全局背景图。
      const todayRec = getTodayReviewRecord();
      if (todayRec && todayRecordWordCount(todayRec) > 0) {
        renderDone($("#review-body"), todayRec);
        return;
      }
      $("#review-body").innerHTML = `<div class="rv-done rv-screen">
        <div class="rv-done-check">✓</div>
        <h2 class="rv-done-title">今日无需复习</h2>
        <p class="rv-done-sub">没有待复习的单词</p>
        <p class="rv-done-hint">继续学习新单词，积累复习任务</p>
        <button class="rv-btn-go" id="review-done-back" type="button">返回首页</button>
      </div>`;
      return;
    }
    
    // 构建任务池：第一态按待复习顺序，后两态混合随机（同词不相邻）
    const taskPool = buildTaskPool(queue);
    rvMcqAutoSpoken = {}; // 新会话：重置「看词选义」自动播报标记（每题仅自动播报一次）
    reviewSession = {
      day: vocabDay(),
      phase: "meaning",
      queue: taskPool,
      idx: 0,
      current: null,
      currentTask: null,
      lastResult: null,
      snapshot: null,
      stats: { n: 0, known: 0, fuzzy: 0, unknown: 0 },
      answeredToday: {},
      initialCount: queue.length,
      mcqData: null,
      mcqStats: { w2mCorrect: 0, m2wCorrect: 0, w2mTotal: 0, m2wTotal: 0 },
      completed: {},
      wordResults: {},
      wordsDone: {},
      detailCtx: null,
      spellQueue: [],
      spellIdx: 0,
      spell: { submitted: false, correct: false, input: "" },
      spellStats: { correct: 0, wrong: 0, skipped: 0 },
      mcqRecord: {},
      spellResults: {},
      recallAttempts: {},
      mcqFirst: {},
      spellSettled: {},
      baseTaskTotal: taskPool.length,
      answeredCount: 0,
    };
    saveReviewSession();
  }
  
  // 进入沉浸模式
  document.body.classList.add("review-active");
  switchTab("review");
  // 预加载 Review 队列中考研词书未收录的词（如 manufacturer），确保 MCQ 同步取义可用
  Promise.all([...new Set(reviewSession.queue.map((t) => t.word))].map((w) => dictGetAsync(w))).catch(() => {});
  renderReviewByPhase();
}

/** 按阶段渲染（统一经 rvRender 做轻量切换动画） */
function renderReviewByPhase() {
  const body = $("#review-body");
  
  if (reviewSession.phase === "meaning") {
    // 跳过已完成的任务（可能被标记为 completed 但仍在队列中）
    while (reviewSession.idx < reviewSession.queue.length) {
      const t = reviewSession.queue[reviewSession.idx];
      const key = t.word + "|" + t.step;
      if (reviewSession.completed[key]) {
        reviewSession.idx++;
        continue;
      }
      break;
    }
    if (reviewSession.idx >= reviewSession.queue.length) {
      // Phase 1 完成，进入过渡页
      reviewSession.phase = "transition";
      saveReviewSession();
      return rvRender(() => renderTransition(body));
    }
    const task = reviewSession.queue[reviewSession.idx];
    reviewSession.currentTask = task;
    reviewSession.current = task.word;

    // 按任务类型路由（进度由各渲染函数统一调用 rvMeaningProgress）
    if (task.step === "recall") {
      return rvRender(() => renderMeaning(body));
    }
    if (task.step === "w2m") {
      // 构建 MCQ 数据（如果还没有）
      if (!reviewSession.mcqData || reviewSession.mcqData.type !== "w2m" || reviewSession.mcqData.question !== task.word) {
        reviewSession.mcqData = buildMcqData("w2m", task.word);
        if (!reviewSession.mcqData) {
          // 词典数据不足 → 跳过该任务
          reviewSession.completed[task.word + "|w2m"] = true;
          reviewSession.idx++;
          saveReviewSession();
          return renderReviewByPhase(); // 递归处理下一个任务
        }
      }
      return rvRender(() => renderMcqWord2Meaning(body));
    }
    if (task.step === "m2w") {
      if (!reviewSession.mcqData || reviewSession.mcqData.type !== "m2w" || reviewSession.mcqData.question !== task.word) {
        reviewSession.mcqData = buildMcqData("m2w", task.word);
        if (!reviewSession.mcqData) {
          reviewSession.completed[task.word + "|m2w"] = true;
          reviewSession.idx++;
          saveReviewSession();
          return renderReviewByPhase();
        }
      }
      return rvRender(() => renderMcqMean2Word(body));
    }
    return rvRender(() => renderMeaning(body));
  }
  
  if (reviewSession.phase === "spell") {
    if (reviewSession.spellIdx >= reviewSession.spellQueue.length) {
      // Phase 2 完成：先落盘今日复习记录（完成页列表数据源 + 再次进入时判定「今日复习完成」），
      // 再清空已结束的会话（勿再 saveReviewSession 回写，否则重启后残留"已完成"会话）。
      // 并入旧版本推导记录（deriveLegacyTodayRecord）：今天早些时候在旧版本复习过的词也进列表，
      // 会话精确结果优先于推导结果。完成页属于状态页 → 退出沉浸模式，恢复全局背景图。
      const record = buildTodayRecord();
      const legacyToday = deriveLegacyTodayRecord();
      if (legacyToday) record.meaning = { ...legacyToday.meaning, ...record.meaning };
      saveReviewTodayRecord(record);
      reviewSession.phase = "done";
      clearReviewSession();
      document.body.classList.remove("review-active");
      return rvRender(() => renderDone(body, record));
    }
    reviewSession.current = reviewSession.spellQueue[reviewSession.spellIdx];
    return rvRender(() => renderSpell(body));
  }
  
  if (reviewSession.phase === "done") {
    return rvRender(() => renderDone(body, getTodayReviewRecord() || buildTodayRecord()));
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

/** 屏幕切换动画：翻书换页（从左向右轻翻；表现层）
    旧屏克隆为「翻出页」（不透明，以左缘为轴向右轻旋揭走），新屏先垫底渲染再旋入就位
    —— 新屏全程在场，绝无白屏/闪烁；约 280ms，轻微克制（无 3D 卷曲） */
let rvAnimating = false;
function rvRender(fn) {
  const body = $("#review-body");
  if (!body || rvAnimating) { fn(); return; }
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) { fn(); return; }
  const cur = body.firstElementChild;
  if (!cur) { fn(); return; }
  rvAnimating = true;
  const flip = cur.cloneNode(true);           // 克隆当前屏作为翻出页
  flip.classList.add("rv-flip-out");
  flip.setAttribute("aria-hidden", "true");
  fn();                                       // 新屏垫底渲染（立刻在场 → 无白屏）
  try { flip.scrollTop = cur.scrollTop; } catch (_) {} // 保留旧屏滚动位置
  const next = body.firstElementChild;
  if (next) next.classList.add("rv-flip-in");
  body.appendChild(flip);                     // 翻出页盖上，向右轻翻揭走
  setTimeout(() => {
    if (flip.parentNode) flip.remove();
    if (next) next.classList.remove("rv-flip-in");
    rvAnimating = false;
  }, 300);
}

/** 统一进度计算（作答计数语义）：
    分子 = 本次已作答任务数（answeredCount，对错都算一次，初始为 0）；
    分母 = 队列当前任务总数（答错产生的重复任务入队 → 总进度随之 +1）。
    例：5 词 15 态，第 1 词答错 → 1/16，重复出现在词义段队尾后再答对 → 2/16。 */
function rvMeaningProgress() {
  const total = reviewSession.queue.length;
  rvSetProgress(Math.min(reviewSession.answeredCount, total), total);
}

/** 「娴熟」毕业按钮（右上角灰色小字）。
    点击后该词彻底毕业：立即移出 Review 队列、后续 FSRS 不再排期；
    生词本记录与全部学习历史保留，不删除单词本身。 */
function rvMasteredBtnHtml() {
  return `<button class="rv-mastered" data-mastered="1" type="button" aria-label="标记娴熟，退出复习队列">娴熟</button>`;
}

/** Phase 1: 词义复习 - 回忆页（单词舞台中央，顶部进度，底部判断区） */
function renderMeaning(body) {
  const word = reviewSession.current;
  
  rvMeaningProgress();
  
  body.innerHTML = `<div class="rv-meaning rv-screen">
    ${rvMasteredBtnHtml()}
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
  
  // 回忆页自动播放一次英语发音（本地 TTS 优先，在线兜底；仅此一次）
  // 用户答题/离开时立即停止（见 onReviewAnswer / reviewNext / exitReview 的 ttsStop）
  setTimeout(() => ttsSpeak(word, 1), 120);
}

/** Phase 1: 词义复习 - 释义确认页（单词头部 → 词性/释义列表 → 底部操作） */
function renderDetail(body) {
  const word = reviewSession.current;
  const ctx = reviewSession.detailCtx;
  const isRecallDetail = ctx && ctx.task && ctx.task.step === "recall";
  const isMcqWrong = ctx && ctx.action === "retry";
  // 「记错了」在「认识/模糊」后的词义详情页显示（与「认识 → 记错了」复用同一 reviewCorrection）：
  // 不认识已是明确的最差判断，无需修正
  const showCorrection = isRecallDetail && (reviewSession.lastResult === "known" || reviewSession.lastResult === "fuzzy");
  
  // 判断印记颜色：recall 详情用 recall 结果，MCQ 答错用 unknown 色
  const resultForColor = isMcqWrong ? "unknown" : reviewSession.lastResult;
  const indicatorClass = resultForColor === "known" ? "rv-detail-indicator--known" 
                       : resultForColor === "fuzzy" ? "rv-detail-indicator--fuzzy" 
                       : "rv-detail-indicator--unknown";
  
  const senses = rvSenseRows(word);
  // 考研词书 → 逐条释义按统一等级着色（含「僻」角标）；其他来源 → 原有纯文本
  const g = window.KY ? KY.kyLevel(word) : null;
  const sensesHtml = g
    ? g.rows.map((row) => `<div class="rv-sense">${row.pos ? `<span class="rv-pos">${esc(row.pos)}</span>` : ""}<p class="rv-sense-meaning">${KY.kyJoin(row.meanings)}</p></div>`).join("")
    : (senses.length
      ? senses.map((s) => `<div class="rv-sense">${s.pos ? `<span class="rv-pos">${esc(s.pos)}</span>` : ""}<p class="rv-sense-meaning">${esc(s.meaning)}</p></div>`).join("")
      : `<div class="rv-sense"><p class="rv-sense-meaning" style="color:var(--text-2);">暂无释义</p></div>`);
  
  rvMeaningProgress();
  
  body.innerHTML = `<div class="rv-detail rv-screen">
    ${rvMasteredBtnHtml()}
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
      ${showCorrection ? '<button class="rv-btn-wrong" id="review-wrong" type="button">记错了</button>' : ""}
      <button class="rv-btn-next" id="review-next" type="button">${isMcqWrong ? "继续" : "下一个"}</button>
    </div>
  </div>`;
  
  // 自动播放 TTS：仅 recall 详情时
  if (isRecallDetail) {
    setTimeout(() => ttsSpeak(word, 1), 200);
  }
}

/* ============================================================
   MCQ 选择题 — 渲染函数
   ------------------------------------------------------------
   两种选择题共用选项卡片布局，差异仅在题目区（单词 vs 释义）
   和选项内容（中文释义 vs 英文单词）。
   点击选项即判断，正确绿色/错误红色 + 音效，1.2s 后自动进入下一步。
   长按选项显示反向信息（辅助学习，不影响答题结果）。
   ============================================================ */

/** MCQ 选项卡片 HTML 生成 */
function mcqOptionsHtml(options) {
  return options.map((opt, i) =>
    `<button class="rv-mcq-option" data-mcq-idx="${i}" data-mcq-longpress="${i}" type="button">${esc(opt)}</button>`
  ).join("");
}

/** 看词选义 · 单个中文选项的释义行（最多 2 条，带词典真实词性）。
    两种情况严格区分，互不混淆：
      情况一：该选项的英文单词命中考研词书
        → 取「考研词书释义分级」结果中最具代表性的两条（绿色高频优先 → 黄色补足 → 其余补足），
          逐条带词性 + 考研等级配色（绿/黄/灰）+ 「僻」角标。
      情况二：该英文单词仅命中 ECDICT
        → 保持 ECDICT 原有释义数据与原有纯文本显示方式，仅补上真实词性，
          不套用考研绿色/黄色/灰色分级，不人为加色。
    绝不虚构释义：不足两条就只显示已有条数。
    @param {string} word 选项对应的英文单词
    @param {number} max  最多显示几条（默认 2）
    @returns {{pos:string, text:string, level?:string, obscure?:boolean}[]} */
function w2mOptionSenseRows(word, max = 2) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return [];

  // 情况一：考研词书命中 → 考研词书释义 + 考研释义颜色体系
  if (window.KY && KY.kyTopSenses) {
    const kyRows = KY.kyTopSenses(w, max);
    if (kyRows && kyRows.length) return kyRows;
  }

  // 情况二：仅 ECDICT 兜底 → ECDICT 原有释义 + 原有显示方式（纯文本，无等级色）
  const d = dictGet(w);
  if (!d) return [];
  const rows = [];
  const seen = new Set();
  for (const [pos, defs] of sensesOf(d)) {
    for (const def of (defs || [])) {
      const t = String(def || "").trim();
      if (!t || seen.has(t)) continue; // 同词不同词性的重复释义只保留一次
      seen.add(t);
      rows.push({ pos: pos || "", text: t });
      if (rows.length >= max) return rows;
    }
  }
  return rows;
}

/** MCQ 选项卡片 HTML（看词选义 · 四个中文释义选项）。
    每个选项内部显示其所属英文单词最具代表性的两条中文释义，分行排布、逐条带真实词性：
      · 命中考研词书 → 按考研释义分级着色（绿 / 黄 / 灰）+ 「僻」角标；
      · 仅 ECDICT 命中 → ECDICT 原有释义 + 原有纯文本显示，不套考研配色。
    干扰项生成、四选项随机排列、正确答案位置、判定与音效逻辑均不变。 */
function mcqOptionsHtmlGraded(options, optionWords) {
  return options.map((opt, i) => {
    const w = optionWords && optionWords[i];
    const rows = w ? w2mOptionSenseRows(w, 2) : [];
    const inner = rows.length
      ? rows.map((r) => {
          // 有 level 即来自考研词书分级 → 等级色 + 「僻」；否则保持 ECDICT 纯文本
          const textHtml = r.level && window.KY
            ? KY.kySpan({ text: r.text, level: r.level, obscure: !!r.obscure })
            : esc(r.text);
          const posHtml = r.pos ? `<span class="rv-mcq-pos">${esc(r.pos)}</span>` : "";
          return `<span class="rv-mcq-line">${posHtml}<span class="rv-mcq-text">${textHtml}</span></span>`;
        }).join("")
      : esc(opt);
    return `<button class="rv-mcq-option" data-mcq-idx="${i}" data-mcq-longpress="${i}" type="button">${inner}</button>`;
  }).join("");
}

/** 已自动播报过的「看词选义」题目 key（word|w2m），防重渲染/重考重复自动播放。
    仅内存态：新会话重建时清空（见 openReview）；手动点扬声器不依赖此标记 */
let rvMcqAutoSpoken = {};

/** Phase 1 子步骤: 单词→选释义 */
function renderMcqWord2Meaning(body) {
  const word = reviewSession.current;
  const data = reviewSession.mcqData;
  if (!data) { reviewNext(); return; }

  rvMeaningProgress();

  body.innerHTML = `<div class="rv-meaning rv-mcq rv-screen">
    ${rvMasteredBtnHtml()}
    <div class="rv-stage">
      <div class="rv-word-row">
        <h2 class="rv-word ${rvWordSizeClass(word)}">${esc(word)}</h2>
        <button class="rv-speaker" id="rv-mcq-speaker" data-speak="${esc(word)}" aria-label="播放读音" type="button">${SPEAKER_SVG}</button>
      </div>
      <p class="rv-mcq-hint">选择正确的中文释义</p>
    </div>
    <div class="rv-mcq-options">
      ${mcqOptionsHtmlGraded(data.options, data.optionWords)}
    </div>
  </div>`;

  // 看词选义：单词出现后自动播报一次英语发音，完全复用回忆态实现
  // （延迟 120ms、本地 TTS 优先 + 在线兜底；进入下一题时 reviewNext 已 ttsStop 立即中断上一条）。
  // 同一题（word|w2m）仅自动播报一次：答错重考（retry 重渲染）不重播，
  // 手动点扬声器仍可重复播放。
  const mKey = word + "|w2m";
  if (!rvMcqAutoSpoken[mKey]) {
    rvMcqAutoSpoken[mKey] = true;
    setTimeout(() => ttsSpeak(word, 1), 120);
  }
}

/** Phase 1 子步骤: 释义→选单词 */
function renderMcqMean2Word(body) {
  const word = reviewSession.current;
  const data = reviewSession.mcqData;
  if (!data) { reviewNext(); return; }

  rvMeaningProgress();

  // 题目为目标单词完整释义：考研词书 → 逐条按统一等级着色（含「僻」角标）
  const g = window.KY ? KY.kyLevel(word) : null;
  let questionParts = [];
  if (g) g.rows.forEach((r) => (questionParts = questionParts.concat(r.meanings)));
  const questionHtml = questionParts.length ? KY.kyJoin(questionParts) : esc(data.question);

  body.innerHTML = `<div class="rv-meaning rv-mcq rv-screen">
    ${rvMasteredBtnHtml()}
    <div class="rv-stage">
      <p class="rv-mcq-question">${questionHtml}</p>
      <p class="rv-mcq-hint">选择正确的英文单词</p>
    </div>
    <div class="rv-mcq-options">
      ${mcqOptionsHtml(data.options)}
    </div>
  </div>`;
}

/** MCQ 答题处理：点击选项 → 判断 → 音效 + 视觉反馈 → 1.2s 后自动进入下一步 */
function onMcqAnswer(clickedIdx) {
  const data = reviewSession.mcqData;
  const task = reviewSession.currentTask;
  if (!data || !task) return;
  const correct = clickedIdx === data.correctIdx;
  const word = task.word;
  const step = task.step; // "w2m" or "m2w"

  // 记录 MCQ 结果到 wordResults
  if (!reviewSession.wordResults[word]) reviewSession.wordResults[word] = {};
  reviewSession.wordResults[word][step] = correct;
  // 首次作答结果（组合评分依据）：重试答对不洗白，一题仅记录一次
  if (!reviewSession.mcqFirst[word]) reviewSession.mcqFirst[word] = {};
  if (reviewSession.mcqFirst[word][step] === undefined) {
    reviewSession.mcqFirst[word][step] = correct;
  }

  reviewSession.answeredCount += 1; // 进度：选择题每次作答计入（答错的重复任务入队 → 总进度 +1）
  rvMeaningProgress(); // 答题瞬间即时刷新进度（下一次渲染前也能看到本次作答计入）

  // 今日复习记录：按词记录选择题实际结果（一天内出现过错误即记 wrong，不随后续重试洗白）
  if (!correct || reviewSession.mcqRecord[word] === "wrong") {
    reviewSession.mcqRecord[word] = "wrong";
  } else {
    reviewSession.mcqRecord[word] = "correct";
  }

  // MCQ 统计
  if (step === "w2m") {
    reviewSession.mcqStats.w2mTotal += 1;
    if (correct) reviewSession.mcqStats.w2mCorrect += 1;
  } else {
    reviewSession.mcqStats.m2wTotal += 1;
    if (correct) reviewSession.mcqStats.m2wCorrect += 1;
  }

  // 视觉反馈
  const options = document.querySelectorAll(".rv-mcq-option");
  options.forEach((opt, i) => {
    opt.style.pointerEvents = "none";
    if (i === data.correctIdx) {
      opt.classList.add(correct ? "correct" : "reveal-correct");
    }
    if (i === clickedIdx && !correct) {
      opt.classList.add("wrong");
    }
  });

  // 音效
  if (correct) {
    playCorrectSound();
  } else {
    playErrorSound();
  }

  if (correct) {
    // 正确：标记任务完成，尝试完成单词，1.2s 后前进
    reviewSession.completed[word + "|" + step] = true;
    tryCompleteWord(word);
    reviewSession.detailCtx = { task: task, action: "advance" };
    saveReviewSession();
    setTimeout(() => reviewNext(), 1200);
  } else {
    // 错误：设置 detailCtx 为 retry，1.2s 后进入详情页
    reviewSession.detailCtx = { task: task, action: "retry" };
    saveReviewSession();
    setTimeout(() => {
      rvRender(() => renderDetail($("#review-body")));
    }, 1200);
  }
}

/** 阶段过渡页 */
function renderTransition(body) {
  const s = reviewSession.stats;
  const total = reviewSession.initialCount || reviewSession.queue.length;

  rvHideProgress();

  body.innerHTML = `<div class="rv-transition rv-screen">
    <div class="rv-transition-icon">✓</div>
    <h2 class="rv-transition-title">词义复习完成</h2>
    <p class="rv-transition-sub">已完成 ${total} 个单词的回忆与选择题考察<br>接下来进行拼写复习</p>
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
    ${reviewSession.mcqStats.w2mTotal + reviewSession.mcqStats.m2wTotal > 0 ? `<p class="rv-transition-mcq">选择题正确率：${reviewSession.mcqStats.w2mCorrect + reviewSession.mcqStats.m2wCorrect} / ${reviewSession.mcqStats.w2mTotal + reviewSession.mcqStats.m2wTotal}</p>` : ""}
    <button class="rv-btn-go" id="rv-go-spell" type="button">开始拼写复习</button>
  </div>`;
}

/** Phase 2: 拼写复习 */
function renderSpell(body) {
  const word = reviewSession.current;
  const total = reviewSession.spellQueue.length;
  const sp = reviewSession.spell;
  // 拼写提示：考研词书 → 首行释义逐条按统一等级着色；其他来源 → 原有纯文本
  const g = window.KY ? KY.kyLevel(word) : null;
  const defHintHtml = g && g.rows.length
    ? `${g.rows[0].pos ? esc(g.rows[0].pos) + " " : ""}${KY.kyJoin(g.rows[0].meanings)}`
    : esc((senseLines(word)[0] || briefOf(word)) || "根据释义拼写单词");
  
  rvSetProgress(Math.min(reviewSession.spellIdx, total), total); // 进度 = 已作答拼写数（答错的重复使总数 +1）
  
  const inputClass = sp.submitted && !sp.correct ? "error" : "";
  // 按钮组恒为 [跳过 + 确认/重新提交]：「确认」= 提交并判断，正确时直接进入下一题（无「下一个」中间态）
  const actionsHtml = `<button class="rv-btn-wrong" id="spell-skip" type="button">跳过</button>
       <button class="rv-btn-next" id="spell-submit" type="button">${sp.submitted && !sp.correct ? "下一个" : "确认"}</button>`;
  
  body.innerHTML = `<div class="rv-spell rv-screen">
    ${rvMasteredBtnHtml()}
    <div class="rv-stage">
      <p class="rv-spell-label">拼写复习</p>
      <button class="rv-speaker rv-speaker-sm" data-speak="${esc(word)}" aria-label="播放读音" type="button">${SPEAKER_SVG}</button>
      <p class="rv-spell-def">${defHintHtml}</p>
      <input class="rv-spell-input ${inputClass}" 
             id="spell-input" 
             type="text" 
             enterkeyhint="done"
             placeholder="输入英文单词" 
             autocomplete="off" 
             autocapitalize="off" 
             spellcheck="false" 
             value="${esc(sp.input)}" />
      ${sp.submitted && !sp.correct ? `<div class="rv-spell-result">
        <div class="rv-spell-result-word wrong">${esc(word)}</div>
        <p class="rv-spell-result-tip">正确拼写如上 · 请重新输入</p>
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
    /* Android IME「回车 / 下一步 / 完成」键 = 点击「确认」：
       preventDefault 拦截 WebView 默认行为（焦点后移 / 聚焦元素滚入视野 → 界面整体上移）；
       再触发 #spell-submit.click()，走与「确认」按钮完全相同的委托链路
       （同一 300ms 防抖 + 同一 submitSpell 判定，不引入第二套判断机制）。
       组词中的回车（isComposing / keyCode 229，输入法用于候选词确认）不拦截 */
    input.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const isEnter = e.key === "Enter" || e.keyCode === 13 || e.which === 13;
      if (!isEnter) return;
      e.preventDefault();
      const btn = $("#spell-submit");
      if (btn) btn.click();
      // 双保险：复位滚动，杜绝个别 ROM / 输入法仍把页面整体上移（键盘不受影响）
      const stabilize = () => {
        window.scrollTo(0, 0);
        const screen = body.firstElementChild;
        if (screen) screen.scrollTop = 0;
      };
      stabilize();
      requestAnimationFrame(stabilize);
    });
    setTimeout(() => {
      input.focus();
      if (sp.submitted && !sp.correct) {
        input.select();
      }
    }, 60);
  }
}

/** 完成页 / 「今日复习完成」状态页（同一套页面复用）：
    顶部保留完成状态表达（✓ + 标题 + 共复习 N 个单词）；
    下方三态切换（词义复习 / 选择题 / 拼写，视觉沿用「今日生词 / 历史生词」的分段控件），
    列表展示今天实际复习记录（来自 buildTodayRecord / saveReviewTodayRecord 的真实作答数据，按词去重），
    每行：单词 + 本次结果色标 + 放大镜（弹出词义卡片，仅查看，不产生任何新记录）。
    record: 今日复习记录；缺省时从当天持久化记录或当前会话兜底。 */
let rvDoneView = "meaning"; // 完成页当前切换态：meaning | mcq | spell（每次渲染重置为词义复习）

/** 记录行状态元数据：文本 + 色调（绿/黄/红） */
function rvDoneStatusMeta(mode, status) {
  if (mode === "meaning") {
    return status === "known" ? { text: "认识", tone: "green" }
         : status === "fuzzy" ? { text: "模糊", tone: "yellow" }
         : { text: "不认识", tone: "red" };
  }
  if (mode === "mcq") {
    return status === "wrong" ? { text: "错误", tone: "red" } : { text: "正确", tone: "green" };
  }
  return status === "correct" ? { text: "正确", tone: "green" }
       : status === "skipped" ? { text: "跳过", tone: "red" }
       : { text: "需强化", tone: "red" };
}

function renderDone(body, record) {
  const rec = record || getTodayReviewRecord() || buildTodayRecord();
  rvDoneView = "meaning"; // 默认进入「词义复习」
  rvHideProgress();

  const counts = {
    meaning: Object.keys(rec.meaning).length,
    mcq: Object.keys(rec.mcq).length,
    spell: Object.keys(rec.spell).length,
  };
  const total = todayRecordWordCount(rec);
  const emptyText = { meaning: "今天没有词义复习记录", mcq: "今天没有选择题记录", spell: "今天没有拼写记录" };

  const listHtml = (mode) => {
    const words = Object.keys(rec[mode]);
    if (!words.length) return `<li class="rv-rec-empty">${emptyText[mode]}</li>`;
    return words.map((w, i) => {
      const meta = rvDoneStatusMeta(mode, rec[mode][w]);
      return `<li class="rv-rec-row" style="animation-delay:${i * 30}ms">
        <span class="rv-rec-item"><span class="rv-rec-word">${esc(w)}</span></span>
        <span class="rv-rec-tag rv-rec-tag--${meta.tone}"><i class="rv-rec-dot"></i>${meta.text}</span>
        <button class="rv-rec-lookup" data-lookup="${esc(w)}" aria-label="查看 ${esc(w)} 的词义" type="button">${MAG_SVG}</button>
      </li>`;
    }).join("");
  };

  body.innerHTML = `<div class="rv-done rv-screen">
    <div class="rv-done-check">✓</div>
    <h2 class="rv-done-title">今日复习完成</h2>
    <p class="rv-done-sub">共复习 ${total} 个单词</p>

    <div class="segmented wide rv-done-seg" role="tablist" aria-label="复习记录分类">
      <button class="seg-btn" data-done-view="meaning" aria-checked="true" type="button">词义复习 ${counts.meaning}</button>
      <button class="seg-btn" data-done-view="mcq" aria-checked="false" type="button">选择题 ${counts.mcq}</button>
      <button class="seg-btn" data-done-view="spell" aria-checked="false" type="button">拼写 ${counts.spell}</button>
    </div>

    <ul class="rv-rec-list" id="rv-rec-list">${listHtml(rvDoneView)}</ul>

    <p class="rv-done-hint">坚持就是胜利！</p>
    <button class="rv-btn-go" id="review-done-back" type="button">返回首页</button>
  </div>`;

  // 三态切换：只更新选中态与列表，不整页重渲染（避免动画/滚动跳动）
  body.querySelectorAll("[data-done-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.doneView;
      if (view === rvDoneView) return;
      rvDoneView = view;
      body.querySelectorAll("[data-done-view]").forEach((b) =>
        b.setAttribute("aria-checked", String(b.dataset.doneView === view)));
      const list = $("#rv-rec-list");
      if (list) list.innerHTML = listHtml(view);
    });
  });
}

/** 词义态重复任务入队：插入到「词义复习段」的队尾（即选择题混合段开始之前），
    而不是整个三态队列的末尾 —— 第一态的重复必须在第一态内部完成。 */
function enqueueRecallRepeat(word) {
  let insertAt = reviewSession.queue.length;
  for (let i = reviewSession.idx; i < reviewSession.queue.length; i++) {
    if (reviewSession.queue[i].step !== "recall") { insertAt = i; break; } // 混合段起点
  }
  reviewSession.queue.splice(insertAt, 0, { word: word, step: "recall", repeat: true });
}

/** 用户点击判断按钮（认识/模糊/不认识）。
    词义复习态规则：只有「认识」才算通过本态；
    模糊/不认识 = 未通过 → 当前单词插入词义复习段队尾稍后重复出现（直到最终选择认识）。
    进度：每次判断（无论对错）当前进度 +1；答错的重复任务入队 → 总进度 +1。
    间隔算法口径：以第一次判断为准，重复练习不覆盖已记录的结果；
    answerReview 延迟到单词三种任务全部完成时调用。 */
function onReviewAnswer(result) {
  ttsStop();
  if (window.VH_STATS) VH_STATS.add({ vocab: 1, sec: VH_STATS.elapsed() });
  const word = reviewSession.current;
  const task = reviewSession.currentTask;
  const firstOfDay = !reviewSession.answeredToday[word];

  if (firstOfDay) {
    const st = reviewStore.words[word];
    reviewSession.snapshot = st ? JSON.parse(JSON.stringify(st)) : null;
    // 注意：answerReview 不在这里调用，延迟到单词三种任务全部完成时
    reviewSession.answeredToday[word] = 1;
  } else {
    reviewSession.snapshot = null;
  }

  // 词义复习尝试计数（「记错了」修正仅对首次判断改写算法结果，见 reviewCorrection）
  reviewSession.recallAttempts[word] = (reviewSession.recallAttempts[word] || 0) + 1;
  const isFirstAttempt = reviewSession.recallAttempts[word] === 1;
  reviewSession.answeredCount += 1; // 进度：本次判断计入（认识/模糊/不认识都算一次作答）

  // 记录 recall 结果：仅首次判断写入（队尾重复练习不覆盖 → 间隔算法始终按第一次选择更新）
  reviewSession.lastResult = result;
  if (isFirstAttempt) {
    if (!reviewSession.wordResults[word]) reviewSession.wordResults[word] = {};
    reviewSession.wordResults[word].recall = result;
  }

  if (result === "known") {
    // 认识 = 本态通过
    reviewSession.completed[word + "|recall"] = true;
    reviewSession.detailCtx = { task: task, action: "complete" };
  } else {
    // 模糊/不认识 = 本态未通过 → 插入词义复习段队尾等待重复出现；
    // 不标记完成（间隔算法不提前结算），详情页「下一个」正常前进
    enqueueRecallRepeat(word);
    reviewSession.detailCtx = { task: task, action: "repeat" };
  }

  saveReviewSession();
  rvRender(() => renderDetail($("#review-body")));
}

/** 记错了：当前判断修正为不认识（「认识 → 记错了」与「模糊 → 记错了」共用本函数）。
    - 间隔算法：首次判断被「记错了」修正 → 结果按不认识更新（影响间隔日）；
      队尾重复练习上的修正不改变首次记录（算法口径始终以第一次选择为准）。
    - 三态不可豁免：记错了只影响词义态，看词选义/看义选词仍照常完成（答错同样重复至答对）。
    - 词义复习态未通过 → 当前单词重新加入词义段队尾（撤销本态完成标记），等待再次复习直到认识。
    - 不重新打开当前单词的释义详情界面，直接进入下一个待复习项。 */
function reviewCorrection() {
  const word = reviewSession.current;
  if (!reviewSession.snapshot && !reviewSession.answeredToday[word]) return;

  if (reviewSession.snapshot) {
    reviewStore.words[word] = reviewSession.snapshot;
    reviewSession.snapshot = null;
    // 不调用 answerReview，延迟到 tryCompleteWord
  }

  const isFirstAttempt = (reviewSession.recallAttempts[word] || 0) <= 1;
  if (isFirstAttempt) {
    // 首次判断（认识）被修正 → 算法结果改为不认识
    if (!reviewSession.wordResults[word]) reviewSession.wordResults[word] = {};
    reviewSession.wordResults[word].recall = "unknown";
  }
  reviewSession.lastResult = "unknown";

  // 词义复习态未通过：撤销本态完成标记 + 插入词义复习段队尾（重复到最终选择认识为止）。
  // 注意：无论词义态结果如何（认识/模糊/不认识/记错了），看词选义与看义选词两态都必须照常完成，
  // 不存在免考；选择题答错亦重复至答对为止。
  // 「记错了」是修正而非新的一次作答：当前进度不变，重复任务入队 → 总进度 +1。
  // 来自「模糊」详情（action=repeat）时该词已入队尾等待重复，不重复入队（避免队尾出现两次）
  if (reviewSession.detailCtx && reviewSession.detailCtx.action === "repeat") {
    // 已在词义段队尾，仅把本次结果修正为不认识
  } else {
    delete reviewSession.completed[word + "|recall"];
    enqueueRecallRepeat(word);
  }

  saveReviewSession();

  // 直接进入下一个待复习项（action=repeat → reviewNext 不把本态标记为完成），
  // 不再重新打开当前单词详情页；队列走完则正常进入过渡页结束本阶段。
  reviewSession.detailCtx = { task: reviewSession.currentTask, action: "repeat" };
  reviewNext();
}

/** 计算组合结果：基于 wordResults 中已记录的三种结果 */
/** 尝试完成一个单词：三种任务全部完成时调用 answerReview + 更新统计。
    组合评分已升级为 comboRatingFor（组合评分表，见辅助层）。 */
function tryCompleteWord(word) {
  if (reviewSession.wordsDone[word]) return;
  const r = reviewSession.wordResults[word] || {};
  const recallDone = reviewSession.completed[word + "|recall"];
  const w2mDone = reviewSession.completed[word + "|w2m"];
  const m2wDone = reviewSession.completed[word + "|m2w"];
  if (!recallDone || !w2mDone || !m2wDone) return;

  // 三种任务全部完成 → 组合评分表（T1 主结算，答案由四态权重共同决定）
  reviewSession.wordsDone[word] = true;
  const combo = comboRatingFor(word);
  const label = resultLabel(combo);

  // 调用 answerReview（当天首次判断）
  const firstOfDay = reviewSession.answeredToday[word];
  if (firstOfDay) {
    answerReview(word, combo, { phase: "meaning" });
  }

  // 更新统计（按组合评分对应的三态标签计数）
  reviewSession.stats.n += 1;
  reviewSession.stats[label] += 1;
}

/** 任务池模式下的“下一个”：根据 detailCtx 决定行为 */
function reviewNext() {
  ttsStop();

  const ctx = reviewSession.detailCtx;

  // MCQ（看词选义 / 义选词）的结果音效已在答题瞬间播放一次（对→答对音，错→错误音）。
  // 答对自动前进、答错详情页点「继续」都不属于新的答题结果，
  // 此处不再播放前进音，保证「一次有效答题只触发一次提示音」；
  // 看词回忆（action="complete"，详情页点「下一个」）保持原有播放行为不变。
  const fromMcq = ctx && ctx.task && (ctx.task.step === "w2m" || ctx.task.step === "m2w");
  if (!fromMcq) playNextSound();

  if (ctx && ctx.action === "retry") {
    // MCQ 答错后查看完详情 → 仅将当前这一态重入混合队列（随机插到未消费段的合法位置，
    // 避开与同一单词相邻；无合法位置时兜底追加队尾），其余已完成的态不重考
    const retryTask = { word: ctx.task.word, step: ctx.task.step };
    const q = reviewSession.queue;
    const slots = [];
    for (let p = reviewSession.idx + 1; p <= q.length; p++) {
      const beforeSame = p > 0 && q[p - 1] && q[p - 1].word === retryTask.word;
      const afterSame = p < q.length && q[p].word === retryTask.word;
      if (!beforeSame && !afterSame) slots.push(p);
    }
    if (slots.length) {
      q.splice(slots[Math.floor(Math.random() * slots.length)], 0, retryTask);
    } else {
      q.push(retryTask);
    }
    reviewSession.idx += 1;
    reviewSession.detailCtx = null;
    reviewSession.mcqData = null;
    saveReviewSession();
    renderReviewByPhase();
    return;
  }

  // 默认：完成任务并前进
  if (ctx && ctx.task) {
    const key = ctx.task.word + "|" + ctx.task.step;
    // 词义复习态未通过（模糊/不认识/记错了 → action=repeat）：不标记完成，
    // 该词已加入队尾等待重复；tryCompleteWord 因 recall 未完成而直接返回，不会提前结算算法
    const failedRecall = ctx.task.step === "recall" && ctx.action === "repeat";
    if (!reviewSession.completed[key] && !failedRecall) {
      reviewSession.completed[key] = true;
    }
    // 尝试完成该单词（三态全部完成才结算；未通过态时此处为空操作）
    tryCompleteWord(ctx.task.word);
  }

  reviewSession.idx += 1;
  reviewSession.detailCtx = null;
  reviewSession.mcqData = null;
  reviewSession.lastResult = null;
  reviewSession.snapshot = null;
  saveReviewSession();
  renderReviewByPhase();
}

/** 进入拼写阶段（拼写队列基于当天词集合去重后随机打乱：
    Phase 1 队末重排会在 queue 中留下重复项，拼写每词只考一次起步） */
function goToSpellPhase() {
  // 从任务池提取唯一单词列表（已「娴熟」毕业的词不进入拼写阶段）
  const uniqueWords = [...new Set(reviewSession.queue.map(t => t.word))]
    .filter((w) => !isReviewMastered(w));
  reviewSession.spellQueue = shuffleArray(uniqueWords);
  reviewSession.spellIdx = 0;
  reviewSession.phase = "spell";
  reviewSession.spell = { submitted: false, correct: false, input: "" };
  saveReviewSession();
  renderReviewByPhase();
}

/** T2 拼写证据结算：拼写结果落定后，把拼写评分作为第二次证据加权进同一全局 FSRS 状态。
    只对该词已 T1 结算（三态完成）生效；同词同业务日仅结算一次（spellSettled 去重）。 */
function settleSpell(word) {
  if (!word) return;
  const sr = (reviewSession.spellResults || {})[word];
  if (!sr) return;                                  // 拼写结果未落定
  if ((reviewSession.spellSettled || {})[word]) return; // 同词同业务日仅结算一次
  reviewSession.spellSettled[word] = true;
  const rating = sr === "correct" ? VH_FSRS.RATING.GOOD : VH_FSRS.RATING.AGAIN;
  answerReview(word, rating, { phase: "spell" });
}

/** 提交拼写：「确认」= 提交 + 判断。
    正确 → 立即进入下一个单词（播放提示音，无需再点「下一个」）；
    错误 → 停留当前单词展示正确拼写，按钮变「下一个」：计入进度、该词入队尾重复（与词义/选择题答错同一套重复逻辑） */
function submitSpell() {
  const word = reviewSession.current;
  // 错误展示态（已显示正确拼写）：按钮此时为「下一个」→ 该词入拼写队列队尾重复，前进。
  // 若用户已把输入改对（错误 → 正确完成），先播一次正确提示音再前进（仅触发一次，不重复播放）
  if (reviewSession.spell.submitted && !reviewSession.spell.correct) {
    const input = $("#spell-input");
    const v = (input ? input.value : reviewSession.spell.input).trim().toLowerCase();
    if (v === word) playCorrectSound();
    spellNext();
    return;
  }

  const input = $("#spell-input");
  const v = (input ? input.value : reviewSession.spell.input).trim().toLowerCase();

  reviewSession.spell.input = v;
  reviewSession.spell.submitted = true;
  reviewSession.spell.correct = (v === word);

  if (reviewSession.spell.correct) {
    // 正确：直接前进到下一题（正确 = 通过，从队列移除，不重排）
    reviewSession.spellStats.correct += 1;
    // 今日复习记录：首次即对 → correct；曾写错后改对 → 保留 wrong（需强化）
    if (!reviewSession.spellResults[word]) reviewSession.spellResults[word] = "correct";
    settleSpell(word); // T2 拼写证据：拼写正确 → 短期 Good
    ttsStop(); // 切换单词：立即停掉可能仍在播放的读音
    playNextSound(); // 下一题提示音（「滴」，与 TTS 通道互不影响）
    reviewSession.spellIdx += 1;
    reviewSession.spell = { submitted: false, correct: false, input: "" };
    saveReviewSession();
    renderReviewByPhase(); // 渲染下一题（更新 current；队列走完则进入完成页）
  } else {
    // 首次拼写错误：停留在当前词展示正确拼写（按钮变「下一个」），
    // 点「下一个」后本次作答计入进度、该词入拼写队列队尾重复（见 spellNext）
    reviewSession.spellStats.wrong += 1;
    // 今日复习记录：出现过错误拼写 → wrong（需强化）
    if (reviewSession.spellResults[word] !== "skipped") reviewSession.spellResults[word] = "wrong";
    settleSpell(word); // T2 拼写证据：拼写错误 → 短期 Again（重拼改对不重复结算）
    playErrorSound(); // 错误提示音（复用选择题答错音效，与选择题答错行为一致）
    saveReviewSession();
    rvRender(() => renderSpell($("#review-body")));
  }
}

/** 拼写「下一个」（看过正确拼写后）：本次作答计入进度（spellIdx +1），
    该词加入拼写队列队尾重复（总进度 +1），前进到下一个拼写词 */
function spellNext() {
  const word = reviewSession.current;
  reviewSession.spellIdx += 1;
  reviewSession.spellQueue.push(word);
  reviewSession.spell = { submitted: false, correct: false, input: "" };
  saveReviewSession();
  renderReviewByPhase();
}

/** 跳过拼写 = 本词未通过（记入 skipped），直接进入下一个词。
    不放回队列：回队会让 spellQueue.length（进度分母）随跳过次数膨胀，
    且被跳过的词反复出现 —— 表现为进度条越走越多、连续跳过时永远结束不了 */
function skipSpell() {
  ttsStop(); // 切换单词：立即停掉可能仍在播放的读音
  reviewSession.spellStats.skipped += 1;
  // 今日复习记录：跳过 = 未通过（若此前已记 wrong，保留 wrong，同为需强化）
  if (!reviewSession.spellResults[reviewSession.current]) {
    reviewSession.spellResults[reviewSession.current] = "skipped";
  }
  settleSpell(reviewSession.current); // T2 拼写证据：跳过 → 短期 Again
  reviewSession.spellIdx += 1;
  reviewSession.spell = { submitted: false, correct: false, input: "" };
  saveReviewSession();
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

  // 任务面板顶部进度环：今日完成度一目了然（与打卡口径一致）
  const doneCount = todayDoneCount();
  // 环体偏小、进度弧偏粗：整体更精致不显臃肿（半径 21 / 弧宽 6.5）
  const RING_R = 21;
  const RING_C = +(2 * Math.PI * RING_R).toFixed(2);
  const ringPct = ts.length ? Math.min(1, doneCount / ts.length) : 0;
  const ringOffset = +(RING_C * (1 - ringPct)).toFixed(2);
  const ringHTML = `
    <section class="task-progress-card">
      <svg class="task-ring" viewBox="0 0 60 60" aria-hidden="true">
        <circle class="task-ring-track" cx="30" cy="30" r="${RING_R}"/>
        <circle class="task-ring-bar" cx="30" cy="30" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${ringOffset}"/>
        <circle class="task-ring-core" cx="30" cy="30" r="16"/>
        <text class="task-ring-text" x="30" y="33.6" text-anchor="middle">${ts.length ? `${doneCount}/${ts.length}` : "—"}</text>
      </svg>
      <div class="task-progress-main">
        <p class="task-progress-title">今日任务</p>
        <p class="task-progress-sub">${!ts.length
          ? "今天还没有任务 · 点击添加"
          : doneCount === ts.length ? "全部完成 · 太棒了 ✓" : `${doneCount} / ${ts.length} 已完成`}</p>
      </div>
    </section>`;

  body.innerHTML = `
    ${ringHTML}
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
              <span class="goal-icon">${GOAL_SVG}</span>
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
              <span class="reward-icon">${REWARD_SVG}</span>
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

  // 进度环转动动画：勾选/取消任务后圆弧从旧进度带轻微回弹地转到新进度。
  // 圆环随每次重绘重建，故先无动画拨回旧值、再切到新值触发 CSS transition；
  // 首次渲染（无旧值）直接呈现终态，不闪动画。
  const ringBar = body.querySelector(".task-ring-bar");
  if (ringBar) {
    if (prevRingOffset !== null && prevRingOffset !== ringOffset) {
      ringBar.style.transition = "none";
      ringBar.style.strokeDashoffset = prevRingOffset;
      void ringBar.getBoundingClientRect(); // 强制回流，确保旧值生效后再恢复过渡
      ringBar.style.transition = "";
    }
    ringBar.style.strokeDashoffset = ringOffset;
    prevRingOffset = ringOffset;
  }
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

/* ============================================================
   学习统计（坚持看板底部）：真实本地数据聚合 + 纯 SVG 图表
   数据由 js/stats.js 提供（生词复习 + 知识条目复习 + 专注时长）
   ============================================================ */

/** 分钟数展示：≥10 取整，<10 保留 1 位小数（避免小数值全部显示 0） */
function fmtStatMin(m) { return m >= 10 ? String(Math.round(m)) : String(Math.round(m * 10) / 10); }

/** 柱状图（近 7 天复习数量：红=词汇 蓝=知识点；组内双柱 + 顶部数值） */
let statsLineSel = null; // 折线图选中日索引（null = 默认显示今日）
function statsBarChartSVG(days) {
  const W = 340, H = 148, padT = 18, padB = 20, padX = 6;
  const ih = H - padT - padB;
  const max = Math.max(1, ...days.map((d) => Math.max(d.vocab, d.entry)));
  const gw = (W - padX * 2) / days.length;
  const bw = Math.min(10, gw / 3.2);
  let bars = "", texts = "";
  days.forEach((d, i) => {
    const cx = padX + gw * i + gw / 2;
    const hv = d.vocab ? Math.max(3, (d.vocab / max) * ih) : 0;
    const he = d.entry ? Math.max(3, (d.entry / max) * ih) : 0;
    if (hv) bars += `<rect class="bar-vocab" x="${(cx - bw - 1.2).toFixed(1)}" y="${(H - padB - hv).toFixed(1)}" width="${bw.toFixed(1)}" height="${hv.toFixed(1)}" rx="2"/>`;
    if (he) bars += `<rect class="bar-entry" x="${(cx + 1.2).toFixed(1)}" y="${(H - padB - he).toFixed(1)}" width="${bw.toFixed(1)}" height="${he.toFixed(1)}" rx="2"/>`;
    if (d.vocab || d.entry) {
      // 数值标签：每根柱单独标注自己的数量，水平居中于该柱顶部正上方（不再组合成 5/1 格式）。
      // y 各自跟随本柱柱顶：柱高不同时两个数字一高一低，始终位于各自柱顶；
      // 水平居中由 .chart-val 的 text-anchor: middle 保证；保留既有 1px 左移修正。
      if (hv) texts += `<text class="chart-val" x="${(cx - bw / 2 - 1.2 - 1).toFixed(1)}" y="${(H - padB - hv - 4).toFixed(1)}">${d.vocab}</text>`;
      if (he) texts += `<text class="chart-val" x="${(cx + bw / 2 + 1.2 - 1).toFixed(1)}" y="${(H - padB - he - 4).toFixed(1)}">${d.entry}</text>`;
    }
    texts += `<text class="chart-x${d.isToday ? " today" : ""}" x="${cx.toFixed(1)}" y="${H - 6}">${d.label}</text>`;
  });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 7 天复习数量柱状图">
    ${bars}
    <line class="chart-axis" x1="${padX}" x2="${W - padX}" y1="${H - padB}" y2="${H - padB}"/>
    ${texts}
  </svg>`;
}

/** 折线图（近 7 天学习时间：实线=累计时长 虚线=每日时长）
    累计与每日同单位（分钟）→ 共用同一纵轴刻度：等值必然同高、累计≥每日必然不低于每日，
    线条位置与左侧参考刻度严格一致（修正旧版双刻度各自归一的视觉失真：
    曾出现累计 2.8 > 今日 1.4 两线却交汇同一点、同为 1.4 却一高一低）
    sel：选中日索引（null = 默认今日）；点击某天数据列切换显示该日数据，点击图表外恢复今日 */
function statsLineChartSVG(days, sel) {
  const W = 340, H = 148, padL = 30, padR = 30, padT = 18, padB = 20;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxV = Math.max(1, ...days.map((d) => d.cumMin), ...days.map((d) => d.dailyMin));
  const x = (i) => padL + (iw * i) / (days.length - 1);
  const yOf = (v) => H - padB - (v / maxV) * ih;
  const active = sel != null && sel >= 0 && sel < days.length; // 是否用户点选过
  const si = active ? sel : days.length - 1; // 默认选中今日（最后一天）
  const colW = iw / (days.length - 1);
  let grid = "", dots = "", texts = "", hits = "";
  [1, 0.5, 0].forEach((f) => {
    const y = (H - padB - f * ih).toFixed(1);
    grid += `<line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/>`;
    // 单一纵轴：仅左侧一组参考刻度（右侧不再独立成另一套刻度，避免数值误导）
    texts += `<text class="chart-axis-label" x="${padL - 4}" y="${Number(y) + 3}" text-anchor="end">${fmtStatMin(maxV * f)}</text>`;
  });
  const ptsC = days.map((d, i) => `${x(i).toFixed(1)},${yOf(d.cumMin).toFixed(1)}`).join(" ");
  const ptsD = days.map((d, i) => `${x(i).toFixed(1)},${yOf(d.dailyMin).toFixed(1)}`).join(" ");
  days.forEach((d, i) => {
    const cls = i === si && active ? " sel" : "";
    const r = i === si && active ? 3.2 : 2.4;
    dots += `<circle class="chart-dot dot-cum${cls}" cx="${x(i).toFixed(1)}" cy="${yOf(d.cumMin).toFixed(1)}" r="${r}"/>`;
    dots += `<circle class="chart-dot dot-daily${cls}" cx="${x(i).toFixed(1)}" cy="${yOf(d.dailyMin).toFixed(1)}" r="${r}"/>`;
    texts += `<text class="chart-x${d.isToday ? " today" : ""}${cls}" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d.label}</text>`;
    // 整列透明命中区（置顶）：点中某天数据点/所在列即选中该天，触屏更易命中
    const hx0 = i === 0 ? 0 : x(i) - colW / 2;
    const hx1 = i === days.length - 1 ? W : x(i) + colW / 2;
    hits += `<rect class="chart-hit" data-li="${i}" x="${hx0.toFixed(1)}" y="0" width="${(hx1 - hx0).toFixed(1)}" height="${H}" fill="transparent"/>`;
  });
  const sd = days[si];
  // 数值标注与选中日数据点一一对应（默认今日）：累计 = 实线当日的值，日期标注 = 虚线当日学习时长
  texts += `<text class="chart-val strong" x="${W - padR}" y="${(yOf(sd.cumMin) - 7).toFixed(1)}" text-anchor="end">累计 ${fmtStatMin(sd.cumMin)}</text>`;
  texts += `<text class="chart-val daily" x="${W - padR}" y="${(yOf(sd.dailyMin) + 12).toFixed(1)}" text-anchor="end">${sd.isToday ? "今日" : sd.label} ${fmtStatMin(sd.dailyMin)}</text>`;
  return `<svg id="stats-line-chart" class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 7 天学习时间折线图">
    ${grid}
    ${active ? `<line class="chart-sel-line" x1="${x(si).toFixed(1)}" x2="${x(si).toFixed(1)}" y1="${padT}" y2="${H - padB}"/>` : ""}
    <polyline class="line-cum" points="${ptsC}"/>
    <polyline class="line-daily" points="${ptsD}"/>
    ${dots}
    ${texts}
    ${hits}
  </svg>`;
}

/** 折线图选中日切换后仅重绘该 SVG（不重渲染整块看板，无滚动跳动） */
function statsLineRender() {
  const old = $("#stats-line-chart");
  if (!old || !window.VH_STATS) return;
  const tpl = document.createElement("div");
  tpl.innerHTML = statsLineChartSVG(VH_STATS.last7(), statsLineSel);
  const fresh = tpl.firstElementChild;
  if (fresh) old.replaceWith(fresh);
}

/** 坚持看板渲染（连续天数 / 最长 / 已完成 / 可切换月份日历 / 目标日期标记 / 点击日期查看 / 学习统计） */
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

  /* 学习统计（真实本地数据：生词复习 + 知识条目复习 + 专注时长；stats.js 缺失时优雅跳过） */
  let statsHTML = "";
  if (window.VH_STATS) {
    const s = VH_STATS.snapshot();
    const d7 = VH_STATS.last7();
    const barHasData = d7.some((d) => d.vocab || d.entry);
    const lineHasData = d7.some((d) => d.cumMin > 0 || d.dailyMin > 0);
    statsHTML = `
    <section class="task-section">
      <div class="task-section-head"><p class="section-eyebrow">统计</p></div>
      <div class="stat-grid">
        <div class="stat-cell"><p class="stat-label">今日复习</p><p class="stat-value"><b>${s.today.vocab}</b><i>词</i><em>/</em><b>${s.today.entry}</b><i>条</i></p></div>
        <div class="stat-cell"><p class="stat-label">累计复习</p><p class="stat-value"><b>${s.total.vocab}</b><i>词</i><em>/</em><b>${s.total.entry}</b><i>条</i></p></div>
        <div class="stat-cell"><p class="stat-label">今日总时长</p><p class="stat-value"><b>${fmtStatMin(s.today.min)}</b><i>分钟</i></p></div>
        <div class="stat-cell"><p class="stat-label">累计时长</p><p class="stat-value"><b>${fmtStatMin(s.total.min)}</b><i>分钟</i></p></div>
      </div>
    </section>
    <section class="task-section">
      <div class="task-section-head">
        <p class="section-eyebrow">复习数量 · 近 7 天</p>
        <div class="chart-legend"><span class="lg"><span class="sw sw-vocab"></span>词汇</span><span class="lg"><span class="sw sw-entry"></span>知识点</span></div>
      </div>
      ${barHasData ? statsBarChartSVG(d7) : `<div class="chart-empty">近 7 天暂无复习记录</div>`}
    </section>
    <section class="task-section">
      <div class="task-section-head">
        <p class="section-eyebrow">学习时间 · 近 7 天</p>
        <div class="chart-legend"><span class="lg"><span class="ln ln-cum"></span>累计</span><span class="lg"><span class="ln ln-daily"></span>今日</span></div>
      </div>
      ${lineHasData ? statsLineChartSVG(d7, statsLineSel) : `<div class="chart-empty">近 7 天暂无学习时长</div>`}
    </section>`;
  }

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
    </section>
    ${statsHTML}`;

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
  pushPageSnapshot();
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
  body.innerHTML = `<div class="pomo-full pomo-confirm">
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
// 进度环上一次的 dashoffset：勾选/取消任务重绘时让圆弧从旧进度平滑转到新进度（回弹缓动）
let prevRingOffset = null;

function loadTasks() {
  try {
    const s = JSON.parse(localStorage.getItem(TASKS_KEY) || "null");
    if (s && Array.isArray(s.daily)) {
      taskStore = s;
      // 旧版本/导入备份可能缺字段：补默认值，否则 reminderSnapshot() 抛错会被
      // pushReminderState 静默吞掉 → 快照永远无效 → 到点不发任何通知
      if (!Array.isArray(taskStore.onetime)) taskStore.onetime = [];
      if (!Array.isArray(taskStore.goals)) taskStore.goals = [];
      if (!Array.isArray(taskStore.rewards)) taskStore.rewards = [];
      if (!taskStore.checkins || typeof taskStore.checkins !== "object") taskStore.checkins = {};
    } else {
      taskStore = { daily: [], onetime: [], goals: [], rewards: [], checkins: {} };
    }
  } catch (_) { taskStore = { daily: [], onetime: [], goals: [], rewards: [], checkins: {} }; }
}
function saveTasks() {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(taskStore)); } catch (_) {}
  pushReminderState(); // 通知提醒：任务/打卡变化 → 同步快照给原生（到点判断是否已完成）
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

/* ---------- 连续 Review 天数（首页紫色卡片「连续 X 天」专用口径） ----------
   只看「每日 Review 任务是否完成」，与每日学习任务打卡完全无关：
   - 当天有 Review 任务且全部完成 → 计入连续
   - 当天无需复习（无待复习词）→ 跳过（不中断也不计数）
   - 当天有任务未完成 → 连续中断
   数据来源（按优先级）：
   ① 精确记录 vc-review-days（Review 会话完整走完时在 saveReviewTodayRecord 内落盘）
   ② 今天：实时判断（今日复习记录 / reviewQueue 待复习队列）
   ③ 历史日无精确记录：用 vc-stats 当日复习活动兜底（当天有复习作答 → 视为完成）；
     无活动日无法还原历史到期状态，按「无需复习」跳过（不误判为中断）
   回溯下界 = 最早使用痕迹日（再往前 App 尚未使用，视为中断），保证升级后历史连续不归零 */

/** 读取 vc-stats 逐日统计（坚持看板数据，作历史兜底用；不修改该模块） */
function reviewStatsDays() {
  try {
    const s = JSON.parse(localStorage.getItem("vc-stats") || "null");
    return (s && s.days && typeof s.days === "object") ? s.days : null;
  } catch (_) { return null; }
}

/** 最早使用痕迹日：vc-review-days / vc-stats / 生词首次加入日中最早者（无记录返回 ""） */
function reviewEarliestDay(statsDays) {
  let min = "";
  const consider = (d) => { if (d && (!min || d < min)) min = d; };
  Object.keys(reviewDays).forEach(consider);
  if (statsDays) Object.keys(statsDays).forEach(consider);
  for (const w of Object.keys(records.words)) {
    if (records.words[w] && records.words[w].first) consider(records.words[w].first);
  }
  return min;
}

/** 某业务日 Review 完成状态：1=当天全部完成 0=有任务未完成 -1=当天无需复习 */
function reviewDayStatus(day, statsDays) {
  if (reviewDays[day]) return 1; // ① 精确记录：当天 Review 会话完整走完
  if (day === vocabDay()) {      // ② 今天：实时判断（含旧版本数据推导，与首页状态判断同口径）
    const rec = getTodayReviewRecord();
    if (rec && todayRecordWordCount(rec) > 0) return 1;
    return reviewQueue().length > 0 ? 0 : -1;
  }
  const b = statsDays && statsDays[day]; // ③ 历史兜底
  return b && (b.v || 0) > 0 ? 1 : -1;
}

/** 连续 Review 天数：从某业务日（默认今天）往前回溯 */
function reviewStreakFrom(dayStr) {
  const statsDays = reviewStatsDays();
  const floor = reviewEarliestDay(statsDays);
  if (!floor) return 0; // 毫无使用痕迹 → 0
  const [y, m, d0] = String(dayStr).split("-").map(Number);
  const d = new Date(y, m - 1, d0, 12);
  let n = 0;
  while (true) {
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (day < floor) break;        // 早于首次使用 → 中断
    const st = reviewDayStatus(day, statsDays);
    if (st === 0) break;           // 有 Review 任务未完成 → 连续中断
    if (st === 1) n += 1;          // 全部完成 → 计入；-1 无需复习 → 跳过不中断
    if (day === floor) break;      // 已回溯到最早使用日
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function reviewCurrentStreak() { return reviewStreakFrom(vocabDay()); }

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
  if (n > 0) {
    el.textContent = String(n);
    el.classList.remove("muted");
    return;
  }
  // 与 Review 页内部状态同一套判断（getTodayReviewRecord 含旧版本数据推导）：
  // 今天有任务且已完成 → 「复习已完成」；只有今日本来就没有任务 → 「今日无需复习」
  const rec = getTodayReviewRecord();
  const doneToday = !!(rec && todayRecordWordCount(rec) > 0);
  el.textContent = doneToday ? "复习已完成" : "今日无需复习";
  el.classList.toggle("muted", true);
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

// 工具格四卡强制等高：grid 隐式行各自按内容定高，跨行不等高时统一为最高卡高度，保证四格完全等大
function equalizeToolGrid() {
  const grid = $("#tool-grid");
  if (!grid) return;
  const cards = grid.querySelectorAll(".review-entry");
  cards.forEach((c) => (c.style.height = "")); // 先释放再测量，避免旧值干扰真实高度
  let max = 0;
  cards.forEach((c) => { max = Math.max(max, c.offsetHeight); });
  if (max > 0) cards.forEach((c) => (c.style.height = `${max}px`));
}

function renderHome() {
  const list = todayWords();
  bumpStat($("#stat-new"), statNew());
  bumpStat($("#stat-queries"), statQueries());
  // 专注分钟：今日番茄累计（整数直显，小数保留一位）
  const focusMin = pomoStatsToday().minutes;
  bumpStat($("#stat-focus"), Number.isInteger(focusMin) ? focusMin : focusMin.toFixed(1));
  // 连续天数胶囊：始终展示（对齐设计参考图，无连续记录时显示 0）
  // 口径 = 连续完成每日 Review 的天数（与每日学习任务打卡无关，见 reviewStreakFrom）
  $("#stat-streak-days").textContent = reviewCurrentStreak();
  const histSub = $("#history-entry-sub");
  if (histSub) histSub.textContent = `共 ${statQueries()} 条 · 永久`;
  renderReviewEntry();
  renderPomoEntry();
  renderTasksEntry();
  renderHomeFeedback();
  equalizeToolGrid();
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
    : `<li class="empty-state empty-hero">
        <span class="empty-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/><path d="M9 12.5h6M9 16h4"/>
        </svg></span>
        今天还没有遇到生词<br><span>搜索单词，开始记录</span>
      </li>`;
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

/** 查询记录时间范围过滤：按记录真实 ts 筛选，只影响本页展示，不动数据与查询次数统计。
    day=本日内按业务日 04:00 边界（与「今日生词」同口径）；week/month 按当前时刻回溯。 */
function filterHistoryByRange(feed, range) {
  if (range === "day") {
    const day = records.day || vocabDay();
    return feed.filter((h) => h && h.ts && bizDayOf(h.ts) === day);
  }
  if (HISTORY_RANGE_MS[range]) {
    const from = Date.now() - HISTORY_RANGE_MS[range];
    return feed.filter((h) => h && h.ts && h.ts >= from);
  }
  return feed;
}

function renderHistory() {
  const el = $("#history-list");
  const feed = filterHistoryByRange([...records.history].reverse(), historyRange);
  // 长历史全量渲染会在每次 renderAll（输入即查命中）时重建数千节点导致输入卡顿：
  // 只渲染最近 HISTORY_MAX 条，数据永久保存不变，底部保留总数标注
  const shown = feed.slice(0, HISTORY_MAX);
  const total = statQueries();
  const moreLabel = historyRange === "all"
    ? (feed.length > HISTORY_MAX ? `已显示最近 ${HISTORY_MAX} 条 · ` : "") + `共 ${total} 条查询记录（永久保存）`
    : `${HISTORY_RANGE_NAME[historyRange] || ""} ${feed.length} 条 · 共 ${total} 条查询记录（永久保存）`;
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
      }).join("") + `<li class="history-more">${moreLabel}</li>`
    : `<li class="history-item" style="border-bottom:none;"><span class="history-def" style="margin:0;">${historyRange === "all" ? "还没有查询记录" : "该时间范围内还没有查询记录"}</span></li>`;
}

function renderGreeting() {
  const now = new Date();
  const h = now.getHours();
  const part = h < 5 ? "夜深了" : h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  $("#greeting").textContent = `${part} · ${now.getMonth() + 1}月${now.getDate()}日 · 周${week}`;
}

/* ---------- ECDICT 分片后台预热 ----------
   列表数据来自 localStorage（跨会话持久），而 ECDICT 分片缓存只在内存中（重启即清空）。
   启动后列表里的 ECDICT-only 词（考研词书未收录）分片未加载时，音标/释义会显示为空。
   这里在渲染后按需异步加载这些分片，成功后重渲染一次，保证
   「列表显示 → 点击词条 → 详情」与搜索链路使用一致、可靠的词典查询机制。
   安全说明：ECDICT 分片加载后即缓存（加载失败也缓存 null），重复扫描代价可忽略；
   仅当有词由缺失变为可用时才重渲染，词典中不存在该形式的词返回 null 不触发，避免循环。 */
let ecdictWarmTimer = null;
function warmDisplayedEcdict() {
  const seen = {};
  const missing = [];
  const collect = (arr) => {
    for (const w of arr) {
      const k = String(w || "").trim().toLowerCase();
      if (k && !seen[k] && !dictGet(k)) { seen[k] = 1; missing.push(k); }
    }
  };
  collect(todayWords());
  collect(starredWords());
  collect(records.history.slice(-HISTORY_MAX).map((h) => h.w));
  if (!missing.length) return; // 全部可查：无需加载
  if (ecdictWarmTimer) return; // 已有一轮进行中，合并避免重复加载/重渲染
  ecdictWarmTimer = setTimeout(() => {
    ecdictWarmTimer = null;
    Promise.all(missing.map((k) => dictGetAsync(k))).then((results) => {
      if (results.some((d) => !!d)) renderAll(); // 确有词补齐成功 → 重渲染让音标/释义出现
    });
  }, 120);
}

function renderAll() {
  rolloverIfNeeded(); // 任何渲染路径先做跨天检查：App 进程存活跨过 04:00 时，确保今日生词/今日次数及时切换
  renderHome();
  renderWords();
  renderHistory();
  renderExportMeta();
  warmDisplayedEcdict();
  pushReminderState(); // 通知提醒：任何数据渲染路径都顺带把最新状态同步给原生
}

/** 静默重渲染：回前台等「恢复路径」专用 —— 重建 DOM 时临时挂 vh-quiet-render
    关闭列表行入场动画（rowIn/srRowIn 的 from{opacity:0} 会在恢复瞬间整屏重播，
    即回前台「闪现 + 跳变」的根源；入场动画只应发生在真正的页面进入时）。
    渲染完成（两帧后）即摘除标记，不影响后续任何正常动画。 */
let quietRenderActive = false;
function renderAllQuiet() {
  if (quietRenderActive) { renderAll(); return; } // 已在静默窗口内：直接渲染即可
  quietRenderActive = true;
  document.documentElement.classList.add("vh-quiet-render");
  try {
    renderAll();
  } finally {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.remove("vh-quiet-render");
      quietRenderActive = false;
    }));
  }
}

/* ---------- 页面切换 ---------- */

function switchTab(name, opts) {
  // 切换页面时清理全局浮层（词典搜索面板），避免残留叠加到其他页面
  if (typeof closeSheet === "function" && sheetOpen) closeSheet();
  // 任务/导出/通知子页无底部导航（对齐设计参考图，同 Review 沉浸模式）
  document.body.classList.toggle("subpage-active",
    name === "tasks" || name === "export" || name === "notify");
  $$(".page").forEach((p) => p.classList.remove("active"));
  const page = $(`#page-${name}`);
  void page.offsetWidth;
  page.classList.add("active");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  // 状态恢复路径（keepScroll）由 navigateBack 在渲染后回设滚动位置；
  // 普通导航（Tab 切换/进入子页）保持回到顶部
  if (!(opts && opts.keepScroll)) window.scrollTo({ top: 0 });
}

/* ============================================================
   页面导航栈 + 状态快照（统一机制，所有页面共用）
   ------------------------------------------------------------
   层级：home / words / history / settings 为顶层 Tab；
   export / notify 为 settings 子页；tasks / pomo / habits / review 为 home 子页。
   进入子页（openPage / pushPageSnapshot）时给当前页面拍快照压栈；
   系统返回键 / 全面屏手势 / 页面返回按钮（navigateBack）弹栈并恢复快照。
   快照内容 = 主滚动位置 + 页面内实际滚动过的容器位置 + 页面级 UI 状态。
   新页面的 UI 状态只需在 PAGE_UI_SAVERS / PAGE_UI_RESTORERS 登记。
   目标：进入下一层 → 返回上一层 → 上一层保持离开时的原始状态。
   ============================================================ */

const PAGE_PARENT = {
  home: null, words: null, history: null, settings: null,
  export: "settings", notify: "settings",
  tasks: "home", pomo: "home", habits: "home", review: "home",
};

let pageStack = []; // [{ page, ui }] 离开各页面时的快照（仅内存态）

/** 页面级 UI 状态注册表 */
const PAGE_UI_SAVERS = {
  words: () => ({ view: wordsView }),
  history: () => ({ range: historyRange }),
};
const PAGE_UI_RESTORERS = {
  words: (s) => { if (s && s.view) wordsView = s.view; },
  history: (s) => { if (s && s.range) historyRange = s.range; },
};

function currentPageName() {
  const p = $(".page.active");
  return p ? p.id.replace("page-", "") : "home";
}

/** 抓取快照：主滚动位置 + 页面内所有「实际滚动过」的容器位置 + 页面级 UI 状态 */
function capturePageState(page) {
  const ui = { winY: window.scrollY || window.pageYOffset || 0, els: [], page: null };
  const el = document.getElementById("page-" + page);
  if (el) {
    const nodes = [el].concat([...el.querySelectorAll("*")]);
    for (const n of nodes) {
      if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight + 2) ui.els.push(n.scrollTop);
      if (ui.els.length >= 24) break; // 上限兜底：极端 DOM 下不拖慢切页
    }
  }
  const saver = PAGE_UI_SAVERS[page];
  if (saver) ui.page = saver();
  return ui;
}

/** 恢复快照：页面渲染完成后调用；先同步回设，下一帧再校一次（防内容后撑高导致回设被钳制） */
function restorePageState(page, ui) {
  if (!ui) return;
  const restorer = PAGE_UI_RESTORERS[page];
  if (restorer && ui.page) restorer(ui.page);
  const apply = () => {
    window.scrollTo(0, ui.winY);
    const el = document.getElementById("page-" + page);
    if (el && ui.els.length) {
      const nodes = [el].concat([...el.querySelectorAll("*")])
        .filter((n) => n.scrollHeight > n.clientHeight + 2);
      nodes.forEach((n, i) => { if (i < ui.els.length) n.scrollTop = ui.els[i]; });
    }
  };
  apply();
  requestAnimationFrame(apply);
}

/** 给当前页面拍快照压栈（子页进入方在 switchTab 前调用） */
function pushPageSnapshot() {
  const cur = currentPageName();
  if (cur) pageStack.push({ page: cur, ui: capturePageState(cur) });
}

/** 进入子页：快照当前页 → 切换（渲染由调用方按各自惯例处理） */
function openPage(name) {
  pushPageSnapshot();
  switchTab(name);
}

/** 统一返回：弹栈恢复上一层；空栈回落到父页 / 首页；首页再返回 → false（交给系统退出） */
function navigateBack() {
  if (pageStack.length) {
    const { page, ui } = pageStack.pop();
    const restorer = PAGE_UI_RESTORERS[page];
    if (restorer && ui && ui.page) restorer(ui.page);
    renderAll();
    switchTab(page, { keepScroll: true });
    restorePageState(page, ui);
    return true;
  }
  const cur = currentPageName();
  const parent = PAGE_PARENT[cur];
  if (parent) { renderAll(); switchTab(parent); return true; }
  if (cur !== "home") { renderAll(); switchTab("home"); return true; }
  return false; // 首页无上层：交由系统处理（默认退出）
}

$$(".tab").forEach((t) => t.addEventListener("click", () => { rolloverIfNeeded(); renderAll(); pageStack.length = 0; switchTab(t.dataset.tab); }));
$$("[data-back='home']").forEach((b) => b.addEventListener("click", () => {
  if (document.body.classList.contains("review-active")) {
    ttsStop();
    exitReview();
  }
  navigateBack();
}));
$$("[data-back='settings']").forEach((b) => b.addEventListener("click", () => navigateBack()));
$("#view-all").addEventListener("click", () => openPage("words"));
$("#history-entry").addEventListener("click", () => { rolloverIfNeeded(); pushPageSnapshot(); renderAll(); switchTab("history"); });
$("#export-entry").addEventListener("click", () => openPage("export"));
/* 设置 → 数据：JSON 全量备份 / 恢复（逻辑见 js/data-manager.js） */
$("#json-export-entry").addEventListener("click", () => {
  if (window.VH_DataManager) window.VH_DataManager.onExportClick();
});
$("#json-import-entry").addEventListener("click", () => {
  if (window.VH_DataManager) window.VH_DataManager.onImportClick();
});
$("#notify-entry").addEventListener("click", () => { renderNotify(); openPage("notify"); });

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
  
  // 「娴熟」毕业：词义回忆页 / 详情页 / 选择题页 / 拼写页右上角灰色小字按钮
  // 优先于其它分支处理（毕业词立即退出调度，不再结算、不再出现）
  if (e.target.closest(".rv-mastered[data-mastered]")) {
    fire(ready, reviewMasteredFromSession);
    return;
  }
  
  // Phase 1: 判断按钮（认识/模糊/不认识）—— 仅 recall 任务时可用
  const ans = e.target.closest(".rv-btn[data-result]");
  if (ans && reviewSession.phase === "meaning") {
    const ct = reviewSession.currentTask;
    fire(ready && ct && ct.step === "recall", () => onReviewAnswer(ans.dataset.result));
    return;
  }
  
  // Phase 1: 记错了 —— 仅 recall 详情页可用
  if (e.target.closest("#review-wrong")) {
    const ctx = reviewSession.detailCtx;
    fire(ready && ctx && ctx.task && ctx.task.step === "recall", reviewCorrection);
    return;
  }
  
  // Phase 1: 下一个/继续 —— 详情页可用
  if (e.target.closest("#review-next")) {
    fire(ready && reviewSession.detailCtx, reviewNext);
    return;
  }

  // 完成页记录列表：放大镜 → 弹出词义卡片（复用长按浮层，纯查看，
  // 不增加查询次数/累计次数，不加入生词本，不修改 Review 状态；点「+1」才入生词本）
  const lookup = e.target.closest("[data-lookup]");
  if (lookup) {
    const lw = lookup.getAttribute("data-lookup");
    if (dictGet(lw)) {
      showMcqOverlay(lw);
    } else {
      // 词典分片未加载（如刷新后直接进入完成页）→ 先异步加载分片再弹出
      dictGetAsync(lw).then(() => showMcqOverlay(lw)).catch(() => {});
    }
    return;
  }

  // MCQ: 点击选项答题（长按松开后的 click 不触发答题）
  const mcqOpt = e.target.closest(".rv-mcq-option[data-mcq-idx]");
  if (mcqOpt) {
    const ct = reviewSession.currentTask;
    if (ct && (ct.step === "w2m" || ct.step === "m2w")) {
      if (mcqLongPressed) { mcqLongPressed = false; return; }
      fire(ready, () => onMcqAnswer(parseInt(mcqOpt.getAttribute("data-mcq-idx"), 10)));
      return;
    }
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

  // 完成页：返回首页（弹栈恢复进入 Review 前的页面状态）
  if (e.target.closest("#review-done-back")) {
    exitReview();
    navigateBack();
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

/* ---------- MCQ 长按查看反向信息（辅助学习，不影响答题结果） ---------- */
let mcqLongPressTimer = null;
let mcqLongPressOverlay = null;
let mcqLongPressed = false; // 标记本次长按已触发，阻止后续 click 答题

function removeMcqOverlay() {
  if (mcqLongPressTimer) { clearTimeout(mcqLongPressTimer); mcqLongPressTimer = null; }
  if (mcqLongPressOverlay) { mcqLongPressOverlay.remove(); mcqLongPressOverlay = null; }
}

/** 事件驱动的浮层关闭（带保护窗）：
    打开浮层的点击/长按序列会带尾随的 mouseup/touchend（引擎在 click 之后补发），
    会把刚打开的浮层立即关掉 —— 打开时设置短保护窗（400ms），窗内忽略事件关闭。 */
let mcqOverlayGuardUntil = 0;

function maybeRemoveMcqOverlay() {
  if (Date.now() < mcqOverlayGuardUntil) return;
  removeMcqOverlay();
}

/** 显示长按浮层：完整词典释义卡片（复用搜索结果卡片样式）
    不增加查询次数/记录/生词本，仅辅助查看。用户点击 +1 才执行加入生词本。
    交互约定（遮罩 + 卡片标准结构）：只有点击遮罩空白区域才关闭；
    点击卡片本身/内部任何元素（发音、+1、释义等）都不关闭，且事件被遮罩层挡住不会穿透到底层页面。 */
function showMcqOverlay(word) {
  removeMcqOverlay();
  mcqOverlayGuardUntil = Date.now() + 400; // 打开瞬间忽略尾随的 mouseup/click（触摸兼容事件），防止刚打开即被关闭
  const d = dictGet(word);
  if (!d) return;
  const m = wordMeta(word);
  const el = document.createElement("div");
  el.className = "rv-mcq-longpress";
  el.innerHTML = `<div class="rv-mcq-longpress-card">
    <div class="result-detail">
      <p class="detail-word">
        <span class="word">${esc(word)}</span>
        <span class="detail-word-actions">
          <span class="speaker-btn" data-speak="${esc(word)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
          <button class="add-one-btn" data-addone="${esc(word)}" type="button">+1</button>
        </span>
      </p>
      <p class="detail-phonetic">${esc(phoneticOf(word))}</p>
      ${detailMeaningsHtml(word)}
      <div class="detail-meta">
        <span class="meta-chip"><span class="chip-label">今日</span>${m.today} 次</span>
        <span class="meta-chip"><span class="chip-label">累计</span>${m.total} 次</span>
      </div>
    </div>
  </div>`;
  // 关闭逻辑：只有点击「遮罩空白区域」（target === 遮罩层本身）才关闭。
  // 点击卡片或其内部任何元素时 target 是具体子元素 → 不关闭，
  // 发音/+1 等由 document 级委托正常处理，事件不会穿透到底层页面（遮罩层 fixed + z-index 挡住）。
  el.addEventListener("click", (e) => {
    if (e.target === el) maybeRemoveMcqOverlay();
  });
  el.addEventListener("mouseup", (e) => {
    if (e.target === el) maybeRemoveMcqOverlay();
  });
  el.addEventListener("touchend", (e) => {
    if (e.target === el) maybeRemoveMcqOverlay();
  });
  document.body.appendChild(el);
  mcqLongPressOverlay = el;
}

/** 获取选项对应的单词（用于词典查询） */
function getMcqOptionWord(optionIdx) {
  const data = reviewSession.mcqData;
  if (!data) return null;

  if (data.type === "w2m") {
    // 单词→选释义模式：直接从 optionWords 查找源单词
    if (data.optionWords && data.optionWords[optionIdx]) {
      return data.optionWords[optionIdx];
    }
    // 兆底：反查
    const optionText = data.options[optionIdx];
    if (!optionText) return null;
    const results = reverseSearch(stripPos(optionText), 1);
    return results.length > 0 ? results[0] : null;
  }

  if (data.type === "m2w") {
    // 释义→选单词模式：选项就是单词
    return data.options[optionIdx] || null;
  }

  return null;
}

// 长按触发逻辑（触摸 + 鼠标通用）
function mcqLongPressStart(e) {
  const opt = e.target.closest(".rv-mcq-option[data-mcq-longpress]");
  if (!opt) return;
  const ct = reviewSession.currentTask;
  if (!ct || (ct.step !== "w2m" && ct.step !== "m2w")) return;
  const idx = parseInt(opt.getAttribute("data-mcq-longpress"), 10);
  mcqLongPressed = false;
  mcqLongPressTimer = setTimeout(() => {
    mcqLongPressed = true;
    const word = getMcqOptionWord(idx);
    if (word) {
      showMcqOverlay(word);
      try { navigator.vibrate && navigator.vibrate(30); } catch (_) {}
    }
  }, 500);
}

/** 取消未触发的长按定时器（普通点击在 500ms 内松开 → 不应弹出浮层）。
    只清定时器，不关闭已打开的浮层 —— 卡片保持打开，由遮罩点击关闭（见 showMcqOverlay）。 */
function mcqLongPressCancel() {
  if (mcqLongPressTimer) { clearTimeout(mcqLongPressTimer); mcqLongPressTimer = null; }
}

// 触摸/鼠标事件（移动端 + 桌面端兜底）：负责「长按打开」浮层 + 松开时取消未触发的长按。
// 不在 review-body 上监听 mouseup/touchend 关闭浮层——
// 浮层打开后手指松开应保持卡片打开（点遮罩空白才关闭），否则卡片内发音/+1 无法操作。
$("#review-body").addEventListener("touchstart", mcqLongPressStart, { passive: true });
$("#review-body").addEventListener("touchend", mcqLongPressCancel, { passive: true });
$("#review-body").addEventListener("touchmove", mcqLongPressCancel, { passive: true });

$("#review-body").addEventListener("mousedown", (e) => {
  const opt = e.target.closest(".rv-mcq-option[data-mcq-longpress]");
  if (opt) e.preventDefault(); // 防止长按时触发文本选择
  mcqLongPressStart(e);
});
$("#review-body").addEventListener("mouseup", mcqLongPressCancel);
$("#review-body").addEventListener("mouseleave", mcqLongPressCancel);

/** 退出 Review 沉浸模式 */
function exitReview() {
  document.body.classList.remove("review-active");
  removeMcqOverlay(); // 退出时清理长按浮层
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
  pushPageSnapshot();
  renderAll();
  switchTab("tasks");
  renderTasks();
}
function openHabits() {
  rolloverIfNeeded();
  pushPageSnapshot();
  renderAll();
  switchTab("habits");
  renderHabits();
}

$("#tasks-entry").addEventListener("click", openTasks);
$("#habits-entry").addEventListener("click", openHabits);
$("#habits-body").addEventListener("click", (e) => {
  // 折线图点选：命中某天数据列 → 切换显示该日的累计/学习时长（数据点、日期、时长一一对应）
  const hit = e.target.closest(".chart-hit");
  if (hit) {
    statsLineSel = Number(hit.dataset.li);
    statsLineRender();
    return;
  }
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

/* 折线图点选恢复：点击图表以外任意位置 → 回到默认今日显示；
   命中区自身（含重绘后已脱离 DOM 的元素，closest 仍可自匹配）不触发恢复 */
document.addEventListener("click", (e) => {
  if (statsLineSel === null) return;
  if (!e.target || !e.target.closest) return;
  if (e.target.closest(".chart-hit") || e.target.closest("#stats-line-chart")) return;
  statsLineSel = null;
  statsLineRender();
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
  if (pomo.running) {
    // 番茄钟运行中：返回键 = 打开「结束确认」二次提示（与页面内关闭按钮一致）；
    // 确认层已显示时保持不动（计时在确认期间继续），由按钮决定继续或结束
    if (!$("#pomo-confirm-no")) confirmPomoClose();
    return true;
  }
  if (exportSheetOpen) { closeExportSheet(); return true; } // 导出二次选择弹窗：返回即关闭
  if (sheetOpen) { closeSheet(); return true; }
  // Review 沉浸模式：先退出，再按页面层级返回（恢复进入前的页面状态）
  if (document.body.classList.contains("review-active")) {
    ttsStop();
    exitReview();
  }
  return navigateBack();
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
  if (!q) return renderSheetHint();
  // 中文输入 → 释义反向查询（英文查询路径不变）
  if (isChineseQuery(q)) return renderReverseResults(q);
  const matches = dictSearch(q);
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

/** 中文释义反查结果：完全复用既有结果行 UI 与点击链路
    （.result-row → commitQuery → 详情/读音/生词本/查询次数全功能保留） */
function renderReverseResults(q) {
  const matches = reverseSearch(q);
  if (!matches.length) {
    sheetBody.innerHTML = `<p class="sheet-hint">没有找到释义包含「${esc(q)}」的单词</p>`;
    return;
  }
  sheetBody.innerHTML =
    `<p class="sheet-reverse-tip">按中文释义找到 ${matches.length} 个单词</p>` +
    matches.map((w, i) => {
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

/** 词条详情渲染（与搜索链路一致的词典路由）：考研词书优先，未命中回退 ECDICT。
    生词列表 / 查询记录 / Review 等入口点击词条时，ECDICT 分片可能尚未加载
    （内存缓存，App 重启即清空），需与搜索链路一样按需异步加载后再渲染，
    否则 ECDICT-only 词（如 manufacturer）会误报「词典未收录」。 */
/* ---------- 单词笔记（与单词绑定，跨入口共享；独立键存储，随 JSON 备份/恢复） ----------
   所有单词详情入口（首页搜索 / 查询记录 / 生词本回顾）都经 renderSheetDetailWith 渲染，
   笔记板块挂在那里即可覆盖全部入口。Review 复习界面不显示笔记、不读笔记数据。 */

const WORD_NOTES_KEY = "vc-word-notes";
const WORD_NOTE_MAX_H = 120; // 详情页胶囊输入框的最大高度（超出部分内部滚动 + 显示展开入口）
let wordNotesCache = null;   // 惰性加载的内存缓存 { [word]: { text, ts } }

function loadWordNotes() {
  if (wordNotesCache) return wordNotesCache;
  try {
    const parsed = JSON.parse(localStorage.getItem(WORD_NOTES_KEY) || "null");
    wordNotesCache = (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch (_) { wordNotesCache = {}; }
  return wordNotesCache;
}

function getWordNote(w) {
  const e = loadWordNotes()[String(w || "").trim().toLowerCase()];
  return e && typeof e.text === "string" ? e.text : "";
}

/** 保存单词笔记（去首尾空白；空内容 = 删除该词笔记）。失败返回 false，由调用方明确提示，绝不假装成功。 */
function saveWordNote(w, text) {
  const key = String(w || "").trim().toLowerCase();
  if (!key) return false;
  const t = String(text || "").replace(/^\s+|\s+$/g, "");
  const notes = loadWordNotes();
  if (!t) delete notes[key]; else notes[key] = { text: t, ts: Date.now() };
  try {
    localStorage.setItem(WORD_NOTES_KEY, JSON.stringify(notes));
    return true;
  } catch (_) { return false; }
}

/** 胶囊输入框自动增高：随内容撑开，到上限后内部滚动并标记溢出（显示展开入口） */
function wordNoteAutosize(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, WORD_NOTE_MAX_H) + "px";
  const box = ta.closest(".word-note-box");
  if (box) box.classList.toggle("has-overflow", ta.scrollHeight > WORD_NOTE_MAX_H + 2);
}

/** 键盘避让（窗口 ADJUST_NOTHING）：键盘弹出后面板可视区收缩，聚焦的输入框可能被挤出视野，
    将其平滑滚回 .sheet-body 可视区。--ime 注入略滞后于键盘动画，由调用方做两次延时校准。 */
function imeEnsureVisible(ta) {
  const ime = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ime")) || 0;
  if (ime <= 0 || document.activeElement !== ta) return; // 键盘未弹出 / 已失焦：不动
  const scroller = ta.closest(".sheet-body");
  if (!scroller) return;
  const tr = ta.getBoundingClientRect();
  const sr = scroller.getBoundingClientRect();
  if (tr.top >= sr.top && tr.bottom <= sr.bottom) return; // 完整可见：不打扰
  const target = scroller.scrollTop + (tr.top - sr.top) - (sr.height - tr.height) / 2;
  scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
}

/** 绑定一个笔记输入容器（自动保存 + 展开）：输入防抖 600ms 自动保存，失焦立即保存 */
function bindWordNoteEditor(root, w) {
  const ta = root.querySelector(".word-note-input");
  if (!ta) return;
  wordNoteAutosize(ta);
  let timer = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!saveWordNote(w, ta.value)) showToast("笔记保存失败，请重试");
  };
  ta.addEventListener("input", () => {
    wordNoteAutosize(ta);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 600);
  });
  ta.addEventListener("blur", flush);
  ta.addEventListener("focus", () => {
    setTimeout(() => imeEnsureVisible(ta), 300);
    setTimeout(() => imeEnsureVisible(ta), 700);
  });
  // 修复：用户关闭 IME 后再次点击「记点笔记」时，输入框仍处 focus 状态 → 不会再触发 focus 监听
  // → IME 弹出后页面不滚动，输入框被遮挡。
  // 改用 pointerdown + click 双触发：覆盖所有「点击输入框」场景（含已聚焦状态下再次点击）。
  // 完全不触发 blur/重新 focus，对光标位置、用户已输入内容、键盘弹起时序均无副作用。
  // 时间点：50ms（已有 IME 时立即校正） / 300ms（IME 动画起点） / 700ms（IME 完全稳定后兜底）
  const recheckImeOnTap = () => {
    setTimeout(() => imeEnsureVisible(ta), 50);
    setTimeout(() => imeEnsureVisible(ta), 300);
    setTimeout(() => imeEnsureVisible(ta), 700);
  };
  ta.addEventListener("pointerdown", recheckImeOnTap);
  ta.addEventListener("click", recheckImeOnTap);
  const expand = root.querySelector(".word-note-expand");
  if (expand) expand.addEventListener("click", () => { flush(); openWordNotePage(w); });
}

let wordNotePageEl = null; // 二级笔记页（单例）

/** 二级笔记页：独立全屏界面查看/编辑完整笔记。
    以覆盖层形式挂在详情页之上，关闭即回到原详情页（原页面不在重新渲染，状态天然保持）。 */
function openWordNotePage(w) {
  if (wordNotePageEl) return;
  const el = document.createElement("div");
  el.className = "note-page";
  el.innerHTML = `<div class="note-page-panel">
    <header class="note-page-head">
      <button class="note-page-back" type="button" aria-label="返回">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>
      </button>
      <div class="note-page-title-wrap">
        <p class="note-page-word">${esc(w)}</p>
        <p class="note-page-sub">单词笔记 · 自动保存</p>
      </div>
    </header>
    <textarea class="note-page-input" placeholder="记录这个单词的笔记…"></textarea>
  </div>`;
  const ta = el.querySelector(".note-page-input");
  ta.value = getWordNote(w);
  let timer = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (saveWordNote(w, ta.value)) {
      // 同步回详情页的胶囊框（保持两处一致）
      const cap = document.querySelector("#sheet-body .word-note-input");
      if (cap) { cap.value = getWordNote(w); wordNoteAutosize(cap); }
    } else {
      showToast("笔记保存失败，请重试");
    }
  };
  ta.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 600);
  });
  el.querySelector(".note-page-back").addEventListener("click", () => {
    flush();
    if (timer) { clearTimeout(timer); timer = null; flush(); }
    el.remove();
    wordNotePageEl = null;
  });
  document.body.appendChild(el);
  wordNotePageEl = el;
  setTimeout(() => ta.focus(), 60);
}

/* ---------- ECDICT 增强信息（词形变化 / 考试标签 / 柯林斯星级 / 牛津3000 / 词频） ---------- */

const TAG_NAMES = {
  zk: "中考", gk: "高考", cet4: "四级", cet6: "六级",
  ky: "考研", toefl: "托福", ielts: "雅思", gre: "GRE",
};

/** 空格分隔的 tag 字符串 → 中文名称数组（未知 tag 保留原文） */
function tagNames(tagStr) {
  if (!tagStr) return [];
  return String(tagStr).trim().split(/\s+/).filter(Boolean).map((t) => TAG_NAMES[t] || t);
}

/** exchange 字符串 → 分组行 [{label, words:[]}]。
    p过去式 d过去分词 i现在分词 3第三人称单数 r比较级 t最高级 s复数 0原形 1变换 */
const EXCHANGE_LABELS = { p: "过去式", d: "过去分词", i: "现在分词", "3": "第三人称单数", r: "比较级", t: "最高级", s: "复数", "0": "原形", "1": "变换" };
const EXCHANGE_ORDER = ["p", "d", "i", "3", "r", "t", "s", "0", "1"];
function exchangeRows(ex) {
  if (!ex) return [];
  const groups = {};
  String(ex).split("/").forEach((item) => {
    const i = item.indexOf(":");
    if (i <= 0) return;
    const t = item.slice(0, i);
    const w = item.slice(i + 1);
    if (!w) return;
    (groups[t] = groups[t] || []).push(w);
  });
  return EXCHANGE_ORDER.filter((t) => groups[t]).map((t) => ({ label: EXCHANGE_LABELS[t] || t, words: groups[t] }));
}

/** 增强信息行 HTML：考试标签徽章 + 柯林斯星级 + 牛津3000 + 词频；无数据返回空串 */
function extInfoHtml(ext) {
  if (!ext) return "";
  const chips = [];
  (tagNames(ext.tag) || []).forEach((name) => chips.push(`<span class="tag-chip">${esc(name)}</span>`));
  if (ext.col) chips.push(`<span class="stars" title="柯林斯星级 ${ext.col}">${"★".repeat(ext.col)}</span>`);
  if (ext.ox) chips.push(`<span class="ox-chip">牛津3000</span>`);
  const freq = [];
  if (ext.bnc) freq.push(`<span>BNC #${ext.bnc}</span>`);
  if (ext.frq) freq.push(`<span>当代 #${ext.frq}</span>`);
  const parts = [];
  if (chips.length) parts.push(`<span class="ext-chips">${chips.join("")}</span>`);
  if (freq.length) parts.push(`<span class="ext-freq">${freq.join("")}</span>`);
  if (!parts.length) return "";
  return `<div class="detail-ext-info">${parts.join("")}</div>`;
}

/** 词形变化区块 HTML（仅内部内容）；无 exchange 数据返回空串。
    外层 <div class="detail-exchange"> 由 renderSheetDetailWith 的模板容器提供，
    这里若再包一层会形成嵌套 div → 两条 border-top（双分隔线）。 */
function extBlockHtml(ext) {
  const rows = exchangeRows(ext && ext.ex);
  if (!rows.length) return "";
  return `<div class="exchange-title">词形变化</div>
    <div class="exchange-rows">${rows.map((r) =>
      `<span class="exchange-item"><span class="exchange-label">${esc(r.label)}</span><span class="exchange-words">${r.words.map((w) => `<span class="exchange-word">${esc(w)}</span>`).join("")}</span></span>`
    ).join("")}</div>`;
}

/** 正则转义（用于构造高亮正则） */
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 例句英文中高亮查询词及其词形变化（红色加粗）；返回已转义 HTML */
function highlightExample(text, word, variants) {
  const terms = [word].concat(variants || []).filter(Boolean).map(escRe);
  if (!terms.length) return esc(text);
  const re = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
  return esc(text).replace(re, (m) => `<span class="example-hl">${m}</span>`);
}

/** 例句区块 HTML（仅内部内容）；ext.eg 为空返回空串。
    与 extBlockHtml 同理：外层容器由模板提供，避免嵌套 div 双分隔线。 */
function extExamplesHtml(w, ext) {
  const eg = ext && ext.eg;
  if (!eg || !eg.length) return "";
  const variants = [];
  exchangeRows(ext && ext.ex).forEach((r) => (r.words || []).forEach((x) => variants.push(x)));
  return `<div class="examples-title">例句</div>
    ${eg.map((e) => `<div class="example-item">
      <p class="example-en">${highlightExample(e.en, w, variants)}</p>${e.cn ? `<p class="example-cn">${esc(e.cn)}</p>` : ""}
    </div>`).join("")}`;
}

/** 异步填充当前详情面板的增强区块（防竞态：面板已关/输入已变则作废） */
function renderSheetExt(w) {
  if (!window.ECDICT_EXT) return;
  const apply = (ext) => {
    if (!sheetOpen || sheetInput.value.trim().toLowerCase() !== w) return;
    const info = sheetBody.querySelector(".detail-ext-info");
    const block = sheetBody.querySelector(".detail-exchange");
    const examples = sheetBody.querySelector(".detail-examples");
    if (info) info.innerHTML = extInfoHtml(ext);
    if (block) block.innerHTML = extBlockHtml(ext);
    if (examples) examples.innerHTML = extExamplesHtml(w, ext);
  };
  const synced = window.ECDICT_EXT ? window.ECDICT_EXT.get(w) : null;
  if (synced) { apply(synced); return; }
  window.ECDICT_EXT.getAsync(w).then(apply);
}

function renderSheetDetail(word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return;
  sheetInput.value = w; // 详情视图同步输入框（生词列表/Review 入口可能未设置）
  const d = dictGet(w); // 考研词书 / 已加载的 ECDICT 分片：同步命中直接渲染
  if (d) { renderSheetDetailWith(w, d); renderSheetExt(w); return; }
  // 考研未命中且 ECDICT 分片未加载：异步按需加载后渲染（与 dictGetAsync 搜索兜底一致）
  dictGetAsync(w).then((e) => {
    if (!sheetOpen || sheetInput.value.trim().toLowerCase() !== w) return; // 面板已关/输入已变 → 作废
    if (e) { renderSheetDetailWith(w, e); renderSheetExt(w); }
    else sheetBody.innerHTML = `<p class="sheet-hint">词典未收录「${esc(w)}」</p>`;
  });
  sheetBody.innerHTML = `<p class="sheet-hint">正在查询词典…</p>`;
}

/** 用已命中的词条渲染详情视图（d 为 dictGet/dictGetAsync 的返回值） */
function renderSheetDetailWith(w, d) {
  const m = wordMeta(w);
  sheetBody.innerHTML = `<div class="result-detail">
    <p class="detail-word">
      <span class="word">${wordHTML(w, m.total)}</span>
      <span class="detail-word-actions">
        <span class="speaker-btn" data-speak="${esc(w)}" role="button" aria-label="播放读音" type="button">${SPEAKER_SVG}</span>
        <button class="add-one-btn" data-addone="${esc(w)}" type="button">+1</button>
      </span>
    </p>
    <p class="detail-phonetic">${esc(phoneticOf(w))}</p>
    <div class="detail-ext-info"></div>
    ${detailMeaningsHtml(w)}
    <div class="detail-exchange"></div>
    <div class="detail-examples"></div>
    <div class="detail-meta">
      <span class="meta-chip"><span class="chip-label">今日</span>${m.today} 次</span>
      <span class="meta-chip"><span class="chip-label">累计</span>${m.total} 次</span>
    </div>
    <div class="word-note">
      <h2 class="section-title">笔记</h2>
      <div class="word-note-box">
        <textarea class="word-note-input" rows="1" placeholder="记点笔记…" data-note-word="${esc(w)}">${esc(getWordNote(w))}</textarea>
        <button class="word-note-expand" type="button" aria-label="展开笔记">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10L10 6M10 6H6.8M10 6v3.2"/><path d="M3.5 3.5h9v9h-9z" opacity="0"/></svg>
        </button>
      </div>
    </div>
  </div>`;
  bindWordNoteEditor(sheetBody, w);
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
  // 内容与已记录词不同 = 旧会话失效（之后点击进入详情算新查询）
  if (v !== sessionWord) {
    sessionWord = null;
    sessionConfirmed = null;
  }
  // 实时搜索只刷新候选/反查列表，不记录查询次数：
  // 统计触发点统一为「点击词条并成功进入详情」或「回车确认」（commitQuery）。
  renderSheetResults(e.target.value);
});

sheetInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const q = sheetInput.value.trim().toLowerCase();
  // 中文输入 → 反查：回车直接查询匹配度最高的英文词
  if (isChineseQuery(q)) {
    const top = reverseSearch(q, 1)[0];
    if (top) commitQuery(top);
    return;
  }
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
let vcThemeMode = "system"; // 用户保存的外观模式（light/dark/system）；dataset.theme 存解析后的具体主题

/** 系统是否深色模式：APK 内直接读原生 UI Mode（WebView 的 prefers-color-scheme 在
    部分 ROM/WebView 版本上恒报浅色，不可靠）；浏览器环境回退 matchMedia */
function systemPrefersDark() {
  try {
    if (hasBridge() && typeof window.AndroidBridge.getSystemDark === "function") {
      return window.AndroidBridge.getSystemDark() === true;
    }
  } catch (_) { }
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode, persist = true) {
  vcThemeMode = mode;
  const dark =
    mode === "dark" ||
    (mode === "system" && systemPrefersDark());
  // CSS 只按具体主题（dark/light）分支，不依赖 prefers-color-scheme → 与原生状态严格一致
  html.dataset.theme = dark ? "dark" : "light";
  metaTheme.content = dark ? "#0B0E14" : "#F7F8FA";
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
  if (vcThemeMode === "system") applyTheme("system", false);
});
/* 原生系统深色模式变化回调（MainActivity.onConfigurationChanged → uiMode）：
   仅「跟随系统」时重新解析；手动浅色/深色不受影响，保存的模式不变 */
window.__onSystemThemeChanged = function () {
  if (vcThemeMode === "system") applyTheme("system", false);
};

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

/* ---------- 通知提醒（Android 原生 AlarmManager + 系统通知，仅 APK 内可用） ----------
   前端只负责两件事：
     ① 用户设置（开关 / 提醒时间）→ AndroidBridge.setReminder(on, hour, minute)
     ② 任务与复习状态快照        → AndroidBridge.updateReminderState(json)
   到点检查、发通知、App 关闭态触发、重启后恢复计划一律由原生完成，不依赖 WebView 存活。
   快照口径与前端 reviewQueue() / todayAllDone() 严格一致（见 reminderSnapshot）。 */

const NOTIFY_KEY = "vc-notify";
const notifyCfg = loadNotify();
let notifyPushTimer = null;

function loadNotify() {
  try {
    const s = JSON.parse(localStorage.getItem(NOTIFY_KEY) || "null");
    if (s && typeof s === "object") {
      const h = Number(s.hour), m = Number(s.minute);
      return {
        on: !!s.on,
        hour: Number.isFinite(h) ? Math.min(23, Math.max(0, Math.round(h))) : 21,
        minute: Number.isFinite(m) ? Math.min(59, Math.max(0, Math.round(m))) : 0,
      };
    }
  } catch (_) { /* 数据损坏 → 回默认 */ }
  return { on: false, hour: 21, minute: 0 };
}

function saveNotify() {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(notifyCfg)); } catch (_) {}
}

function notifyTimeText() {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(notifyCfg.hour)}:${p(notifyCfg.minute)}`;
}

/** 通知提醒状态快照（交原生持久化，到点时由原生现算，不使用任何固定假状态）：
      review：生词本内全部词条的 nextAt 时间戳（升序）→ 原生按「nextAt <= 当前时刻」计数，
              与前端 reviewQueue() 同口径；存时间戳而非数量，快照多旧都不会失真
      tasks / done：今日任务定义 + 今日已打卡 id → 原生可对任意业务日重新投影（tasksOfDay /
               dailyVisibleOn / isTaskDone 同口径），App 几天没打开也能算出当天该不该提醒
    两个状态彼此独立，原生分别判断、分别发通知。 */
function reminderSnapshot() {
  const day = vocabDay();
  const tasks = todayTasks().map((t) => (t.kind === "daily"
    ? {
        id: t.id, k: "d",
        s: t.startAt || bizDayOf(t.createdAt), e: t.endAt || null,
        x: t.deletedAt ? (t.deleteDay || bizDayOf(t.deletedAt)) : null,
        xk: t.keepDeletedDay ? 1 : 0,
      }
    : { id: t.id, k: "o", d: t.date }));
  const review = [];
  for (const w of Object.keys(reviewStore.words)) {
    const e = reviewStore.words[w];
    if (e && e.nextAt > 0 && isStarred(w)) review.push(e.nextAt);
  }
  review.sort((a, b) => a - b);
  if (review.length > 5000) review.length = 5000; // 极端数据量保护（升序，保留最早到期的一批）
  return JSON.stringify({
    v: 1, day, ts: Date.now(),
    tasks, done: taskStore.checkins[day] || [], review,
  });
}

/** 推送快照给原生；300ms 合并窗口（复习答题、批量迁移等高频写入只推最后一次） */
function pushReminderState() {
  if (!hasBridge()) return;
  clearTimeout(notifyPushTimer);
  notifyPushTimer = setTimeout(() => {
    try { window.AndroidBridge.updateReminderState(reminderSnapshot()); } catch (_) {}
  }, 300);
}

/** 同步通知相关 UI：设置页入口副标题 + 二级页开关 / 时间 / 状态 */
function applyNotifyUI() {
  const on = notifyCfg.on;
  const sw = $("#notify-switch");
  if (sw) sw.setAttribute("aria-checked", String(on));
  const time = $("#notify-time");
  if (time) time.value = notifyTimeText();
  const entry = $("#notify-value");
  if (entry) entry.textContent = on ? notifyTimeText() : "关";
  const status = $("#notify-status");
  if (status) status.textContent = on ? `每日 ${notifyTimeText()}` : "未开启";
}

/** 设置落盘 + 通知原生：关闭 → 取消已设定的提醒；改时间 → 取消旧计划并按新时间重排 */
function commitNotify() {
  saveNotify();
  applyNotifyUI();
  if (!hasBridge()) return;
  window.AndroidBridge.setReminder(notifyCfg.on, notifyCfg.hour, notifyCfg.minute);
}

function renderNotify() { applyNotifyUI(); }

$("#notify-switch").addEventListener("click", () => {
  notifyCfg.on = !notifyCfg.on;
  // 开启且未获通知权限时，原生先申请权限，结果经 window.__onNotifyPermission 回写
  commitNotify();
  if (notifyCfg.on) ensureReminderDeliverability(); // 精确闹钟 / 电池优化送达保障引导
});
$("#notify-time").addEventListener("change", (e) => {
  const seg = String(e.target.value || "").split(":");
  const h = Number(seg[0]), m = Number(seg[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) { applyNotifyUI(); return; }
  notifyCfg.hour = Math.min(23, Math.max(0, h));
  notifyCfg.minute = Math.min(59, Math.max(0, m));
  commitNotify();
  showToast(`提醒时间已设为 ${notifyTimeText()}`);
});

/** 原生申请通知权限的结果回调：拒绝则把开关复位，避免出现「显示已开但不会响」 */
window.__onNotifyPermission = function (granted) {
  notifyCfg.on = !!granted;
  commitNotify();
  showToast(granted ? "通知提醒已开启" : "未获得通知权限");
};

/** 回到前台 / 从系统通知设置页返回：权限被关掉 → 复位显示；否则校正一次计划 */
function syncNotifyPermission() {
  if (!hasBridge() || !notifyCfg.on) return;
  if (!window.AndroidBridge.hasNotificationPermission()) {
    notifyCfg.on = false;
    saveNotify();
    applyNotifyUI();
    return;
  }
  // 用 syncReminderState 而非 syncReminder：把前端设置一并下发，
  // 避免原生存储失配（如曾桥调用失败）时按旧设置取消/错排闹钟
  try { window.AndroidBridge.syncReminderState(notifyCfg.on, notifyCfg.hour, notifyCfg.minute); } catch (_) {}
}

function initNotify() {
  if (!hasBridge()) return; // Web 预览隐藏该项
  const item = $("#notify-entry"), sep = $("#notify-sep");
  if (item) item.hidden = false;
  if (sep) sep.hidden = false;
  // 系统通知被关（用户在系统设置里关掉）：前端开关复位，杜绝「显示已开但不会响」的幽灵状态
  try {
    if (notifyCfg.on && !window.AndroidBridge.hasNotificationPermission()) {
      notifyCfg.on = false;
      saveNotify();
    }
  } catch (_) {}
  applyNotifyUI();
  // 启动时把前端本地设置静默重发给原生：强制原生 SharedPreferences 与 localStorage 对齐。
  // 只调 syncReminder()（按原生存的设置排程）时，一旦两端失配（升级安装/清应用数据/
  // 桥调用失败），前端显示已开启、原生却每次启动都取消闹钟 → 永远不响。
  try { window.AndroidBridge.syncReminderState(notifyCfg.on, notifyCfg.hour, notifyCfg.minute); } catch (_) {}
}

/** 开启提醒后的送达保障引导（问一次，用户拒绝后不再打扰）：
      未豁免电池优化 → 弹系统对话框申请（激进省电 ROM 会推迟或拦截后台闹钟）。
      精确性无需引导：原生排程用 setAlarmClock 闹钟型注册（USE_EXACT_ALARM 声明即授予），
      Doze 中准点触发、无需用户另开任何权限 */
function ensureReminderDeliverability() {
  if (!hasBridge()) return;
  const B = window.AndroidBridge;
  try {
    if (typeof B.isIgnoringBatteryOptimizations === "function"
        && !B.isIgnoringBatteryOptimizations()
        && !localStorage.getItem("vc-notify-batt-asked")) {
      localStorage.setItem("vc-notify-batt-asked", "1");
      B.requestIgnoreBatteryOptimizations(); // 系统弹窗：允许应用后台运行
    }
  } catch (_) {}
}

/** 通知点击落地：由原生在页面就绪后调用。target = 'review'（单词 Review）| 'tasks'（学习任务） */
window.__vhGo = function (target) {
  if (target === "review") { openReview(); return; }
  openTasks();
};

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

const exportState = { content: "today", format: "pdf", style: "clean", picked: null };
bindSegmented("#content-seg", (v) => { exportState.content = v; exportState.picked = null; renderExportMeta(); });
bindSegmented("#format-seg", (v) => { exportState.format = v; renderExportMeta(); });
bindSegmented("#style-seg", (v) => (exportState.style = v));
// 查询记录页时间筛选：切换即重渲染列表（仅展示层，不改数据/统计）
bindSegmented("#history-range-seg", (v) => { historyRange = v; renderHistory(); });

/** 默认导出词数上限：模板渲染页数上限 30 页（见 js/export-template.js
    PAGE_LIMIT），每页词数随释义长度浮动，折算约 150 词 —— 默认导出
    按此截断；选择性导出不截断，超出后由模板页数上限自然回退旧路径 */
const EXPORT_DEFAULT_LIMIT = 150;

/** 当前导出内容对应的生词列表：今日生词 | 历史生词。
    选择性导出时返回用户勾选的词（picked），否则按默认逻辑最多取 150 词。
    仅影响本次导出内容，不修改任何生词数据。 */
function exportWords() {
  if (exportState.picked) return exportState.picked;
  const list = exportState.content === "starred" ? starredWords() : todayWords();
  return list.slice(0, EXPORT_DEFAULT_LIMIT);
}

/** 当前导出内容的查询次数：今日=当前业务日的查询条数（按 ts 归日）；历史=历史生词累计查询总数 */
function exportQueries() {
  if (exportState.content === "starred")
    return exportWords().reduce((s, w) => s + (wordMeta(w).total || 0), 0);
  const day = records.day || vocabDay();
  if (records.qToday && records.qToday.day === day) return records.qToday.n;
  return records.history.filter((h) => h && h.ts && bizDayOf(h.ts) === day).length;
}

const EXPORT_CONTENT_NAME = { today: "今日生词", starred: "历史生词", stats: "学习统计" };
const EXPORT_FORMAT_NAME = { pdf: "PDF", word: "Word", png: "PNG" };

function renderExportMeta() {
  rolloverIfNeeded(); // 跨 04:00 先滚动业务日，保证「今日」= 当前业务日
  const isStats = exportState.content === "stats";
  const tEl = $("#export-preview-title");
  if (tEl) tEl.textContent = `${EXPORT_FORMAT_NAME[exportState.format]} · ${EXPORT_CONTENT_NAME[exportState.content]}`;
  const sEl = $("#export-preview-sub");
  if (sEl) sEl.textContent = isStats
    ? "真实学习数据 · 报告式图表排版"
    : "VocabHit 水印 · A4 竖版";
  const btn = $("#export-btn");
  if (btn) btn.disabled = false; // 学习统计已支持 PDF / Word / PNG 报告导出
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
    // 考研词书 → 释义分级着色（KY.exportHtml 复用详情/Review 同一等级数据
    // 与 CSS 变量色，颜色内联保证导出文件自包含）；ECDICT 等保持纯文本行
    const kyLines = window.KY && KY.exportHtml ? KY.exportHtml(w) : null;
    const lines = (kyLines != null ? kyLines : senseLines(w).map((l) => `<div>${esc(l)}</div>`))
      .slice(0, maxLines)
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

/** 模板化导出（PDF / PNG）：线条小狗整页背景 + 双板块词条排版，
    详见 js/export-template.js。词条数据与现有导出同口径（导出前
    dictGetAsync 预加载，保证音标/释义完整）。
    模板缺失 / 空列表 / 超页数上限 → 返回 false，调用方回退旧导出路径。 */
async function exportViaTemplate(fmt, name) {
  const T = window.VH_ExportTemplate;
  rolloverIfNeeded();
  const words = exportWords();
  if (!words.length) return false;
  await Promise.all(words.map((w) => dictGetAsync(w)));
  const isStarred = exportState.content === "starred";
  const entries = words.map((w) => {
    const m = wordMeta(w);
    return {
      word: w,
      meta: isStarred ? `累计 ${m.total} 次查询` : `今日 ${m.today} 次 · 累计 ${m.total} 次`,
      phonetic: phoneticOf(w),
      // 考研词书 → 富文本行（KY.exportLines：同一分级数据 + CSS 变量色，
      // 模板渲染端按分段着色并绘制「僻」上标）；其余回退纯文本行
      lines: (window.KY && KY.exportLines ? KY.exportLines(w) : null) || senseLines(w),
    };
  });
  const canvases = await T.renderPages(entries);
  console.log(`[export] renderPages -> ${canvases ? canvases.length + " page(s)" : "null (fallback)"}`);
  if (!canvases) return false;
  if (hasBridge()) { // Android：原生拼装多页 PDF / 长图 PNG，直接存入 Downloads
    if (fmt === "pdf") {
      const payload = JSON.stringify(canvases.map(T.canvasJpegDataUrl));
      console.log(`[export] bridge exportPdfImages payloadLen=${payload.length}`);
      window.AndroidBridge.exportPdfImages(name, payload);
      console.log("[export] bridge exportPdfImages call returned");
    } else {
      const dataUrl = T.stackedPngDataUrl(canvases);
      console.log(`[export] bridge exportImageFile dataUrlLen=${dataUrl.length} prefix=${dataUrl.slice(0, 32)}`);
      window.AndroidBridge.exportImageFile(name, dataUrl);
      console.log("[export] bridge exportImageFile call returned");
    }
    showToast(`导出中 · ${fmt.toUpperCase()}…`);
    return true;
  }
  if (fmt === "pdf") {
    downloadBlob(await T.canvasesToPdfBlob(canvases), `${name}.pdf`);
  } else {
    downloadBlob(await T.stackedPngBlob(canvases), `${name}.png`);
  }
  showToast(`已导出 ${name}.${fmt}`);
  return true;
}

/* 学习统计导出（报告式）：整页报告画布（统计卡片 + 柱状图 + 折线图，
   全部来自 VH_STATS 真实数据，见 js/stats-export.js）。
   PDF / PNG 复用既有桥接与零依赖装配链路；Word = MHTML（图表以
   base64 图片嵌入，Word/WPS 打开布局正常）。 */
async function exportStatsReport() {
  const S = window.VH_StatsExport, T = window.VH_ExportTemplate;
  if (!S || !T) { showToast("统计导出组件未加载，请重启应用"); return; }
  const report = S.renderReport();
  if (!report) { showToast("暂无统计数据可导出"); return; }
  const dateStr = vocabDay();
  const name = `学习统计-${dateStr}`;
  const fmt = exportState.format;
  if (hasBridge()) { // Android APK：复用既有原生导出通道
    if (fmt === "pdf") {
      window.AndroidBridge.exportPdfImages(name, JSON.stringify([T.canvasJpegDataUrl(report.page)]));
    } else if (fmt === "png") {
      window.AndroidBridge.exportImageFile(name, T.stackedPngDataUrl([report.page]));
    } else { // Word：MHTML 文本（.doc），原生原样保存（不加 BOM，保 MIME 结构完整）
      window.AndroidBridge.exportTextFile(`${name}.doc`, "application/msword", S.buildWordMhtml(report));
    }
    showToast(`导出中 · ${fmt.toUpperCase()}…`);
    return;
  }
  if (fmt === "pdf") {
    downloadBlob(await T.canvasesToPdfBlob([report.page]), `${name}.pdf`);
    showToast(`已导出 ${name}.pdf`);
  } else if (fmt === "png") {
    downloadBlob(await T.stackedPngBlob([report.page]), `${name}.png`);
    showToast(`已导出 ${name}.png`);
  } else {
    downloadBlob(new Blob([S.buildWordMhtml(report)], { type: "application/msword" }), `${name}.doc`);
    showToast(`已导出 ${name}.doc`);
  }
}

$("#export-btn").addEventListener("click", async () => {
  if (exportState.content === "stats") { // 学习统计：报告式导出（PDF / Word / PNG），无生词可选，直接导出
    try { await exportStatsReport(); } catch (err) {
      console.error(`[export-stats] failed: ${err && (err.stack || err.message || err)}`);
      showToast("导出失败，请重试");
    }
    return;
  }
  openExportSheet(); // 生词导出：先弹二次选择（默认 / 选择性导出），不直接进入导出
});

/** 既有生词导出链路（PDF / PNG 模板优先，模板不可用回退旧路径；Word；
    Android 原生通道）。由二次选择窗口触发，词列表经 exportWords() 取得 */
async function runVocabExport() {
  rolloverIfNeeded(); // 跨 04:00 先滚动业务日（与导出内容口径一致）
  const dateStr = vocabDay(); // 业务日期（04:00 切换点），非 UTC/自然日期
  const fmt = exportState.format;
  const name = exportState.content === "starred" ? `生词本-历史-${dateStr}` : `生词本-${dateStr}`;
  try {
    // PDF / PNG 优先走线条小狗模板渲染；不可用（模板缺失/空列表）时回退旧路径
    if ((fmt === "pdf" || fmt === "png") && window.VH_ExportTemplate
        && await exportViaTemplate(fmt, name)) return;

    const html = await buildExportHTML(exportState.style); // await：先确保词典数据完整再导出
    if (hasBridge()) { // Android APK：原生导出（Word 及模板回退场景）
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
    console.error(`[export] failed: ${err && (err.stack || err.message || err)}`);
    showToast("导出失败，请重试");
  }
}

/** 以勾选词列表走一次完整导出；结束后清空 picked（仅影响本次导出内容，
    不修改生词数据） */
async function exportWithPicked(picked) {
  exportState.picked = picked;
  try { await runVocabExport(); } finally { exportState.picked = null; }
}

/* ---------- 导出二次选择 Bottom Sheet（方式选择 → 生词勾选） ---------- */

const exportSheet = $("#export-sheet");
const exportSheetOverlay = $("#export-sheet-overlay");
const exportSheetBody = $("#export-sheet-body");
const exportSheetTitle = $("#export-sheet-title");
const exportSelFooter = $("#export-sel-footer");
const exportSelBtn = $("#export-sel-btn");
let exportSheetOpen = false;
let exportPick = null; // Set：勾选视图当前已选词（仅临时记录本次导出，不改生词数据）

function openExportSheet() {
  exportPick = null;
  renderExportChooser();
  exportSheetOverlay.classList.add("visible");
  exportSheet.classList.add("open");
  exportSheet.setAttribute("aria-hidden", "false");
  exportSheetOpen = true;
}

function closeExportSheet() {
  if (!exportSheetOpen) return;
  exportSheetOverlay.classList.remove("visible");
  exportSheet.classList.remove("open");
  exportSheet.setAttribute("aria-hidden", "true");
  exportSheetOpen = false;
  exportPick = null;
}

/** 当前入口的生词全集与是否历史生词（选择视图与方式选择共用口径） */
function exportSourceList() {
  return { words: exportState.content === "starred" ? starredWords() : todayWords(),
           isStarred: exportState.content === "starred" };
}

/** 视图一：导出方式选择 —— 默认（最多150词） / 选择性导出 */
function renderExportChooser() {
  exportSelFooter.hidden = true;
  const contentName = EXPORT_CONTENT_NAME[exportState.content];
  exportSheetTitle.textContent = `导出 · ${contentName}`;
  const { words } = exportSourceList();
  const defaultDesc = words.length > EXPORT_DEFAULT_LIMIT
    ? `按现有排版导出前 ${EXPORT_DEFAULT_LIMIT} 词（共 ${words.length} 个）`
    : `导出全部 ${words.length} 个生词`;
  exportSheetBody.innerHTML = `
    <p class="export-choice-sub">共 ${words.length} 个${contentName} · 请选择导出方式</p>
    <div class="fmt-list exp-choice-list">
      <button class="fmt-row" id="exp-opt-default" type="button">
        <span class="fmt-icon fmt-icon-pdf"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/></svg></span>
        <span class="fmt-main">
          <span class="fmt-name">默认（最多150词）</span>
          <span class="fmt-desc">${defaultDesc}</span>
        </span>
      </button>
      <button class="fmt-row" id="exp-opt-select" type="button">
        <span class="fmt-icon fmt-icon-word"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l1.7 1.7L9 4.4"/><path d="M12.5 7H20"/><path d="M4 13l1.7 1.7L9 11.4"/><path d="M12.5 14H20"/><path d="M4.5 20h2"/><path d="M12.5 20H20"/></svg></span>
        <span class="fmt-main">
          <span class="fmt-name">选择性导出</span>
          <span class="fmt-desc">手动勾选本次要导出的生词</span>
        </span>
      </button>
    </div>`;
  $("#exp-opt-default").addEventListener("click", () => {
    closeExportSheet();
    runVocabExport(); // picked 保持 null → exportWords() 按默认逻辑最多 150 词
  });
  $("#exp-opt-select").addEventListener("click", renderExportSelector);
}

/** 勾选行 HTML：圆圈视觉复用每日任务 task-check（选中色为主题紫，
    表示「选择/未选择」而非任务完成）。
    注意：属性用 data-exp-word 而非 data-word —— 全局点击委托会把
    [data-word] 当作词典查询入口（openSheet/commitQuery），会虚增查询次数 */
function expWordRowHTML(w, isStarred) {
  const m = wordMeta(w);
  const on = exportPick && exportPick.has(w);
  return `<button class="exp-word-row${on ? " selected" : ""}" data-exp-word="${esc(w)}" type="button">
    <span class="task-check exp-check${on ? " checked" : ""}" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>
    </span>
    <span class="exp-word-main">
      <span class="exp-word">${esc(w)}</span>
      <span class="exp-word-sub">${isStarred ? `累计 ${m.total} 次查询` : `今日 ${m.today} 次 · 累计 ${m.total} 次`}</span>
    </span>
  </button>`;
}

/** 底部导出条 + 全选按钮文案 + 计数实时更新 */
function updateExportSelBar(words) {
  const n = exportPick ? exportPick.size : 0;
  const cnt = $("#exp-sel-count");
  if (cnt) cnt.textContent = `已选择 ${n} 个`;
  const allBtn = $("#exp-sel-all");
  if (allBtn) allBtn.textContent = words.length && n === words.length ? "取消全选" : "全选";
  exportSelBtn.disabled = !n;
  exportSelBtn.textContent = n ? `导出 ${n} 个生词` : "导出";
}

/** 原地同步列表行勾选状态（不整列表重渲染，保持滚动位置与输入状态） */
function syncExportSelRows(words) {
  $$("#exp-word-list .exp-word-row").forEach((row) => {
    const on = exportPick.has(row.dataset.expWord);
    row.classList.toggle("selected", on);
    const c = row.querySelector(".exp-check");
    if (c) c.classList.toggle("checked", on);
  });
  updateExportSelBar(words);
}

/** 视图二：生词勾选（今日入口=今日生词；历史入口=全部历史生词）。
    全选 / 取消全选 / 单独勾选 / 全选后微调 / 已选数量实时更新 */
function renderExportSelector() {
  if (!exportPick) exportPick = new Set();
  exportSelFooter.hidden = false;
  const { words, isStarred } = exportSourceList();
  exportSheetTitle.textContent = `选择生词 · ${EXPORT_CONTENT_NAME[exportState.content]}`;
  exportSheetBody.innerHTML = `
    <div class="exp-sel-toolbar">
      <button class="exp-sel-all-btn" id="exp-sel-all" type="button">全选</button>
      <span class="exp-sel-count" id="exp-sel-count">已选择 0 个</span>
    </div>
    <div class="exp-word-list" id="exp-word-list">${
      words.length
        ? words.map((w) => expWordRowHTML(w, isStarred)).join("")
        : `<p class="sheet-hint">${isStarred ? "历史生词本暂无记录" : "今天暂无生词记录"}</p>`
    }</div>`;
  updateExportSelBar(words);
  exportSheetBody.scrollTop = 0;

  // 全选 / 取消全选（全选后仍可逐条取消微调）
  $("#exp-sel-all").addEventListener("click", () => {
    if (words.length && exportPick.size === words.length) exportPick.clear();
    else words.forEach((w) => exportPick.add(w));
    syncExportSelRows(words);
  });

  // 单条勾选/取消：事件委托 + 原地更新
  $("#exp-word-list").addEventListener("click", (e) => {
    const row = e.target.closest(".exp-word-row");
    if (!row) return;
    const w = row.dataset.expWord;
    if (exportPick.has(w)) exportPick.delete(w); else exportPick.add(w);
    syncExportSelRows(words);
  });
}

/* 选择完成 → 仅把实际勾选的词交给既有导出链路（PDF/PNG/Word、模板、
   文件生成全部复用现有实现） */
exportSelBtn.addEventListener("click", () => {
  if (!exportPick || !exportPick.size) { showToast("请先勾选要导出的生词"); return; }
  const { words } = exportSourceList();
  const picked = words.filter((w) => exportPick.has(w));
  closeExportSheet();
  exportWithPicked(picked);
});
$("#export-sheet-close").addEventListener("click", closeExportSheet);
exportSheetOverlay.addEventListener("click", closeExportSheet);

/* ---------- 初始化 ---------- */

renderGreeting();
loadRecords();
loadReview();
loadReviewDays(); // 连续 Review 天数记录（vc-review-days）
loadReviewRevlogs(); // 复习日志（四态统一 FSRS 自适应层训练数据源）
loadAdaptive(); // 个性化自适应参数
syncReviewWithWords(); // 生词本 = Review 唯一数据源：清除不在生词本的残留脏数据
migrateReview(); // 为生词本内无复习状态的词补建（按「首次加入日期」安排首次复习）
migrateLegacyIntervalsToFsrs(); // 旧算法遗留间隔 → FSRS 重算（旧用户升级后 nextAt 统一为 FSRS 结果）
loadPomo();
loadTasks(); // 待办任务 / 目标 / 奖励 / 打卡
renderAll();

applyTheme(localStorage.getItem("vc-theme") || "system", false);
initOverlay();
initNotify();

/* 启动闪屏：首页初始化完成 → 通知闪屏可按自然结束点关闭（见 js/splash.js，
   首页先就绪时闪屏播完即走、不人为延迟；闪屏未加载时此调用自动跳过） */
if (window.__vhSplash) window.__vhSplash.appReady();

/* 回到前台：检查跨天重置 + 重载记录（与后台悬浮查词互通）+ 悬浮查词授权结果 */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  /* 回前台防闪：先对关键字段做数据快照，仅当数据确实变化（后台悬浮查词写入、
     跨天重置等）才重渲染；数据未变时跳过整页重建，避免列表行入场动画重播
     造成的「组件闪现 + 回前台卡顿」。确需重渲染时走静默渲染（关闭行动画），
     页面停留在用户离开时的状态，不闪不跳。 */
  const resumeSig = () => JSON.stringify([records, reviewStore]);
  const sigBefore = resumeSig();
  loadRecords(); // 后台悬浮查词可能已写入新记录
  rolloverIfNeeded();
  // 悬浮查词期间生词本已变化（新增/删除）：与启动时同样的同步流程，
  // 否则悬浮条确认的生词要等下次重启才会进入 Review 队列
  syncReviewWithWords();
  migrateReview();
  if (resumeSig() !== sigBefore) renderAllQuiet();
  syncNotifyPermission(); // 通知提醒：权限/计划随回前台校正（含从系统通知设置页返回）
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

/* 预览注入态：打开 index.html?seed=w2m 自动注入测试数据并进入 Review（无需点击/跳转） */
(function previewSeed() {
  const sp = new URLSearchParams(location.search).get("seed");
  if (sp === "w2m" || sp === "full") {
    try {
      const now = Date.now();
      const vd = (t) => { const d = new Date(t - 4 * 3600 * 1000); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
      const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
      const WORDS = ["manufacturer", "manufacture", "temporary", "abandon", "circumstance", "deteriorate", "articulate", "abundant", "manuscript", "miniature"];
      const records = { day: vd(now), history: [], words: {} };
      const review = { words: {} };
      WORDS.forEach((w, i) => {
        const total = 3 + (i % 4);
        records.words[w] = { today: 1, total, first: vd(now - 7 * 86400000), last: now - 3600000, starred: true, starredAt: now - 7 * 86400000, firstQueriedAt: now - 7 * 86400000, deleted: false };
        review.words[w] = { known: 2, fuzzy: 1, unknown: 0, total, firstAt: now - 7 * 86400000, lastAt: now - 3600000, stage: 2, mode: "long", origStage: 0, nextAt: now - (WORDS.length - i) * 600000 };
      });
      const words = WORDS.slice();
      let tasks = [];
      if (sp === "w2m") { words.forEach((w) => tasks.push({ word: w, step: "w2m" })); tasks = shuffle(tasks); }
      else { words.forEach((w) => { tasks.push({ word: w, step: "recall" }); tasks.push({ word: w, step: "w2m" }); tasks.push({ word: w, step: "m2w" }); }); tasks = shuffle(tasks); }
      const session = {
        day: vd(now), phase: "meaning", queue: tasks, idx: 0, current: null, currentTask: null, lastResult: null, snapshot: null,
        stats: { n: 0, known: 0, fuzzy: 0, unknown: 0 }, answeredToday: {}, initialCount: words.length, mcqData: null,
        mcqStats: { w2mCorrect: 0, m2wCorrect: 0, w2mTotal: 0, m2wTotal: 0 }, completed: {}, wordResults: {}, wordsDone: {}, detailCtx: null,
        spellQueue: sp === "w2m" ? [] : shuffle(words), spellIdx: 0, spell: { submitted: false, correct: false, input: "" }, spellStats: { correct: 0, wrong: 0, skipped: 0 }
      };
      localStorage.setItem("vc-records", JSON.stringify(records));
      localStorage.setItem("vc-review", JSON.stringify(review));
      localStorage.setItem("vc-review-session-v2", JSON.stringify(session));
      openReview();
      return;
    } catch (e) { console.error("[preview-seed]", e); }
  } else if (sp === "fsrs") {
    // FSRS 迁移验证：注入 3 个首次复习（全新 FSRS 状态）的词，原子注入后直接构建队列进入 Review
    try {
      const now = Date.now();
      const DAY = 86400000;
      const vd = (t) => { const d = new Date(t - 4 * 3600 * 1000); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
      const SEED = [
        { w: "abandon",      fsrs: null, total: 0, known: 0, fuzzy: 0, unknown: 0, stage: 0, lastAt: 0, first: now - 1 * DAY },
        { w: "abundant",     fsrs: null, total: 0, known: 0, fuzzy: 0, unknown: 0, stage: 0, lastAt: 0, first: now - 1 * DAY },
        { w: "circumstance", fsrs: null, total: 0, known: 0, fuzzy: 0, unknown: 0, stage: 0, lastAt: 0, first: now - 1 * DAY },
      ];
      const records = { day: vd(now), history: [], words: {} };
      const review = { words: {} };
      SEED.forEach((x, i) => {
        records.words[x.w] = { today: 1, total: x.total, first: vd(x.first), last: x.lastAt, starred: true, starredAt: x.first, firstQueriedAt: x.first, deleted: false };
        review.words[x.w] = { known: x.known, fuzzy: x.fuzzy, unknown: x.unknown, total: x.total, firstAt: x.first, lastAt: x.lastAt, stage: x.stage, mode: "long", origStage: 0, fsrs: x.fsrs, nextAt: now - (3 - i) * 600000 };
      });
      localStorage.setItem("vc-records", JSON.stringify(records));
      localStorage.setItem("vc-review", JSON.stringify(review));
      localStorage.removeItem("vc-review-session-v2");
      localStorage.removeItem("vc-review-today");
      loadRecords(); loadReview(); // 重新载入内存态，供 openReview 构建队列
      openReview();
      return;
    } catch (e) { console.error("[preview-seed-fsrs]", e); }
  }
  if (localStorage.getItem("vc-auto-review") === "1") {
    localStorage.removeItem("vc-auto-review");
    openReview();
  }
})();
