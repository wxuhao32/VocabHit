/* ============================================================
   Spaced Repetition · 自适应间隔算法 · UI 层 v2
   ------------------------------------------------------------
   挂载到 window.VH_SR.ui。
   页面层级：设置 → 自适应间隔算法(sr) →
     ├─ 生词复习计划(sr-vocab)：只读展示现有 vc-review 队列
     │    （点击单词 → 复用既有 openSheet+renderSheetDetail 释义卡片）
     └─ 存储库(sr-repo) →
          ├─ 间隔设置(sr-intervals)：六档间隔自定义（默认与生词 Review 一致，两套算法独立）
          ├─ 库页(sr-lib)：已在队列 / 未在队列 同页 Segmented 切换（不跳页）
          │    ├─ 已在队列：点击条目 → 查看/修改考察方式(sr-exam)
          │    └─ 未在队列：圆圈批量选择 → 加入复习 → 逐条设置考察方式(sr-exam)
          ├─ 复习队列(sr-queue)：全部复习中条目总览
          └─ 知识复习(sr-review)：提问型 / 挖空型 / 旧数据兼容三分支
   考察方式（每条知识独立）：
     提问型：显示预设问题 → 回忆 → 记得/模糊/遗忘 → 显示预设答案
     挖空型：挖空原文（复用荧光笔「原生选区→偏移→切换」逻辑）→ 填写 → 判分
   间隔重复（什么时候考）与考察方式（怎么考）完全独立。
   隔离原则：
     - 生词数据只读 localStorage(vc-review/vc-records)，绝不写入
     - 存储库条目只读 vc-repo，绝不写入
     - 本模块自有数据全部走 VH_SR.data(vc-spaced-repetition)
   ============================================================ */
(function () {
  "use strict";
  window.VH_SR = window.VH_SR || {};
  var D = window.VH_SR.data;

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) { if (typeof showToast === "function") showToast(msg); }

  var BACK_SVG = '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>';
  var CHEV_SVG = '<svg class="icon icon-s" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';
  var SR_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8"/><path d="M16.8 10V4.4M16.8 10h-5.6"/></svg>';
  var DOC_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/></svg>';

  /* ================= 只读数据访问（绝不写入既有键） ================= */

  function readVC(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
  }

  var PRESET_CATS = { phrase: "短语", sentence: "句型", quote: "好句" };

  function repoRaw() { return readVC("vc-repo"); }
  function libs() { var r = repoRaw(); return (r && Array.isArray(r.libraries)) ? r.libraries : []; }
  function allEntries() { var r = repoRaw(); return (r && Array.isArray(r.entries)) ? r.entries : []; }
  function entriesOf(libId) { return allEntries().filter(function (e) { return e.libraryId === libId; }); }
  function entryById(id) {
    var es = allEntries();
    for (var i = 0; i < es.length; i++) if (es[i].id === id) return es[i];
    return null;
  }
  function catNameOf(libId, catId) {
    if (libId === "default" && PRESET_CATS[catId]) return PRESET_CATS[catId];
    var cs = repoRaw();
    cs = (cs && Array.isArray(cs.customCats)) ? cs.customCats : [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === catId) return cs[i].name;
    return "未分类";
  }
  function libNameOf(libId) {
    var ls = libs();
    for (var i = 0; i < ls.length; i++) if (ls[i].id === libId) return ls[i].name;
    return "未知库";
  }

  /** 生词复习计划：全部处于现有 Review 系统中的生词（只读 vc-review + vc-records） */
  function vocabPlan() {
    var rv = readVC("vc-review"), rec = readVC("vc-records");
    var out = [];
    if (rv && rv.words && rec && rec.words) {
      Object.keys(rv.words).forEach(function (w) {
        var r = rec.words[w];
        var st = rv.words[w];
        if (r && r.starred && st && st.nextAt > 0) out.push({ word: w, nextAt: st.nextAt, stage: st.stage });
      });
    }
    out.sort(function (a, b) { return a.nextAt - b.nextAt; });
    return out;
  }

  /* ---------- 业务日（04:00 边界，与现有系统一致；只读计算） ---------- */

  function dayStrOf(t) {
    var d = new Date(t - 4 * 3600 * 1000);
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function dayDiff(ts, now) {
    var a = dayStrOf(ts), b = dayStrOf(now || Date.now());
    return Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);
  }
  /** 复习时间文案：完全以现有/自有系统的 nextReviewAt 为准，不自行计算 */
  function timeLabel(nextAt, now) {
    now = now || Date.now();
    if (nextAt <= now) return { text: "今天需复习", due: true };
    var d = dayDiff(nextAt, now);
    if (d <= 0) return { text: "今天稍后", due: false }; // 同业务日但未到 04:00 检查点（罕见）
    if (d === 1) return { text: "明天复习", due: false };
    return { text: d + " 天后复习", due: false };
  }

  function briefOf(s, n) {
    var brief = String(s || "").replace(/\s+/g, " ");
    if (brief.length > n) brief = brief.slice(0, n) + "…";
    return brief;
  }

  /* ================= 出题规则（旧数据兜底：无考察方式的条目） ================= */

  /** 句型：≥4 字母英文词 → 首字母 + ____（隐藏关键结构） */
  function maskSentence(s) {
    return String(s).replace(/[A-Za-z][A-Za-z'-]{3,}/g, function (w) {
      return w.charAt(0) + "____";
    });
  }
  /** 搭配：保留首词，其余遮为 ＿＿＿（显示其中一部分，回忆完整搭配） */
  function maskCollocation(s) {
    var parts = String(s).trim().split(/\s+/);
    if (parts.length < 2) return "＿＿＿";
    return parts[0] + " ＿＿＿";
  }

  /** 按条目类型生成主动回忆题目（不改任何已有数据结构；仅用于未设置考察方式的旧条目） */
  function quizOf(entry, catName) {
    var cid = entry.catId;
    var name = catName || "";
    if (cid === "quote") {
      return { label: "好句", prompt: "请回忆这个英语句子", hint: entry.explanation || entry.context || "回想句子的完整表达" };
    }
    if (cid === "phrase") {
      return { label: "短语", prompt: "请回忆这个英语短语", hint: entry.explanation || "回想英文短语" };
    }
    if (cid === "sentence") {
      return { label: "句型", prompt: "请回忆完整句型", hint: maskSentence(entry.content) };
    }
    if (name.indexOf("搭配") !== -1) {
      return { label: name, prompt: "请回忆完整搭配", hint: maskCollocation(entry.content) };
    }
    return { label: name || "知识", prompt: "请回忆这条内容", hint: entry.explanation || entry.context || "回想完整内容" };
  }

  /* ================= DOM 注入 ================= */

  function injectShell() {
    // 设置页入口：插在「关于」分组之前（设置功能列表最底部；无图标，与其他设置项对齐）
    var about = document.querySelector("#page-settings .settings-group:last-of-type");
    if (about) {
      about.insertAdjacentHTML("beforebegin", `
        <section class="settings-group">
          <h2 class="settings-group-title">学习</h2>
          <div class="settings-list">
            <button class="settings-item clickable" id="sr-entry" type="button">
              <div class="settings-item-label">
                <span>自适应间隔算法</span>
                <span class="settings-item-value">管理生词与存储库的复习计划</span>
              </div>
              <svg class="icon chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
            </button>
          </div>
        </section>`);
    }

    document.getElementById("app").insertAdjacentHTML("beforeend", `
      <!-- 二级页：自适应间隔算法 -->
      <main class="page" id="page-sr">
        <header class="page-header">
          <button class="back-btn" id="sr-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">自适应间隔算法</h1>
        </header>
        <p class="page-subtitle">管理生词与存储库的复习计划</p>
        <div class="sr-hub-stack">
        <button class="review-entry" id="sr-vocab-entry" type="button">
          <span class="review-entry-icon">${DOC_SVG}</span>
          <span class="review-entry-main">
            <span class="review-entry-title">生词</span>
            <span class="review-entry-sub" id="sr-vocab-sub">当前有 0 个词正在复习</span>
          </span>
          ${CHEV_SVG}
        </button>
        <button class="review-entry" id="sr-repo-entry" type="button">
          <span class="review-entry-icon">${SR_SVG}</span>
          <span class="review-entry-main">
            <span class="review-entry-title">存储库</span>
            <span class="review-entry-sub" id="sr-repo-sub">当前有 0 条知识正在复习</span>
          </span>
          ${CHEV_SVG}
        </button>
        </div>
      </main>

      <!-- 三级页：生词复习计划（只读现有 Review 队列） -->
      <main class="page" id="page-sr-vocab">
        <header class="page-header">
          <button class="back-btn" id="sr-vocab-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">生词复习计划</h1>
        </header>
        <p class="page-subtitle" id="sr-vocab-subtitle">按现有复习算法排列 · 点击单词查看释义</p>
        <ul class="sr-vocab-list" id="sr-vocab-list"></ul>
        <div class="sr-empty" id="sr-vocab-empty" hidden>
          <p>暂无复习中的生词</p>
          <p class="sr-empty-sub">把单词加入生词本后，这里会显示复习计划</p>
        </div>
      </main>

      <!-- 三级页：存储库复习 -->
      <main class="page" id="page-sr-repo">
        <header class="page-header">
          <button class="back-btn" id="sr-repo-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">存储库复习</h1>
        </header>
        <p class="page-subtitle">与生词复习完全独立 · 知识条目按条独立间隔重复</p>
        <button class="primary-btn" id="sr-start-btn" type="button">开始复习</button>
        <div class="sr-row-list">
          <button class="sr-row" id="sr-intervals-entry" type="button">
            <div class="sr-row-main">
              <p class="sr-row-title">间隔设置</p>
              <p class="sr-row-sub" id="sr-intervals-sub">1·3·7·10·20·30 天</p>
            </div>
            ${CHEV_SVG}
          </button>
          <button class="sr-row" id="sr-queue-entry" type="button">
            <div class="sr-row-main">
              <p class="sr-row-title">复习队列</p>
              <p class="sr-row-sub" id="sr-queue-sub">0 条知识正在复习</p>
            </div>
            ${CHEV_SVG}
          </button>
        </div>
        <p class="sr-sec-title">选择知识加入间隔重复</p>
        <div class="sr-row-list" id="sr-lib-list"></div>
        <div class="sr-empty" id="sr-lib-empty" hidden>
          <p>还没有存储库</p>
          <p class="sr-empty-sub">去 Knowledge 摘取内容，即可在这里选择复习</p>
        </div>
      </main>

      <!-- 四级页：库页（已在队列 / 未在队列 同页 Segmented 切换） -->
      <main class="page" id="page-sr-lib">
        <header class="page-header">
          <button class="back-btn" id="sr-lib-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title" id="sr-lib-title">存储库</h1>
        </header>
        <div class="segmented wide sr-lib-seg" id="sr-lib-seg" role="radiogroup" aria-label="队列视图">
          <button class="seg-btn" data-lib-tab="inq" role="radio" aria-checked="false" type="button">已在队列</button>
          <button class="seg-btn" data-lib-tab="notq" role="radio" aria-checked="true" type="button">未在队列</button>
        </div>
        <p class="page-subtitle" id="sr-lib-subtitle"></p>

        <div id="sr-inq-view" hidden>
          <ul class="sr-inq-list" id="sr-inq-list"></ul>
          <div class="sr-empty" id="sr-inq-empty" hidden>
            <p>还没有条目加入间隔重复</p>
            <p class="sr-empty-sub">切换到「未在队列」选择知识条目加入</p>
          </div>
        </div>

        <div id="sr-notq-view">
          <button class="sr-select-all" id="sr-select-all" type="button">全选</button>
          <ul class="sr-pick-list" id="sr-pick-list"></ul>
          <div class="sr-empty" id="sr-notq-empty" hidden>
            <p>全部条目均已加入队列</p>
            <p class="sr-empty-sub">切换到「已在队列」即可看到它们</p>
          </div>
          <div class="sr-empty" id="sr-lib-empty2" hidden>
            <p>该库暂无知识条目</p>
            <p class="sr-empty-sub">去 Knowledge 摘取内容加入这个库</p>
          </div>
        </div>

        <div class="sr-pick-bar" id="sr-pick-bar" hidden>
          <span class="sr-pick-count" id="sr-pick-count">已选 0 条</span>
          <button class="sr-pick-add" id="sr-pick-add" type="button">加入复习</button>
        </div>
      </main>

      <!-- 四级页：间隔设置（存储库间隔重复规则，默认与生词 Review 一致） -->
      <main class="page" id="page-sr-intervals">
        <header class="page-header">
          <button class="back-btn" id="sr-intervals-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">间隔设置</h1>
        </header>
        <p class="page-subtitle">存储库间隔重复规则 · 默认与生词复习一致，可独立修改</p>
        <div class="sr-iv-list">
          <div class="sr-iv-row"><span class="sr-iv-label">第一次复习</span><span class="sr-iv-field"><input class="sr-iv-input" data-iv="0" type="number" min="1" max="365" step="1" inputmode="numeric" autocomplete="off" aria-label="第一次复习间隔天数"><span class="sr-iv-unit">天后</span></span></div>
          <div class="sr-iv-row"><span class="sr-iv-label">第二次复习</span><span class="sr-iv-field"><input class="sr-iv-input" data-iv="1" type="number" min="1" max="365" step="1" inputmode="numeric" autocomplete="off" aria-label="第二次复习间隔天数"><span class="sr-iv-unit">天后</span></span></div>
          <div class="sr-iv-row"><span class="sr-iv-label">第三次复习</span><span class="sr-iv-field"><input class="sr-iv-input" data-iv="2" type="number" min="1" max="365" step="1" inputmode="numeric" autocomplete="off" aria-label="第三次复习间隔天数"><span class="sr-iv-unit">天后</span></span></div>
          <div class="sr-iv-row"><span class="sr-iv-label">第四次复习</span><span class="sr-iv-field"><input class="sr-iv-input" data-iv="3" type="number" min="1" max="365" step="1" inputmode="numeric" autocomplete="off" aria-label="第四次复习间隔天数"><span class="sr-iv-unit">天后</span></span></div>
          <div class="sr-iv-row"><span class="sr-iv-label">第五次复习</span><span class="sr-iv-field"><input class="sr-iv-input" data-iv="4" type="number" min="1" max="365" step="1" inputmode="numeric" autocomplete="off" aria-label="第五次复习间隔天数"><span class="sr-iv-unit">天后</span></span></div>
          <div class="sr-iv-row"><span class="sr-iv-label">第六次及以上</span><span class="sr-iv-field"><input class="sr-iv-input" data-iv="5" type="number" min="1" max="365" step="1" inputmode="numeric" autocomplete="off" aria-label="第六次及以上间隔天数"><span class="sr-iv-unit">天后</span></span></div>
        </div>
        <p class="sr-exam-tip sr-iv-tip">「记得」推进一档 ·「模糊」当前档减半（最少 1 天）·「遗忘」次日复习。修改仅影响后续排期，生词复习不受影响。</p>
        <div class="sr-iv-foot">
          <button class="sr-iv-reset" id="sr-intervals-reset" type="button">恢复默认</button>
          <button class="sr-iv-save" id="sr-intervals-save" type="button">保存</button>
        </div>
      </main>

      <!-- 四级页：考察方式配置（批量加入逐步设置 / 已在队列单条修改） -->
      <main class="page" id="page-sr-exam">
        <header class="page-header">
          <button class="back-btn" id="sr-exam-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">设置考察方式</h1>
          <span class="sr-exam-step" id="sr-exam-step"></span>
        </header>
        <div class="sr-exam-card">
          <p class="sr-rv-tag" id="sr-exam-cat"></p>
          <p class="sr-exam-preview" id="sr-exam-preview"></p>
          <div class="sr-exam-extra" id="sr-exam-extra" hidden></div>
        </div>
        <div class="sr-exam-types">
          <button class="sr-exam-type on" data-etype="question" type="button">提问型</button>
          <button class="sr-exam-type" data-etype="cloze" type="button">挖空型</button>
        </div>
        <div id="sr-exam-q">
          <p class="sr-field-label">预设问题</p>
          <input class="sr-input" id="sr-exam-question" type="text" maxlength="120" autocomplete="off" placeholder="如：这个句子的核心结构是什么？">
          <p class="sr-field-label">正确答案</p>
          <textarea class="sr-textarea" id="sr-exam-answer" rows="3" placeholder="复习时先回忆，判断后显示这里的内容"></textarea>
          <p class="sr-exam-tip">复习流程：显示问题 → 自行回忆 → 选择「记得 / 模糊 / 遗忘」→ 显示正确答案</p>
        </div>
        <div id="sr-exam-c" hidden>
          <p class="sr-exam-tip sr-exam-tip-top">在下面原文中长按 / 拖选要隐藏的部分（可设置多处），复习时变为填空</p>
          <div class="sr-exam-src" id="sr-exam-src"></div>
          <div class="sr-exam-blanks" id="sr-exam-blanks"></div>
        </div>
        <div class="sr-exam-foot">
          <button class="sr-exam-cancel" id="sr-exam-cancel" type="button">取消</button>
          <button class="sr-exam-prev" id="sr-exam-prev" type="button" hidden>上一条</button>
          <button class="sr-exam-next" id="sr-exam-next" type="button">下一条</button>
        </div>
      </main>

      <!-- 四级页：复习队列总览 -->
      <main class="page" id="page-sr-queue">
        <header class="page-header">
          <button class="back-btn" id="sr-queue-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">复习队列</h1>
        </header>
        <p class="page-subtitle" id="sr-queue-subtitle">0 条知识正在复习 · 0 条今天到期</p>
        <ul class="sr-queue-list" id="sr-queue-list"></ul>
        <div class="sr-empty" id="sr-queue-empty" hidden>
          <p>队列为空</p>
          <p class="sr-empty-sub">进入某个存储库，选择知识条目加入复习</p>
        </div>
      </main>

      <!-- 四级页：知识复习（提问型 / 挖空型 / 旧数据兼容） -->
      <main class="page" id="page-sr-review">
        <div class="sr-rv" id="sr-rv-body"></div>
      </main>`);
  }

  /* ================= 二级页：自适应间隔算法 ================= */

  function renderHub() {
    var n = vocabPlan().length;
    $("#sr-vocab-sub").textContent = "当前有 " + n + " 个词正在复习";
    var c = D.counts();
    $("#sr-repo-sub").textContent = "当前有 " + c.active + " 条知识正在复习";
  }

  function openHub() {
    renderHub();
    switchTab("sr");
  }

  /* ================= 生词复习计划（只读） ================= */

  function renderVocab() {
    var list = vocabPlan();
    var due = 0;
    var html = list.map(function (v, i) {
      var lb = timeLabel(v.nextAt);
      if (lb.due) due++;
      // 属性名必须用 data-sr-word：app.js 有全局 [data-word] 点击监听（记一次查询
      // commitQuery），若复用 data-word 会污染查询统计与今日生词数据
      return '<li class="sr-vocab-row' + (lb.due ? " due" : "") + '" data-sr-word="' + esc(v.word) + '" style="animation-delay:' + Math.min(i, 20) * 25 + 'ms">' +
        '<span class="sr-vocab-word">' + esc(v.word) + "</span>" +
        '<span class="sr-vocab-time' + (lb.due ? " due" : "") + '">' + esc(lb.text) + "</span>" +
        "</li>";
    }).join("");
    $("#sr-vocab-list").innerHTML = html;
    $("#sr-vocab-empty").hidden = list.length > 0;
    $("#sr-vocab-subtitle").textContent = "共 " + list.length + " 个词 · " + due + " 个今天需复习 · 点击查看释义";
  }

  function openVocab() {
    renderVocab();
    switchTab("sr-vocab");
  }

  /** 复用既有单词释义卡片（openSheet + renderSheetDetail，不记查询次数） */
  function openWordCard(word) {
    if (typeof openSheet === "function" && typeof renderSheetDetail === "function") {
      openSheet({ focus: false, hint: false });
      renderSheetDetail(word);
    }
  }

  /* ================= 存储库复习主页 ================= */

  function renderRepo() {
    D.loadAll();
    var c = D.counts();
    $("#sr-intervals-sub").textContent = D.intervals().join("·") + " 天";
    var startBtn = $("#sr-start-btn");
    if (c.due > 0) {
      startBtn.textContent = "开始复习 · " + c.due + " 条到期";
      startBtn.disabled = false;
    } else {
      startBtn.textContent = c.active > 0 ? "暂无到期知识" : "还没有复习中的知识";
      startBtn.disabled = true;
    }
    $("#sr-queue-sub").textContent = c.active + " 条知识正在复习" + (c.due > 0 ? " · " + c.due + " 条今天到期" : "");

    var ls = libs();
    $("#sr-lib-empty").hidden = ls.length > 0;
    $("#sr-lib-list").innerHTML = ls.map(function (l) {
      var total = entriesOf(l.id).length;
      var n = D.statesOfLibrary(l.id).length;
      return '<button class="sr-row" data-sr-lib="' + esc(l.id) + '" type="button">' +
        '<div class="sr-row-main">' +
        '<p class="sr-row-title">' + esc(l.name) + (n > 0 ? ' <span class="sr-badge">' + n + " 条复习中</span>" : "") + "</p>" +
        '<p class="sr-row-sub">共 ' + total + " 条知识" + (total > 0 && n < total ? " · " + (total - n) + " 条未加入" : "") + "</p>" +
        "</div>" + CHEV_SVG + "</button>";
    }).join("");
  }

  function openRepo() {
    renderRepo();
    switchTab("sr-repo");
  }

  /* ================= 库页：已在队列 / 未在队列（同页 Segmented 切换） ================= */

  var pickCtx = { libId: "", tab: "notq", selected: {} };

  function renderLibPage() {
    D.loadAll();
    var libId = pickCtx.libId;
    var lib = libs().find(function (l) { return l.id === libId; });
    $("#sr-lib-title").textContent = lib ? lib.name : "存储库";

    var entries = entriesOf(libId);
    var inQ = [], notQ = [];
    entries.forEach(function (e) {
      var st = D.stateOf(e.id);
      if (st && st.reviewEnabled) inQ.push({ e: e, st: st });
      else notQ.push(e);
    });
    inQ.sort(function (a, b) { return a.st.nextReviewAt - b.st.nextReviewAt; });

    /* ---- Segmented 切换状态与视图显隐（同页切换，不跳页） ---- */
    var tab = pickCtx.tab === "inq" ? "inq" : "notq";
    var segBtns = document.querySelectorAll("#sr-lib-seg .seg-btn");
    for (var si = 0; si < segBtns.length; si++) {
      segBtns[si].setAttribute("aria-checked", segBtns[si].getAttribute("data-lib-tab") === tab ? "true" : "false");
    }
    $("#sr-inq-view").hidden = tab !== "inq";
    $("#sr-notq-view").hidden = tab !== "notq";
    $("#sr-lib-subtitle").textContent = tab === "inq"
      ? inQ.length + " 条正在间隔重复 · 点击条目查看/修改考察方式"
      : notQ.length + " 条未加入 · 勾选后点击「加入复习」";

    if (tab === "inq") {
      /* 已在队列：内容 + 考察方式 + 阶段 + 下次复习时间；点击改考察方式 */
      $("#sr-inq-empty").hidden = inQ.length > 0;
      $("#sr-inq-list").innerHTML = inQ.map(function (x, i) {
        var lb = timeLabel(x.st.nextReviewAt);
        return '<li class="sr-inq-row' + (lb.due ? " due" : "") + '" data-inq="' + esc(x.e.id) + '" style="animation-delay:' + Math.min(i, 20) * 20 + 'ms">' +
          '<div class="sr-inq-main">' +
          '<p class="sr-inq-content">' + esc(briefOf(x.e.content, 48)) + "</p>" +
          '<p class="sr-inq-meta"><span class="sr-badge">' + esc(D.examTypeLabel(x.st.examType)) + "</span>" +
          "<span>" + esc(D.stageLabel(x.st)) + "</span><span>已复习 " + x.st.reviewCount + " 次</span></p>" +
          "</div>" +
          '<div class="sr-inq-side"><span class="sr-vocab-time' + (lb.due ? " due" : "") + '">' + esc(lb.text) + "</span></div>" +
          "</li>";
      }).join("");
    } else {
      /* 未在队列：圆圈批量选择 → 加入复习（已在队列条目绝不出现于此） */
      $("#sr-lib-empty2").hidden = entries.length > 0;
      $("#sr-notq-empty").hidden = !(entries.length > 0 && notQ.length === 0);
      $("#sr-select-all").hidden = notQ.length === 0;
      var nSel = Object.keys(pickCtx.selected).filter(function (id) { return pickCtx.selected[id]; }).length;
      $("#sr-select-all").textContent = notQ.length && nSel === notQ.length ? "取消全选" : "全选";

      $("#sr-pick-list").innerHTML = notQ.map(function (e, i) {
        var st = D.stateOf(e.id);
        var on = !!pickCtx.selected[e.id];
        var catName = catNameOf(libId, e.catId);
        var meta = catName + (st ? " · 已掌握，可重新加入" : "");
        return '<li class="sr-pick-row' + (on ? " on" : "") + '" data-pick="' + esc(e.id) + '" style="animation-delay:' + Math.min(i, 20) * 20 + 'ms">' +
          '<button class="task-check' + (on ? " checked" : "") + '" data-check="' + esc(e.id) + '" type="button" aria-label="选择">' + (on ? "✓" : "") + "</button>" +
          '<div class="sr-pick-main">' +
          '<p class="sr-pick-content">' + esc(briefOf(e.content, 60)) + "</p>" +
          '<p class="sr-pick-meta">' + esc(meta) + "</p>" +
          "</div></li>";
      }).join("");
    }

    /* 底部操作浮条：仅「未在队列」且有选中时出现 */
    var nSel2 = Object.keys(pickCtx.selected).filter(function (id) { return pickCtx.selected[id]; }).length;
    var bar = $("#sr-pick-bar");
    bar.hidden = !(tab === "notq" && nSel2 > 0);
    $("#sr-pick-count").textContent = "已选 " + nSel2 + " 条";
  }

  function openLib(libId, tab) {
    pickCtx.libId = libId;
    pickCtx.selected = {};
    if (tab) {
      pickCtx.tab = tab;
    } else {
      /* 自适应落点：库里已有复习中条目 → 「已在队列」；否则 → 「未在队列」 */
      var hasQ = entriesOf(libId).some(function (e) {
        var st = D.stateOf(e.id);
        return st && st.reviewEnabled;
      });
      pickCtx.tab = hasQ ? "inq" : "notq";
    }
    renderLibPage();
    switchTab("sr-lib");
  }

  /* ---- 勾选局部更新：绝不重建列表 ----
     根因修复：此前 togglePick/toggleSelectAll 走 renderLibPage() 整体重建
     #sr-pick-list 的 innerHTML，且每行 .sr-pick-row 带 srRowIn 入场动画
     （animation-fill-mode:both，from 态 opacity:0），重建后全部行重播动画
     → 整屏闪白 + 滚动位置丢失。现改为只改对应行的勾选态与浮条计数，
     DOM 节点不换、动画不重播、滚动与其他条目状态原样保留。 */
  function pickRowOf(id) {
    var rows = document.querySelectorAll("#sr-pick-list li[data-pick]");
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("data-pick") === id) return rows[i];
    }
    return null;
  }

  function setRowCheck(row, on) {
    if (!row) return;
    row.classList.toggle("on", on);
    var chk = row.querySelector(".task-check");
    if (chk) {
      chk.classList.toggle("checked", on);
      chk.textContent = on ? "✓" : "";
    }
  }

  function pickCount() {
    return Object.keys(pickCtx.selected).filter(function (id) { return pickCtx.selected[id]; }).length;
  }

  function notQEntries() {
    return entriesOf(pickCtx.libId).filter(function (e) {
      var st = D.stateOf(e.id);
      return !(st && st.reviewEnabled);
    });
  }

  /** 局部刷新：浮条显隐 + 已选计数 + 全选按钮文案（不触碰列表 DOM） */
  function refreshPickBar() {
    var notQ = notQEntries();
    var nSel = pickCount();
    var bar = $("#sr-pick-bar");
    if (bar) bar.hidden = !(pickCtx.tab === "notq" && nSel > 0);
    var cnt = $("#sr-pick-count");
    if (cnt) cnt.textContent = "已选 " + nSel + " 条";
    var allBtn = $("#sr-select-all");
    if (allBtn) allBtn.textContent = notQ.length && nSel === notQ.length ? "取消全选" : "全选";
  }

  function togglePick(id) {
    pickCtx.selected[id] = !pickCtx.selected[id];
    setRowCheck(pickRowOf(id), !!pickCtx.selected[id]);
    refreshPickBar();
  }

  function toggleSelectAll() {
    var notQ = notQEntries();
    var all = notQ.length > 0 && pickCount() === notQ.length;
    pickCtx.selected = {};
    if (!all) notQ.forEach(function (e) { pickCtx.selected[e.id] = true; });
    notQ.forEach(function (e) { setRowCheck(pickRowOf(e.id), !!pickCtx.selected[e.id]); });
    refreshPickBar();
  }

  /* ================= 考察方式配置页 ================= */

  /* examCtx：
     批量（未在队列 → 加入复习）：{ mode:"batch", libId, ids:[], idx, drafts:{ id:{type,q,a,blanks,ok} } }
     单条（已在队列 → 修改）：  { mode:"edit", libId, id, draft:{type,q,a,blanks} } */
  var examCtx = null;

  function draftFor(ctx, id, entry) {
    if (!ctx.drafts) ctx.drafts = {};
    if (!ctx.drafts[id]) {
      // 答案默认预填条目原文（提问型开箱即用，用户可改）
      ctx.drafts[id] = { type: "question", q: "", a: entry ? String(entry.content || "") : "", blanks: [], ok: null };
    }
    return ctx.drafts[id];
  }

  function currentExamId() {
    if (!examCtx) return null;
    return examCtx.mode === "batch" ? examCtx.ids[examCtx.idx] : examCtx.id;
  }

  function currentExamDraft() {
    if (!examCtx) return null;
    var id = currentExamId();
    if (!id) return null;
    if (examCtx.mode === "batch") return draftFor(examCtx, id, entryById(id));
    return examCtx.draft;
  }

  /** 把当前输入框内容捕获进草稿（切换类型/翻页/保存前调用） */
  function captureDraftInputs(draft) {
    if (!draft) return;
    var q = $("#sr-exam-question"), a = $("#sr-exam-answer");
    if (q) draft.q = q.value;
    if (a) draft.a = a.value;
  }

  function renderExamPage() {
    if (!examCtx) return;
    var id = currentExamId();
    var e = entryById(id);
    if (!e) { examCancel(); return; }
    var draft = currentExamDraft();

    $("#sr-exam-step").textContent = examCtx.mode === "batch" ? (examCtx.idx + 1) + " / " + examCtx.ids.length : "";
    $("#sr-exam-cat").textContent = catNameOf(e.libraryId, e.catId);
    $("#sr-exam-preview").textContent = e.content || "";
    /* 完整展示既有知识数据（直接读取 Repository 原始条目，不重建精简数据）：
       原文 + 中文解释 + 上下文，设置问题/挖空时均有完整上下文可依据 */
    var extra = "";
    if (e.explanation) {
      extra += '<p class="sr-exam-x-label">中文解释</p>' +
        '<p class="sr-rv-explain">' + esc(e.explanation) + "</p>";
    }
    if (e.context) {
      extra += '<p class="sr-exam-x-label">上下文</p>' +
        '<blockquote class="sr-rv-context">' + esc(e.context) + "</blockquote>";
    }
    var extraBox = $("#sr-exam-extra");
    extraBox.hidden = !extra;
    extraBox.innerHTML = extra;
    $("#sr-exam-question").value = draft.q;
    $("#sr-exam-answer").value = draft.a;

    var src = $("#sr-exam-src");
    src.textContent = e.content || "";
    renderBlankChips();

    var typeBtns = document.querySelectorAll(".sr-exam-type");
    for (var ti = 0; ti < typeBtns.length; ti++) {
      typeBtns[ti].classList.toggle("on", typeBtns[ti].getAttribute("data-etype") === draft.type);
    }
    $("#sr-exam-q").hidden = draft.type !== "question";
    $("#sr-exam-c").hidden = draft.type !== "cloze";

    $("#sr-exam-prev").hidden = !(examCtx.mode === "batch" && examCtx.idx > 0);
    $("#sr-exam-next").textContent = examCtx.mode === "batch"
      ? (examCtx.idx === examCtx.ids.length - 1 ? "完成" : "下一条")
      : "保存";
  }

  /** 已设挖空 chips（点 × 移除）；同时更新顶部预览的挖空效果 */
  function renderBlankChips() {
    if (!examCtx) return;
    var id = currentExamId();
    var e = entryById(id);
    var draft = currentExamDraft();
    if (!e || !draft) return;
    var content = String(e.content || "");
    var blanks = D.validBlanks(content, draft.blanks);

    var box = $("#sr-exam-blanks");
    if (!blanks.length) {
      box.innerHTML = '<p class="sr-exam-blank-empty">尚未设置挖空 · 请在上方原文中选择</p>';
    } else {
      box.innerHTML = blanks.map(function (b, i) {
        return '<span class="sr-blank-chip"><i>空' + (i + 1) + "</i>" + esc(content.slice(b.start, b.end)) +
          '<button data-blank-del="' + i + '" type="button" aria-label="移除">×</button></span>';
      }).join("");
    }

    // 顶部预览：挖空部分显示为 ＿＿＿（直观所见即所得）
    var prev = $("#sr-exam-preview");
    if (!blanks.length) { prev.textContent = content; return; }
    var parts = [], pos = 0;
    blanks.forEach(function (b) {
      parts.push(esc(content.slice(pos, b.start)));
      parts.push("＿＿＿");
      pos = b.end;
    });
    parts.push(esc(content.slice(pos)));
    prev.innerHTML = parts.join("");
  }

  /** 未在队列批量选择 → 加入复习：逐条设置考察方式 */
  function openExamBatch() {
    var ids = Object.keys(pickCtx.selected).filter(function (id) { return pickCtx.selected[id]; });
    if (!ids.length) { toast("请先选择知识条目"); return; }
    examCtx = { mode: "batch", libId: pickCtx.libId, ids: ids, idx: 0, drafts: {}, fromTab: "notq" };
    renderExamPage();
    switchTab("sr-exam");
  }

  /** 已在队列条目 → 查看/修改考察方式（不动复习进度） */
  function openExamEdit(entryId) {
    var st = D.stateOf(entryId);
    if (!st || !st.reviewEnabled) return;
    var e = entryById(entryId);
    var draft = { type: st.examType || "question", q: "", a: "", blanks: [] };
    if (st.examType === "question" && st.examConfig) {
      draft.q = st.examConfig.question || "";
      draft.a = st.examConfig.answer || "";
    } else if (st.examType === "cloze" && st.examConfig) {
      draft.blanks = (st.examConfig.blanks || []).slice();
    }
    if (!draft.a) draft.a = e ? String(e.content || "") : "";
    examCtx = { mode: "edit", libId: st.repositoryId, id: entryId, draft: draft, fromTab: "inq" };
    renderExamPage();
    switchTab("sr-exam");
  }

  function examCancel() {
    var libId = examCtx ? examCtx.libId : pickCtx.libId;
    var tab = examCtx && examCtx.fromTab === "inq" ? "inq" : "notq";
    examCtx = null;
    if (libId && entriesOf(libId).length) openLib(libId, tab);
    else openRepo();
  }

  /** 校验当前草稿（通过则记入 draft.ok，返回 true） */
  function validateCurrentDraft() {
    var id = currentExamId();
    var e = entryById(id);
    var draft = currentExamDraft();
    if (!e || !draft) return false;
    captureDraftInputs(draft);
    var cfg = draft.type === "question"
      ? { question: draft.q, answer: draft.a }
      : { blanks: draft.blanks };
    var ex = D.validExam(draft.type, cfg, e.content);
    if (!ex.ok) { toast(ex.error); return false; }
    draft.ok = { type: draft.type, config: ex.config };
    return true;
  }

  function examNext() {
    if (!examCtx) return;
    if (!validateCurrentDraft()) return;
    if (examCtx.mode === "batch") {
      if (examCtx.idx < examCtx.ids.length - 1) {
        examCtx.idx++;
        renderExamPage();
        window.scrollTo({ top: 0 });
      } else {
        finishExamBatch();
      }
    } else {
      var id = examCtx.id;
      var e = entryById(id);
      var d = examCtx.draft;
      var r = D.setExamConfig(id, d.ok.type, d.ok.config, e ? e.content : "");
      if (r.error) { toast(r.error); return; }
      toast("考察方式已更新 · 复习进度不变");
      var libId = examCtx.libId;
      examCtx = null;
      openLib(libId, "inq");
    }
  }

  function finishExamBatch() {
    var ctx = examCtx;
    var entries = ctx.ids.map(function (id) {
      var e = entryById(id);
      var d = ctx.drafts[id];
      if (!e || !d || !d.ok) return null;
      return { id: id, content: e.content, examType: d.ok.type, examConfig: d.ok.config };
    }).filter(Boolean);
    var r = D.addToReview(entries, ctx.libId);
    pickCtx.selected = {};
    var libId = ctx.libId;
    examCtx = null;
    openLib(libId, "inq"); // 加入后切到「已在队列」，立即看到新加入的条目
    var parts = [];
    if (r.added) parts.push("新增 " + r.added + " 条");
    if (r.reactivated) parts.push(r.reactivated + " 条重新进入");
    if (r.skipped) parts.push(r.skipped + " 条已在队列");
    toast((parts.join(" · ") || "已加入") + " · 间隔重复按各自加入时间独立安排");
  }

  /* ---------- 挖空选区（复用荧光笔「原生选区 → 偏移 → 切换」逻辑） ---------- */

  /** 选区端点相对 root 文本的字符偏移 */
  function offsetIn(root, node, off) {
    try {
      var r = document.createRange();
      r.selectNodeContents(root);
      r.setEnd(node, off);
      return r.toString().length;
    } catch (e) { return -1; }
  }

  var examSelTimer = null;
  /** 文本选择结束 → 与已有挖空重叠则移除（取消），否则新增（同 toggleHighlight 语义） */
  function onExamSelectEnd() {
    clearTimeout(examSelTimer);
    examSelTimer = setTimeout(function () {
      if (!examCtx || activePageId() !== "page-sr-exam") return;
      var src = $("#sr-exam-src");
      var draft = currentExamDraft();
      if (!src || !draft) return;
      var sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      var range = sel.getRangeAt(0);
      var node = range.startContainer;
      var el = node.nodeType === 3 ? node.parentElement : node;
      if (!el || !el.closest || el.closest("#sr-exam-src") !== src) return;
      var start = offsetIn(src, range.startContainer, range.startOffset);
      var end = offsetIn(src, range.endContainer, range.endOffset);
      if (start < 0 || end < 0 || end <= start) return;
      // 收窄两端空白（对齐荧光笔偏移语义）
      var text = src.textContent;
      while (start < end && /\s/.test(text.charAt(start))) start++;
      while (end > start && /\s/.test(text.charAt(end - 1))) end--;
      if (end <= start) return;
      // 与已有挖空重叠 → 移除重叠项；否则新增
      var kept = [], removed = false;
      draft.blanks.forEach(function (b) {
        if (b.start < end && start < b.end) removed = true;
        else kept.push(b);
      });
      if (!removed) kept.push({ start: start, end: end });
      kept.sort(function (a, b) { return a.start - b.start; });
      draft.blanks = kept;
      try { sel.removeAllRanges(); } catch (err) { /* 部分内核受限 */ }
      renderBlankChips();
    }, 150);
  }

  /* ================= 间隔设置（存储库间隔重复规则，默认与生词 Review 一致） ================= */

  function renderIntervalsPage() {
    var iv = D.intervals();
    var inputs = document.querySelectorAll(".sr-iv-input");
    for (var i = 0; i < inputs.length; i++) inputs[i].value = iv[i];
  }

  function openIntervals() {
    renderIntervalsPage();
    switchTab("sr-intervals");
  }

  function saveIntervals() {
    var inputs = document.querySelectorAll(".sr-iv-input");
    var arr = [];
    for (var i = 0; i < inputs.length; i++) arr.push(inputs[i].value);
    var r = D.setIntervals(arr);
    if (r.error) { toast(r.error); return; }
    toast("间隔设置已保存 · 后续复习按新规则排期");
    openRepo();
  }

  function resetIntervalsUI() {
    D.resetIntervals();
    renderIntervalsPage();
    toast("已恢复默认间隔（与生词复习一致）");
  }

  /* ================= 复习队列总览 ================= */

  function renderQueue() {
    D.loadAll();
    var c = D.counts();
    $("#sr-queue-subtitle").textContent = c.active + " 条知识正在复习 · " + c.due + " 条今天到期";
    var list = D.queueStates();
    $("#sr-queue-empty").hidden = list.length > 0;
    $("#sr-queue-list").innerHTML = list.map(function (st) {
      var e = entryById(st.id);
      if (!e) {
        // 条目已被删除：状态清理（隔离命名空间内自愈，不动 vc-repo）
        D.removeFromReview(st.id);
        return "";
      }
      var lb = timeLabel(st.nextReviewAt);
      return '<li class="sr-queue-row' + (lb.due ? " due" : "") + '">' +
        '<div class="sr-row-main">' +
        '<p class="sr-row-title">' + esc(briefOf(e.content, 50)) + "</p>" +
        '<p class="sr-row-sub">' + esc(D.examTypeLabel(st.examType)) + " · " + esc(libNameOf(st.repositoryId)) + " · " + esc(D.stageLabel(st)) + " · 已复习 " + st.reviewCount + " 次</p>" +
        "</div>" +
        '<div class="sr-queue-side">' +
        '<span class="sr-vocab-time' + (lb.due ? " due" : "") + '">' + esc(lb.text) + "</span>" +
        '<button class="sr-mini-btn sr-mini-danger" data-queue-remove="' + esc(st.id) + '" type="button">移出</button>' +
        "</div></li>";
    }).join("");
  }

  function openQueue() {
    renderQueue();
    switchTab("sr-queue");
  }

  /* ================= 知识复习（提问型 / 挖空型 / 旧数据兼容） ================= */

  /* rvSession：{ queue, idx, stats:{known,fuzzy,forgot,mastered},
                  phase("ask"|"reveal"|"fill"|"result"), lastResult,
                  userAnswers, clozeResults } */
  var rvSession = null;

  function startReview() {
    var due = D.dueStates();
    if (!due.length) { toast("暂无到期知识"); return; }
    if (window.VH_STATS && typeof window.VH_STATS.touch === "function") {
      try { window.VH_STATS.touch(); } catch (e) {} // 学习统计：会话开始，重置有效时长计时
    }
    rvSession = { queue: due, idx: 0, phase: "ask", stats: { known: 0, fuzzy: 0, forgot: 0, mastered: 0 } };
    switchTab("sr-review");
    renderReviewCard();
  }

  function rvHeadHtml() {
    var total = rvSession.queue.length;
    var i = rvSession.idx + 1;
    return '<header class="sr-rv-head">' +
      '<button class="sr-rv-exit" id="sr-rv-exit" type="button" aria-label="退出复习">' + BACK_SVG + "</button>" +
      '<span class="sr-rv-progress">' + i + " / " + total + "</span>" +
      '<span class="sr-rv-progressbar"><i style="width:' + ((i - 1) / total * 100) + '%"></i></span>' +
      "</header>";
  }

  function entryExtraHtml(entry) {
    var html = "";
    if (entry.explanation) html += '<p class="sr-rv-explain">' + esc(entry.explanation) + "</p>";
    if (entry.context) html += '<blockquote class="sr-rv-context">' + esc(entry.context) + "</blockquote>";
    return html;
  }

  var RESULT_LABEL = { known: "记得", fuzzy: "模糊", forgot: "遗忘" };

  function renderReviewCard() {
    var body = $("#sr-rv-body");
    if (!rvSession) { renderReviewDone(); return; }

    // 跳过已被删除的条目（自愈：移出状态）
    while (rvSession.idx < rvSession.queue.length) {
      var st = rvSession.queue[rvSession.idx];
      if (st.reviewEnabled && entryById(st.id)) break;
      if (st.reviewEnabled && !entryById(st.id)) D.removeFromReview(st.id);
      rvSession.idx++;
    }
    if (rvSession.idx >= rvSession.queue.length) { renderReviewDone(); return; }

    var state = rvSession.queue[rvSession.idx];
    var entry = entryById(state.id);
    var blanks = state.examType === "cloze"
      ? D.validBlanks(entry.content, state.examConfig && state.examConfig.blanks)
      : [];

    if (state.examType === "question" && state.examConfig) renderQuestionCard(state, entry);
    else if (state.examType === "cloze" && blanks.length) renderClozeCard(state, entry, blanks);
    else renderLegacyCard(state, entry); // 旧数据兜底（未设置考察方式）
  }

  /* ---- 提问型：显示问题 → 回忆 → 记得/模糊/遗忘 → 显示预设答案 → 下一条 ---- */
  function renderQuestionCard(state, entry) {
    var cfg = state.examConfig;
    var asking = rvSession.phase === "ask";
    var body = $("#sr-rv-body");
    var reveal = "";
    if (!asking) {
      reveal = '<div class="sr-rv-answer">' +
        '<p class="sr-rv-answer-label">正确答案</p>' +
        '<p class="sr-rv-content">' + esc(cfg.answer) + "</p>" +
        (String(cfg.answer).trim() !== String(entry.content || "").trim()
          ? '<p class="sr-rv-src">原文：' + esc(entry.content) + "</p>" : "") +
        entryExtraHtml(entry) +
        '<p class="sr-rv-judged">你的判断：' + RESULT_LABEL[rvSession.lastResult] + "</p>" +
        "</div>";
    }
    body.innerHTML = rvHeadHtml() +
      '<div class="sr-rv-card">' +
      '<p class="sr-rv-tag">提问型 · ' + esc(libNameOf(state.repositoryId)) + "</p>" +
      '<p class="sr-rv-prompt">' + esc(cfg.question) + "</p>" +
      (asking ? '<p class="sr-rv-hint">先在脑中回忆答案，再选择你的记忆程度</p>' : reveal) +
      "</div>" +
      (asking
        ? '<div class="sr-rv-actions">' +
          '<button class="sr-rv-btn sr-rv-known" data-ans="known" type="button">记得</button>' +
          '<button class="sr-rv-btn sr-rv-fuzzy" data-ans="fuzzy" type="button">模糊</button>' +
          '<button class="sr-rv-btn sr-rv-forgot" data-ans="forgot" type="button">遗忘</button>' +
          '<button class="sr-rv-mastered" id="sr-rv-mastered" type="button">已经很熟 · 已掌握</button>' +
          "</div>"
        : '<div class="sr-rv-actions"><button class="sr-rv-next" id="sr-rv-next" type="button">下一条</button></div>');
  }

  /* ---- 挖空型：挖空原文 → 填写 → 系统判分 → 显示正确答案 → 下一条 ---- */
  function renderClozeCard(state, entry, blanks) {
    var filling = rvSession.phase === "fill";
    var content = String(entry.content || "");
    var parts = [], pos = 0;
    blanks.forEach(function (b, i) {
      parts.push(esc(content.slice(pos, b.start)));
      if (filling) {
        var w = Math.min(18, Math.max(4, b.end - b.start + 2));
        parts.push('<input class="sr-cloze-input" data-blank="' + i + '" style="width:' + w + 'ch" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">');
      } else {
        var ua = rvSession.userAnswers && rvSession.userAnswers[i] != null ? String(rvSession.userAnswers[i]) : "";
        var okI = rvSession.clozeResults && rvSession.clozeResults[i];
        parts.push('<span class="sr-cloze-mark ' + (okI ? "ok" : "bad") + '">' + esc(ua || "（未填）") + "</span>");
        if (!okI) parts.push('<span class="sr-cloze-correct">' + esc(content.slice(b.start, b.end)) + "</span>");
      }
      pos = b.end;
    });
    parts.push(esc(content.slice(pos)));
    var clozeHtml = parts.join("");

    var banner = "";
    if (!filling) {
      var j = { correct: rvSession.clozeResults ? rvSession.clozeResults.filter(Boolean).length : 0, total: blanks.length };
      banner = j.correct === j.total
        ? '<p class="sr-cloze-banner ok">✓ 正确</p>'
        : '<p class="sr-cloze-banner bad">✗ 错误 · 答对 ' + j.correct + " / " + j.total + " 空</p>";
    }

    var body = $("#sr-rv-body");
    body.innerHTML = rvHeadHtml() +
      '<div class="sr-rv-card">' +
      '<p class="sr-rv-tag">挖空型 · ' + esc(libNameOf(state.repositoryId)) + "</p>" +
      '<p class="sr-cloze-text">' + clozeHtml + "</p>" +
      entryExtraHtml(entry) +
      banner +
      "</div>" +
      (filling
        ? '<div class="sr-rv-actions">' +
          '<button class="sr-rv-next" id="sr-cloze-submit" type="button">提交答案</button>' +
          '<button class="sr-rv-mastered" id="sr-rv-mastered" type="button">已经很熟 · 已掌握</button>' +
          "</div>"
        : '<div class="sr-rv-actions"><button class="sr-rv-next" id="sr-rv-next" type="button">下一条</button></div>');

    if (filling) {
      var first = body.querySelector(".sr-cloze-input");
      if (first) { try { first.focus(); } catch (e) { /* 受限忽略 */ } }
    }
  }

  /* ---- 旧数据兜底：原有「提示 → 显示答案 → 判断」流程 ---- */
  function renderLegacyCard(state, entry) {
    var catName = catNameOf(entry.libraryId, entry.catId);
    var quiz = quizOf(entry, catName);
    var revealed = rvSession.phase === "reveal";
    var body = $("#sr-rv-body");
    body.innerHTML = rvHeadHtml() +
      '<div class="sr-rv-card">' +
      '<p class="sr-rv-tag">' + esc(quiz.label) + " · " + esc(libNameOf(state.repositoryId)) + "</p>" +
      '<p class="sr-rv-prompt">' + esc(quiz.prompt) + "</p>" +
      '<p class="sr-rv-hint">' + esc(quiz.hint) + "</p>" +
      (revealed ? "" : '<button class="sr-rv-reveal" id="sr-rv-reveal" type="button">显示答案</button>') +
      (revealed
        ? '<div class="sr-rv-answer"><p class="sr-rv-content">' + esc(entry.content) + "</p>" + entryExtraHtml(entry) + "</div>"
        : "") +
      "</div>" +
      (revealed
        ? '<div class="sr-rv-actions">' +
          '<button class="sr-rv-btn sr-rv-known" data-ans="known" type="button">记得</button>' +
          '<button class="sr-rv-btn sr-rv-fuzzy" data-ans="fuzzy" type="button">模糊</button>' +
          '<button class="sr-rv-btn sr-rv-forgot" data-ans="forgot" type="button">忘记</button>' +
          '<button class="sr-rv-mastered" id="sr-rv-mastered" type="button">已经很熟 · 已掌握</button>' +
          "</div>"
        : "");
  }

  function reviewNext() {
    if (!rvSession) return;
    rvSession.idx++;
    rvSession.phase = "ask";
    rvSession.lastResult = null;
    rvSession.userAnswers = null;
    rvSession.clozeResults = null;
    renderReviewCard();
  }

  /** 提问型：三按钮直接作为调度判断，随后显示答案 */
  function answerQuestion(result) {
    if (!rvSession || rvSession.phase !== "ask") return;
    var state = rvSession.queue[rvSession.idx];
    if (!state) return;
    D.answer(state.id, result);
    rvSession.stats[result]++;
    rvSession.lastResult = result;
    rvSession.phase = "reveal";
    renderReviewCard();
  }

  /** 挖空型：提交 → 判分（全对=记得 / 部分对=模糊 / 全错=遗忘）→ 显示正确答案 */
  function submitCloze() {
    if (!rvSession || rvSession.phase !== "fill") return;
    var state = rvSession.queue[rvSession.idx];
    var entry = entryById(state.id);
    if (!state || !entry) return;
    var blanks = D.validBlanks(entry.content, state.examConfig.blanks);
    var answers = blanks.map(function (b, i) {
      var inp = document.querySelector('.sr-cloze-input[data-blank="' + i + '"]');
      return inp ? inp.value : "";
    });
    var j = D.judgeCloze(entry.content, blanks, answers);
    var result = j.allCorrect ? "known" : (j.correct > 0 ? "fuzzy" : "forgot");
    D.answer(state.id, result);
    rvSession.stats[result]++;
    rvSession.userAnswers = answers;
    rvSession.clozeResults = j.results;
    rvSession.lastResult = result;
    rvSession.phase = "result";
    renderReviewCard();
  }

  function markMasteredCurrent() {
    if (!rvSession) return;
    var state = rvSession.queue[rvSession.idx];
    if (!state) return;
    D.markMastered(state.id);
    rvSession.stats.mastered++;
    reviewNext();
  }

  /** 旧数据兜底流程：显示答案 */
  function revealAnswer() {
    if (!rvSession || rvSession.phase !== "ask") return;
    rvSession.phase = "reveal";
    renderReviewCard();
  }

  /** 旧数据兜底流程：答案已显示后的判断按钮 */
  function answerLegacy(result) {
    if (!rvSession || rvSession.phase !== "reveal") return;
    var state = rvSession.queue[rvSession.idx];
    if (!state) return;
    D.answer(state.id, result);
    rvSession.stats[result]++;
    reviewNext();
  }

  function renderReviewDone() {
    var s = rvSession ? rvSession.stats : { known: 0, fuzzy: 0, forgot: 0, mastered: 0 };
    var total = rvSession ? rvSession.queue.length : 0;
    var body = $("#sr-rv-body");
    body.innerHTML = `
      <div class="sr-rv-done">
        <div class="sr-rv-done-check">✓</div>
        <h2 class="sr-rv-done-title">本轮复习完成</h2>
        <p class="sr-rv-done-sub">共 ${total} 条 · 记得 ${s.known} · 模糊 ${s.fuzzy} · 忘记 ${s.forgot}${s.mastered ? " · 已掌握 " + s.mastered : ""}</p>
        <p class="sr-rv-done-hint">下一轮复习已按间隔重复算法自动安排</p>
        <button class="sr-rv-done-btn" id="sr-rv-done-back" type="button">返回存储库复习</button>
      </div>`;
    rvSession = null;
  }

  function exitReview() {
    rvSession = null;
    openRepo();
  }

  /* ================= 返回键：装饰 window.__back ================= */

  function activePageId() {
    var el = document.querySelector(".page.active");
    return el ? el.id : "";
  }

  function handleBack() {
    var id = activePageId();
    if (id === "page-sr-exam") { examCancel(); return true; }
    if (id === "page-sr-review") { exitReview(); return true; }
    if (id === "page-sr-intervals") { openRepo(); return true; }
    if (id === "page-sr-lib") { openRepo(); return true; }
    if (id === "page-sr-queue") { openRepo(); return true; }
    if (id === "page-sr-repo") { openHub(); return true; }
    if (id === "page-sr-vocab") { openHub(); return true; }
    if (id === "page-sr") { switchTab("settings"); return true; }
    return false;
  }

  /* ================= 事件绑定 ================= */

  function bindUI() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      var el;

      if ((el = t.closest("#sr-entry"))) { openHub(); return; }
      if ((el = t.closest("#sr-vocab-entry"))) { openVocab(); return; }
      if ((el = t.closest("#sr-repo-entry"))) { openRepo(); return; }

      // 返回
      if ((el = t.closest("#sr-back"))) { switchTab("settings"); return; }
      if ((el = t.closest("#sr-vocab-back"))) { openHub(); return; }
      if ((el = t.closest("#sr-repo-back"))) { openHub(); return; }
      if ((el = t.closest("#sr-lib-back"))) { openRepo(); return; }
      if ((el = t.closest("#sr-exam-back"))) { examCancel(); return; }
      if ((el = t.closest("#sr-queue-back"))) { openRepo(); return; }
      if ((el = t.closest("#sr-intervals-back"))) { openRepo(); return; }
      if ((el = t.closest("#sr-intervals-save"))) { saveIntervals(); return; }
      if ((el = t.closest("#sr-intervals-reset"))) { resetIntervalsUI(); return; }

      // 库页：已在队列 / 未在队列 同页 Segmented 切换
      if ((el = t.closest("#sr-lib-seg .seg-btn"))) {
        pickCtx.tab = el.getAttribute("data-lib-tab") === "inq" ? "inq" : "notq";
        renderLibPage();
        return;
      }

      // 生词列表 → 释义卡片
      if ((el = t.closest("#sr-vocab-list .sr-vocab-row"))) {
        openWordCard(el.getAttribute("data-sr-word"));
        return;
      }

      // 存储库主页
      if ((el = t.closest("#sr-start-btn"))) { startReview(); return; }
      if ((el = t.closest("#sr-intervals-entry"))) { openIntervals(); return; }
      if ((el = t.closest("#sr-queue-entry"))) { openQueue(); return; }
      if ((el = t.closest("[data-sr-lib]"))) { openLib(el.getAttribute("data-sr-lib")); return; }

      // 库页：已在队列 → 修改考察方式；未在队列 → 圆圈选择
      if ((el = t.closest("[data-inq]"))) { openExamEdit(el.getAttribute("data-inq")); return; }
      if ((el = t.closest("[data-check]"))) { togglePick(el.getAttribute("data-check")); return; }
      if ((el = t.closest("#sr-select-all"))) { toggleSelectAll(); return; }
      if ((el = t.closest("#sr-pick-add"))) { openExamBatch(); return; }
      // 点条目行也切换勾选（整行可点，像微信批量选择一样简单）
      if ((el = t.closest(".sr-pick-row")) && !t.closest("[data-check]")) {
        togglePick(el.getAttribute("data-pick"));
        return;
      }

      // 考察方式配置页
      if ((el = t.closest(".sr-exam-type"))) {
        var draft = currentExamDraft();
        if (draft) {
          captureDraftInputs(draft);
          draft.type = el.getAttribute("data-etype");
          renderExamPage();
        }
        return;
      }
      if ((el = t.closest("[data-blank-del]"))) {
        var d2 = currentExamDraft();
        if (d2) {
          d2.blanks.splice(parseInt(el.getAttribute("data-blank-del"), 10), 1);
          renderBlankChips();
        }
        return;
      }
      if ((el = t.closest("#sr-exam-prev"))) {
        if (examCtx && examCtx.mode === "batch" && validateCurrentDraft()) {
          examCtx.idx--;
          renderExamPage();
        }
        return;
      }
      if ((el = t.closest("#sr-exam-next"))) { examNext(); return; }
      if ((el = t.closest("#sr-exam-cancel"))) { examCancel(); return; }

      // 队列
      if ((el = t.closest("[data-queue-remove]"))) {
        D.removeFromReview(el.getAttribute("data-queue-remove"));
        renderQueue();
        toast("已移出复习队列");
        return;
      }

      // 复习流程
      if ((el = t.closest("#sr-rv-exit"))) { exitReview(); return; }
      if ((el = t.closest("#sr-rv-reveal"))) { revealAnswer(); return; }
      if ((el = t.closest("#sr-cloze-submit"))) { submitCloze(); return; }
      if ((el = t.closest("#sr-rv-next"))) { reviewNext(); return; }
      if ((el = t.closest(".sr-rv-btn[data-ans]"))) {
        // 提问型（ask 阶段：判断后显答案）与旧数据兜底（reveal 阶段）共用按钮样式
        if (rvSession && rvSession.phase === "ask") answerQuestion(el.getAttribute("data-ans"));
        else answerLegacy(el.getAttribute("data-ans"));
        return;
      }
      if ((el = t.closest("#sr-rv-mastered"))) { markMasteredCurrent(); return; }
      if ((el = t.closest("#sr-rv-done-back"))) { openRepo(); return; }
    });

    // 挖空选区结束（同荧光笔：mouseup/touchend + 150ms 防抖）
    document.addEventListener("mouseup", onExamSelectEnd);
    document.addEventListener("touchend", onExamSelectEnd);
  }

  /* ================= 初始化 ================= */

  function init() {
    injectShell();
    bindUI();
    var prevBack = window.__back;
    window.__back = function () {
      if (handleBack()) return true;
      return prevBack ? prevBack.apply(this, arguments) : false;
    };
  }

  init();

  window.VH_SR.ui = {
    openHub: openHub,
    vocabPlan: vocabPlan,
    quizOf: quizOf,
    timeLabel: timeLabel,
    maskSentence: maskSentence,
    maskCollocation: maskCollocation
  };
})();
