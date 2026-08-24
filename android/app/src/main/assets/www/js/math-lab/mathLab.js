/* ============================================================
   Math Lab · 主控模块（入口注入 + 页面外壳 + 事件编排）
   ------------------------------------------------------------
   挂载到 window.VH_MathLab.lab。
   页面层级：Dashboard → Math Lab(math-lab) → 实验配置(math-config)
             → Math Canvas(math-canvas)
   遵循 knowledge.js 注入模式：index.html 零修改，DOM 动态注入；
   装饰 window.__back 接管物理返回键。
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};
  var ML = window.VH_MathLab;
  var C = ML.config, D = ML.data, P = ML.presets, CV = ML.canvas;

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) { if (typeof showToast === "function") showToast(msg); }

  /* ================= 图标 ================= */

  var BACK_SVG = '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>';
  var MATH_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 4.5l4 5-4 5"/><path d="M11 14.5h4.5"/><path d="M13.2 8.3h4"/><circle cx="13.2" cy="8.3" r="2.6"/><path d="M11 4.5h4.5"/></svg>';

  /* ================= DOM 注入（既有 HTML 零修改） ================= */

  function injectShell() {
    // 首页入口卡片：插在 knowledge/repo 入口之后（锚点降级保证独立可用）
    var anchor = document.getElementById("repo-entry") ||
      document.getElementById("kn-entry") ||
      document.getElementById("habits-entry");
    if (anchor) {
      anchor.insertAdjacentHTML("afterend", `
        <button class="review-entry" id="ml-entry" type="button">
          <span class="review-entry-icon">${MATH_SVG}</span>
          <span class="review-entry-main">
            <span class="review-entry-title">📐 Math Lab · 数学实验室</span>
            <span class="review-entry-sub" id="ml-entry-sub">函数 · 导数 · 积分 · 极限 · 代数｜进入实验室</span>
          </span>
          <svg class="icon icon-s review-entry-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
        </button>`);
    }

    document.getElementById("app").insertAdjacentHTML("beforeend", `
      <!-- Math Lab 主页 -->
      <main class="page" id="page-math-lab">
        <header class="page-header">
          <button class="back-btn" id="ml-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">📐 Math Lab</h1>
        </header>
        <p class="page-subtitle">数学实验室 · 通过操作与观察理解高等数学</p>
        <button class="primary-btn" id="ml-new" type="button">＋ 新建实验</button>

        <p class="ml-sec-title">我的预设</p>
        <ul class="ml-list" id="ml-preset-list"></ul>
        <div class="ml-empty" id="ml-preset-empty" hidden>
          <p>还没有预设</p>
          <p class="ml-empty-sub">在配置页「存为预设」，把常用实验一键打开</p>
        </div>

        <p class="ml-sec-title">最近实验</p>
        <ul class="ml-list" id="ml-recent-list"></ul>
        <div class="ml-empty" id="ml-recent-empty" hidden>
          <p>还没有实验</p>
          <p class="ml-empty-sub">新建一个实验，生成后可拖动缩放观察图像</p>
        </div>
      </main>

      <!-- 实验配置页 -->
      <main class="page" id="page-math-config">
        <header class="page-header">
          <button class="back-btn" id="mlc-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">实验配置</h1>
        </header>
        <p class="page-subtitle">选择生成类型，输入公式与参数</p>
        <p class="ml-field-label">生成类型</p>
        <div class="ml-type-chips" id="ml-type-chips"></div>
        <div id="ml-form"></div>
        <button class="primary-btn" id="ml-generate" type="button">生成 · 进入 Math Canvas</button>
        <button class="ml-ghost-btn" id="ml-save-preset" type="button">存为预设</button>
        <button class="ml-ghost-btn" id="ml-preset-update" type="button" hidden>更新当前预设</button>
      </main>

      <!-- Math Canvas 三级页（全屏画布 + 浮动顶栏，极简沉浸） -->
      <main class="page ml-canvas-page" id="page-math-canvas">
        <div class="ml-cv-wrap" id="ml-cv-wrap">
          <canvas id="ml-canvas"></canvas>
          <header class="ml-cv-topbar">
            <button class="ml-cv-btn" id="ml-cv-back" type="button" aria-label="返回">${BACK_SVG}</button>
            <h1 class="ml-cv-title" id="ml-cv-title">Math Canvas</h1>
            <button class="ml-cv-btn" id="ml-cv-menu" type="button" aria-label="更多操作">⋯</button>
          </header>
          <div class="ml-cv-coord" id="ml-cv-coord" hidden></div>
          <div class="ml-cv-info" id="ml-cv-info" hidden></div>
          <div class="ml-cv-hint" id="ml-cv-hint">拖动平移 · 双指缩放 · 双击复位</div>
        </div>
      </main>

      <!-- 预设操作 Bottom Sheet -->
      <div class="sheet-overlay" id="ml-psheet-overlay" aria-hidden="true"></div>
      <div class="sheet ml-psheet" id="ml-psheet" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="sheet-grabber"></div>
        <p class="ml-psheet-title" id="ml-psheet-title">预设</p>
        <button class="ml-psheet-btn" id="ml-psheet-open" type="button">打开（进入配置）</button>
        <button class="ml-psheet-btn" id="ml-psheet-rename" type="button">重命名</button>
        <button class="ml-psheet-btn ml-psheet-danger" id="ml-psheet-delete" type="button">删除预设</button>
        <button class="ml-psheet-btn ml-psheet-cancel" id="ml-psheet-cancel" type="button">取消</button>
      </div>

      <!-- Canvas 菜单 Bottom Sheet（工具栏全部收纳于此） -->
      <div class="sheet-overlay" id="ml-menu-overlay" aria-hidden="true"></div>
      <div class="sheet ml-menu-sheet" id="ml-menu-sheet" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="sheet-grabber"></div>
        <p class="ml-psheet-title">Math Canvas</p>
        <div class="ml-menu-toggle-row" id="ml-menu-grid-row" role="button" tabindex="0">
          <span class="ml-menu-toggle-label">显示网格</span>
          <span class="ml-menu-mini-sw on" id="ml-menu-grid-sw"></span>
        </div>
        <div class="ml-menu-toggle-row" id="ml-menu-axes-row" role="button" tabindex="0">
          <span class="ml-menu-toggle-label">显示坐标轴</span>
          <span class="ml-menu-mini-sw on" id="ml-menu-axes-sw"></span>
        </div>
        <button class="ml-psheet-btn" id="ml-menu-reset" type="button">重置视图（回到最佳视野）</button>
        <div class="ml-menu-name-row">
          <input id="ml-menu-name" type="text" autocomplete="off" maxlength="24" placeholder="实验名称（可选）">
        </div>
        <button class="ml-psheet-btn" id="ml-menu-save" type="button">保存实验</button>
        <button class="ml-psheet-btn" id="ml-menu-export" type="button">导出图片 PNG</button>
        <button class="ml-psheet-btn ml-psheet-cancel" id="ml-menu-cancel" type="button">取消</button>
      </div>`);
  }

  /* ================= 主页 ================= */

  function openLab() {
    D.loadAll();
    P.renderList();
    renderRecent();
    switchTab("math-lab");
  }

  function renderRecent() {
    var list = $("#ml-recent-list");
    if (!list) return;
    var items = D.recentExperiments();
    var empty = $("#ml-recent-empty");
    if (empty) empty.hidden = items.length > 0;
    list.innerHTML = items.map(function (e) {
      var name = e.name || P.summaryOf(e);
      return '<li class="ml-item" data-exp="' + esc(e.id) + '">' +
        '<div class="ml-item-main">' +
        '<p class="ml-item-title">' + esc(name) +
        (e.saved ? '<span class="ml-item-tag ml-item-tag-saved">已保存</span>' : "") +
        '</p>' +
        '<p class="ml-item-sub">' + esc(P.typeLabel(e.type)) + ' · ' + esc(P.summaryOf(e)) + '</p>' +
        '</div>' +
        '<span class="ml-item-time">' + esc(P.timeAgo(e.lastAt)) + '</span>' +
        '</li>';
    }).join("");
  }

  function openExperiment(id) {
    var e = D.expById(id);
    if (!e) return;
    delete e.__fitX0; delete e.__fitX1; // 历史：直接用持久化视图
    CV.open(e, "lab");
  }

  /* ================= 配置页 ================= */

  function openNewExperiment() {
    C.open({ type: "function" });
    switchTab("math-config");
  }

  function saveAsPreset() {
    P.nameDialog({
      title: "存为预设",
      placeholder: "预设名称，如：二次函数实验",
      okText: "保存",
      onOk: function (name) { P.saveCurrentAs(name); }
    });
  }

  function updatePresetBtn() {
    if (C.presetId) P.updateCurrent();
    else toast("当前不是从预设打开的配置");
  }

  /* ================= 浮层强制回收（串层防御：严格绑定 Math Lab 页面） =================
     ml-menu-sheet / ml-psheet / ml-dlg-mask 均为全局 fixed 浮层，不归页面切换管。
     任何路径离开 Math Lab 三页（底部 tab 直达、其他模块 switchTab、异步时序等）
     都必须强制关闭，否则残留的 .open/.visible 会叠加到其他页面——尤其键盘弹出、
     --ime 变化（.sheet { bottom: var(--ime) }）时残留面板被顶到键盘上方显形。 */

  function forceCloseAllLayers() {
    if (CV.menuOpened()) CV.closeMenu();
    if (P.actionsOpened()) P.closeActions();
    if (P.dialogOpened()) P.closeDialog();
  }

  function anyMathPageActive() {
    return !!document.querySelector("#page-math-lab.active, #page-math-config.active, #page-math-canvas.active");
  }

  /* ================= 事件绑定 ================= */

  function bindUI() {
    // 首页入口 → Math Lab
    $("#ml-entry").addEventListener("click", openLab);

    // 主页
    $("#ml-back").addEventListener("click", function () { switchTab("home"); });
    $("#ml-new").addEventListener("click", openNewExperiment);
    $("#ml-recent-list").addEventListener("click", function (e) {
      var item = e.target.closest("[data-exp]");
      if (item) openExperiment(item.getAttribute("data-exp"));
    });
    $("#ml-psheet-cancel").addEventListener("click", P.closeActions);

    // 配置页
    $("#mlc-back").addEventListener("click", function () { switchTab("math-lab"); });
    $("#ml-type-chips").addEventListener("click", function (e) {
      var chip = e.target.closest("[data-mltype]");
      if (chip) C.onSelectType(chip.getAttribute("data-mltype"));
    });
    var form = $("#ml-form");
    form.addEventListener("input", function (e) {
      var el = e.target.closest("[data-mlkey]");
      if (el) C.onInput(el.getAttribute("data-mlkey"), el.value);
    });
    form.addEventListener("change", function (e) {
      var el = e.target.closest("[data-mlkey]");
      if (el && el.type === "checkbox") C.onToggle(el.getAttribute("data-mlkey"), el.checked);
    });
    form.addEventListener("click", function (e) {
      var seg = e.target.closest("[data-mlsel]");
      if (seg) C.onSelect(seg.getAttribute("data-mlsel"), seg.getAttribute("data-mlval"));
    });
    $("#ml-generate").addEventListener("click", function () { C.generate(); });
    $("#ml-save-preset").addEventListener("click", saveAsPreset);
    $("#ml-preset-update").addEventListener("click", updatePresetBtn);

    // 子模块各自绑定
    P.bindUI();
    CV.bindUI();

    // 全局页面失活防御：监听 #app 的 class 变化（页面切换即 .active 迁移），
    // 一旦当前激活页不是 Math Lab 三页，立即强制关闭本模块全部浮层 ——
    // 覆盖底部 tab 直达切换等一切绕过返回链的路径，浮层绝不串到其他页面。
    // 不监听/不拦截 resize/键盘事件：其他输入框的键盘适配不受任何影响。
    if (window.MutationObserver) {
      var appRoot = document.getElementById("app");
      if (appRoot) {
        new MutationObserver(function () {
          if (!anyMathPageActive()) forceCloseAllLayers();
        }).observe(appRoot, { subtree: true, attributes: true, attributeFilter: ["class"] });
      }
    }

    // 视图保存后同步主页列表（最近实验顺序/名称可能变化）
    ML.onExperimentChanged = renderRecent;
  }

  /* ================= 返回键：装饰 window.__back ================= */

  function activePageId() {
    var el = document.querySelector(".page.active");
    return el ? el.id : "";
  }

  function handleBack() {
    // 最上层浮层优先
    if (CV.menuOpened()) { CV.closeMenu(); return true; }
    if (P.actionsOpened()) { P.closeActions(); return true; }
    if (P.dialogOpened()) { P.closeDialog(); return true; }

    var id = activePageId();
    if (id === "page-math-canvas") { CV.back(); return true; }
    if (id === "page-math-config") { switchTab("math-lab"); return true; }
    if (id === "page-math-lab") { switchTab("home"); return true; }
    return false; // 交回原有处理链
  }

  /* ================= 初始化 ================= */

  function init() {
    D.loadAll();
    C.injectDeps({ $: $, esc: esc, showToast: toast });
    C.setHooks({
      onGenerate: function (exp) { CV.open(exp, "config"); } // 生成 → 直达画布
    });
    injectShell();
    bindUI();

    var prevBack = window.__back;
    window.__back = function () {
      if (handleBack()) return true;
      return prevBack ? prevBack.apply(this, arguments) : false;
    };
  }

  init();

  /* ================= 导出 ================= */

  window.VH_MathLab.lab = {
    open: openLab,
    openNew: openNewExperiment,
    openExperiment: openExperiment,
    renderRecent: renderRecent
  };
})();
