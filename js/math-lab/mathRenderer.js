/* ============================================================
   Math Lab · 绘图引擎（Canvas 2D，纯绘制无 DOM 事件）
   ------------------------------------------------------------
   挂载到 window.VH_MathLab.renderer。
   输入：ctx + {width, height, view{cx,cy,scale}, theme, display, layers, ...}
   输出：网格 / 坐标轴 / 刻度 / 曲线 / 积分区域 / 切线 / 点 / 竖线标记。
   交互（平移缩放）由 mathCanvas.js 负责，本引擎只负责画。
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};

  /* ---------- 坐标变换 ---------- */
  // 世界 → 屏幕：sx = (wx - cx) * scale + W/2 ; sy = H/2 - (wy - cy) * scale

  function makeView(view, W, H) {
    var v = view || {};
    var scale = isFinite(v.scale) && v.scale > 0 ? v.scale : 40;
    var cx = isFinite(v.cx) ? v.cx : 0;
    var cy = isFinite(v.cy) ? v.cy : 0;
    return {
      cx: cx, cy: cy, scale: scale, W: W, H: H,
      toX: function (wx) { return (wx - cx) * scale + W / 2; },
      toY: function (wy) { return H / 2 - (wy - cy) * scale; },
      fromX: function (sx) { return (sx - W / 2) / scale + cx; },
      fromY: function (sy) { return (H / 2 - sy) / scale + cy; }
    };
  }

  /* ---------- “漂亮”刻度步长：1 / 2 / 5 × 10^n ---------- */

  function niceStep(worldSpan, targetCount) {
    var target = Math.max(1e-12, worldSpan / Math.max(1, targetCount));
    var mag = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
    var norm = target / mag;
    var mult;
    if (norm < 1.5) mult = 1;
    else if (norm < 3.5) mult = 2;
    else if (norm < 7.5) mult = 5;
    else mult = 10;
    return mult * mag;
  }

  /** 刻度数字：去浮点噪声；超大/超小用指数 */
  function fmtTick(v) {
    if (Math.abs(v) < 1e-12) return "0";
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-4) {
      return v.toExponential(1).replace(/\.0+e/, "e").replace(/e\+?(-?)(\d+)/, "e$1$2");
    }
    return String(parseFloat(v.toPrecision(8)));
  }

  /* ---------- 网格 / 坐标轴 / 刻度 ---------- */

  function drawGrid(ctx, T, theme, opts) {
    var W = T.W, H = T.H, scale = T.scale;
    var x0 = T.fromX(0), x1 = T.fromX(W);
    var yTop = T.fromY(0), yBot = T.fromY(H);
    var stepX = niceStep(x1 - x0, Math.max(2, W / 80));
    var stepY = niceStep(yBot - yTop, Math.max(2, H / 80));
    var pad = 4, labelEdge = 34;

    if (opts.grid) {
      // 次网格（1/5 步长，更淡）
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.gridMinor;
      ctx.beginPath();
      drawGridLines(ctx, T, x0, x1, stepX / 5, true, W, H);
      drawGridLines(ctx, T, yTop, yBot, stepY / 5, false, W, H);
      ctx.stroke();
      // 主网格
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      drawGridLines(ctx, T, x0, x1, stepX, true, W, H);
      drawGridLines(ctx, T, yTop, yBot, stepY, false, W, H);
      ctx.stroke();
    }

    // 坐标轴（超出屏幕时贴边）
    var axY = Math.min(Math.max(T.toY(0), pad), H - pad);
    var axX = Math.min(Math.max(T.toX(0), pad), W - pad);
    if (opts.axes) {
      ctx.strokeStyle = theme.axis;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, axY); ctx.lineTo(W, axY);
      ctx.moveTo(axX, 0); ctx.lineTo(axX, H);
      ctx.stroke();
      // 轴箭头
      ctx.fillStyle = theme.axis;
      drawArrow(ctx, W - 1, axY, 1, 0);
      drawArrow(ctx, axX, 1, 0, -1);
    }

    // 刻度数字：沿轴排布，轴出屏时贴边
    ctx.fillStyle = theme.tickText;
    ctx.font = "11px " + theme.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var tickY = Math.min(Math.max(axY + pad, pad + 18), H - labelEdge); // X 刻度行贴边
    var tx, wx;
    for (wx = Math.ceil(x0 / stepX) * stepX; wx <= x1 + stepX; wx += stepX) {
      if (Math.abs(wx) < stepX * 1e-6) continue;
      tx = Math.round(T.toX(wx)) + 0.5;
      if (tx < pad || tx > W - pad) continue;
      ctx.fillText(fmtTick(wx), tx, tickY);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var tickX = Math.min(Math.max(axX - pad, pad + 30), W - pad);
    var ty, wy;
    for (wy = Math.ceil(yTop / stepY) * stepY; wy <= yBot + stepY; wy += stepY) {
      if (Math.abs(wy) < stepY * 1e-6) continue;
      ty = Math.round(T.toY(wy)) + 0.5;
      if (ty < pad || ty > H - pad) continue;
      ctx.fillText(fmtTick(wy), tickX, ty);
    }
    // 原点 0
    if (opts.axes) {
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("0", Math.min(Math.max(axX - pad, pad), W - pad), Math.min(Math.max(axY + pad, pad), H - 20));
    }
  }

  function drawGridLines(ctx, T, a, b, step, vertical, W, H) {
    // 浮点累加误差防护：按索引遍历
    var start = Math.ceil(a / step - 1e-9);
    var end = Math.floor(b / step + 1e-9);
    var i, v, s;
    for (i = start; i <= end; i++) {
      v = i * step;
      if (vertical) {
        s = Math.round(T.toX(v)) + 0.5;
        if (s < 0 || s > W) continue;
        ctx.moveTo(s, 0); ctx.lineTo(s, H);
      } else {
        s = Math.round(T.toY(v)) + 0.5;
        if (s < 0 || s > H) continue;
        ctx.moveTo(0, s); ctx.lineTo(W, s);
      }
    }
  }

  function drawArrow(ctx, x, y, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * 7 - dy * 4, y - dy * 7 + dx * 4);
    ctx.lineTo(x - dx * 7 + dy * 4, y - dy * 7 - dx * 4);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- 曲线（自适应采样 + 断点处理） ---------- */

  /** 画 y=f(x)：非有限值或屏幕跳变超阈值处断笔（避免渐近线竖线） */
  function drawCurve(ctx, T, f, style) {
    var W = T.W, H = T.H;
    var N = Math.max(160, Math.ceil(W * 1.6));
    var x0 = T.fromX(0), x1 = T.fromX(W);
    var breakH = H * 4;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width || 2.2;
    ctx.setLineDash(style.dash || []); // 空数组 = 实线（null 在部分 WebView 会抛 TypeError）
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    var pen = false, lastSy = 0;
    for (var i = 0; i <= N; i++) {
      var wx = x0 + (x1 - x0) * i / N;
      var wy = f(wx);
      if (typeof wy !== "number" || !isFinite(wy)) { pen = false; continue; }
      var sy = T.toY(wy);
      if (pen && Math.abs(sy - lastSy) > breakH) pen = false; // 渐近线跳变断笔
      if (Math.abs(sy) > breakH && Math.abs(lastSy) > breakH) pen = false;
      var sx = T.toX(wx);
      if (!pen) { ctx.moveTo(sx, sy); pen = true; }
      else ctx.lineTo(sx, sy);
      lastSy = sy;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 画预采样折线（不定积分 F(x) 用） */
  function drawSampled(ctx, T, xs, ys, style) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width || 2.2;
    ctx.setLineDash(style.dash || []); // 空数组 = 实线（null 在部分 WebView 会抛 TypeError）
    ctx.lineJoin = "round";
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < xs.length; i++) {
      var y = ys[i];
      if (y === null || typeof y !== "number" || !isFinite(y)) { pen = false; continue; }
      var sx = T.toX(xs[i]), sy = T.toY(y);
      if (!pen) { ctx.moveTo(sx, sy); pen = true; }
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- 定积分区域 ---------- */

  function drawArea(ctx, T, f, a, b, style) {
    var W = T.W;
    var N = Math.max(120, Math.ceil(W));
    var y0s = T.toY(0); // 世界 y=0 的屏幕位置（可出屏，canvas 自动裁剪）
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(T.toX(a), y0s);
    var pen = true;
    for (var i = 0; i <= N; i++) {
      var wx = a + (b - a) * i / N;
      var wy = f(wx);
      if (typeof wy !== "number" || !isFinite(wy) || Math.abs(wy) > 1e12) {
        // 奇点：分段填充
        ctx.lineTo(T.toX(wx), y0s);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        pen = false;
        continue;
      }
      if (!pen) { ctx.moveTo(T.toX(wx), y0s); pen = true; }
      ctx.lineTo(T.toX(wx), T.toY(wy));
    }
    if (pen) {
      ctx.lineTo(T.toX(b), y0s);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- 点 / 竖线 / 标签 ---------- */

  function drawPoint(ctx, T, x, y, style, label) {
    var sx = T.toX(x), sy = T.toY(y);
    if (sx < -40 || sx > T.W + 40 || sy < -40 || sy > T.H + 40) return;
    ctx.beginPath();
    ctx.arc(sx, sy, style.r || 4.5, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    if (style.ring) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.ring;
      ctx.stroke();
    }
    if (label) drawLabel(ctx, T, x, y, label, style.color);
  }

  /** 世界坐标附近绘制带底色的文字标签（自动避让画布边缘） */
  function drawLabel(ctx, T, wx, wy, text, color) {
    var sx = T.toX(wx), sy = T.toY(wy);
    ctx.font = "600 11.5px " + theme_font(ctx);
    var w = ctx.measureText(text).width + 12;
    var h = 20;
    var bx = sx + 8, by = sy - h - 6;
    if (bx + w > T.W - 6) bx = sx - w - 8;
    if (by < 6) by = sy + 8;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    if (ctx.__mlDark) ctx.fillStyle = "rgba(30,30,32,0.92)";
    roundRect(ctx, bx, by, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, w, h, 6);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 6, by + h / 2 + 0.5);
  }

  function theme_font() { return "-apple-system, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"; }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawVLine(ctx, T, wx, style) {
    var sx = T.toX(wx);
    if (sx < 0 || sx > T.W) return;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width || 1.4;
    ctx.setLineDash(style.dash || [5, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, T.H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- 十字准线（坐标读数） ---------- */

  function drawCrosshair(ctx, T, wx, wy, theme) {
    var sx = T.toX(wx), sy = T.toY(wy);
    if (sx < 0 || sx > T.W || sy < 0 || sy > T.H) return;
    ctx.strokeStyle = theme.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, 0); ctx.lineTo(sx, T.H);
    ctx.moveTo(0, sy); ctx.lineTo(T.W, sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- 主入口 ---------- */
  // layers: [{kind:'curve', f, color, width, dash}
  //          {kind:'sampled', xs, ys, ...}
  //          {kind:'area', f, a, b, color}
  //          {kind:'point', x, y, color, ring, label}
  //          {kind:'vline', x, ...}]

  function render(ctx, opts) {
    var W = opts.width, H = opts.height;
    var T = makeView(opts.view, W, H);
    var theme = opts.theme;
    ctx.__mlDark = !!theme.dark;
    ctx.clearRect(0, 0, W, H);
    if (opts.background !== false) {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);
    }

    // 1. 网格与坐标轴
    drawGrid(ctx, T, theme, { grid: opts.display.grid !== false, axes: opts.display.axes !== false });

    // 2. 图层
    var layers = opts.layers || [];
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      if (L.kind === "area") drawArea(ctx, T, L.f, L.a, L.b, { color: L.color });
    }
    for (var j = 0; j < layers.length; j++) {
      var L2 = layers[j];
      if (L2.kind === "curve") drawCurve(ctx, T, L2.f, L2);
      else if (L2.kind === "sampled") drawSampled(ctx, T, L2.xs, L2.ys, L2);
    }
    for (var k = 0; k < layers.length; k++) {
      var L3 = layers[k];
      if (L3.kind === "vline") drawVLine(ctx, T, L3.x, L3);
      else if (L3.kind === "point") drawPoint(ctx, T, L3.x, L3.y, L3, L3.label);
    }

    // 3. 十字准线
    if (opts.crosshair && isFinite(opts.crosshair.x) && isFinite(opts.crosshair.y)) {
      drawCrosshair(ctx, T, opts.crosshair.x, opts.crosshair.y, theme);
    }

    // 4. 导出模式：公式标题 + 信息 + 水印
    if (opts.exportMode) {
      if (opts.title) {
        ctx.fillStyle = theme.text;
        ctx.font = "600 15px " + theme.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(opts.title, 14, 12);
      }
      if (opts.subtitle) {
        ctx.fillStyle = theme.text2;
        ctx.font = "12.5px " + theme.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(opts.subtitle, 14, 36);
      }
      ctx.fillStyle = theme.text3;
      ctx.font = "11px " + theme.font;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("VocabHit · Math Lab", W - 12, H - 10);
    }
    return T;
  }

  /* ---------- 从 CSS 变量解析主题色 ---------- */

  function themeFromCSS() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      try { var s = cs.getPropertyValue(name).trim(); return s || fallback; } catch (e) { return fallback; }
    }
    var dark = false;
    try {
      var mode = document.documentElement.getAttribute("data-theme") || "system";
      dark = mode === "dark" ||
        (mode === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) { /* 保守亮色 */ }
    var accent = v("--accent", "#5856D6");
    return {
      dark: dark,
      bg: dark ? "#131315" : "#FFFFFF",
      grid: dark ? "rgba(255,255,255,0.07)" : "#EFEFF1",
      gridMinor: dark ? "rgba(255,255,255,0.03)" : "#F6F6F8",
      axis: dark ? "rgba(255,255,255,0.45)" : "#8E8E93",
      tickText: dark ? "#98989D" : "#86868B",
      text: dark ? "#F5F5F7" : "#1D1D1F",
      text2: dark ? "#98989D" : "#86868B",
      text3: dark ? "#636366" : "#B0B0B5",
      crosshair: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)",
      curve1: accent,
      curve2: dark ? "#32ADE6" : "#007AFF",
      curve3: dark ? "#FFD60A" : "#FF9F0A",
      areaFill: dark ? "rgba(125,122,255,0.30)" : "rgba(88,86,214,0.22)",
      tangent: dark ? "#FF453A" : "#FF3B30",
      point: dark ? "#30D158" : "#34C759",
      font: "-apple-system, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    };
  }

  /* ============================================================
     智能最佳视野 autoView：分析实验内容自动计算初始视图
     ------------------------------------------------------------
     思路（参考 Desmos/ChatGPT 可视化）：
     1. 从 layers 提取曲线 / 标注点 / 积分区间 / 竖线
     2. 对每条曲线宽域采样，检测数学特征点：
        - 零点（符号变化 + 二分精化，自动排除奇点如 1/x 的 x=0）
        - 局部极值（一阶差分变号）
     3. x 范围 = 特征点 + 固定位置（积分上下限等）+ padding
     4. y 范围 = 特征 y + 范围内采样分位（5%~95% 截断渐近线）
     5. 纵横比约束（按画布宽高比，避免细长条视野）
     返回 {cx, cy, scale}；失败回退安全默认
     ============================================================ */

  /** 二分求根：收敛即零点；中点掉奇点或 |f| 巨大 → 判为不连续，返回 null */
  function bisectRoot(f, a, b) {
    var fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
    var m = 0, fm = 0;
    for (var k = 0; k < 42; k++) {
      m = (a + b) / 2;
      fm = f(m);
      if (!isFinite(fm)) return null; // 区间内不连续 → 奇点非零点
      if (Math.abs(fm) < 1e-10 || b - a < 1e-9) break;
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    if (!isFinite(fm) || Math.abs(fm) > 1e3) return null; // 未收敛到 0 → 奇点
    return { x: m, y: 0 };
  }

  /** 宽域采样一条曲线，返回特征点 [{x,y}]（零点 + 极值），过多时保留离原点最近的 */
  function analyzeCurve(f) {
    var X0 = -32, X1 = 32, N = 640, dx = (X1 - X0) / N;
    var xs = [], ys = [], feat = [];
    var i, x, y;
    for (i = 0; i <= N; i++) {
      x = X0 + dx * i;
      y = f(x);
      xs.push(x);
      ys.push(typeof y === "number" && isFinite(y) ? y : NaN);
    }
    // 零点（变号处二分；奇点自动排除）
    for (i = 0; i < N; i++) {
      var y1 = ys[i], y2 = ys[i + 1];
      if (!isFinite(y1) || !isFinite(y2)) continue;
      if (y1 === 0) { feat.push({ x: xs[i], y: 0 }); continue; }
      if (y1 * y2 < 0) {
        var r = bisectRoot(f, xs[i], xs[i + 1]);
        if (r) feat.push(r);
      }
    }
    // 局部极值（差分变号）
    for (i = 1; i < N; i++) {
      var a = ys[i - 1], b = ys[i], c = ys[i + 1];
      if (!isFinite(a) || !isFinite(b) || !isFinite(c)) continue;
      if ((b - a) * (c - b) < 0 && Math.abs(b) < 1e6) feat.push({ x: xs[i], y: b });
    }
    // 周期函数特征过多：按 |x| 距离截断（群组化：对称特征同进同退，避免任意取舍破坏对称）
    if (feat.length > 8) {
      feat.sort(function (p, q) { return Math.abs(p.x) - Math.abs(q.x); });
      var eps = function (t) { return t * 0.02 + 1e-9; };
      var t = Math.abs(feat[7].x); // 第 8 个的距离
      // 第 9 个与第 8 个同群（如 sin 的 ±2π 成对）→ 整群纳入会超限 → 回退到上一群
      if (feat.length > 8 && Math.abs(Math.abs(feat[8].x) - t) < eps(t)) {
        t = Math.abs(feat[6].x);
      }
      feat = feat.filter(function (p) { return Math.abs(p.x) <= t + eps(t); });
      if (feat.length > 10) feat = feat.slice(0, 10);
    }
    return feat;
  }

  /** autoView 主入口：spec = buildSpec 结果；W/H = 画布 CSS 尺寸 */
  function autoView(spec, W, H) {
    var fallback = { cx: 0, cy: 0, scale: Math.max(20, Math.min(W, H) / 12) };
    try {
      var layers = (spec && spec.layers) || [];
      var fns = [], feat = [], fixXs = [];
      layers.forEach(function (L) {
        if (L.kind === "curve" && typeof L.f === "function") fns.push(L.f);
        else if (L.kind === "point" && isFinite(L.x) && isFinite(L.y)) feat.push({ x: L.x, y: L.y });
        else if (L.kind === "vline" && isFinite(L.x)) fixXs.push(L.x);
        else if (L.kind === "area") {
          if (isFinite(L.a)) fixXs.push(L.a);
          if (isFinite(L.b)) fixXs.push(L.b);
          if (typeof L.f === "function") fns.push(L.f);
        }
      });
      fns.forEach(function (f) {
        analyzeCurve(f).forEach(function (p) { feat.push(p); });
      });
      if (!feat.length && !fixXs.length && !fns.length) return fallback;

      /* ---- x 范围 ---- */
      var xsAll = feat.map(function (p) { return p.x; }).concat(fixXs);
      var x0, x1;
      if (xsAll.length) {
        xsAll.sort(function (a, b) { return a - b; });
        x0 = xsAll[0]; x1 = xsAll[xsAll.length - 1];
        // 特征 x 少于 2 个不同值（如 x² 仅原点）→ 扩到 ±2.5 看曲线主体
        var uniq = xsAll.filter(function (v, i, arr) { return i === 0 || v - arr[i - 1] > 1e-9; });
        if (uniq.length < 2) { var mx = (x0 + x1) / 2; x0 = mx - 2.5; x1 = mx + 2.5; }
        else {
          var padX = (x1 - x0) * 0.18 + 1e-9;
          x0 -= padX; x1 += padX;
        }
      } else { x0 = -5; x1 = 5; } // 无特征（如 1/x 无零点极值）→ 默认窗口
      if (x1 - x0 < 0.5) { var c0 = (x0 + x1) / 2; x0 = c0 - 0.25; x1 = c0 + 0.25; }

      /* ---- y 范围 ---- */
      var ys = feat.map(function (p) { return p.y; }).filter(function (v) { return isFinite(v) && Math.abs(v) < 1e6; });
      fns.forEach(function (f) {
        for (var i = 0; i <= 240; i++) {
          var v = f(x0 + (x1 - x0) * i / 240);
          if (typeof v === "number" && isFinite(v) && Math.abs(v) < 1e6) ys.push(v);
        }
      });
      var y0, y1;
      if (ys.length >= 8) {
        ys.sort(function (a, b) { return a - b; });
        y0 = ys[Math.floor(ys.length * 0.05)];
        y1 = ys[Math.floor(ys.length * 0.95)];
        // 分位可能把特征点挤出（渐近线场景）→ 与特征点合并再截断
        feat.forEach(function (p) {
          if (isFinite(p.y) && Math.abs(p.y) < 1e6) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        });
      } else { y0 = -3; y1 = 3; }
      if (y1 - y0 < 1e-9) { var my = (y0 + y1) / 2; y0 = my - 1; y1 = my + 1; }
      var padY = (y1 - y0) * 0.15 + 1e-9;
      y0 -= padY; y1 += padY;

      // 等比缩放：较小方向刚好铺满，较大方向自然留白（保证内容完整可见）
      var spanX = x1 - x0, spanY = y1 - y0;
      var scale = Math.min(W / spanX, H / spanY) * 0.94;
      if (!(scale > 0) || !isFinite(scale)) return fallback;
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: scale };
    } catch (e) {
      return fallback;
    }
  }

  window.VH_MathLab.renderer = {
    render: render,
    makeView: makeView,
    niceStep: niceStep,
    fmtTick: fmtTick,
    themeFromCSS: themeFromCSS,
    drawLabel: drawLabel,
    autoView: autoView,
    analyzeCurve: analyzeCurve
  };
})();
