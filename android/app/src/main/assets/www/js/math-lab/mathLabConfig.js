/* ============================================================
   Math Lab · 实验配置页（生成类型注册表 + 动态表单 + 校验 + 规格构建）
   ------------------------------------------------------------
   挂载到 window.VH_MathLab.config。
   职责：类型选择、按类型渲染配置项、校验输入、构建绘图规格(spec)。
   页面外壳与按钮事件由 mathLab.js 注入绑定；Canvas 页消费 buildSpec。
   新增数学类型：在 TYPES 注册表加一项即可（字段+校验+spec 三段）。
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};
  var E = window.VH_MathLab.engine;

  /* ================= 工具 ================= */

  /** 空串 → null；非法 → undefined；合法 → 数值 */
  function parseNum(s) {
    if (s === null || s === undefined) return null;
    var t = String(s).trim().replace(/−/g, "-");
    if (t === "") return null;
    var v = parseFloat(t);
    return isFinite(v) ? v : undefined;
  }

  /** 公式轻量美化：^2/^3 → 上标 */
  function pretty(f) {
    return String(f || "").trim().replace(/\^2/g, "²").replace(/\^3/g, "³");
  }

  var hooks = { onGenerate: null }; // 由 mathLab.js 注入

  /* ================= 不定积分：带缓存的原函数闭包 ================= */

  /** F(x)=∫₀ˣf·dt：内部表格缓存，越界自动重建（锚点 0 固定，重建结果一致） */
  function makeAntiderivativeFn(f) {
    var cache = null; // {x0,x1,N,dx,ys[]}
    function rebuild(x0, x1) {
      var base = E.definiteIntegral(f, 0, x0);
      if (!isFinite(base)) base = 0; // 0 与 x0 间有奇点 → 退化为 F(x0)=0
      var N = 1000, dx = (x1 - x0) / N, ys = new Array(N + 1);
      var acc = base, prev = f(x0), prevOk = isFinite(prev);
      ys[0] = prevOk ? acc : null;
      for (var i = 1; i <= N; i++) {
        var x = x0 + i * dx, v = f(x);
        if (!isFinite(v) || !prevOk) {
          ys[i] = null; acc = 0; prevOk = isFinite(v);
          if (prevOk) { // 断点后重锚：从断点重新累积（跨奇点积分无意义）
            prev = v; ys[i] = 0; acc = 0; continue;
          }
        } else {
          acc += (prev + v) / 2 * dx;
          ys[i] = acc;
        }
        prev = v;
      }
      cache = { x0: x0, x1: x1, N: N, dx: dx, ys: ys };
    }
    return function (x) {
      if (!cache) rebuild(x - 4, x + 4);
      if (x < cache.x0 + cache.dx || x > cache.x1 - cache.dx) {
        var margin = Math.max(2, (cache.x1 - cache.x0) * 0.6);
        rebuild(Math.min(x, cache.x0) - margin, Math.max(x, cache.x1) + margin);
      }
      var idx = (x - cache.x0) / cache.dx;
      var i0 = Math.max(0, Math.floor(idx)), i1 = Math.min(cache.N, i0 + 1);
      var y0 = cache.ys[i0], y1 = cache.ys[i1];
      if (y0 === null || y1 === null) return NaN;
      var t = idx - i0;
      return y0 + (y1 - y0) * t;
    };
  }

  /* ================= y 轴智能适配 ================= */

  function fitYRange(fns, x0, x1, extraYs) {
    var ys = [];
    for (var g = 0; g < fns.length; g++) {
      var f = fns[g];
      for (var i = 0; i <= 240; i++) {
        var v = f(x0 + (x1 - x0) * i / 240);
        if (typeof v === "number" && isFinite(v) && Math.abs(v) < 1e9) ys.push(v);
      }
    }
    if (extraYs) extraYs.forEach(function (v) { if (isFinite(v)) ys.push(v); });
    if (!ys.length) return { y0: -5, y1: 5 };
    ys.sort(function (a, b) { return a - b; });
    var lo, hi;
    if (ys.length >= 40) { lo = ys[Math.floor(ys.length * 0.05)]; hi = ys[Math.floor(ys.length * 0.95)]; }
    else { lo = ys[0]; hi = ys[ys.length - 1]; }
    if (hi - lo < 1e-9) { var m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
    var pad = (hi - lo) * 0.18;
    return { y0: lo - pad, y1: hi + pad };
  }

  /* ================= 生成类型注册表 ================= */

  var TYPES = {
    /* ---------- 函数 ---------- */
    function: {
      label: "函数",
      hint: "输入函数公式，绘制图像。支持 sin cos tan exp ln log sqrt abs、^ 幂、pi / e 常数",
      fields: [
        { key: "formula", label: "函数公式 f(x)", kind: "expr", ph: "x^2 - 2x - 3", required: true },
        { key: "markX", label: "标注点 x₀（可选）", kind: "num", ph: "如 2，标注 (2, f(2))" }
      ],
      defaults: { formula: "x^2 - 2x - 3", markX: "" },
      validate: function (cfg) {
        var r = E.parseFormula(cfg.formula);
        if (r.error) return { ok: false, error: "公式错误：" + r.error };
        var mx = parseNum(cfg.params.markX);
        if (mx === undefined) return { ok: false, error: "标注点 x₀ 不是有效数字" };
        return { ok: true, data: { f: r.f, markX: mx } };
      },
      spec: function (exp, theme, v) {
        var layers = [{ kind: "curve", f: v.f, color: theme.curve1, width: 2.4 }];
        var info = ["f(x) = " + pretty(exp.formula)];
        var extras = [];
        if (v.markX !== null) {
          var y = v.f(v.markX);
          if (isFinite(y)) {
            layers.push({
              kind: "point", x: v.markX, y: y, color: theme.point, ring: theme.bg,
              label: "(" + E.fmtNum(v.markX) + ", " + E.fmtNum(y) + ")"
            });
            info.push("f(" + E.fmtNum(v.markX) + ") = " + E.fmtNum(y));
            extras.push(y);
          }
        }
        var fit = fitYRange([v.f], v.x0, v.x1, extras);
        return { layers: layers, fit: fit, info: info };
      }
    },

    /* ---------- 导数 ---------- */
    derivative: {
      label: "导数",
      hint: "输入原函数，可同时显示导函数曲线与指定点切线，直观理解导数的几何意义",
      fields: [
        { key: "formula", label: "原函数 f(x)", kind: "expr", ph: "x^3 - 2x", required: true },
        { key: "showDf", label: "同时显示导函数 f′(x)", kind: "toggle", def: true },
        { key: "showTangent", label: "显示切线", kind: "toggle", def: true },
        { key: "tangentX", label: "切点横坐标 x₀", kind: "num", ph: "如 1" }
      ],
      defaults: { formula: "x^3 - 2x", showDf: true, showTangent: true, tangentX: "1" },
      validate: function (cfg) {
        var r = E.parseFormula(cfg.formula);
        if (r.error) return { ok: false, error: "公式错误：" + r.error };
        if (cfg.params.showTangent) {
          var tx = parseNum(cfg.params.tangentX);
          if (tx === null || tx === undefined) return { ok: false, error: "请输入切点横坐标 x₀" };
        }
        return { ok: true, data: { f: r.f } };
      },
      spec: function (exp, theme, v) {
        var layers = [], info = ["f(x) = " + pretty(exp.formula)];
        var extras = [];
        var df = E.derivativeFn(v.f);
        layers.push({ kind: "curve", f: v.f, color: theme.curve1, width: 2.4 });
        var fns = [v.f];
        if (exp.params.showDf) {
          layers.push({ kind: "curve", f: df, color: theme.curve2, width: 2, dash: [7, 5] });
          fns.push(df);
          info.push("f′(x)：蓝色虚线");
        }
        if (exp.params.showTangent) {
          var x0 = parseNum(exp.params.tangentX);
          if (x0 !== null) {
            var y0 = v.f(x0), m = E.derivative(v.f, x0);
            if (isFinite(y0) && isFinite(m)) {
              var tf = function (x) { return y0 + m * (x - x0); };
              layers.push({ kind: "curve", f: tf, color: theme.tangent, width: 1.8, dash: [9, 5] });
              layers.push({
                kind: "point", x: x0, y: y0, color: theme.tangent, ring: theme.bg,
                label: "f′(" + E.fmtNum(x0) + ") = " + E.fmtNum(m)
              });
              fns.push(tf);
              info.push("切点 (" + E.fmtNum(x0) + ", " + E.fmtNum(y0) + ") · 斜率 f′(x₀) = " + E.fmtNum(m));
              extras.push(y0);
            }
          }
        }
        var fit = fitYRange(fns, v.x0, v.x1, extras);
        return { layers: layers, fit: fit, info: info };
      }
    },

    /* ---------- 不定积分 ---------- */
    indefinite: {
      label: "不定积分",
      hint: "输入被积函数，绘制一个原函数 F(x)=∫f(x)dx + C（数值积分），可调 C 观察曲线族平移",
      fields: [
        { key: "formula", label: "被积函数 f(x)", kind: "expr", ph: "x^2", required: true },
        { key: "c", label: "常数 C", kind: "num", ph: "默认 0，可输入任意常数" }
      ],
      defaults: { formula: "x^2", c: "0" },
      validate: function (cfg) {
        var r = E.parseFormula(cfg.formula);
        if (r.error) return { ok: false, error: "公式错误：" + r.error };
        return { ok: true, data: { f: r.f } };
      },
      spec: function (exp, theme, v) {
        var c = parseNum(exp.params.c);
        if (c === null || c === undefined) c = 0;
        var F0 = makeAntiderivativeFn(v.f);
        var F = function (x) { return F0(x) + c; };
        var layers = [
          { kind: "curve", f: v.f, color: theme.curve3, width: 1.6, dash: [4, 4] },
          { kind: "curve", f: F, color: theme.curve1, width: 2.4 }
        ];
        var info = ["F(x) = ∫ " + pretty(exp.formula) + " dx" + (c ? (" + " + E.fmtNum(c)) : "") + "（橙虚线为 f(x)）"];
        var fit = fitYRange([v.f, F], v.x0, v.x1);
        return { layers: layers, fit: fit, info: info };
      }
    },

    /* ---------- 定积分 ---------- */
    definite: {
      label: "定积分",
      hint: "输入被积函数与积分上下限，直观显示积分区域面积与计算结果",
      fields: [
        { key: "formula", label: "被积函数 f(x)", kind: "expr", ph: "x^2", required: true },
        { key: "a", label: "积分下限 a", kind: "num", ph: "如 0", required: true },
        { key: "b", label: "积分上限 b", kind: "num", ph: "如 2", required: true }
      ],
      defaults: { formula: "x^2", a: "0", b: "2" },
      validate: function (cfg) {
        var r = E.parseFormula(cfg.formula);
        if (r.error) return { ok: false, error: "公式错误：" + r.error };
        var a = parseNum(cfg.params.a), b = parseNum(cfg.params.b);
        if (a === null || a === undefined) return { ok: false, error: "请输入积分下限 a" };
        if (b === null || b === undefined) return { ok: false, error: "请输入积分上限 b" };
        if (a === b) return { ok: false, error: "上下限不能相同" };
        return { ok: true, data: { f: r.f, a: a, b: b } };
      },
      spec: function (exp, theme, v) {
        var val = E.definiteIntegral(v.f, v.a, v.b);
        var lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
        var layers = [
          { kind: "area", f: v.f, a: v.a, b: v.b, color: theme.areaFill },
          { kind: "curve", f: v.f, color: theme.curve1, width: 2.4 },
          { kind: "vline", x: v.a, color: theme.curve2, width: 1.4 },
          { kind: "vline", x: v.b, color: theme.curve2, width: 1.4 }
        ];
        var info = ["∫[" + E.fmtNum(v.a) + ", " + E.fmtNum(v.b) + "] " + pretty(exp.formula) + " dx = " +
          (isNaN(val) ? "无法计算（区间可能含奇点）" : E.fmtNum(val, 8))];
        var span = hi - lo;
        var fx0 = lo - Math.max(span * 0.55, 0.6), fx1 = hi + Math.max(span * 0.55, 0.6);
        var extras = [v.f(v.a), v.f(v.b)];
        var fit = fitYRange([v.f], fx0, fx1, extras);
        return { layers: layers, fit: { x0: fx0, x1: fx1, y0: fit.y0, y1: fit.y1 }, info: info };
      }
    },

    /* ---------- 极限 ---------- */
    limit: {
      label: "极限",
      hint: "输入函数与趋近目标（数字 / inf / -inf），数值估计极限并绘制趋近过程",
      fields: [
        { key: "formula", label: "函数 f(x)", kind: "expr", ph: "sin(x)/x", required: true },
        { key: "varName", label: "趋近变量", kind: "text", ph: "默认 x" },
        { key: "target", label: "趋近目标", kind: "text", ph: "数字，或 inf / -inf", required: true },
        { key: "side", label: "趋近方向", kind: "select", options: [["both", "双侧"], ["left", "左极限"], ["right", "右极限"]], def: "both" }
      ],
      defaults: { formula: "sin(x)/x", varName: "x", target: "0", side: "both" },
      validate: function (cfg) {
        var vn = String(cfg.params.varName || "x").trim().toLowerCase();
        if (!/^[a-z]$/.test(vn) || vn === "e") return { ok: false, error: "趋近变量须为单字母（e 除外）" };
        var r = E.parseFormula(cfg.formula, vn);
        if (r.error) return { ok: false, error: "公式错误：" + r.error };
        var t = E.parseLimitTarget(cfg.params.target);
        if (!t.ok) return { ok: false, error: t.error };
        return { ok: true, data: { f: r.f, vn: vn, target: t.v } };
      },
      spec: function (exp, theme, v) {
        var res = E.estimateLimit(v.f, v.target, exp.params.side || "both");
        var layers = [{ kind: "curve", f: v.f, color: theme.curve1, width: 2.4 }];
        var info = [];
        var tName = v.target === Infinity ? "∞" : v.target === -Infinity ? "-∞" : E.fmtNum(v.target);
        var arrow = "x→" + tName;
        var sideTxt = exp.params.side === "left" ? "左极限 " : exp.params.side === "right" ? "右极限 " : "";
        var L = res.value;
        if (exp.params.side === "both" && !res.same && res.left !== null && res.right !== null) {
          info.push("lim " + arrow + "：左 = " + E.fmtNum(res.left) + "，右 = " + E.fmtNum(res.right) + "（两侧不同，极限不存在）");
        } else {
          info.push("lim " + sideTxt + arrow + " f(x) = " + (L === null ? "不存在（或震荡）" : E.fmtNum(L, 8)));
        }
        var extras = [];
        if (isFinite(L)) extras.push(L);
        var fx0, fx1;
        if (v.target === Infinity) { fx0 = 0; fx1 = 30; }
        else if (v.target === -Infinity) { fx0 = -30; fx1 = 0; }
        else { fx0 = v.target - 3; fx1 = v.target + 3; }
        if (isFinite(v.target)) {
          layers.push({ kind: "vline", x: v.target, color: theme.curve2, width: 1.4 });
          var ft = v.f(v.target);
          if (isFinite(ft)) {
            layers.push({ kind: "point", x: v.target, y: ft, color: theme.bg, ring: theme.curve2, label: "f(" + E.fmtNum(v.target) + ") = " + E.fmtNum(ft) });
            extras.push(ft);
          }
        }
        if (isFinite(L)) {
          layers.push({ kind: "point", x: v.target, y: L, color: theme.point, ring: theme.bg, label: "极限 = " + E.fmtNum(L) });
        }
        var fit = fitYRange([v.f], fx0, fx1, extras);
        return { layers: layers, fit: { x0: fx0, x1: fx1, y0: fit.y0, y1: fit.y1 }, info: info };
      }
    },

    /* ---------- 代数 ---------- */
    algebra: {
      label: "代数",
      hint: "输入代数表达式或方程（如 x^2-2x-3=0），绘制曲线并求范围内全部根",
      fields: [
        { key: "formula", label: "表达式 / 方程", kind: "expr", ph: "x^2 - 2x - 3 = 0", required: true }
      ],
      defaults: { formula: "x^2 - 2x - 3 = 0" },
      validate: function (cfg) {
        var parts = String(cfg.formula).split("=");
        if (parts.length > 2) return { ok: false, error: "方程只能包含一个 =" };
        var r1 = E.parseFormula(parts[0]);
        if (r1.error) return { ok: false, error: "公式错误：" + r1.error };
        var rhs = null;
        if (parts.length === 2) {
          var r2 = E.parseFormula(parts[1]);
          if (r2.error) return { ok: false, error: "等号右侧错误：" + r2.error };
          rhs = r2.f;
        }
        return { ok: true, data: { lhs: r1.f, rhs: rhs } };
      },
      spec: function (exp, theme, v) {
        var isEq = v.rhs !== null;
        var g = isEq ? function (x) { return v.lhs(x) - v.rhs(x); } : v.lhs;
        var layers = [{ kind: "curve", f: g, color: theme.curve1, width: 2.4 }];
        var info = [];
        var roots = E.findRoots(g, v.x0, v.x1);
        if (isEq) {
          if (roots.length === 0) info.push("方程在当前范围内无实数解（可调整定义域后重新生成）");
          else if (roots.length > 8) {
            info.push("解：x = " + roots.slice(0, 8).map(function (r) { return E.fmtNum(r, 6); }).join("、") + " …（共 " + roots.length + " 个）");
          } else {
            info.push("解：x = " + roots.map(function (r) { return E.fmtNum(r, 6); }).join("、"));
          }
          roots.slice(0, 24).forEach(function (r) {
            layers.push({ kind: "point", x: r, y: 0, color: theme.point, ring: theme.bg });
          });
        } else {
          info.push("y = " + pretty(exp.formula));
        }
        var fit = fitYRange([g], v.x0, v.x1, [0]);
        return { layers: layers, fit: fit, info: info };
      }
    }
  };

  var ORDER = ["function", "derivative", "indefinite", "definite", "limit", "algebra"];

  /* ================= 配置状态与表单渲染 ================= */

  var state = { type: "function", draft: {}, presetId: null };
  var $ = null, esc = null, showToast = null; // 由 mathLab.js 注入依赖

  function injectDeps(deps) {
    $ = deps.$; esc = deps.esc; showToast = deps.showToast;
  }

  function resetDraft(type, from) {
    var t = TYPES[type];
    var d = {};
    t.fields.forEach(function (f) {
      d[f.key] = f.def !== undefined ? f.def : "";
    });
    if (from) {
      t.fields.forEach(function (f) {
        if (from.params && from.params[f.key] !== undefined) d[f.key] = from.params[f.key];
      });
      d.formula = from.formula !== undefined ? from.formula : d.formula;
    }
    state.draft = d;
  }

  function domainOf(from) {
    var dom = (from && from.domain) || {};
    return { min: dom.min != null ? String(dom.min) : "", max: dom.max != null ? String(dom.max) : "" };
  }

  var domain = { min: "", max: "" };
  var display = { grid: true, axes: true };

  /** 打开配置页：opts = {type, preset, experiment} */
  function open(opts) {
    opts = opts || {};
    state.type = TYPES[opts.type] ? opts.type : "function";
    state.presetId = opts.preset ? opts.preset.id : null;
    var from = opts.preset || opts.experiment || null;
    resetDraft(state.type, from);
    domain = domainOf(from);
    display = (from && from.display) ? { grid: from.display.grid !== false, axes: from.display.axes !== false } : { grid: true, axes: true };
    renderAll();
  }

  function renderAll() {
    renderTypeChips();
    renderForm();
    renderPresetBtns();
  }

  function renderTypeChips() {
    var el = $("#ml-type-chips");
    el.innerHTML = ORDER.map(function (k) {
      return '<button class="ml-chip' + (k === state.type ? " on" : "") + '" data-mltype="' + k + '" type="button">' + TYPES[k].label + "</button>";
    }).join("");
  }

  function fieldHTML(f) {
    var v = state.draft[f.key] !== undefined ? state.draft[f.key] : "";
    if (f.kind === "toggle") {
      var on = v === true || v === "true";
      return '<div class="ml-field ml-field-toggle">' +
        '<label class="ml-switch"><input type="checkbox" data-mlkey="' + f.key + '"' + (on ? " checked" : "") + '><span class="ml-switch-track"><span class="ml-switch-knob"></span></span><span class="ml-switch-label">' + esc(f.label) + "</span></label></div>";
    }
    if (f.kind === "select") {
      return '<div class="ml-field"><p class="ml-field-label">' + esc(f.label) + '</p><div class="ml-seg">' +
        f.options.map(function (o) {
          return '<button class="ml-seg-btn' + (v === o[0] ? " on" : "") + '" data-mlsel="' + f.key + '" data-mlval="' + o[0] + '" type="button">' + esc(o[1]) + "</button>";
        }).join("") + "</div></div>";
    }
    var inputCls = f.kind === "expr" ? "ml-input ml-input-expr" : "ml-input";
    var h = '<div class="ml-field">' +
      '<p class="ml-field-label">' + esc(f.label) + (f.required ? '<span class="ml-req">*</span>' : "") + "</p>" +
      '<input class="' + inputCls + '" data-mlkey="' + f.key + '" type="text" inputmode="' + (f.kind === "num" ? "decimal" : "text") + '" autocomplete="off" placeholder="' + esc(f.ph || "") + '" value="' + esc(String(v)) + '">';
    if (f.key === "formula") {
      h += '<p class="ml-parse" data-mlparse hidden></p>';
    }
    h += "</div>";
    return h;
  }

  function renderForm() {
    var t = TYPES[state.type];
    var h = '<p class="ml-type-hint">' + esc(t.hint) + "</p>" +
      t.fields.map(fieldHTML).join("");

    // 定义域（极限类型不适用）
    if (state.type !== "limit") {
      h += '<div class="ml-field ml-domain">' +
        '<p class="ml-field-label">定义域 x ∈（可选，留空自动适配）</p>' +
        '<div class="ml-domain-row">' +
        '<input class="ml-input" data-mlkey="__dmin" type="text" inputmode="decimal" autocomplete="off" placeholder="最小值，如 -5" value="' + esc(domain.min) + '">' +
        '<span class="ml-domain-sep">→</span>' +
        '<input class="ml-input" data-mlkey="__dmax" type="text" inputmode="decimal" autocomplete="off" placeholder="最大值，如 5" value="' + esc(domain.max) + '">' +
        "</div></div>";
    }

    // 显示选项
    h += '<div class="ml-field ml-field-toggle"><p class="ml-field-label ml-field-label-gap">显示选项</p>' +
      '<label class="ml-switch"><input type="checkbox" data-mlkey="__grid"' + (display.grid ? " checked" : "") + '><span class="ml-switch-track"><span class="ml-switch-knob"></span></span><span class="ml-switch-label">网格</span></label>' +
      '<label class="ml-switch"><input type="checkbox" data-mlkey="__axes"' + (display.axes ? " checked" : "") + '><span class="ml-switch-track"><span class="ml-switch-knob"></span></span><span class="ml-switch-label">坐标轴</span></label></div>';

    $("#ml-form").innerHTML = h;
    checkFormula();
  }

  function renderPresetBtns() {
    var upd = $("#ml-preset-update");
    if (upd) upd.hidden = !state.presetId;
  }

  /* ---------- 公式即时校验 ---------- */

  var parseTimer = null;
  function checkFormula() {
    var el = $("#ml-form [data-mlparse]");
    if (!el) return;
    var formula = state.draft.formula || "";
    if (!String(formula).trim()) { el.hidden = true; return; }
    var varName = state.type === "limit" ? (String(state.draft.varName || "x").trim().toLowerCase() || "x") : "x";
    var r;
    if (state.type === "algebra") {
      var parts = String(formula).split("=");
      r = E.parseFormula(parts[0], varName);
      if (!r.error && parts.length === 2) r = E.parseFormula(parts[1], varName);
      if (parts.length > 2) r = { error: "方程只能包含一个 =" };
    } else {
      r = E.parseFormula(formula, varName);
    }
    el.hidden = false;
    if (r.error) { el.textContent = "✕ " + r.error; el.className = "ml-parse ml-parse-err"; }
    else { el.textContent = "✓ 公式有效"; el.className = "ml-parse ml-parse-ok"; }
  }

  /* ---------- 表单交互（mathLab.js 委托调用） ---------- */

  function onSelectType(type) {
    if (!TYPES[type] || type === state.type) return;
    state.type = type;
    state.presetId = null; // 切类型 = 离开预设上下文
    resetDraft(type, null);
    domain = { min: "", max: "" };
    renderAll();
  }

  function onInput(key, value) {
    if (key === "__dmin") { domain.min = value; return; }
    if (key === "__dmax") { domain.max = value; return; }
    state.draft[key] = value;
    if (key === "formula" || key === "varName") {
      clearTimeout(parseTimer);
      parseTimer = setTimeout(checkFormula, 220);
    }
  }

  function onToggle(key, checked) {
    if (key === "__grid") { display.grid = checked; return; }
    if (key === "__axes") { display.axes = checked; return; }
    state.draft[key] = checked;
  }

  function onSelect(key, val) {
    state.draft[key] = val;
  }

  /* ---------- 收集 + 校验 + 生成 ---------- */

  function collectConfig() {
    return {
      type: state.type,
      formula: String(state.draft.formula || "").trim(),
      params: JSON.parse(JSON.stringify(state.draft)),
      domain: { min: domain.min.trim(), max: domain.max.trim() },
      display: { grid: display.grid, axes: display.axes }
    };
  }

  /** 完整校验（含定义域）→ {ok, error, exp, data} */
  function validateAndBuild() {
    var cfg = collectConfig();
    var t = TYPES[cfg.type];
    var vr = t.validate(cfg);
    if (!vr.ok) return { ok: false, error: vr.error };

    // 定义域校验
    var dmin = parseNum(cfg.domain.min), dmax = parseNum(cfg.domain.max);
    if (dmin === undefined) return { ok: false, error: "定义域最小值无效" };
    if (dmax === undefined) return { ok: false, error: "定义域最大值无效" };
    if (dmin !== null && dmax !== null && dmin >= dmax) return { ok: false, error: "定义域最小值须小于最大值" };

    // 默认取景窗口（x 范围）
    var x0, x1;
    if (dmin !== null && dmax !== null) { x0 = dmin; x1 = dmax; }
    else if (cfg.type === "definite") {
      var a = vr.data.a, b = vr.data.b;
      var span = Math.abs(b - a);
      x0 = Math.min(a, b) - Math.max(span * 0.55, 0.6);
      x1 = Math.max(a, b) + Math.max(span * 0.55, 0.6);
    } else if (cfg.type === "limit") {
      var tg = vr.data.target;
      if (tg === Infinity) { x0 = 0; x1 = 30; }
      else if (tg === -Infinity) { x0 = -30; x1 = 0; }
      else { x0 = tg - 3; x1 = tg + 3; }
    } else if (cfg.type === "algebra") { x0 = -8; x1 = 8; }
    else {
      // 含标注点/切点时窗口覆盖之
      var marks = [];
      if (cfg.type === "function" && vr.data.markX !== null) marks.push(vr.data.markX);
      if (cfg.type === "derivative") {
        var tx = parseNum(cfg.params.tangentX);
        if (cfg.params.showTangent && tx !== null) marks.push(tx);
      }
      x0 = -6; x1 = 6;
      marks.forEach(function (m) {
        if (m < x0 + 1) x0 = m - 2;
        if (m > x1 - 1) x1 = m + 2;
      });
    }

    var exp = {
      type: cfg.type, formula: cfg.formula, params: cfg.params,
      domain: cfg.domain, display: cfg.display, view: null, name: ""
    };
    return { ok: true, exp: exp, data: vr.data, x0: x0, x1: x1 };
  }

  /** 生成（由 mathLab.js 的「生成」按钮调用）→ 实验体（已入库置顶最近） */
  function generate() {
    var r = validateAndBuild();
    if (!r.ok) {
      if (showToast) showToast(r.error);
      return null;
    }
    var D = window.VH_MathLab.data;
    var stored = D.upsertExperiment(r.exp); // 签名去重 + 置顶最近
    stored.__fitX0 = r.x0; stored.__fitX1 = r.x1; // 首次取景窗口（内存态，不持久化）
    if (hooks.onGenerate) hooks.onGenerate(stored);
    return stored;
  }

  /* ---------- 规格构建（Canvas 页调用） ---------- */
  // 返回 {layers, fit:{x0,x1,y0,y1}, info[], error}

  function buildSpec(exp, theme) {
    var t = TYPES[exp.type];
    if (!t) return { layers: [], fit: { x0: -6, x1: 6, y0: -5, y1: 5 }, info: [], error: "未知类型" };
    var cfg = {
      type: exp.type, formula: exp.formula, params: exp.params || {},
      domain: exp.domain || { min: "", max: "" }, display: exp.display || { grid: true, axes: true }
    };
    var vr = t.validate(cfg);
    if (!vr.ok) return { layers: [], fit: { x0: -6, x1: 6, y0: -5, y1: 5 }, info: [], error: vr.error };

    // x 窗口：优先实验持久化视图 → 生成时窗口 → 定义域 → 默认
    var x0, x1;
    var dmin = parseNum(cfg.domain.min), dmax = parseNum(cfg.domain.max);
    if (exp.__fitX0 !== undefined && exp.__fitX1 !== undefined) { x0 = exp.__fitX0; x1 = exp.__fitX1; }
    else if (dmin !== null && dmax !== null) { x0 = dmin; x1 = dmax; }
    else if (exp.type === "definite") {
      var a = vr.data.a, b = vr.data.b, span = Math.abs(b - a);
      x0 = Math.min(a, b) - Math.max(span * 0.55, 0.6);
      x1 = Math.max(a, b) + Math.max(span * 0.55, 0.6);
    } else if (exp.type === "limit") {
      var tg = vr.data.target;
      if (tg === Infinity) { x0 = 0; x1 = 30; }
      else if (tg === -Infinity) { x0 = -30; x1 = 0; }
      else { x0 = tg - 3; x1 = tg + 3; }
    } else if (exp.type === "algebra") { x0 = -8; x1 = 8; }
    else {
      x0 = -6; x1 = 6;
      if (exp.type === "function" && vr.data.markX !== null) {
        if (vr.data.markX < x0 + 1) x0 = vr.data.markX - 2;
        if (vr.data.markX > x1 - 1) x1 = vr.data.markX + 2;
      }
      if (exp.type === "derivative" && exp.params.showTangent) {
        var tx = parseNum(exp.params.tangentX);
        if (tx !== null) {
          if (tx < x0 + 1) x0 = tx - 2;
          if (tx > x1 - 1) x1 = tx + 2;
        }
      }
    }
    // 恢复最近实验：有历史视图则按视图反推窗口（fit 仅作初始化参考）
    if (exp.view && isFinite(exp.view.cx)) {
      var halfW = 5;
      x0 = exp.view.cx - halfW; x1 = exp.view.cx + halfW;
    }

    try {
      var out = t.spec(exp, theme, { f: vr.data.f, lhs: vr.data.lhs, rhs: vr.data.rhs, markX: vr.data.markX, a: vr.data.a, b: vr.data.b, vn: vr.data.vn, target: vr.data.target, x0: x0, x1: x1 });
      out.fit.x0 = x0; out.fit.x1 = x1;
      out.error = null;
      return out;
    } catch (err) {
      return { layers: [], fit: { x0: x0, x1: x1, y0: -5, y1: 5 }, info: [], error: "计算失败：" + (err && err.message) };
    }
  }

  /* ---------- 导出 ---------- */

  window.VH_MathLab.config = {
    TYPES: TYPES,
    ORDER: ORDER,
    injectDeps: injectDeps,
    setHooks: function (h) { hooks = h; },
    open: open,
    onSelectType: onSelectType,
    onInput: onInput,
    onToggle: onToggle,
    onSelect: onSelect,
    generate: generate,
    buildSpec: buildSpec,
    collectConfig: collectConfig,
    get type() { return state.type; },
    get presetId() { return state.presetId; },
    set presetId(id) { state.presetId = id; renderPresetBtns(); }
  };
})();
