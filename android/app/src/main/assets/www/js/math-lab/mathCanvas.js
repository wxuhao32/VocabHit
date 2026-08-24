/* ============================================================
   Math Lab · Math Canvas 三级页（沉浸式数学画布 · 极简交互版）
   ------------------------------------------------------------
   挂载到 window.VH_MathLab.canvas。
   页面 DOM 由 mathLab.js 注入（#page-math-canvas），本模块负责：
   - 画布渲染与 DPR 适配
   - 智能最佳视野：生成时 autoView 分析曲线特征（零点/极值/积分区间）
   - 手势交互：单指拖动 / 双指捏合 / 滚轮 / 双击复位（平滑动画）
   - 指针处世界坐标读数（十字准线）
   - 「⋯」菜单：重置视图 / 网格 / 坐标轴 / 保存实验 / 导出 PNG
   设计理念：整个屏幕 ≈ 数学画布，操作尽量手势化。
   页面栈：config(生成) / lab(最近实验) → canvas
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};
  var R = null, C = null, D = null; // renderer / config / data（延迟取）

  /* ================= 状态 ================= */

  var st = {
    exp: null,          // 当前实验体
    source: "lab",      // 进入来源："config"(新生成) | "lab"(最近实验)
    spec: null,         // buildSpec 结果 {layers, fit, info}
    theme: null,
    view: null,         // {cx, cy, scale}
    homeView: null,     // 最佳视野（autoView 计算，双击复位目标）
    display: { grid: true, axes: true },
    crosshair: null,    // {x, y} 指针世界坐标
    raf: 0,
    anim: 0,            // 视图动画 rAF id
    hintShown: false    // 手势提示是否已展示过（本次会话）
  };

  function modules() {
    R = R || window.VH_MathLab.renderer;
    C = C || window.VH_MathLab.config;
    D = D || window.VH_MathLab.data;
  }

  function $(sel) { return document.querySelector(sel); }

  /* ================= 进入画布 ================= */

  /** 打开画布：exp 为已入库实验体；source: "config"|"lab"
      source === "config"（刚生成）→ 忽略历史视图，强制智能最佳视野 */
  function open(exp, source) {
    modules();
    st.exp = exp;
    st.source = source || "lab";
    st.display = { grid: exp.display ? exp.display.grid !== false : true, axes: exp.display ? exp.display.axes !== false : true };
    st.crosshair = null;
    st.theme = R.themeFromCSS();

    st.spec = C.buildSpec(exp, st.theme);
    if (st.spec.error) { showToastSafe(st.spec.error); }

    // 顶部公式（即标题）+ 底部信息条
    var formula = $("#ml-cv-title");
    if (formula) formula.textContent = specFormula(exp);
    var infoEl = $("#ml-cv-info");
    if (infoEl) {
      var lines = (st.spec.info || []).filter(Boolean);
      infoEl.innerHTML = lines.map(function (l) { return "<p>" + escHtml(l) + "</p>"; }).join("");
      infoEl.hidden = lines.length === 0;
    }
    updateToggleUI();

    switchTabSafe("math-canvas");
    document.body.classList.add("ml-canvas-active"); // 沉浸模式：隐藏底部 tabbar
    // 页面激活后才可测量尺寸：两帧后初始化画布
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        initCanvas();
        saveViewDebounced(); // 首次进入即记录视图（保证最近实验可恢复）
        showHint();
      });
    });
  }

  function specFormula(exp) {
    var f = String(exp.formula || "").trim();
    var t = exp.type;
    if (t === "derivative") return "f(x) = " + f;
    if (t === "indefinite") return "∫ " + f + " dx";
    if (t === "definite") {
      var a = (exp.params && exp.params.a) || "0", b = (exp.params && exp.params.b) || "0";
      return "∫[" + a + ", " + b + "] " + f + " dx";
    }
    if (t === "limit") {
      var tg = (exp.params && exp.params.target) || "0";
      return "lim x→" + tg + " " + f;
    }
    return (t === "algebra" && f.indexOf("=") === -1) ? "y = " + f : f;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ================= 画布与视图 ================= */

  var canvas = null, ctx = null, cssW = 0, cssH = 0;

  function initCanvas() {
    canvas = canvas || $("#ml-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    bindInteractions();
    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 智能最佳视野：分析曲线特征（零点/极值/积分区间/标注点）自动取景
    st.homeView = R.autoView(st.spec, cssW, cssH);
    var v = st.exp.view;
    if (st.source !== "config" && v && isFinite(v.cx) && isFinite(v.cy) && isFinite(v.scale) && v.scale > 0) {
      st.view = { cx: v.cx, cy: v.cy, scale: v.scale }; // 最近实验：恢复上次视图
    } else {
      st.view = { cx: st.homeView.cx, cy: st.homeView.cy, scale: st.homeView.scale };
    }
    render();
  }

  function render() {
    if (!ctx || !st.view) return;
    R.render(ctx, {
      width: cssW, height: cssH,
      view: st.view, theme: st.theme,
      display: st.display, layers: (st.spec && st.spec.layers) || [],
      crosshair: st.crosshair
    });
  }

  function scheduleRender() {
    if (st.raf) return;
    st.raf = requestAnimationFrame(function () { st.raf = 0; render(); });
  }

  /* ---------- 视图操作 ---------- */

  function clampScale(s) { return Math.min(Math.max(s, 0.5), 20000); }

  /** 以屏幕点 (sx,sy) 为中心缩放 factor 倍 */
  function zoomAt(sx, sy, factor) {
    cancelAnim();
    var v = st.view;
    var wx = (sx - cssW / 2) / v.scale + v.cx;
    var wy = (cssH / 2 - sy) / v.scale + v.cy;
    var ns = clampScale(v.scale * factor);
    v.cx = wx - (sx - cssW / 2) / ns;
    v.cy = wy + (sy - cssH / 2) / ns;
    v.scale = ns;
    scheduleRender();
    saveViewDebounced();
  }

  function panBy(dx, dy) {
    cancelAnim();
    st.view.cx -= dx / st.view.scale;
    st.view.cy += dy / st.view.scale;
    scheduleRender();
    saveViewDebounced();
  }

  /* ---------- 平滑视图动画（双击复位 / 缩放过渡） ---------- */

  function cancelAnim() {
    if (st.anim) { cancelAnimationFrame(st.anim); st.anim = 0; }
  }

  /** 从当前视图平滑过渡到 target（cx/cy 线性、scale 对数空间插值） */
  function animateTo(target, dur) {
    if (!st.view || !target) return;
    cancelAnim();
    var from = { cx: st.view.cx, cy: st.view.cy, scale: st.view.scale };
    var t0 = 0;
    try { t0 = performance.now(); } catch (e) { t0 = Date.now(); }
    var D = dur || 280;
    function step(now) {
      var t = Math.min(1, (now - t0) / D);
      var e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      st.view = {
        cx: from.cx + (target.cx - from.cx) * e,
        cy: from.cy + (target.cy - from.cy) * e,
        scale: from.scale * Math.pow(target.scale / from.scale, e) // 几何插值
      };
      render();
      if (t < 1) st.anim = requestAnimationFrame(step);
      else { st.anim = 0; saveViewDebounced(); }
    }
    st.anim = requestAnimationFrame(step);
  }

  /** 双击复位：平滑回到智能最佳视野 */
  function resetView() {
    if (!st.homeView) return;
    st.crosshair = null;
    hideCoord();
    animateTo(st.homeView, 300);
    if (typeof showToast === "function") showToast("已回到最佳视野");
  }

  /* ---------- 视图持久化（防抖） ---------- */

  var saveTimer = 0;
  function saveViewDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!st.exp || !st.view || !D) return;
      D.updateExperiment(st.exp.id, {
        view: { cx: st.view.cx, cy: st.view.cy, scale: st.view.scale }
      });
      if (window.VH_MathLab.onExperimentChanged) window.VH_MathLab.onExperimentChanged();
    }, 600);
  }

  /* ================= 交互：拖动 / 双指 / 滚轮 / 双击 / 坐标 ================= */

  var bound = false;
  var touch = { // 单指拖动状态
    active: false, id: -1, sx: 0, sy: 0, lx: 0, ly: 0, moved: false, t0: 0
  };
  var pinch = { // 双指捏合状态
    active: false, d0: 0, scale0: 0
  };
  var lastTap = { t: 0, x: 0, y: 0 }; // 双击检测

  function bindInteractions() {
    if (bound || !canvas) return;
    bound = true;

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    // 桌面 / WebView 鼠标
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onHover);
    canvas.addEventListener("mouseleave", function () { hideCoord(); st.crosshair = null; scheduleRender(); });
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", function (e) {
      e.preventDefault();
      resetView();
    });

    // 尺寸变化（旋转 / 键盘弹出）
    window.addEventListener("resize", onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
  }

  function onResize() {
    // 严格绑定画布页：仅 Math Canvas 为当前激活页才响应（旋转/本页键盘弹出）；
    // 其他页面弹输入法引起的 viewport 变化一律忽略，避免跨页面联动
    if (!isActive()) return;
    if (!canvas || !canvas.offsetParent) return;
    var wrap = canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cssW = rect.width; cssH = rect.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  /* ---------- 触摸 ---------- */

  function onTouchStart(e) {
    if (!st.view) return;
    hideHint();
    if (e.touches.length === 1) {
      var t = e.touches[0];
      touch.active = true; touch.id = t.identifier;
      touch.sx = touch.lx = t.clientX; touch.sy = touch.ly = t.clientY;
      touch.moved = false;
      touch.t0 = Date.now();
      pinch.active = false;
      showCoordAt(t.clientX, t.clientY);
    } else if (e.touches.length === 2) {
      touch.active = false;
      pinch.active = true;
      var a = e.touches[0], b = e.touches[1];
      pinch.d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      pinch.scale0 = st.view.scale;
      hideCoord();
    }
    e.preventDefault(); // 阻止页面滚动/双击缩放
  }

  function onTouchMove(e) {
    if (!st.view) return;
    if (pinch.active && e.touches.length === 2) {
      var a = e.touches[0], b = e.touches[1];
      var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      var midX = (a.clientX + b.clientX) / 2, midY = (a.clientY + b.clientY) / 2;
      var target = clampScale(pinch.scale0 * d / pinch.d0);
      var factor = target / st.view.scale;
      var rect = canvas.getBoundingClientRect();
      zoomAt(midX - rect.left, midY - rect.top, factor);
      e.preventDefault();
      return;
    }
    if (touch.active && e.touches.length === 1) {
      var t = e.touches[0];
      if (t.identifier !== touch.id) return;
      var dx = t.clientX - touch.lx, dy = t.clientY - touch.ly;
      if (Math.abs(t.clientX - touch.sx) > 3 || Math.abs(t.clientY - touch.sy) > 3) touch.moved = true;
      touch.lx = t.clientX; touch.ly = t.clientY;
      panBy(dx, dy);
      showCoordAt(t.clientX, t.clientY);
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (pinch.active && e.touches.length < 2) pinch.active = false;
    if (touch.active && e.touches.length === 0) {
      touch.active = false;
      var now = Date.now();
      if (!touch.moved) {
        // 双击检测：300ms 内两次轻点且位置接近 → 复位最佳视野
        if (now - lastTap.t < 300 && Math.hypot(touch.lx - lastTap.x, touch.ly - lastTap.y) < 28) {
          lastTap.t = 0;
          resetView();
          return;
        }
        lastTap = { t: now, x: touch.lx, y: touch.ly };
        pinCrosshair(touch.lx, touch.ly); // 单击：准线停留，便于读数
      }
    }
  }

  /* ---------- 鼠标（桌面 / WebView） ---------- */

  var mouseDown = false;

  function onMouseDown(e) {
    if (!st.view) return;
    hideHint();
    mouseDown = true;
    touch.lx = e.clientX; touch.ly = e.clientY;
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!mouseDown || !st.view) return;
    var dx = e.clientX - touch.lx, dy = e.clientY - touch.ly;
    touch.lx = e.clientX; touch.ly = e.clientY;
    panBy(dx, dy);
  }

  function onMouseUp() { mouseDown = false; }

  function onHover(e) {
    if (!st.view || mouseDown || pinch.active) return;
    showCoordAt(e.clientX, e.clientY);
  }

  function onWheel(e) {
    if (!st.view) return;
    e.preventDefault();
    hideHint();
    var rect = canvas.getBoundingClientRect();
    var factor = Math.pow(1.0016, -e.deltaY); // deltaY>0 下滚 → 缩小
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  /* ---------- 坐标读数 ---------- */

  function worldAt(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var sx = clientX - rect.left, sy = clientY - rect.top;
    var v = st.view;
    return {
      x: (sx - cssW / 2) / v.scale + v.cx,
      y: (cssH / 2 - sy) / v.scale + v.cy,
      inside: sx >= 0 && sx <= cssW && sy >= 0 && sy <= cssH
    };
  }

  function showCoordAt(clientX, clientY) {
    if (!st.view) return;
    var w = worldAt(clientX, clientY);
    var el = $("#ml-cv-coord");
    if (el) {
      el.textContent = "(" + fmt(w.x) + ", " + fmt(w.y) + ")";
      el.hidden = false;
    }
    st.crosshair = { x: w.x, y: w.y };
    scheduleRender();
  }

  function pinCrosshair(clientX, clientY) {
    showCoordAt(clientX, clientY); // 轻点：准线停留，便于读数
  }

  function hideCoord() {
    var el = $("#ml-cv-coord");
    if (el) el.hidden = true;
  }

  function fmt(v) {
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e5 || (a < 1e-4 && a > 0)) return v.toExponential(2);
    return String(parseFloat(v.toFixed(4)));
  }

  /* ---------- 手势提示（首次进入轻提示，交互即隐） ---------- */

  var hintTimer = 0;
  function showHint() {
    if (st.hintShown) return;
    var el = $("#ml-cv-hint");
    if (!el) return;
    st.hintShown = true;
    el.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 3600);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    var el = $("#ml-cv-hint");
    if (el) el.classList.remove("show");
  }

  /* ================= 「⋯」菜单（工具栏全部收纳于此） ================= */

  function updateToggleUI() {
    var gs = $("#ml-menu-grid-sw"), as = $("#ml-menu-axes-sw");
    if (gs) gs.classList.toggle("on", st.display.grid);
    if (as) as.classList.toggle("on", st.display.axes);
  }

  function toggleGrid() {
    st.display.grid = !st.display.grid;
    updateToggleUI();
    scheduleRender();
    persistDisplay();
  }

  function toggleAxes() {
    st.display.axes = !st.display.axes;
    updateToggleUI();
    scheduleRender();
    persistDisplay();
  }

  /** 显示设置写回实验体（下次打开保持一致） */
  function persistDisplay() {
    if (!st.exp || !D) return;
    st.exp.display = { grid: st.display.grid, axes: st.display.axes };
    D.updateExperiment(st.exp.id, {
      display: st.exp.display,
      view: st.view ? { cx: st.view.cx, cy: st.view.cy, scale: st.view.scale } : undefined
    });
  }

  function openMenu() {
    var sheet = $("#ml-menu-sheet"), ov = $("#ml-menu-overlay");
    if (!sheet) return;
    if (!isActive()) return; // 严格绑定画布页：非画布激活态绝不打开（防御残留/误触发）
    // 保存实验按钮文案：已保存 → 更新
    var btn = $("#ml-menu-save");
    if (btn) btn.textContent = st.exp && st.exp.saved ? "更新已保存实验" : "保存实验";
    var nameIn = $("#ml-menu-name");
    if (nameIn) nameIn.value = (st.exp && st.exp.name) || "";
    updateToggleUI();
    ov.classList.add("visible");
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }

  function closeMenu() {
    var sheet = $("#ml-menu-sheet"), ov = $("#ml-menu-overlay");
    if (!sheet) return;
    ov.classList.remove("visible");
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }

  function menuOpened() {
    var sheet = $("#ml-menu-sheet");
    return sheet && sheet.getAttribute("aria-hidden") === "false";
  }

  function onSaveExperiment() {
    if (!st.exp || !D) return;
    var nameIn = $("#ml-menu-name");
    var name = nameIn ? nameIn.value.trim() : "";
    D.saveExperiment(st.exp.id, name || undefined);
    if (st.exp.name && window.VH_MathLab.onExperimentChanged) window.VH_MathLab.onExperimentChanged();
    closeMenu();
    if (typeof showToast === "function") showToast("实验已保存，可在「最近实验」打开");
  }

  /* ---------- 导出 PNG ---------- */

  function exportPNG() {
    if (!st.spec) return;
    try {
      // 离屏画布：1.6 倍尺寸 + 标题信息（exportMode 渲染公式/水印）
      var W = Math.max(720, Math.round(cssW * 1.6)), H = Math.max(900, Math.round(cssH * 1.6));
      var off = document.createElement("canvas");
      off.width = W; off.height = H;
      var octx = off.getContext("2d");
      R.render(octx, {
        width: W, height: H,
        view: st.view, theme: st.theme,
        display: st.display, layers: st.spec.layers || [],
        exportMode: true,
        title: specFormula(st.exp),
        subtitle: (st.spec.info || []).slice(0, 2).join(" · ")
      });
      var dataURL = off.toDataURL("image/png");

      var name = "MathLab-" + (st.exp.name ? st.exp.name : String(st.exp.formula || "").replace(/[^\w\u4e00-\u9fa5-]+/g, "").slice(0, 20));
      if (window.AndroidBridge && typeof window.AndroidBridge.exportFile === "function") {
        // 复用原生导出管线：img HTML → 系统 PNG 保存
        var html = '<body style="margin:0;background:' + st.theme.bg + '"><img src="' + dataURL + '" style="width:100%;display:block"></body>';
        window.AndroidBridge.exportFile(name, "png", html);
        if (typeof showToast === "function") showToast("导出中 · PNG…");
      } else {
        var a = document.createElement("a");
        a.href = dataURL;
        a.download = name + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (typeof showToast === "function") showToast("已导出 " + name + ".png");
      }
    } catch (err) {
      if (typeof showToast === "function") showToast("导出失败：" + (err && err.message));
    }
    closeMenu();
  }

  /* ================= 返回 ================= */

  function back() {
    if (menuOpened()) { closeMenu(); return; }
    document.body.classList.remove("ml-canvas-active");
    if (st.source === "config") {
      switchTabSafe("math-config");
    } else {
      switchTabSafe("math-lab");
    }
  }

  function switchTabSafe(name) {
    if (typeof switchTab === "function") switchTab(name);
    else if (window.VH_MathLab.switchTab) window.VH_MathLab.switchTab(name);
  }

  function showToastSafe(msg) {
    if (typeof showToast === "function") showToast(msg);
  }

  function isActive() {
    return document.getElementById("page-math-canvas") &&
      document.getElementById("page-math-canvas").classList.contains("active");
  }

  /* ================= 事件绑定（mathLab.js 注入 DOM 后调用） ================= */

  function bindUI() {
    var root = document.getElementById("page-math-canvas");
    if (!root || root.__mlBound) return;
    root.__mlBound = true;

    // 防御：画布页失活（任何路径）→ 退出沉浸模式
    if (window.MutationObserver) {
      new MutationObserver(function () {
        if (!root.classList.contains("active")) document.body.classList.remove("ml-canvas-active");
      }).observe(root, { attributes: true, attributeFilter: ["class"] });
    }

    $("#ml-cv-back").addEventListener("click", back);
    $("#ml-cv-menu").addEventListener("click", openMenu);
    $("#ml-menu-overlay").addEventListener("click", closeMenu);
    $("#ml-menu-cancel").addEventListener("click", closeMenu);
    $("#ml-menu-save").addEventListener("click", onSaveExperiment);
    $("#ml-menu-export").addEventListener("click", exportPNG);
    $("#ml-menu-reset").addEventListener("click", function () { closeMenu(); resetView(); });
    $("#ml-menu-grid-row").addEventListener("click", toggleGrid);
    $("#ml-menu-axes-row").addEventListener("click", toggleAxes);
  }

  /* ================= 导出 ================= */

  window.VH_MathLab.canvas = {
    bindUI: bindUI,
    open: open,
    back: back,
    closeMenu: closeMenu,
    menuOpened: menuOpened,
    isActive: isActive,
    resetView: resetView,
    /** 画布页激活时由外部调用（从最近实验直接进入场景下的尺寸刷新） */
    refresh: function () { if (canvas) onResize(); }
  };
})();
