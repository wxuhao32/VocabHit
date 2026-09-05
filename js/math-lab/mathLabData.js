/* ============================================================
   Math Lab · 数据层（独立本地存储，与既有 vc-* 数据完全隔离）
   ------------------------------------------------------------
   挂载到 window.VH_MathLab.data。
   键名：mathLab.presets / mathLab.experiments / mathLab.recentExperiments
   实验体：{id, name?, saved, type, formula, params, domain, display, view, createdAt, lastAt}
   预设体：{id, name, type, formula, params, domain, display, builtin, createdAt, updatedAt}
   容量：experiments 100（优先淘汰未保存旧项）/ recent 20 / presets 200
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};

  var KEY_PRESETS = "mathLab.presets";
  var KEY_EXPERIMENTS = "mathLab.experiments";
  var KEY_RECENT = "mathLab.recentExperiments";

  var CAP_EXPERIMENTS = 100;
  var CAP_RECENT = 20;
  var CAP_PRESETS = 200;

  var presets = { v: 1, items: [] };
  var experiments = { v: 1, items: [] };
  var recent = { v: 1, items: [] }; // 有序 id 列表（新→旧），指向 experiments.items

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function readStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object" || !Array.isArray(obj.items)) return fallback;
      return { v: 1, items: obj.items };
    } catch (e) { return fallback; }
  }

  function writeStore(key, store) {
    try { localStorage.setItem(key, JSON.stringify(store)); }
    catch (e) { /* 存储满等异常：静默，不阻塞交互 */ }
  }

  /* ---------- 内置示例预设（仅首次初始化播种，此后完全由用户管理） ---------- */

  function builtinPresets() {
    var t = Date.now();
    return [
      {
        id: "mlp-quad", name: "二次函数实验", builtin: true, createdAt: t, updatedAt: t,
        type: "function", formula: "x^2 - 2x - 3",
        params: { markX: "" }, domain: { min: "", max: "" }, display: { grid: true, axes: true }
      },
      {
        id: "mlp-tangent", name: "导数与切线", builtin: true, createdAt: t, updatedAt: t,
        type: "derivative", formula: "x^3 - 2x",
        params: { showDf: true, showTangent: true, tangentX: "1" },
        domain: { min: "", max: "" }, display: { grid: true, axes: true }
      },
      {
        id: "mlp-area", name: "定积分面积", builtin: true, createdAt: t, updatedAt: t,
        type: "definite", formula: "x^2",
        params: { a: "0", b: "2" }, domain: { min: "", max: "" }, display: { grid: true, axes: true }
      }
    ];
  }

  function loadAll() {
    /* 数据安全加固：firstInit 判定走 VH_STG（区分「真没有」与「暂时没读到」）——
       WebView 存储层偶发故障时绝不用内置预设覆盖用户预设；未确认期间保持内存现状，
       下次打开 Math Lab 时自动重读。 */
    var guard = window.VH_STG || null;
    var firstInit = false;
    if (guard) {
      var r = guard.safeRead(KEY_PRESETS, null);
      if (r.status === "unverified") return;
      firstInit = (r.status === "absent");
    } else {
      try { firstInit = localStorage.getItem(KEY_PRESETS) === null; } catch (e) { firstInit = true; }
    }
    presets = readStore(KEY_PRESETS, presets);
    if (firstInit && presets.items.length === 0) {
      if (guard && guard.writeBlocked(KEY_PRESETS)) return; // 未确认：不播种不落盘（双保险）
      presets.items = builtinPresets(); // 示例预设：可改可删，删后不再复活
      writeStore(KEY_PRESETS, presets);
    }
    experiments = readStore(KEY_EXPERIMENTS, experiments);
    recent = readStore(KEY_RECENT, recent);
    // 修复悬挂引用：recent 指向的 id 必须存在于 experiments
    var ids = {};
    experiments.items.forEach(function (e) { ids[e.id] = true; });
    recent.items = recent.items.filter(function (id) { return ids[id]; }).slice(0, CAP_RECENT);
  }

  /* ---------- 实验签名（同配置 = 同最近条目） ---------- */

  function signature(exp) {
    return JSON.stringify({
      type: exp.type, formula: exp.formula, params: exp.params || {},
      domain: exp.domain || {}, display: exp.display || {}
    });
  }

  /* ---------- 实验（运行记录） ---------- */

  function expById(id) {
    for (var i = 0; i < experiments.items.length; i++)
      if (experiments.items[i].id === id) return experiments.items[i];
    return null;
  }

  /** 新建或刷新实验记录（按签名去重）→ 返回实验体；同步置顶最近列表 */
  function upsertExperiment(exp) {
    var sig = signature(exp);
    var found = null;
    for (var i = 0; i < experiments.items.length; i++) {
      if (signature(experiments.items[i]) === sig) { found = experiments.items[i]; break; }
    }
    var now = Date.now();
    if (found) {
      found.view = exp.view || found.view;
      found.name = exp.name || found.name;
      found.lastAt = now;
    } else {
      found = {
        id: exp.id || uid("m"),
        name: exp.name || "",
        saved: false,
        type: exp.type, formula: exp.formula,
        params: exp.params || {}, domain: exp.domain || { min: "", max: "" },
        display: exp.display || { grid: true, axes: true },
        view: exp.view || null,
        createdAt: now, lastAt: now
      };
      experiments.items.unshift(found);
      evictExperiments();
    }
    writeStore(KEY_EXPERIMENTS, experiments);
    touchRecent(found.id);
    return found;
  }

  /** 仅更新视图/名称/显示设置等（不新建） */
  function updateExperiment(id, patch) {
    var e = expById(id);
    if (!e) return null;
    if (patch.view) e.view = patch.view;
    if (patch.name !== undefined) e.name = patch.name;
    if (patch.saved !== undefined) e.saved = patch.saved;
    if (patch.display) e.display = patch.display;
    e.lastAt = Date.now();
    writeStore(KEY_EXPERIMENTS, experiments);
    return e;
  }

  function evictExperiments() {
    if (experiments.items.length <= CAP_EXPERIMENTS) return;
    // 从尾部（最旧）开始淘汰未保存项；已保存项尽量保留
    var i = experiments.items.length - 1;
    while (experiments.items.length > CAP_EXPERIMENTS && i >= 0) {
      if (!experiments.items[i].saved) experiments.items.splice(i, 1);
      i--;
    }
    while (experiments.items.length > CAP_EXPERIMENTS) experiments.items.pop(); // 极端情况兜底
    var ids = {};
    experiments.items.forEach(function (e) { ids[e.id] = true; });
    recent.items = recent.items.filter(function (id) { return ids[id]; });
    writeStore(KEY_RECENT, recent);
  }

  /** 删除单条实验记录：experiments 与 recent 两处引用同步清除并立即持久化，不影响其他记录 */
  function deleteExperiment(id) {
    var before = experiments.items.length;
    experiments.items = experiments.items.filter(function (e) { return e.id !== id; });
    if (experiments.items.length === before) return; // id 不存在：不误写存储
    recent.items = recent.items.filter(function (rid) { return rid !== id; });
    writeStore(KEY_EXPERIMENTS, experiments);
    writeStore(KEY_RECENT, recent);
  }

  /* ---------- 最近实验 ---------- */

  function touchRecent(id) {
    var idx = recent.items.indexOf(id);
    if (idx !== -1) recent.items.splice(idx, 1);
    recent.items.unshift(id);
    recent.items = recent.items.slice(0, CAP_RECENT);
    writeStore(KEY_RECENT, recent);
  }

  /** 最近实验快照列表（新→旧） */
  function recentExperiments() {
    var out = [];
    recent.items.forEach(function (id) {
      var e = expById(id);
      if (e) out.push(e);
    });
    return out;
  }

  /* ---------- 保存实验（显式收藏） ---------- */

  function saveExperiment(id, name) {
    var e = expById(id);
    if (!e) return null;
    if (name) e.name = name;
    if (!e.name) e.name = defaultName(e);
    e.saved = true;
    e.lastAt = Date.now();
    writeStore(KEY_EXPERIMENTS, experiments);
    touchRecent(id);
    return e;
  }

  function defaultName(e) {
    var f = String(e.formula || "").trim();
    if (f.length > 18) f = f.slice(0, 18) + "…";
    return f;
  }

  /* ---------- 预设 ---------- */

  function presetById(id) {
    for (var i = 0; i < presets.items.length; i++)
      if (presets.items[i].id === id) return presets.items[i];
    return null;
  }

  function addPreset(cfg) {
    var t = Date.now();
    var p = {
      id: uid("mlp"),
      name: cfg.name,
      type: cfg.type, formula: cfg.formula,
      params: cfg.params || {}, domain: cfg.domain || { min: "", max: "" },
      display: cfg.display || { grid: true, axes: true },
      builtin: false, createdAt: t, updatedAt: t
    };
    presets.items.unshift(p);
    if (presets.items.length > CAP_PRESETS) presets.items.pop();
    writeStore(KEY_PRESETS, presets);
    return p;
  }

  function updatePreset(id, cfg) {
    var p = presetById(id);
    if (!p) return null;
    if (cfg.name !== undefined) p.name = cfg.name;
    if (cfg.type !== undefined) p.type = cfg.type;
    if (cfg.formula !== undefined) p.formula = cfg.formula;
    if (cfg.params !== undefined) p.params = cfg.params;
    if (cfg.domain !== undefined) p.domain = cfg.domain;
    if (cfg.display !== undefined) p.display = cfg.display;
    p.updatedAt = Date.now();
    writeStore(KEY_PRESETS, presets);
    return p;
  }

  function deletePreset(id) {
    presets.items = presets.items.filter(function (p) { return p.id !== id; });
    writeStore(KEY_PRESETS, presets);
  }

  /* ---------- 导出 ---------- */

  window.VH_MathLab.data = {
    loadAll: loadAll,
    uid: uid,
    signature: signature,
    upsertExperiment: upsertExperiment,
    updateExperiment: updateExperiment,
    expById: expById,
    recentExperiments: recentExperiments,
    saveExperiment: saveExperiment,
    deleteExperiment: deleteExperiment,
    defaultName: defaultName,
    presetById: presetById,
    addPreset: addPreset,
    updatePreset: updatePreset,
    deletePreset: deletePreset,
    get presets() { return presets.items; },
    get experiments() { return experiments.items; }
  };
})();
