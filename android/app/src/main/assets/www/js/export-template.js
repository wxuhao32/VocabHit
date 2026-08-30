/* ============================================================
   生词导出 · 线条小狗模板渲染器（模板三代）
   以根目录「线条小狗3.png」为每页固定整页背景（不做任何修改），
   新模板装饰集中在顶部（标题+两角角色）与底部两角，中部整片空白，
   词条写入单一整页大板块：
   Canvas 测量排版（自动换行/自动测高/整条不拆分/贪婪紧凑装填）
   → 页内纵向均布（词条少时拉开间距并整体居中，不挤在顶部）→ 逐页绘制
   → 零依赖 PDF 装配（JPEG 页面嵌入）。
   释义行支持富文本分段（{segs:[{t,c?,sup?}]}：逐条释义等级着色 +
   「僻」缩小上标，属性由 ky-level.js 按同一分级数据给出）；
   字符串行保持原有纯文本渲染。
   挂载 window.VH_ExportTemplate；模板图缺失时返回 null，
   由 app.js 回退现有 HTML 导出路径。
   ============================================================ */

"use strict";

(function () {
  /* ---------- 布局常量（集中于此，便于按模板微调） ---------- */

  /* 模板原始尺寸（线条小狗3.png 实测 943×1668），每页完整铺满 */
  const PAGE = { w: 943, h: 1668 };
  const TEMPLATE_SRC = "线条小狗3.png";
  const RENDER_SCALE = 1.5; // 画布超采样倍率：文字边缘更锐利

  /* 内容板块（占页面宽高的比例）：
     像素级扫描新模板：顶部装饰（标题+两角角色）墨迹止于 y≈307，
     底部装饰（拥抱/挥手角色）墨迹始于 y≈1473，中部 y308~1472 全宽零墨迹。
     板块四边各留安全余量（上余 18px / 下余 22px），分隔线不会触碰装饰；
     连续可用高度约 1126px（旧模板约 1050px），典型词条单页可容纳 6+ 条。 */
  const PANELS = [
    { x0: 0.08, x1: 0.92, y0: 0.195, y1: 0.87 },
  ];

  /* 排版样式（暖棕调，与米黄模板协调） */
  const TPL_STYLE = {
    fontStack: `-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`,
    wordPx: 30,      // 单词字号
    wordColor: "#4A3826",
    metaPx: 19,      // 「今日 n 次 · 累计 n 次」小字
    metaColor: "#A18A70",
    phonPx: 21,      // 音标
    phonColor: "#97826B",
    sensePx: 23,     // 释义行
    senseLH: 1.55,   // 释义行高倍数
    senseColor: "#5A4A3A",
    gapWordPhon: 7,  // 单词行 → 音标行
    gapPhonSense: 9, // 音标行 → 首条释义
    sepColor: "rgba(122, 98, 72, 0.28)", // 词条分隔线（细浅不抢眼）
    sepWidth: 1.5,
    sepGap: 18,      // 分隔线上下各留间距（紧凑装填时的基础间距）
    /* 页内纵向均布：装填完成后若板块仍有剩余高度，把词条间距均匀拉大，
       并把整组词条垂直居中——避免词条全挤在顶部、底部大片空白。
       相邻词条间距上限（拉到该值后剩余空间转为上下对称留白，
       防止只有 1~2 条时撑出夸张的空隙）。 */
    maxJustifyGap: 120,
    minFitScale: 0.8, // 超高词条自动缩字号的下限倍率
  };

  const PAGE_LIMIT = 30; // 页数上限（防内存失控）

  /* ---------- 文本换行 ---------- */

  /* 释义行支持富文本：字符串行（纯正文色，兼容旧数据）或
     { segs: [{t, c?, sup?}] } 分段行（c=颜色，sup=「僻」缩小上标）。
     分级与颜色由调用方（js/ky-level.js KY.exportLines，复用 kyLevel
     同一等级数据与 CSS 变量色）给出，本模块只做通用富文本排版渲染，
     不感知任何分级规则。 */

  /* 行 → token 流：按空格与 CJK/拉丁边界切分，token 携带颜色/上标属性 */
  function lineTokens(line) {
    const segs = line && Array.isArray(line.segs) ? line.segs : [{ t: String(line == null ? "" : line) }];
    const tokens = [];
    for (const seg of segs) {
      const s = String(seg.t == null ? "" : seg.t);
      let run = "", prevCJK = null;
      const flush = () => { if (run) { tokens.push({ t: run, c: seg.c, sup: seg.sup }); run = ""; } };
      for (const ch of s) {
        if (ch === " ") { flush(); tokens.push({ t: " ", c: seg.c, sup: seg.sup }); prevCJK = null; continue; }
        const cjk = /[\u2E80-\uFFFD\u3000-\u303F]/.test(ch);
        if (prevCJK !== null && (cjk || prevCJK)) flush();
        run += ch;
        prevCJK = cjk;
      }
      flush();
    }
    return tokens;
  }

  /* token 测量：上标（僻）按 0.52em（与 .ky-ob font-size 一致） */
  function tokenFont(sPx, sup) {
    return sup ? `600 ${(sPx * 0.52).toFixed(2)}px ${TPL_STYLE.fontStack}` : `${sPx}px ${TPL_STYLE.fontStack}`;
  }

  /* token 流贪婪换行：行首空格丢弃；超宽 token 按字符硬切（保留属性）；
     「僻」上标不落单——放不下时连同其前一个 token 移到下一行 */
  function wrapTokens(ctx, tokens, maxW, sPx) {
    const widths = tokens.map((tok) => {
      ctx.font = tokenFont(sPx, tok.sup);
      return ctx.measureText(tok.t).width;
    });
    const lines = [];
    let cur = []; // [{tok, w}]
    let curW = 0;
    // 输出 token 自带绘制宽度 w（drawEntry 直接按 w 推进 x）
    const push = () => { if (cur.length) { lines.push(cur.map((x) => ({ t: x.tok.t, c: x.tok.c, sup: x.tok.sup, w: x.w }))); cur = []; curW = 0; } };
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      let w = widths[i];
      if (tok.t === " ") {
        if (curW > 0) { cur.push({ tok, w }); curW += w; } // 行首空格丢弃
        continue;
      }
      if (curW + w <= maxW) { cur.push({ tok, w }); curW += w; continue; }
      if (tok.sup && cur.length >= 2) { // 僻标记与前一个 token 一起下移
        const prev = cur.pop();
        curW -= prev.w;
        push();
        cur.push(prev, { tok, w }); curW = prev.w + w;
        continue;
      }
      push();
      if (w <= maxW) { cur.push({ tok, w }); curW = w; continue; }
      let piece = ""; // 单 token 超宽 → 按字符硬切
      ctx.font = tokenFont(sPx, tok.sup);
      for (const ch of tok.t) {
        const cw = ctx.measureText(ch).width;
        if (curW + cw > maxW && curW > 0) {
          cur.push({ tok: { ...tok, t: piece }, w: curW });
          push();
          piece = ch;
          curW = cw;
        } else { piece += ch; curW += cw; }
      }
      if (piece) { cur.push({ tok: { ...tok, t: piece }, w: curW }); }
    }
    push();
    return lines;
  }

  /* 单行 → 换行结果（token 行数组，token 自带绘制宽度 w） */
  function wrapRich(ctx, line, maxW, sPx) {
    return wrapTokens(ctx, lineTokens(line), maxW, sPx);
  }

  /* ---------- 词条测量 ---------- */

  /** 计算词条在指定板块内的换行结果与总高度（不含分隔线空间）。
      scale：字号缩放倍率（超高词条兜底缩小用） */
  function measureEntry(ctx, entry, contentW, scale = 1) {
    const S = TPL_STYLE;
    const wPx = S.wordPx * scale;
    const mPx = S.metaPx * scale;
    const pPx = S.phonPx * scale;
    const sPx = S.sensePx * scale;
    const headH = wPx * 1.25;
    const phonH = pPx * 1.35;
    const senseLH = sPx * S.senseLH;
    ctx.font = `${sPx}px ${S.fontStack}`;
    const senseLines = (entry.lines || []).flatMap((l) => wrapRich(ctx, l, contentW, sPx));
    let h = headH;
    if (entry.phonetic) h += S.gapWordPhon * scale + phonH;
    if (senseLines.length) h += (entry.phonetic ? S.gapPhonSense : S.gapWordPhon) * scale + senseLines.length * senseLH;
    return {
      scale, h, headH, phonH, senseLH,
      wPx, mPx, pPx, sPx,
      phonetic: entry.phonetic || "",
      senseLines,
    };
  }

  /* ---------- 页内纵向均布 ----------
     贪婪装填只看「放不放得下」，装完后板块往往有剩余高度：
     把剩余高度均匀分摊到词条之间的间距，并把整组词条垂直居中，
     保证 6 条左右时铺满整块、只剩 2~3 条时也居中舒展，
     而不是全挤在顶部、底部留一大片空白。间距拉到上限后，
     剩余空间转为上下对称留白。 */
  function distribute(panel) {
    const es = panel.entries;
    const panelH = panel.rect.h;
    if (!es.length) return;
    const sumH = es.reduce((a, d) => a + d.m.h, 0);
    if (es.length === 1) { // 单条：板块内垂直居中，无分隔线
      es[0].y = Math.max(0, (panelH - sumH) / 2);
      return;
    }
    const baseGap = TPL_STYLE.sepGap * 2;
    const surplus = panelH - sumH - baseGap * (es.length - 1);
    let gap = baseGap;
    let topPad = 0;
    if (surplus > 0) {
      gap = Math.min(TPL_STYLE.maxJustifyGap, baseGap + surplus / (es.length - 1));
      topPad = Math.max(0, (panelH - sumH - gap * (es.length - 1)) / 2);
    }
    let y = topPad;
    for (const d of es) { d.y = y; y += d.m.h + gap; }
  }

  /* ---------- 贪婪分页 ----------
     词条为原子单位：当前板块放不下整条 → 移入下一板块；
     板块满 → 开新页（新页使用完全相同的模板背景）。
     装填判定只看「词条底部」是否超出板块——最后一条之后不画分隔线，
     因此不预留其后的分隔空间：只要词条本体放得下就放，
     消除「刚好能塞下却被挤到下一页」的空白浪费。 */
  function layout(entries) {
    const mc = document.createElement("canvas").getContext("2d");
    const pages = [];
    let page = null;
    let pi = 0;
    let yCur = 0; // 当前板块内最后一个已放词条的底部 y
    const openPanel = () => {
      if (!page) {
        page = { panels: [] };
        pages.push(page);
        if (pages.length > PAGE_LIMIT) throw new Error("PAGE_LIMIT");
      }
      if (pi >= PANELS.length) {
        page = { panels: [] };
        pages.push(page);
        if (pages.length > PAGE_LIMIT) throw new Error("PAGE_LIMIT");
        pi = 0;
      }
      const p = PANELS[pi];
      const rect = {
        x: p.x0 * PAGE.w, y: p.y0 * PAGE.h,
        w: (p.x1 - p.x0) * PAGE.w, h: (p.y1 - p.y0) * PAGE.h,
      };
      page.panels.push({ rect, entries: [] });
      yCur = 0;
      pi++;
    };
    openPanel();
    for (const entry of entries) {
      const panel = () => page.panels[page.panels.length - 1];
      let m = measureEntry(mc, entry, panel().rect.w);
      if (m.h > panel().rect.h) { // 超高词条：整条独占板块并缩字号兜底
        let s = TPL_STYLE.minFitScale;
        m = measureEntry(mc, entry, panel().rect.w, s);
        if (m.h > panel().rect.h) {
          s = Math.max(0.6, panel().rect.h / m.h * s);
          m = measureEntry(mc, entry, panel().rect.w, s);
        }
      }
      const gap = panel().entries.length ? TPL_STYLE.sepGap * 2 : 0;
      if (panel().entries.length && yCur + gap + m.h > panel().rect.h + 0.5) {
        openPanel();
        m = measureEntry(mc, entry, panel().rect.w, m.scale);
      }
      const top = panel().entries.length ? yCur + TPL_STYLE.sepGap * 2 : yCur;
      panel().entries.push({ entry, m, y: top });
      yCur = top + m.h;
    }
    for (const pg of pages) for (const panel of pg.panels) distribute(panel);
    return pages;
  }

  /* ---------- 模板图加载（带缓存） ---------- */

  let tplImgPromise = null;
  function loadTemplate() {
    if (!tplImgPromise) {
      tplImgPromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          console.log(`[export-tpl] template loaded ${img.naturalWidth}x${img.naturalHeight} src=${img.src}`);
          resolve(img);
        };
        img.onerror = () => {
          console.error(`[export-tpl] template load FAILED src=${img.src}`);
          resolve(null); // 模板缺失 → 上层回退旧导出
        };
        img.src = TEMPLATE_SRC;
      });
    }
    return tplImgPromise;
  }

  /* ---------- 绘制 ---------- */

  function drawEntry(ctx, px, py, entry, M) {
    const S = TPL_STYLE;
    ctx.textBaseline = "alphabetic";
    // 单词行：左侧单词（超长省略号兜底），右侧同行查询次数小字
    ctx.font = `600 ${M.wPx}px ${S.fontStack}`;
    ctx.fillStyle = S.wordColor;
    let word = String(entry.word || "");
    const meta = entry.meta || "";
    ctx.font = `${M.mPx}px ${S.fontStack}`;
    const metaW = ctx.measureText(meta).width;
    const maxWordW = M.rect.w - (meta ? metaW + M.wPx * 0.6 : 0);
    ctx.font = `600 ${M.wPx}px ${S.fontStack}`;
    while (word && ctx.measureText(word).width > maxWordW) word = word.slice(0, -1);
    if (word !== String(entry.word || "")) word += "…";
    ctx.fillText(word, px, py + M.wPx);
    if (meta) {
      ctx.font = `${M.mPx}px ${S.fontStack}`;
      ctx.fillStyle = S.metaColor;
      ctx.fillText(meta, px + M.rect.w - metaW, py + M.wPx);
    }
    let y = py + M.headH;
    if (M.phonetic) {
      y += S.gapWordPhon * M.scale;
      ctx.font = `${M.pPx}px ${S.fontStack}`;
      ctx.fillStyle = S.phonColor;
      ctx.fillText(M.phonetic, px, y + M.pPx);
      y += M.phonH + S.gapPhonSense * M.scale;
    } else if (M.senseLines.length) {
      y += S.gapWordPhon * M.scale;
    }
    /* 释义行：逐 token 绘制（富文本分段着色 + 「僻」缩小上标；
       无色 token 回落正文色，纯文本行渲染效果与旧版一致） */
    for (const line of M.senseLines) {
      let x = px;
      for (const tok of line) {
        ctx.font = tokenFont(M.sPx, tok.sup);
        ctx.fillStyle = tok.c || S.senseColor;
        const baseline = y + M.sPx * 1.18;
        ctx.fillText(tok.t, x, tok.sup ? baseline - M.sPx * 0.5 : baseline);
        x += tok.w;
      }
      y += M.senseLH;
    }
  }

  /* 渲染单页：整幅模板精确铺满（不缩放不裁剪装饰），
     词条与分隔线只画在板块矩形内部 */
  function renderPage(img, placed) {
    const S = TPL_STYLE;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE.w * RENDER_SCALE);
    canvas.height = Math.round(PAGE.h * RENDER_SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    ctx.drawImage(img, 0, 0, PAGE.w, PAGE.h);
    for (const { rect, entries } of placed.panels) {
      entries.forEach((data, i) => {
        drawEntry(ctx, rect.x, rect.y + data.y, data.entry, { ...data.m, rect });
        if (i < entries.length - 1) { // 分隔线仅在词条之间，不画到板块边缘外；
          // 位置取两词条间的间距中点（均布拉开后分隔线仍居中于空隙）
          const sy = rect.y + (data.y + data.m.h + entries[i + 1].y) / 2;
          ctx.strokeStyle = S.sepColor;
          ctx.lineWidth = S.sepWidth;
          ctx.beginPath();
          ctx.moveTo(rect.x, sy);
          ctx.lineTo(rect.x + rect.w, sy);
          ctx.stroke();
        }
      });
    }
    return canvas;
  }

  /* ---------- 对外：多页画布 ----------
     entries: [{ word, meta, phonetic, lines }]
     返回 HTMLCanvasElement[]；模板缺失/空列表/超页数上限 → null（回退） */
  async function renderPages(entries) {
    if (!entries || !entries.length) return null;
    const img = await loadTemplate();
    if (!img) return null;
    let pages;
    try {
      pages = layout(entries);
      return pages.map((placed) => renderPage(img, placed));
    } catch (e) {
      return null; // 超出页数上限 / 绘制异常 → 回退旧导出
    }
  }

  /* ---------- 零依赖 PDF 装配 ----------
     每页画布编码为 JPEG 作为 DCTDecode Image XObject 嵌入，
     页面尺寸按 72/96 把像素换算为 pt，保持模板纵横比。 */

  function canvasToJpegArrayBuffer(canvas, quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("toBlob failed"))),
        "image/jpeg", quality));
  }

  function strBytes(str) {
    return new TextEncoder().encode(str);
  }

  function canvasesToPdfBlob(canvases) {
    return Promise.all(canvases.map((c) => canvasToJpegArrayBuffer(c, 0.85)))
      .then((jpegs) => {
        const n = canvases.length;
        const PW = canvases[0].width * 0.75;
        const PH = canvases[0].height * 0.75;
        const chunks = [];
        const offsets = [];
        let len = 0;
        const pushStr = (s) => { const b = strBytes(s); chunks.push(b); len += b.length; };
        const pushBuf = (b) => { chunks.push(new Uint8Array(b)); len += b.byteLength; };

        pushStr("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");
        const addObject = (body) => { offsets.push(len); pushStr(body); };

        addObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        addObject(`2 0 obj\n<< /Type /Pages /Count ${n} /Kids [${
          Array.from({ length: n }, (_, i) => `${4 + i * 3} 0 R`).join(" ")
        }] >>\nendobj\n`);
        addObject("3 0 obj\n<< /Producer (VocabHit) >>\nendobj\n");
        // 每页占 3 个对象（页 4+3i / 图 5+3i / 内容流 6+3i），编号连续无空洞
        for (let i = 0; i < n; i++) {
          const po = 4 + i * 3;
          const io = po + 1;
          addObject(`${po} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${
            PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /XObject << /Im${i} ${io} 0 R >> >> /Contents ${
            io + 1} 0 R >>\nendobj\n`);
          const data = new Uint8Array(jpegs[i]);
          addObject(`${io} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvases[i].width} /Height ${
            canvases[i].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${
            data.length} >>\nstream\n`);
          pushBuf(data.buffer);
          pushStr("\nendstream\nendobj\n");
          const cs = `q ${PW.toFixed(2)} 0 0 ${PH.toFixed(2)} 0 0 cm /Im${i} Do Q`;
          addObject(`${io + 1} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
        }

        const xref = len;
        const total = 4 + n * 3; // 对象 1~3n+3 全部连续
        let xs = `xref\n0 ${total}\n0000000000 65535 f \n`;
        for (const off of offsets) xs += `${String(off).padStart(10, "0")} 00000 n \n`;
        xs += `trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        pushStr(xs);

        const out = new Uint8Array(len);
        let o = 0;
        for (const c of chunks) { out.set(c, o); o += c.length; }
        return new Blob([out], { type: "application/pdf" });
      });
  }

  /* PNG 导出保持「单文件长图」语义：各页纵向拼接（每页均为完整模板） */
  function stackCanvases(canvases) {
    const canvas = document.createElement("canvas");
    canvas.width = canvases[0].width;
    canvas.height = canvases[0].height * canvases.length;
    const ctx = canvas.getContext("2d");
    canvases.forEach((c, i) => ctx.drawImage(c, 0, i * canvases[0].height));
    return canvas;
  }

  function stackedPngBlob(canvases) {
    return new Promise((resolve, reject) =>
      stackCanvases(canvases).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
  }

  /* Android 桥接用 dataURL（PDF = 逐页 JPEG 数组；PNG = 整张长图） */
  const canvasJpegDataUrl = (c) => c.toDataURL("image/jpeg", 0.85);
  const stackedPngDataUrl = (canvases) => stackCanvases(canvases).toDataURL("image/png");

  window.VH_ExportTemplate = {
    PAGE, PANELS, TPL_STYLE, PAGE_LIMIT,
    renderPages,
    canvasesToPdfBlob,
    stackedPngBlob,
    canvasJpegDataUrl,
    stackedPngDataUrl,
  };
})();
