/* ============================================================
   Math Lab · 预设管理（我的预设：列表 / 新建 / 修改 / 删除）
   ------------------------------------------------------------
   挂载到 window.VH_MathLab.presets。
   预设 = 完整实验配置的具名快照（类型+公式+参数+定义域+显示选项）。
   内置示例预设仅首次播种，此后完全由用户管理（可改可删不复活）。
   列表 UI 渲染到 #ml-preset-list；操作走底部 sheet（复用 app 设计语言）。
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};
  var D = null, C = null; // data / config

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) { if (typeof showToast === "function") showToast(msg); }

  function modules() {
    D = D || window.VH_MathLab.data;
    C = C || window.VH_MathLab.config;
  }

  /* ================= 摘要文案 ================= */

  function typeLabel(t) {
    var types = (C && C.TYPES) || {};
    return types[t] ? types[t].label : t;
  }

  /** 预设/实验一行摘要：f(x)=x^2-2x-3 / ∫[0,2] x² dx / lim x→0 sin(x)/x */
  function summaryOf(p) {
    var f = String(p.formula || "").trim();
    var pr = p.params || {};
    function v(k) { return pr[k] !== undefined && pr[k] !== null ? pr[k] : ""; }
    switch (p.type) {
      case "derivative": return "f(x) = " + f;
      case "indefinite": return "∫ " + f + " dx";
      case "definite": return "∫[" + v("a") + ", " + v("b") + "] " + f + " dx";
      case "limit": return "lim x→" + v("target") + " " + f;
      case "algebra": return f;
      default: return "f(x) = " + f;
    }
  }

  function timeAgo(ts) {
    if (!ts) return "";
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "刚刚";
    if (s < 3600) return Math.floor(s / 60) + " 分钟前";
    if (s < 86400) return Math.floor(s / 3600) + " 小时前";
    if (s < 86400 * 30) return Math.floor(s / 86400) + " 天前";
    var d = new Date(ts);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  /* ================= 列表渲染 ================= */

  function renderList() {
    modules();
    var list = $("#ml-preset-list");
    if (!list) return;
    var items = D.presets;
    var empty = $("#ml-preset-empty");
    if (empty) empty.hidden = items.length > 0;
    list.innerHTML = items.map(function (p) {
      return '<li class="ml-item" data-preset="' + esc(p.id) + '">' +
        '<div class="ml-item-main">' +
        '<p class="ml-item-title">' + esc(p.name || "未命名预设") + (p.builtin ? '<span class="ml-item-tag">示例</span>' : "") + '</p>' +
        '<p class="ml-item-sub">' + esc(typeLabel(p.type)) + ' · ' + esc(summaryOf(p)) + '</p>' +
        '</div>' +
        '<button class="ml-item-more" data-preset-more="' + esc(p.id) + '" type="button" aria-label="预设操作">⋯</button>' +
        '</li>';
    }).join("");
  }

  /* ================= 操作 sheet ================= */

  var currentId = null;

  function openActions(id) {
    modules();
    var labPage = document.getElementById("page-math-lab");
    if (!labPage || !labPage.classList.contains("active")) return; // 严格绑定 Math Lab 主页：非激活态绝不打开（防御残留/误触发）
    var p = D.presetById(id);
    if (!p) return;
    currentId = id;
    var title = $("#ml-psheet-title");
    if (title) title.textContent = p.name || "未命名预设";
    var sheet = $("#ml-psheet"), ov = $("#ml-psheet-overlay");
    ov.classList.add("visible");
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }

  function closeActions() {
    var sheet = $("#ml-psheet"), ov = $("#ml-psheet-overlay");
    if (!sheet) return;
    ov.classList.remove("visible");
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    currentId = null;
  }

  function actionsOpened() {
    var sheet = $("#ml-psheet");
    return sheet && sheet.getAttribute("aria-hidden") === "false";
  }

  /* ---------- 打开预设 → 配置页 ---------- */

  function openPreset(id) {
    modules();
    var p = D.presetById(id);
    if (!p) return;
    C.open({ type: p.type, preset: p });
    if (typeof switchTab === "function") switchTab("math-config");
  }

  /* ---------- 重命名 / 删除（动态居中对话框，knowledge 命名弹窗同款交互） ---------- */

  function closeDialog() {
    var m = document.getElementById("ml-dlg-mask");
    if (m) m.remove();
  }

  function dialogOpened() {
    return !!document.getElementById("ml-dlg-mask");
  }

  function renamePreset(id) {
    modules();
    var p = D.presetById(id);
    if (!p) return;
    closeActions();
    showNameDialog({
      title: "重命名预设",
      value: p.name || "",
      placeholder: "预设名称",
      okText: "重命名",
      onOk: function (name) {
        D.updatePreset(id, { name: name });
        renderList();
        toast("已重命名为「" + name + "」");
      }
    });
  }

  function deletePreset(id) {
    modules();
    var p = D.presetById(id);
    if (!p) return;
    closeActions();
    showConfirmDialog({
      title: "删除预设",
      text: "删除「" + (p.name || "未命名") + "」？此操作不可撤销。",
      okText: "删除",
      onOk: function () {
        D.deletePreset(id);
        renderList();
        toast("预设已删除");
      }
    });
  }

  /** 轻量命名弹窗：非空才可确认 */
  function showNameDialog(opts) {
    closeDialog();
    var mask = document.createElement("div");
    mask.id = "ml-dlg-mask";
    mask.className = "ml-dlg-mask";
    mask.innerHTML =
      '<div class="ml-dlg" role="dialog" aria-modal="true">' +
      '<p class="ml-dlg-title">' + esc(opts.title) + "</p>" +
      '<input class="ml-dlg-input" type="text" autocomplete="off" maxlength="24" placeholder="' + esc(opts.placeholder || "") + '" value="' + esc(opts.value || "") + '">' +
      '<div class="ml-dlg-btns">' +
      '<button class="ml-dlg-btn" type="button">取消</button>' +
      '<button class="ml-dlg-btn ml-dlg-ok" type="button" disabled>' + esc(opts.okText || "确定") + "</button>" +
      "</div></div>";
    document.body.appendChild(mask);
    var input = mask.querySelector(".ml-dlg-input");
    var okBtn = mask.querySelector(".ml-dlg-ok");
    var close = function () { mask.remove(); };
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });
    mask.querySelectorAll(".ml-dlg-btn")[0].addEventListener("click", close);
    var validate = function () { okBtn.disabled = !input.value.trim(); };
    input.addEventListener("input", validate);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !okBtn.disabled) { e.preventDefault(); okBtn.click(); }
    });
    validate();
    okBtn.addEventListener("click", function () {
      if (okBtn.disabled) return;
      var n = input.value.trim();
      close();
      if (opts.onOk) opts.onOk(n);
    });
    setTimeout(function () { input.focus(); }, 60);
  }

  function showConfirmDialog(opts) {
    closeDialog();
    var mask = document.createElement("div");
    mask.id = "ml-dlg-mask";
    mask.className = "ml-dlg-mask";
    mask.innerHTML =
      '<div class="ml-dlg" role="dialog" aria-modal="true">' +
      '<p class="ml-dlg-title">' + esc(opts.title) + "</p>" +
      (opts.text ? '<p class="ml-dlg-text">' + esc(opts.text) + "</p>" : "") +
      '<div class="ml-dlg-btns">' +
      '<button class="ml-dlg-btn" type="button">取消</button>' +
      '<button class="ml-dlg-btn ml-dlg-ok ml-dlg-danger" type="button">' + esc(opts.okText || "确定") + "</button>" +
      "</div></div>";
    document.body.appendChild(mask);
    var close = function () { mask.remove(); };
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });
    var btns = mask.querySelectorAll(".ml-dlg-btn");
    btns[0].addEventListener("click", close);
    btns[1].addEventListener("click", function () { close(); if (opts.onOk) opts.onOk(); });
  }

  /* ---------- 从配置页保存 / 更新 ---------- */

  /** 当前配置另存为新预设 */
  function saveCurrentAs(name) {
    modules();
    var cfg = C.collectConfig();
    if (!String(cfg.formula).trim()) { toast("请先输入公式"); return null; }
    if (!name) { toast("请输入预设名称"); return null; }
    var p = D.addPreset({
      name: name, type: cfg.type, formula: cfg.formula,
      params: cfg.params, domain: cfg.domain, display: cfg.display
    });
    renderList();
    toast("已保存预设「" + name + "」");
    return p;
  }

  /** 更新现有预设（配置页 presetId 上下文） */
  function updateCurrent(name) {
    modules();
    var pid = C.presetId;
    if (!pid) return null;
    var cfg = C.collectConfig();
    if (!String(cfg.formula).trim()) { toast("请先输入公式"); return null; }
    var patch = {
      type: cfg.type, formula: cfg.formula,
      params: cfg.params, domain: cfg.domain, display: cfg.display
    };
    if (name) patch.name = name;
    var p = D.updatePreset(pid, patch);
    renderList();
    toast("预设已更新");
    return p;
  }

  /* ================= 事件绑定（mathLab.js 注入 DOM 后调用） ================= */

  function bindUI() {
    var root = document.getElementById("page-math-lab");
    if (!root || root.__mlpBound) return;
    root.__mlpBound = true;

    // 预设列表：点击主体 → 打开进配置页；⋯ → 操作 sheet
    var list = $("#ml-preset-list");
    list.addEventListener("click", function (e) {
      var more = e.target.closest("[data-preset-more]");
      if (more) { openActions(more.getAttribute("data-preset-more")); return; }
      var item = e.target.closest("[data-preset]");
      if (item) openPreset(item.getAttribute("data-preset"));
    });

    // 操作 sheet
    $("#ml-psheet-overlay").addEventListener("click", closeActions);
    $("#ml-psheet-open").addEventListener("click", function () { var id = currentId; closeActions(); openPreset(id); });
    $("#ml-psheet-rename").addEventListener("click", function () { var id = currentId; renamePreset(id); });
    $("#ml-psheet-delete").addEventListener("click", function () { var id = currentId; deletePreset(id); });
  }

  /* ================= 导出 ================= */

  window.VH_MathLab.presets = {
    bindUI: bindUI,
    renderList: renderList,
    openActions: openActions,
    closeActions: closeActions,
    actionsOpened: actionsOpened,
    closeDialog: closeDialog,
    dialogOpened: dialogOpened,
    nameDialog: showNameDialog,
    confirmDialog: showConfirmDialog, // 供最近实验删除复用（同一确认弹窗样式）
    saveCurrentAs: saveCurrentAs,
    updateCurrent: updateCurrent,
    summaryOf: summaryOf,
    typeLabel: typeLabel,
    timeAgo: timeAgo
  };
})();
