/* ============================================================
   Knowledge Learning / 学习资料 & Repository  （v2 状态机重构）
   ------------------------------------------------------------
   独立模块（开闭原则）：不修改既有 app.js / style.css；
   本文件自注入页面 DOM、自装饰 window.__back，
   index.html 仅追加 <link> 与 <script> 两个标签。

   v2 核心修复：
   1. 状态机显式化 —— 普通阅读与「添加文本模式」彻底分离：
      · selMode = null（普通阅读）：长按 = Android 原生选择/复制，
        本模块不注入任何 UI；
      · selMode = content | explanation | context（摘取模式）：
        仅由用户主动点击「＋ 添加知识」或编辑面板的
        「从原文选择」按钮进入，底部出现专用操作条。
   2. 解析状态绑定真实任务 —— parseSeq 令牌：只有发起过选择/
      上传任务后才接受解析回调；无任务绝不显示「解析中」。
   3. 上下文不再自动生成 —— 仅当用户主动「从原文选择上下文」
        时保存，Repository 空字段不渲染。
   4. 全生命周期清理 —— 进入/退出阅读页、切 Tab、返回键、
      后台切换均复位临时状态；临时状态不持久化，
      App 重启后自然回到普通阅读。

   数据体系独立：vc-materials（学习资料）与 vc-repo（知识条目）
   互不依赖；对外只读扩展点 window.VH_Knowledge。
   ============================================================ */
(function () {
  "use strict";

  /* ================= 依赖（只读复用既有全局，不做任何修改） ================= */
  /* 来自 app.js：$、$$、esc、showToast、switchTab、renderAll */

  /* ================= 数据层（两个独立存储，避免任何耦合） ================= */

  const MATERIALS_KEY = "vc-materials"; // 学习资料（解析后的纯文本）
  const REPO_KEY = "vc-repo";           // Repository 知识条目（长期知识资产）
  const HIGHLIGHTS_KEY = "vc-highlights"; // 划重点（按资料持久化）

  const PRESET_CATS = [
    { id: "phrase", name: "短语" },
    { id: "sentence", name: "句型" },
    { id: "quote", name: "好句" }
  ];

  let materials = { v: 1, items: [] }; // items: {id,title,text,addedAt}
  let repo = { v: 1, customCats: [], entries: [], hiddenPresetCats: [] }; // hiddenPresetCats：已删除的预设类型 id（持久隐藏，重启不复活）
  // entries: {id,content,explanation,context,catId,
  //           sources:[{materialId,title,paraIndex,at}],createdAt,lastAt}
  // explanation / context 均可为空串（用户未添加则不渲染）
  let highlights = {}; // { materialId: [{paraIndex, start, end}] } v0.8.16 前旧格式 {paraIndex,text} 渲染时自动迁移

  function loadStores() {
    try {
      const m = JSON.parse(localStorage.getItem(MATERIALS_KEY));
      if (m && m.v === 1) materials = m;
    } catch (e) { /* 损坏则重建 */ }
    try {
      const r = JSON.parse(localStorage.getItem(REPO_KEY));
      if (r && r.v === 1) repo = r;
    } catch (e) { /* 损坏则重建 */ }
    try {
      const h = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY));
      if (h) highlights = h;
    } catch (e) { /* 损坏则重建 */ }
  }

  function saveMaterials() { localStorage.setItem(MATERIALS_KEY, JSON.stringify(materials)); }
  function saveRepo() { localStorage.setItem(REPO_KEY, JSON.stringify(repo)); }
  function saveHighlights() { localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(highlights)); }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** 规范化（仅用于重复检测，绝不回写原文） */
  function normText(s) { return String(s || "").replace(/\s+/g, " ").trim().toLowerCase(); }

  /** 2026年8月17日 14:05 */
  function fmtCN(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? "0" + n : "" + n);
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function allCats() {
    return PRESET_CATS.filter((c) => (repo.hiddenPresetCats || []).indexOf(c.id) === -1)
      .concat(repo.customCats);
  }

  function catName(id) {
    const c = allCats().find((x) => x.id === id);
    return c ? c.name : "未分类";
  }

  /* ================= 文档解析器注册表（扩展点） ================= */

  const parsers = {}; // 扩展名 -> async (file) => {text}
  function registerParser(ext, fn) { parsers[String(ext).toLowerCase()] = fn; }

  /* TXT：BOM → UTF-8 严格 → GBK 回退（与原生 DocumentParser 同策略） */
  registerParser("txt", async (file) => {
    const u8 = new Uint8Array(await file.arrayBuffer());
    return { text: decodeTextBytes(u8) };
  });

  function decodeTextBytes(u8) {
    try {
      if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF)
        return new TextDecoder("utf-8").decode(u8.subarray(3));
      if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE)
        return new TextDecoder("utf-16le").decode(u8.subarray(2));
      if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF)
        return new TextDecoder("utf-16be").decode(u8.subarray(2));
    } catch (e) { /* 老引擎不支持标签时落入下方宽容解码 */ }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); }
    catch (e) {
      try { return new TextDecoder("gbk").decode(u8); }
      catch (e2) { return new TextDecoder("utf-8").decode(u8); }
    }
  }

  /* DOCX（Web/无原生桥接回退）：ZIP 目录定位 word/document.xml → inflate → 提取段落 */
  registerParser("docx", async (file) => {
    const u8 = new Uint8Array(await file.arrayBuffer());
    const xml = await extractDocxMain(u8);
    return { text: docxXmlToText(xml) };
  });

  async function extractDocxMain(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    const min = Math.max(0, u8.length - 66000);
    for (let i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("不是有效的 .docx 文件");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      const norm = name.replace(/\\/g, "/"); // 容错个别打包器的反斜杠分隔符
      if (norm === "word/document.xml") {
        const lNameLen = dv.getUint16(lho + 26, true);
        const lExtraLen = dv.getUint16(lho + 28, true);
        const start = lho + 30 + lNameLen + lExtraLen;
        const comp = u8.subarray(start, start + csize);
        const xmlU8 = method === 0 ? comp : await inflateRaw(comp);
        return new TextDecoder("utf-8").decode(xmlU8);
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error("不是有效的 .docx 文档（缺少正文）");
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("当前浏览器暂不支持解析 .docx，请在 App 内使用");
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** 按文档顺序提取段落与表格（w:tbl → 表格行标记 \u0006 + 单元格分隔 \u0007） */
  function docxXmlToText(xml) {
    const blockRe = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    const out = [];
    let m;
    while ((m = blockRe.exec(xml))) {
      if (m[0].charAt(1) === "w" && m[0].charAt(3) === "t" && m[0].charAt(4) === "b") {
        // 表格块：逐行提取，每行以 \u0006 开头，单元格以 \u0007 分隔
        const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
        let rm;
        while ((rm = rowRe.exec(m[0]))) {
          const cellRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
          const cells = [];
          let cm;
          while ((cm = cellRe.exec(rm[0]))) {
            cells.push(extractCellText(cm[0]));
          }
          out.push("\u0006" + cells.join("\u0007"));
        }
      } else {
        out.push(paraTextOf(m[0]));
      }
    }
    if (out.length === 0) return paraTextOf(xml);
    return out.join("\n");
  }

  /** 提取表格单元格内所有段落文本，所有换行统一为 \u001E（避免破坏表格行分割 + 触发列表检测） */
  function extractCellText(tcXml) {
    const pRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    const paras = [];
    let m;
    while ((m = pRe.exec(tcXml))) {
      let t = paraTextOf(m[0]);
      // 去掉段落首部的标题标记（\u0001-\u0003），单元格内不应有标题语义
      if (t.charCodeAt(0) >= 1 && t.charCodeAt(0) <= 3) t = t.slice(1);
      paras.push(t);
    }
    // 段落间用 \u001E 连接；并将所有 \n（含 <w:br> 产生）统一替换为 \u001E
    return paras.join("\u001E").replace(/\n/g, "\u001E");
  }

  function paraTextOf(chunk) {
    // 临时标记用 \u001E/\u001F，避免与段落标题标记 \u0001-\u0003 冲突
    const marked = chunk
      .replace(/<w:tab\b[^>]*\/?>/g, "\u001E")
      .replace(/<(?:w:br|w:cr)\b[^>]*\/?>/g, "\u001F");
    let s = "";
    const re = /<w:t(?:\s[^>]*)?>([ \s\S]*?)<\/w:t>|([\u001E\u001F])/g;
    let m;
    while ((m = re.exec(marked))) {
      if (m[1] !== undefined) s += decodeXmlEnt(m[1]);
      else if (m[2] === "\u001E") s += "\t";
      else if (m[2] === "\u001F") s += "\n";
    }
    // Prepend 标题标记基于 w:pStyle（与原生 DocumentParser 数据格式一致）
    const psMatch = chunk.match(/<w:pStyle\b[^>]*\bw:val=["']?([^"'\s/>]+)["']?/);
    if (psMatch) {
      const v = psMatch[1].toLowerCase().replace(/\s/g, "");
      if (v === "heading1" || v === "\u6807\u98981" || v === "1") s = "\u0001" + s;
      else if (v === "heading2" || v === "\u6807\u98982" || v === "2") s = "\u0002" + s;
      else if (v === "heading3" || v === "\u6807\u98983" || v === "3") s = "\u0003" + s;
    }
    return s;
  }

  function decodeXmlEnt(s) {
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  /* ================= 页面外壳注入（既有 HTML 零修改） ================= */

  const BACK_SVG = '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>';
  const CHEV_SVG = '<svg class="rp-arrow icon-s" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7.2v4M9.3 7.2v4"/></svg>';
  const DOC_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/></svg>';
  const IMG_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.1"/><path d="M3 11.5l3-3 2.5 2.5L11 8.5l2.5 2.5"/></svg>';
  const CAM_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5.5h2l1.2-1.8h4.6L11.5 5.5h2v7h-11z"/><circle cx="8" cy="8.8" r="2.2"/></svg>';
  const SEARCH_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.4 10.4L14 14"/></svg>';
  const BOOK_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H16v13H6.5A2.5 2.5 0 0 0 4 18.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H16"/></svg>';
  const LAYER_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l6.5 3.5L10 10 3.5 6.5z"/><path d="M4.2 10.4L10 13.5l5.8-3.1"/><path d="M4.2 13.9L10 17l5.8-3.1"/></svg>';

  function injectShell() {
    // 首页入口（复用既有 .review-entry 视觉，插在「坚持看板」之后）
    const anchor = document.getElementById("habits-entry");
    if (anchor) {
      anchor.insertAdjacentHTML("afterend", `
        <button class="review-entry" id="kn-entry" type="button">
          <span class="review-entry-icon">${BOOK_SVG}</span>
          <span class="review-entry-main">
            <span class="review-entry-title">Knowledge · 学习资料</span>
            <span class="review-entry-sub" id="kn-entry-sub">上传文档 · 长按摘取知识点</span>
          </span>
          <svg class="icon icon-s review-entry-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
        </button>
        <button class="review-entry" id="repo-entry" type="button">
          <span class="review-entry-icon">${LAYER_SVG}</span>
          <span class="review-entry-main">
            <span class="review-entry-title">Repository</span>
            <span class="review-entry-sub" id="repo-entry-sub">知识条目 · 0 条</span>
          </span>
          <svg class="icon icon-s review-entry-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
        </button>`);
    }

    // 页面 + 编辑面板 + 摘取模式操作条（一次性注入 .app 容器末尾）
    document.getElementById("app").insertAdjacentHTML("beforeend", `
      <!-- Knowledge 学习资料列表 -->
      <main class="page" id="page-knowledge">
        <header class="page-header">
          <button class="back-btn" id="kn-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">Knowledge</h1>
        </header>
        <p class="page-subtitle">导入学习资料 · 摘取内容加入 Repository</p>
        <button class="primary-btn kn-upload-btn" id="kn-upload" type="button">＋ 导入学习资料</button>
        <div class="kn-parsing" id="kn-parsing" hidden>
          <span class="kn-spinner"></span><span>正在解析…</span>
        </div>
        <div class="kn-error" id="kn-error" hidden></div>
        <ul class="kn-list" id="kn-list"></ul>
        <div class="kn-empty" id="kn-empty" hidden>
          <p>还没有学习资料</p>
          <p class="kn-empty-sub">支持 .docx / .txt / 图片拍照 · 解析后的文字将完整保存，可随时回读</p>
        </div>
      </main>

      <!-- 独立二级阅读页 -->
      <main class="page" id="page-reader">
        <header class="page-header kn-reader-header">
          <button class="back-btn" id="rd-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title kn-reader-title" id="rd-title">阅读</h1>
          <button class="kn-add-btn" id="kn-add" type="button">＋ 添加知识</button>
        </header>
        <div class="rd-body">
          <div class="rd-text" id="rd-text"></div>
          <p class="rd-tip">点击右上「＋ 添加知识」，再选择要保存的内容</p>
        </div>
      </main>

      <!-- Repository 知识条目 -->
      <main class="page" id="page-repo">
        <header class="page-header">
          <button class="back-btn" id="rp-back" type="button" aria-label="返回">${BACK_SVG}</button>
          <h1 class="page-title">Repository</h1>
          <button class="kn-add-btn" id="rp-add" type="button">＋ 添加知识</button>
        </header>
        <div class="rp-search">
          <span class="rp-search-icon">${SEARCH_SVG}</span>
          <input id="rp-search-input" type="text" autocomplete="off" placeholder="搜索当前分类的内容或时间" />
          <button class="rp-search-clear" id="rp-search-clear" type="button" aria-label="清空搜索" hidden>✕</button>
        </div>
        <div class="rp-chips" id="rp-chips"></div>
        <p class="page-subtitle" id="rp-count"></p>
        <ul class="rp-list" id="rp-list"></ul>
        <div class="kn-empty" id="rp-empty" hidden>
          <p>暂无知识条目</p>
          <p class="kn-empty-sub">去 Knowledge 打开一份学习资料，摘取内容加入</p>
        </div>
      </main>

      <!-- 条目编辑 Bottom Sheet -->
      <div class="sheet-overlay" id="kn-overlay" aria-hidden="true"></div>
      <div class="sheet kn-sheet" id="kn-sheet" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="sheet-grabber"></div>
        <div class="kn-sheet-head">
          <p class="kn-sheet-title">加入 Repository</p>
          <button class="kn-sheet-cancel" id="kn-sheet-cancel" type="button">取消</button>
        </div>
        <div class="kn-sheet-body">
          <p class="field-label">核心内容</p>
          <textarea class="kn-textarea" id="kn-content" rows="3" placeholder="选中的原文（可修改）"></textarea>

          <p class="field-label kn-field-gap">中文解释 · 可选</p>
          <textarea class="kn-textarea" id="kn-explain" rows="2" placeholder="手动输入，或点击下方从原文选择"></textarea>
          <button class="kn-pick-btn" id="kn-pick-explain" type="button">${DOC_SVG} 从原文选择解释</button>

          <p class="field-label kn-field-gap">上下文 · 可选</p>
          <textarea class="kn-textarea" id="kn-context" rows="2" placeholder="手动输入，或点击下方从原文选择"></textarea>
          <button class="kn-pick-btn" id="kn-pick-context" type="button">${DOC_SVG} 从原文选择上下文</button>

          <p class="field-label kn-field-gap">所属 Repository</p>
          <div class="kn-cats" id="kn-cats"></div>
          <div class="kn-newcat" id="kn-newcat" hidden>
            <input id="kn-newcat-input" type="text" maxlength="12" placeholder="新分类名称，如：考研作文" />
            <button id="kn-newcat-ok" type="button">创建</button>
          </div>

          <button class="primary-btn" id="kn-save" type="button">保存到 Repository</button>
        </div>
      </div>

      <!-- 摘取模式专用底部操作条（仅在添加文本模式显示） -->
      <div class="kn-selbar" id="kn-selbar" hidden>
        <span class="kn-selbar-hint" id="kn-selbar-hint">请选择要保存的知识内容</span>
        <button class="kn-selbar-btn ghost" id="kn-selbar-cancel" type="button">取消</button>
        <button class="kn-selbar-btn solid" id="kn-selbar-confirm" type="button" disabled>确认所选</button>
      </div>
      <input type="file" id="kn-file" accept=".txt,.docx,text/plain" hidden />

      <!-- 导入方式菜单（文档 / 相册图片 / 拍照，统一入口） -->
      <div class="sheet-overlay" id="kn-import-overlay" aria-hidden="true"></div>
      <div class="sheet kn-import-sheet" id="kn-import-sheet" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="sheet-grabber"></div>
        <div class="kn-sheet-head">
          <p class="kn-sheet-title">导入学习资料</p>
          <button class="kn-sheet-cancel" id="kn-import-cancel" type="button">取消</button>
        </div>
        <div class="kn-sheet-body">
          <button class="kn-import-item" id="kn-import-doc" type="button">
            <span class="kn-import-ico">${DOC_SVG}</span>
            <span class="kn-import-main">
              <span class="kn-import-name">文档</span>
              <span class="kn-import-desc">.docx / .txt 文本文档</span>
            </span>
          </button>
          <button class="kn-import-item" id="kn-import-img" type="button">
            <span class="kn-import-ico">${IMG_SVG}</span>
            <span class="kn-import-main">
              <span class="kn-import-name">图片</span>
              <span class="kn-import-desc">相册 JPG / PNG · 识别印刷体文字</span>
            </span>
          </button>
          <button class="kn-import-item" id="kn-import-cam" type="button">
            <span class="kn-import-ico">${CAM_SVG}</span>
            <span class="kn-import-main">
              <span class="kn-import-name">拍照</span>
              <span class="kn-import-desc">拍摄书本 / 试卷 · 直接识别</span>
            </span>
          </button>
        </div>
      </div>
    `);
  }

  /* ================= Knowledge：上传 / 解析 / 列表 ================= */

  let currentMaterial = null;
  let parseSeq = 0; // 解析任务令牌：>0 表示存在真实解析任务；仅此时接受回调
  /** 阅读页进入来源（entrySource）：knowledge | repository。
      同一 DocumentReader 可被两个模块调用，返回目标由此决定 ——
      进入时明确记录，绝不按页面/文件名猜测上一页。 */
  let readerFrom = null;
  /** 从 Repository 点来源进入阅读页时的回快照：滚动位置 + 展开的卡片，
      返回 Repository 时精确还原页面状态（类型/搜索由内存变量自然保留） */
  let repoBackState = null;

  function startUpload() {
    if (!$("#kn-parsing").hidden) return; // 已有任务进行中，防重复
    hideKnError();
    openImportMenu(); // 统一入口：文档 / 图片 / 拍照，选择后进入对应解析链路
  }

  /* ---------- 导入方式菜单（与既有文档入口统一，不新建独立模块） ---------- */

  function openImportMenu() {
    $("#kn-import-sheet").classList.add("open");
    $("#kn-import-overlay").classList.add("visible");
    $("#kn-import-sheet").setAttribute("aria-hidden", "false");
  }

  function closeImportMenu() {
    $("#kn-import-sheet").classList.remove("open");
    $("#kn-import-overlay").classList.remove("visible");
    $("#kn-import-sheet").setAttribute("aria-hidden", "true");
  }

  /** 文档导入（原有链路原样：原生 pickDocument / Web 文件输入框） */
  function importDocument() {
    if (window.AndroidBridge && typeof window.AndroidBridge.pickDocument === "function") {
      parseSeq++;
      setParsing(true);
      window.AndroidBridge.pickDocument(); // 结果经 window.__onDocParsed 回调
      return;
    }
    $("#kn-file").click(); // Web 回退：文件输入框（选中文件后才算任务开始）
  }

  /** 相册图片导入：JPG/JPEG/PNG → 原生 ML Kit OCR；Web 版无离线 OCR 能力，明确提示 */
  function importImage() {
    if (window.AndroidBridge && typeof window.AndroidBridge.pickImage === "function") {
      parseSeq++;
      setParsing(true);
      window.AndroidBridge.pickImage(); // 结果经 window.__onImageParsed 回调
      return;
    }
    showToast("图片识别请在 Android App 中使用");
  }

  /** 拍照导入：调用系统相机 → ML Kit OCR；Web 版无相机桥接，明确提示 */
  function importPhoto() {
    if (window.AndroidBridge && typeof window.AndroidBridge.takePhoto === "function") {
      parseSeq++;
      setParsing(true);
      window.AndroidBridge.takePhoto(); // 结果经 window.__onImageParsed 回调
      return;
    }
    showToast("拍照识别请在 Android App 中使用");
  }

  function setParsing(on) {
    $("#kn-parsing").hidden = !on;
    $("#kn-upload").style.opacity = on ? "0.5" : "";
    $("#kn-upload").disabled = on;
    if (on) hideKnError();
  }

  function showKnError(msg) {
    const box = $("#kn-error");
    box.textContent = msg;
    box.hidden = false;
  }

  function hideKnError() { $("#kn-error").hidden = true; }

  /** 统一解析结果入口：res = null(取消) | {ok,name,text} | {ok:false,error}
      无活跃任务（parseSeq=0）时忽略 —— 防止迟到/重复回调凭空生效。
      kind="image" 时使用图片 OCR 专属错误文案 */
  function ingestParseResult(res, kind) {
    const active = parseSeq > 0;
    parseSeq = 0;
    setParsing(false);
    if (!active) return; // 未发起任务的回调：直接丢弃，绝不产生状态
    if (!res) return;    // 用户取消选择
    if (!res.ok) {
      if (kind === "image") {
        showKnError(res.error === "OCR_EMPTY"
          ? "未检测到清晰的印刷文字，请重新拍摄"
          : "图片识别失败，请换一张清晰的印刷体照片重试");
      } else {
        showKnError(res.error || "解析失败，请重试");
      }
      return;
    }
    const text = res.text || "";
    if (!text.trim()) {
      showKnError(kind === "image" ? "未检测到清晰的印刷文字，请重新拍摄" : "未提取到文字内容");
      return;
    }
    const item = {
      id: uid("m"),
      title: cleanTitle(res.name),
      text: text,
      addedAt: Date.now()
    };
    materials.items.unshift(item);
    saveMaterials();
    renderMaterials();
    updateHomeBadges();
    openReader(item.id); // 解析成功 → 自动进入独立阅读页
    showToast("解析完成 · 点击右上「＋ 添加知识」摘取内容");
  }

  /** 原生解析回调（MainActivity emitDocParsed 调用） */
  window.__onDocParsed = function (res) { ingestParseResult(res); };

  /** 图片 OCR 解析回调（MainActivity emitImageParsed 调用：相册/拍照共用） */
  window.__onImageParsed = function (res) { ingestParseResult(res, "image"); };

  function cleanTitle(name) {
    const n = String(name || "未命名文档").trim();
    return n.replace(/\.(docx|txt|doc|pdf|jpe?g|png)$/i, "") || "未命名文档";
  }

  function renderMaterials() {
    const list = $("#kn-list");
    $("#kn-empty").hidden = materials.items.length !== 0;
    list.innerHTML = materials.items.map((m) => `
      <li class="kn-item" data-id="${m.id}">
        <div class="kn-item-main">
          <p class="kn-item-title">${esc(m.title)}</p>
          <p class="kn-item-meta">${m.text.length.toLocaleString()} 字 · ${fmtCN(m.addedAt)}</p>
        </div>
        <button class="kn-item-del" data-mdel type="button" aria-label="删除资料">${TRASH_SVG}</button>
      </li>`).join("");
  }

  function deleteMaterial(id) {
    materials.items = materials.items.filter((m) => m.id !== id);
    saveMaterials(); // 只删学习资料；vc-repo 独立存储，条目与来源快照完整保留
    renderMaterials();
    updateHomeBadges();
    showToast("已删除学习资料 · Repository 条目不受影响");
  }

  /* ================= Reader：忠实原文阅读 + 添加文本模式 ================= */

  /** 结构化渲染：识别标题标记 / 表格行，其余均为普通段落 */
  function renderReaderText(text) {
    const box = $("#rd-text");
    box.innerHTML = "";
    const rawLines = text.split("\n");

    // 第一遍：按行分类
    const lines = rawLines.map((line, i) => {
      let type = "p", t = line;
      if (t.charCodeAt(0) === 1) { type = "h1"; t = t.slice(1); }
      else if (t.charCodeAt(0) === 2) { type = "h2"; t = t.slice(1); }
      else if (t.charCodeAt(0) === 3) { type = "h3"; t = t.slice(1); }
      else if (t.charCodeAt(0) === 6) { type = "tbl"; t = t.slice(1); }
      return { type, text: t, idx: i, empty: t.trim() === "" };
    });

    // 第二遍：渲染
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.type === "tbl") {
        const table = document.createElement("table");
        table.className = "kn-table";
        while (i < lines.length && lines[i].type === "tbl") {
          const tr = document.createElement("tr");
          tr.dataset.i = lines[i].idx;
          const cellTexts = lines[i].text.split("\u0007");
          cellTexts.forEach((cellText) => {
            const td = document.createElement("td");
            td.className = "kn-td";
            cellText.split(/[\n\u001E]/).forEach((part, pi) => {
              if (pi > 0) td.appendChild(document.createElement("br"));
              td.appendChild(document.createTextNode(part));
            });
            tr.appendChild(td);
          });
          table.appendChild(tr);
          i++;
        }
        box.appendChild(table);
      } else {
        const el = document.createElement(l.type === "h1" || l.type === "h2" || l.type === "h3" ? l.type : "p");
        el.className = l.type === "p" ? "kn-p" + (l.empty ? " kn-p-empty" : "") : "kn-" + l.type;
        el.dataset.i = l.idx;
        el.textContent = l.text;
        box.appendChild(el);
        i++;
      }
    }
  }

  /* ---------- 来源定位后的知识点荧光高亮（纯 DOM 临时标记，绝不写入存储） ----------
     复用既有 paraIndex 定位机制；在已定位段落内匹配该条目保存的「核心内容」原文，
     空白容错（制表/换行差异），匹配失败（用户曾编辑核心内容）则退回整段闪烁。 */

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** 核心内容 → 空白容错正则源（原文与所选文本的空白差异不影响匹配） */
  function buildTolerantSource(text) {
    return escapeRegExp(String(text).trim()).replace(/\s+/g, "\\s+");
  }

  /** 在段落内高亮核心内容：命中返回 true。DOM 重建为 前/标记/后 三段，不改原文文字 */
  function highlightInPara(para, content) {
    let raw = para.textContent;
    // 去除段落开头的结构标记（\u0001-\u0003），使索引对齐不含标记的已保存核心内容
    if (raw && raw.charCodeAt(0) <= 3 && raw.charCodeAt(0) >= 1) {
      const first = para.firstChild;
      if (first && first.nodeType === 3) {
        first.nodeValue = first.nodeValue.slice(1);
        raw = raw.slice(1);
      }
    }
    // 临时移除用户划重点 span，避免干扰来源高亮的文本匹配
    clearUserHighlights(para);
    raw = para.textContent;
    if (!raw || !content || !content.trim()) return false;
    let re;
    try { re = new RegExp(buildTolerantSource(content), "g"); }
    catch (e) { return false; }
    const m = re.exec(raw);
    if (!m) return false;
    const start = m.index, end = m.index + m[0].length;
    para.textContent = "";
    para.appendChild(document.createTextNode(raw.slice(0, start)));
    const mark = document.createElement("span");
    mark.className = "kn-hl";
    mark.textContent = raw.slice(start, end); // 高亮目标 = 条目保存的核心内容原样
    para.appendChild(mark);
    para.appendChild(document.createTextNode(raw.slice(end)));
    // 来源高亮完成后仅恢复当前段落的用户划重点（避免全局重建干扰其他段落）
    if (currentMaterial) applyHighlightsInPara(para, currentMaterial.id);
    return true;
  }

  /* ---------- 用户划重点（持久化存储，与来源高亮 .kn-hl 互不干扰） ----------
     v0.8.16 架构重构，三条铁律：
     1. 状态只存数据：{paraIndex, start, end} 为块内字符偏移区间，DOM 仅是投影，
        重渲染/滚动/添加知识都不影响高亮状态
     2. 增删按偏移判定：选区区间 ∩ 已存区间 → 删；无交集 → 增。
        与文本内容无关，同一文本出现多处互不影响
     3. 渲染无条件先解包：clearUserHighlights 后再按区间包裹，
        取消最后一条同样生效；包裹用「先插入再移入」锚定原位置，文字顺序绝不改变 */

  function getMaterialHighlights(materialId) {
    return highlights[materialId] || [];
  }

  /** 解包段落内全部 .kn-hl-user（含嵌套）并 normalize 合并文本节点 → 恢复纯文本态 */
  function clearUserHighlights(para) {
    const spans = para.querySelectorAll(".kn-hl-user");
    spans.forEach((s) => {
      const p = s.parentNode;
      if (!p) return;
      while (s.firstChild) p.insertBefore(s.firstChild, s);
      p.removeChild(s);
    });
    if (spans.length) para.normalize();
  }

  /** 旧格式迁移 {paraIndex,text} → {paraIndex,start,end}：按段落文本首次命中定位，返回迁移数 */
  function migrateLegacyHighlights(para, materialId) {
    const pi = parseInt(para.dataset.i || "0", 10);
    const raw = para.textContent || "";
    let n = 0;
    getMaterialHighlights(materialId).forEach((h) => {
      if (h.paraIndex === pi && typeof h.start !== "number" && h.text) {
        const t = h.text.trim();
        const idx = raw.indexOf(t);
        if (idx >= 0) { h.start = idx; h.end = idx + t.length; delete h.text; n++; }
      }
    });
    return n;
  }

  /** 区间合并：重叠/相邻合并为升序不交区间（包裹时相邻视觉连续，数据仍独立可取消） */
  function mergeHighlightRanges(rs) {
    if (!rs.length) return [];
    rs.sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [{ start: rs[0].start, end: rs[0].end }];
    for (let i = 1; i < rs.length; i++) {
      const last = out[out.length - 1], r = rs[i];
      if (r.start <= last.end) { if (r.end > last.end) last.end = r.end; }
      else out.push({ start: r.start, end: r.end });
    }
    return out;
  }

  /** 按区间包裹文本：先快照文本节点，再倒序 splitText+wrap。
     支持跨多文本节点（<br> 两侧、td 之间、与其他 span 混排）；
     倒序处理保证后包裹的 split 不影响已包裹片段；insertBefore(span, n) 锚定原位置 */
  function wrapUserRange(para, start, end) {
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    const frags = [];
    let node, base = 0;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      const s = Math.max(start - base, 0);
      const e = Math.min(end - base, len);
      if (s < e) frags.push({ node, s, e });
      base += len;
    }
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      let n = f.node;
      if (f.s > 0) n = n.splitText(f.s);
      if (f.e - f.s < n.nodeValue.length) n.splitText(f.e - f.s);
      const span = document.createElement("span");
      span.className = "kn-hl-user";
      n.parentNode.insertBefore(span, n); // 先插入锚点再移入节点：位置不丢
      span.appendChild(n);
    }
  }

  /** 在单个块元素上重建用户高亮：无条件先清理（数据已空也要解包），再按需包裹 */
  function applyHighlightsInPara(para, materialId) {
    clearUserHighlights(para);
    const pi = parseInt(para.dataset.i || "0", 10);
    if (migrateLegacyHighlights(para, materialId) > 0) saveHighlights();
    const ranges = getMaterialHighlights(materialId)
      .filter((h) => h.paraIndex === pi && typeof h.start === "number" && h.end > h.start)
      .map((h) => ({ start: h.start, end: h.end }));
    mergeHighlightRanges(ranges).forEach((r) => wrapUserRange(para, r.start, r.end));
  }

  /** 全量重建阅读页高亮：逐块清理+包裹。无数据也执行 → 取消后视觉必然同步 */
  function applyHighlights(materialId) {
    if (!materialId) return;
    document.querySelectorAll("#rd-text [data-i]").forEach((el) => {
      applyHighlightsInPara(el, materialId);
    });
  }

  /** Range → 各块元素内的偏移区间 [{el, paraIndex, start, end}]
     块内字符坐标 = 该块所有文本节点按文档序拼接（<br> 不计字符）；
     跨段落/跨单元格选区自动拆分为每块独立区间，两端空白自动收窄 */
  function getSelectionRangesByPara(range) {
    const root = document.getElementById("rd-text");
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const blocks = [];
    let cur = null, base = 0, node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement ? node.parentElement.closest("#rd-text [data-i]") : null;
      if (!cur || cur.el !== el) {
        cur = el ? { el, paraIndex: parseInt(el.dataset.i || "0", 10), start: -1, end: -1, text: "" } : null;
        base = 0;
        if (cur) blocks.push(cur);
      }
      if (cur) {
        cur.text += node.nodeValue;
        if (range.intersectsNode(node)) {
          const s = range.startContainer === node ? range.startOffset : 0;
          const e = range.endContainer === node ? range.endOffset : node.nodeValue.length;
          if (e > s) {
            const gs = base + s, ge = base + e;
            if (cur.start < 0) { cur.start = gs; cur.end = ge; }
            else { cur.start = Math.min(cur.start, gs); cur.end = Math.max(cur.end, ge); }
          }
        }
        base += node.nodeValue.length;
      }
    }
    return blocks
      .filter((b) => b.start >= 0 && b.end > b.start)
      .map((b) => {
        // 收窄两端空白，offset 始终对齐块文本
        while (b.start < b.end && /\s/.test(b.text[b.start])) b.start++;
        while (b.end > b.start && /\s/.test(b.text[b.end - 1])) b.end--;
        return b;
      })
      .filter((b) => b.end > b.start);
  }

  /** 划重点切换：纯数据层偏移运算，视觉由 applyHighlights 全量重建 */
  function toggleHighlight(sel) {
    if (!currentMaterial) return;
    const mid = currentMaterial.id;
    const blocks = getSelectionRangesByPara(sel.getRangeAt(0));
    if (!blocks.length) return;
    const cur = highlights[mid] || [];
    // 与选区重叠的已存区间整体移除（偏移判定 → 同文多处互不影响）；有移除即为「取消」
    const kept = [];
    let removed = false;
    cur.forEach((h) => {
      if (typeof h.start === "number" &&
          blocks.some((b) => b.paraIndex === h.paraIndex && h.start < b.end && b.start < h.end)) {
        removed = true;
      } else kept.push(h);
    });
    if (!removed) {
      blocks.forEach((b) => kept.push({ paraIndex: b.paraIndex, start: b.start, end: b.end }));
    }
    if (kept.length) highlights[mid] = kept; else delete highlights[mid];
    saveHighlights();
    applyHighlights(mid);
  }

  let hlEndTimer = null;
  /** 文本选择结束后触发划重点（仅在普通阅读模式下） */
  function onTextSelectEnd() {
    clearTimeout(hlEndTimer);
    hlEndTimer = setTimeout(() => {
      if (selMode || activePageId() !== "page-reader") return;
      const sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const raw = String(sel).trim();
      if (!raw) return;
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === 3 ? node.parentElement : node;
      if (!el || !el.closest || !el.closest("#rd-text")) return;
      toggleHighlight(sel);
      // 清除浏览器原生选区
      try { sel.removeAllRanges(); } catch (e) { /* 部分内核受限 */ }
    }, 150);
  }

  function openReader(materialId, focusPara, hlText, from) {
    const m = materials.items.find((x) => x.id === materialId);
    if (!m) return false;
    // 进入阅读页前清理一切摘取临时状态；重渲染正文自然清除上一次高亮
    closeEditor();
    exitSelectMode(false);
    readerFrom = from === "repository" ? "repository" : "knowledge"; // 记录 entrySource
    if (readerFrom !== "repository") repoBackState = null; // Knowledge 入口与 Repository 快照互斥
    currentMaterial = m;
    $("#rd-title").textContent = m.title;
    renderReaderText(m.text); // 每次重渲染 → 来源高亮不会跨条目残留
    applyHighlights(m.id);     // 恢复该资料已保存的用户划重点
    switchTab("reader"); // 复用既有页面切换（app.js 全局）
    document.body.classList.add("kn-reading"); // 沉浸：隐藏底部导航
    setReaderOverlay(true); // 阅读页内显示系统悬浮条（与软件外同一悬浮查词条）
    if (focusPara != null) {
      // Repository → 来源 → 定位到知识点所在段落 + 核心内容荧光高亮
      setTimeout(() => {
        const el = document.querySelector('#rd-text [data-i="' + focusPara + '"]');
        if (!el) return;
        const marked = hlText ? highlightInPara(el, hlText) : false;
        el.scrollIntoView({ block: "center" });
        if (!marked) {
          // 未命中（核心内容被编辑过等）：退回整段闪烁，仍是该条目记录的正确位置
          el.classList.add("kn-flash");
          setTimeout(() => el.classList.remove("kn-flash"), 2400);
        }
      }, 300);
    }
    return true;
  }

  function exitReader() {
    document.body.classList.remove("kn-reading");
    closeEditor();
    exitSelectMode(false);
    currentMaterial = null;
    readerFrom = null;
    setReaderOverlay(false); // 退出阅读页：恢复「应用前台隐藏系统悬浮条」的既有行为
  }

  /** 阅读页统一返回：按 entrySource 决定返回目标。
      左上角返回按钮 / 系统返回键 / 全面屏手势三者最终都汇聚于此 ——
      同一函数、同一状态、同一行为，绝不出现返回路径不一致。 */
  function backFromReader() {
    const from = readerFrom;
    exitReader();
    if (from === "repository") {
      renderRepo(); // 类型(repoFilter)/搜索(repoSearchKw+输入框)为内存与 DOM 态，自然保留
      switchTab("repo");
      // 还原离开 Repository 时的展开卡片与滚动位置（switchTab 会 scrollTo(0)，在此恢复）
      if (repoBackState) {
        if (repoBackState.openId) {
          const card = document.querySelector('#rp-list .rp-card[data-id="' + repoBackState.openId + '"]');
          if (card) card.classList.add("open");
        }
        window.scrollTo(0, repoBackState.scroll || 0);
      }
    } else {
      renderMaterials();
      switchTab("knowledge");
    }
  }

  /* ================= 应用内悬浮查词（复用系统级悬浮条，开闭原则纯新增） =================
     软件外悬浮条 = 本阅读页悬浮条 = Repository 来源阅读页悬浮条：
     同一 OverlayService 窗口、同一 overlay.html UI、同一拖动/贴边/查询机制、
     同一 localStorage 查询记录。此处只做三件事：
     1. 进/出阅读页通知原生显隐该系统悬浮条
     2. 普通阅读（selMode=null）选中英文单词/短语 → 悬浮条自动展开查询
     3. 进入摘取模式/编辑面板 → 收起悬浮条展开态（与摘取交互彻底互斥）
     Web 版（无 AndroidBridge）全部静默跳过，零影响。 */

  function overlayBridge() {
    const b = window.AndroidBridge;
    return b && typeof b.overlayQuery === "function" ? b : null;
  }

  /** 悬浮条跟随「后台悬浮查词」开关：用户未开启则应用内同样不出现（尊重关闭意图） */
  function overlayEnabled() {
    return !!overlayBridge() && localStorage.getItem("vc-overlay") === "1";
  }

  let ovHintShown = false; // 未开启悬浮查词时的引导提示（每次会话最多一次）

  function setReaderOverlay(on) {
    const b = overlayBridge();
    if (!b) return;                      // Web 版：无桥接
    if (on && !overlayEnabled()) return; // 开关未开：不显示也不启动服务
    try { b.setOverlayInApp(on); } catch (e) { /* 桥接异常静默 */ }
  }

  /** 普通阅读态选区稳定后触发：英文单词/短语 → 系统悬浮条自动查询 */
  function tryOverlayQuery() {
    const b = overlayBridge();
    if (!b) return;
    if (!overlayEnabled()) {
      if (!ovHintShown) {
        ovHintShown = true;
        showToast("设置中开启「后台悬浮查词」后，阅读时选中单词即可查询");
      }
      return;
    }
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const raw = String(sel).trim();
    if (!raw) return;
    // 仅阅读正文内的选区（与摘取模式同一判定源）
    const node = sel.getRangeAt(0).startContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;
    if (!el || !el.closest || !el.closest("#rd-text")) return;
    // 查询目标 = 英文单词/短语（1~5 词）；整句/中文等不属于查词场景，不触发
    if (!/^[A-Za-z][A-Za-z'’\-]*(?:[ ]+[A-Za-z][A-Za-z'’\-]*){0,4}$/.test(raw)) return;
    try { b.overlayQuery(raw); } catch (e) { /* 静默 */ }
  }

  /** 摘取模式/编辑面板弹出时收起悬浮条展开态（服务未运行时原生静默忽略） */
  function overlayCollapse() {
    const b = overlayBridge();
    if (!b) return;
    try { b.overlayCollapse(); } catch (e) { /* 静默 */ }
  }

  /* ---------- 添加文本模式（与普通阅读彻底分离的状态机） ----------
     null           普通阅读：完全交给 Android 原生选择/复制，本模块零注入
     "content"      摘取核心知识内容（由「＋ 添加知识」进入）
     "explanation"  摘取中文解释（由编辑面板「从原文选择解释」进入）
     "context"      摘取上下文（由编辑面板「从原文选择上下文」进入）
     状态仅存于内存，不持久化 —— App 重启后自然为 null            */

  let selMode = null;
  let pendingDraft = null; // explanation / context 子模式对应的编辑草稿
  let lastSel = null;      // {text, paraIndex} 选区快照（仅摘取模式内更新）

  const SEL_HINTS = {
    content: "请选择要保存的知识内容",
    explanation: "请选择中文解释",
    context: "请选择上下文"
  };

  function enterSelectMode(mode, draft) {
    if (mode === "content" && !currentMaterial) return;
    if (activePageId() !== "page-reader") return; // 仅阅读页内可进入
    overlayCollapse(); // 收起悬浮条展开态：摘取模式与悬浮查词两种交互彻底互斥
    selMode = mode;
    pendingDraft = draft || null;
    lastSel = null;
    $("#kn-selbar-hint").textContent = SEL_HINTS[mode] || SEL_HINTS.content;
    $("#kn-selbar-confirm").disabled = true;
    $("#kn-selbar").hidden = false;
    document.body.classList.add("kn-selecting");
  }

  /** 退出摘取模式：清选区、清标志；reopenEditor=true 时恢复编辑面板 */
  function exitSelectMode(reopenEditor) {
    const wasSub = selMode === "explanation" || selMode === "context";
    const d = pendingDraft;
    selMode = null;
    pendingDraft = null;
    lastSel = null;
    $("#kn-selbar").hidden = true;
    $("#kn-selbar-confirm").disabled = true;
    document.body.classList.remove("kn-selecting");
    const s = window.getSelection && window.getSelection();
    if (s && s.removeAllRanges) { try { s.removeAllRanges(); } catch (e) { /* 部分内核受限 */ } }
    if (reopenEditor && wasSub && d) openEditor(d);
  }

  let selTimer = null;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const btn = $("#kn-selbar-confirm");
      if (!btn) return;
      // 普通阅读（selMode=null）：不注入任何 UI，划重点由 mouseup/touchend 触发
      if (!selMode || activePageId() !== "page-reader") {
        lastSel = null;
        btn.disabled = true;
        return;
      }
      const sel = window.getSelection ? window.getSelection() : null;
      const raw = sel ? String(sel) : "";
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !raw || !raw.trim()) {
        lastSel = null;
        btn.disabled = true;
        return;
      }
      // 限定选区位于当前文档文本内
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === 3 ? node.parentElement : node;
      if (!el || !el.closest || !el.closest("#rd-text")) {
        lastSel = null;
        btn.disabled = true;
        return;
      }
      const para = el.closest("#rd-text [data-i]");
      lastSel = {
        text: raw, // 原样保留用户所选文字，绝不改写
        paraIndex: para ? parseInt(para.dataset.i || "0", 10) : 0
      };
      btn.disabled = false;
    }, 240);
  });

  function confirmSelection() {
    if (!selMode || !lastSel) return;
    if (selMode === "content") {
      const draft = {
        content: lastSel.text,       // 核心内容：用户主动选择
        explanation: "",             // 中文解释：可选，用户后续决定
        context: "",                 // 上下文：可选，绝不自动生成
        paraIndex: lastSel.paraIndex,
        materialId: currentMaterial ? currentMaterial.id : "",
        sourceTitle: currentMaterial ? currentMaterial.title : "手动添加"
      };
      exitSelectMode(false);
      openEditor(draft);
    } else if (selMode === "explanation") {
      pendingDraft.explanation = lastSel.text;
      exitSelectMode(true);
    } else if (selMode === "context") {
      pendingDraft.context = lastSel.text;
      exitSelectMode(true);
    }
  }

  /* ================= 条目编辑 Bottom Sheet ================= */

  const editorState = { open: false, catId: "phrase", draft: null };

  function openEditor(draft) {
    if (!draft) return;
    overlayCollapse(); // 编辑面板弹出时收起悬浮条展开态，避免遮挡
    editorState.draft = draft;
    if (!allCats().some((c) => c.id === editorState.catId)) {
      const first = allCats()[0]; // 预设默认类型可能已被删除 → 退回首个可用类型
      editorState.catId = first ? first.id : editorState.catId;
    }
    $("#kn-content").value = draft.content || "";
    $("#kn-explain").value = draft.explanation || "";
    $("#kn-context").value = draft.context || "";
    $("#kn-newcat").hidden = true;
    $("#kn-newcat-input").value = "";
    renderEditorCats();
    $("#kn-overlay").classList.add("visible");
    $("#kn-sheet").classList.add("open");
    $("#kn-sheet").setAttribute("aria-hidden", "false");
    // 手动创建模式：隐藏「从原文选择」按钮（无原文可选）
    if (draft.isManual) $("#kn-sheet").dataset.manual = "true";
    else delete $("#kn-sheet").dataset.manual;
    editorState.open = true;
  }

  function closeEditor() {
    if (!editorState.open) return;
    $("#kn-overlay").classList.remove("visible");
    $("#kn-sheet").classList.remove("open");
    $("#kn-sheet").setAttribute("aria-hidden", "true");
    editorState.open = false;
    editorState.draft = null;
  }

  /** 面板输入同步回草稿（进入子模式摘取 / 保存前调用，防止丢编辑） */
  function syncDraftFromSheet() {
    const d = editorState.draft;
    if (!d) return;
    d.content = $("#kn-content").value;
    d.explanation = $("#kn-explain").value.trim();
    d.context = $("#kn-context").value.trim();
  }

  function renderEditorCats() {
    $("#kn-cats").innerHTML = allCats().map((c) =>
      `<button class="kn-cat${c.id === editorState.catId ? " on" : ""}" data-cat="${c.id}" type="button">${esc(c.name)}</button>`
    ).join("") + `<button class="kn-cat kn-cat-add" data-newcat type="button">＋ 自定义</button>`;
  }

  function createCustomCat(name) {
    const n = String(name || "").trim();
    if (!n) { showToast("请输入分类名称"); return false; }
    if (allCats().some((c) => c.name === n)) { showToast("已存在同名分类"); return false; }
    const cat = { id: uid("c"), name: n, createdAt: Date.now() };
    repo.customCats.push(cat);
    saveRepo();
    editorState.catId = cat.id;
    return true;
  }

  /** 保存：核心内容 + 可选解释/上下文 + 分类；同分类同内容 → 合并来源 */
  function saveEntry() {
    syncDraftFromSheet();
    const draft = editorState.draft;
    if (!draft) return;
    const content = draft.content;
    if (!content || !content.trim()) { showToast("核心内容不能为空"); return; }
    const explanation = draft.explanation || "";
    const context = draft.context || "";
    const catId = editorState.catId;
    const src = draft.isManual ? { materialId: "", title: "", paraIndex: null, at: Date.now() } : {
      materialId: draft.materialId || "",
      title: draft.sourceTitle || "手动添加",
      paraIndex: draft.paraIndex != null ? draft.paraIndex : null,
      at: Date.now()
    };
    const dup = repo.entries.find((e) =>
      e.catId === catId && normText(e.content) === normText(content));

    if (dup) {
      const samePos = dup.sources.some((s) =>
        s.materialId === src.materialId && s.paraIndex === src.paraIndex);
      if (!samePos) dup.sources.push(src); // 同一短语在 Day3 / Day10 都出现 → 保留多来源
      if (explanation && !dup.explanation) dup.explanation = explanation;
      if (context && !dup.context) dup.context = context;
      dup.lastAt = src.at;
      saveRepo();
      showToast("该内容已存在于「" + catName(catId) + "」· 已合并来源");
    } else {
      repo.entries.unshift({
        id: uid("k"),
        content: content,
        explanation: explanation, // 可为空：详情区不渲染
        context: context,         // 可为空：详情区不渲染
        catId: catId,
        sources: draft.isManual ? [] : [src],
        createdAt: src.at,
        lastAt: src.at
      });
      saveRepo();
      showToast("已加入 Repository · " + catName(catId));
    }
    closeEditor();
    updateHomeBadges();
    if (activePageId() === "page-repo") renderRepo();
    // 连续添加：当前在阅读页（有活跃资料） → 自动回到内容选择态
    if (currentMaterial && activePageId() === "page-reader") {
      enterSelectMode("content");
    }
  }

  /* ================= Repository：列表 / 分类筛选 / 搜索 / 展开 / 来源回跳 ================= */

  let repoFilter = "all";
  let repoSearchKw = ""; // 搜索关键词：与当前分类联动 —— 先按分类，再按关键词/时间进一步筛选
  let searchTimer = null;

  /** 搜索匹配文本：核心内容 + 中文解释 + 上下文 + 添加时间（均来自已保存数据，不修改） */
  function entrySearchText(e) {
    return (e.content + "\n" + (e.explanation || "") + "\n" + (e.context || "") +
      "\n" + fmtCN(e.createdAt)).toLowerCase();
  }

  /** 搜索结果中的关键词轻量高亮（esc 后包 mark，不影响原文与来源定位） */
  function kwHl(text, kw) {
    const safe = esc(text);
    if (!kw) return safe;
    try {
      const re = new RegExp("(" + escapeRegExp(kw) + ")", "gi");
      return safe.replace(re, '<mark class="kn-kw">$1</mark>');
    } catch (err) {
      return safe;
    }
  }

  function renderRepo() {
    const chips = [{ id: "all", name: "全部" }].concat(allCats());
    $("#rp-chips").innerHTML = chips.map((c) =>
      `<button class="kn-cat${c.id === repoFilter ? " on" : ""}" data-rpcat="${c.id}" type="button">${esc(c.name)}</button>`
    ).join("");

    // 筛选管线：Repository → 当前选中类型 → 关键词/时间条件 → 结果
    const kw = repoSearchKw.trim().toLowerCase();
    const byCat = repoFilter === "all"
      ? repo.entries
      : repo.entries.filter((e) => e.catId === repoFilter);
    const list = kw ? byCat.filter((e) => entrySearchText(e).indexOf(kw) !== -1) : byCat;

    const catLabel = repoFilter === "all" ? "全部" : catName(repoFilter);
    $("#rp-search-input").placeholder = "搜索「" + catLabel + "」的内容或时间";
    $("#rp-search-clear").hidden = !repoSearchKw;

    $("#rp-count").textContent = kw
      ? catLabel + " · 匹配 " + list.length + " / " + byCat.length + " 条"
      : repo.entries.length + " 条知识条目" +
        (repoFilter === "all" ? "" : " · " + catLabel + " " + list.length + " 条");

    $("#rp-empty").hidden = list.length !== 0;
    if (list.length === 0) {
      $("#rp-empty").innerHTML = kw
        ? '<p>没有匹配的知识条目</p><p class="kn-empty-sub">换个关键词，或点 ✕ 查看当前分类全部</p>'
        : '<p>暂无知识条目</p><p class="kn-empty-sub">去 Knowledge 打开一份学习资料，摘取内容加入</p>';
    }

    $("#rp-list").innerHTML = list.map((e) => {
      const firstSrc = e.sources[e.sources.length - 1];
      const srcChips = e.sources.map((s) => {
        const missing = !materials.items.some((m) => m.id === s.materialId);
        return `<button class="rp-src${missing ? " missing" : ""}" data-src data-m="${esc(s.materialId)}" data-p="${s.paraIndex != null ? s.paraIndex : ""}" type="button">
          ${DOC_SVG}<b>${esc(s.title)}</b><span>${fmtCN(s.at)}</span>
        </button>`;
      }).join("");
      return `
      <li class="rp-card" data-id="${e.id}">
        <div class="rp-card-head">
          <div class="rp-card-main">
            <span class="rp-tag">${esc(catName(e.catId))}</span>
            <p class="rp-clamp">${kwHl(e.content, kw)}</p>
            <p class="rp-meta">${esc(firstSrc ? firstSrc.title : "手动添加")}${e.sources.length > 1 ? " · " + e.sources.length + " 个来源" : ""}</p>
          </div>
          ${CHEV_SVG}
        </div>
        <div class="rp-detail-wrap"><div class="rp-detail"><div class="rp-detail-in">
          <p class="rp-label">核心内容</p>
          <p class="rp-full">${kwHl(e.content, kw)}</p>
          ${e.explanation ? `<p class="rp-label">中文解释</p><p class="rp-explain">${kwHl(e.explanation, kw)}</p>` : ""}
          ${e.context ? `<p class="rp-label">上下文</p><div class="rp-quote">${kwHl(e.context, kw)}</div>` : ""}
          <p class="rp-label">来源</p>
          ${e.sources.length > 0
            ? `<div>${srcChips}</div>`
            : `<p class="rp-meta">手动添加</p>`}
          <div class="rp-foot">
            <span class="rp-time">添加于 ${fmtCN(e.createdAt)}</span>
            <button class="rp-del" data-rpdel type="button">删除</button>
          </div>
        </div></div></div>
      </li>`;
    }).join("");
  }

  function deleteEntry(id) {
    repo.entries = repo.entries.filter((e) => e.id !== id); // 只删条目，不动学习资料
    saveRepo();
    renderRepo();
    updateHomeBadges();
    showToast("已删除条目 · 学习资料不受影响");
  }

  /* ================= 删除整个类型（长按入口 · 输入类型名二次确认 · 级联删除全部条目） ================= */

  /** 长按类型 chip 后弹出：明确告知后果 + 输入类型名完全一致才可删除 */
  function confirmDeleteCat(catId) {
    const cat = allCats().find((c) => c.id === catId);
    if (!cat) return;
    const n = repo.entries.filter((e) => e.catId === catId).length;
    const old = document.getElementById("kn-catdel-mask");
    if (old) old.remove();
    const mask = document.createElement("div");
    mask.id = "kn-catdel-mask";
    mask.className = "kn-catdel-mask";
    mask.innerHTML = `
      <div class="kn-catdel" role="dialog" aria-modal="true">
        <p class="kn-catdel-title">删除类型</p>
        <p class="kn-catdel-text">即将删除：<b>【${esc(cat.name)}】</b></p>
        <p class="kn-catdel-text">该类型下有 <b>${n}</b> 条知识条目。删除该类型后，该类型下的所有知识条目也将一并永久删除，此操作不可恢复。</p>
        <p class="kn-catdel-tip">请输入「${esc(cat.name)}」以确认删除</p>
        <input id="kn-catdel-input" type="text" autocomplete="off" placeholder="${esc(cat.name)}" />
        <div class="kn-catdel-btns">
          <button id="kn-catdel-cancel" type="button">取消</button>
          <button id="kn-catdel-ok" type="button" disabled>永久删除</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const input = mask.querySelector("#kn-catdel-input");
    const okBtn = mask.querySelector("#kn-catdel-ok");
    const close = () => mask.remove();
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    mask.querySelector("#kn-catdel-cancel").addEventListener("click", close);
    input.addEventListener("input", () => {
      okBtn.disabled = input.value !== cat.name; // 输入与类型名完全一致才允许删除
    });
    okBtn.addEventListener("click", () => {
      if (okBtn.disabled) return;
      close();
      deleteCategory(catId);
    });
    setTimeout(() => { try { input.focus(); } catch (e) { /* 部分内核受限 */ } }, 50);
  }

  /** 执行删除：类型 + 该类型下全部条目（原文/解释/上下文/来源/时间整条数据，无孤立残留） */
  function deleteCategory(catId) {
    const cat = allCats().find((c) => c.id === catId);
    if (!cat) return;
    const n = repo.entries.filter((e) => e.catId === catId).length;
    // 预设类型为代码常量 → 记入 hiddenPresetCats 持久隐藏；自定义类型直接删
    if (PRESET_CATS.some((c) => c.id === catId)) {
      if (!repo.hiddenPresetCats) repo.hiddenPresetCats = [];
      if (repo.hiddenPresetCats.indexOf(catId) === -1) repo.hiddenPresetCats.push(catId);
    } else {
      repo.customCats = repo.customCats.filter((c) => c.id !== catId);
    }
    repo.entries = repo.entries.filter((e) => e.catId !== catId);
    if (repoFilter === catId) repoFilter = "all";
    if (editorState.catId === catId) {
      const first = allCats()[0];
      editorState.catId = first ? first.id : editorState.catId;
    }
    saveRepo();          // 持久化：重启后类型与条目均不复活
    renderRepo();        // 类型列表 / 条目列表 / 数量 / 搜索结果立即同步
    updateHomeBadges();  // 首页角标同步
    if (editorState.open) renderEditorCats(); // 编辑面板若打开同步类型选项
    showToast("已删除「" + cat.name + "」及其 " + n + " 条知识条目");
  }

  /* ================= 首页角标 / 导航 ================= */

  function updateHomeBadges() {
    $("#kn-entry-sub").textContent = "学习资料 · " + materials.items.length + " 份";
    $("#repo-entry-sub").textContent = "知识条目 · " + repo.entries.length + " 条";
  }

  function activePageId() {
    const pg = document.querySelector(".page.active");
    return pg ? pg.id : "";
  }

  function openKnowledge() {
    exitReader(); // 复位阅读/摘取状态
    renderMaterials();
    switchTab("knowledge");
  }

  function openRepoPage() {
    exitReader();
    // 重新进入 Repository：清空搜索，避免残留筛选状态（分类保持既有选择）
    repoSearchKw = "";
    const inp = $("#rp-search-input");
    if (inp) inp.value = "";
    renderRepo();
    switchTab("repo");
  }

  /* ================= 事件绑定（全部为本模块新增元素） ================= */

  function bindEvents() {
    // 首页入口
    $("#kn-entry").addEventListener("click", openKnowledge);
    $("#repo-entry").addEventListener("click", openRepoPage);

    // 页面返回（Knowledge / Repository → 首页）
    $("#kn-back").addEventListener("click", () => { switchTab("home"); renderAll(); });
    $("#rp-back").addEventListener("click", () => { switchTab("home"); renderAll(); });
    // 阅读页返回：统一按 entrySource 返回 Knowledge / Repository（系统返回键/手势同走 backFromReader）
    $("#rd-back").addEventListener("click", () => backFromReader());

    // 上传（原生 / Web 双路径）
    $("#kn-upload").addEventListener("click", startUpload);
    // 导入菜单：文档 / 图片 / 拍照（选择后关菜单进入对应链路）
    $("#kn-import-cancel").addEventListener("click", closeImportMenu);
    $("#kn-import-overlay").addEventListener("click", closeImportMenu);
    $("#kn-import-doc").addEventListener("click", () => { closeImportMenu(); importDocument(); });
    $("#kn-import-img").addEventListener("click", () => { closeImportMenu(); importImage(); });
    $("#kn-import-cam").addEventListener("click", () => { closeImportMenu(); importPhoto(); });
    $("#kn-file").addEventListener("change", async () => {
      const input = $("#kn-file");
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return; // 未选中文件：不产生任何解析状态
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const fn = parsers[ext];
      if (!fn) { showKnError("暂不支持该格式（支持 .docx / .txt）"); return; }
      parseSeq++;            // 真实任务开始，才进入「解析中」
      setParsing(true);
      try {
        const r = await fn(file);
        ingestParseResult({ ok: true, name: file.name, text: r.text });
      } catch (err) {
        ingestParseResult({ ok: false, error: err && err.message ? err.message : "解析失败" });
      }
    });

    // 学习资料列表：打开阅读 / 二次确认删除
    $("#kn-list").addEventListener("click", (e) => {
      const del = e.target.closest("[data-mdel]");
      if (del) {
        if (!del.classList.contains("confirm")) {
          del.classList.add("confirm");
          del.textContent = "确认删除";
          setTimeout(() => {
            del.classList.remove("confirm");
            del.innerHTML = TRASH_SVG;
          }, 2600);
          return;
        }
        deleteMaterial(del.closest(".kn-item").dataset.id);
        return;
      }
      const item = e.target.closest(".kn-item");
      if (item) openReader(item.dataset.id);
    });

    // 添加知识：进入「添加文本模式」（唯一的摘取入口）
    $("#kn-add").addEventListener("click", () => enterSelectMode("content"));

    // 摘取模式操作条
    $("#kn-selbar-confirm").addEventListener("click", confirmSelection);
    $("#kn-selbar-cancel").addEventListener("click", () => {
      const sub = selMode === "explanation" || selMode === "context";
      exitSelectMode(sub); // 子模式取消 → 回到编辑面板（视为跳过该可选项）
    });

    // 编辑面板
    $("#kn-overlay").addEventListener("click", closeEditor);
    $("#kn-sheet-cancel").addEventListener("click", closeEditor);
    $("#kn-cats").addEventListener("click", (e) => {
      const cat = e.target.closest("[data-cat]");
      if (cat) {
        editorState.catId = cat.dataset.cat;
        renderEditorCats();
        return;
      }
      if (e.target.closest("[data-newcat]")) {
        $("#kn-newcat").hidden = false;
        $("#kn-newcat-input").focus();
      }
    });
    $("#kn-newcat-ok").addEventListener("click", () => {
      if (createCustomCat($("#kn-newcat-input").value)) {
        $("#kn-newcat").hidden = true;
        $("#kn-newcat-input").value = "";
        renderEditorCats();
      }
    });
    $("#kn-newcat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); $("#kn-newcat-ok").click(); }
    });
    // 从原文选择解释 / 上下文：面板暂收，进入对应摘取子模式
    $("#kn-pick-explain").addEventListener("click", () => {
      syncDraftFromSheet();
      const d = editorState.draft;
      closeEditor();
      enterSelectMode("explanation", d);
    });
    $("#kn-pick-context").addEventListener("click", () => {
      syncDraftFromSheet();
      const d = editorState.draft;
      closeEditor();
      enterSelectMode("context", d);
    });
    $("#kn-save").addEventListener("click", saveEntry);

    // Repository 手动添加知识
    $("#rp-add").addEventListener("click", () => {
      openEditor({
        content: "", explanation: "", context: "",
        catId: repoFilter !== "all" ? repoFilter : "phrase",
        materialId: "", paraIndex: null, sourceTitle: "",
        isManual: true
      });
    });

    // Repository 搜索：范围 = 当前选中分类；输入即时筛选（防抖）；清空恢复当前分类全部
    $("#rp-search-input").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        repoSearchKw = $("#rp-search-input").value;
        renderRepo(); // 分类切换/输入共用同一条筛选管线，天然联动
      }, 180);
    });
    $("#rp-search-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } // 收起键盘
    });
    $("#rp-search-clear").addEventListener("click", () => {
      $("#rp-search-input").value = "";
      repoSearchKw = "";
      renderRepo();
      $("#rp-search-input").focus();
    });

    // Repository 分类筛选 / 展开 / 来源回跳 / 删除
    let catPressTimer = null, catPressFired = false, catPressXY = null;
    const CAT_PRESS_MS = 600;
    const cancelCatPress = () => { clearTimeout(catPressTimer); catPressTimer = null; };
    // 长按类型 chip → 删除整个类型（类型 + 其下全部条目，二次输入确认）；「全部」不可删
    const rpChips = $("#rp-chips");
    rpChips.addEventListener("pointerdown", (e) => {
      const chip = e.target.closest("[data-rpcat]");
      if (!chip || chip.dataset.rpcat === "all") return;
      catPressFired = false;
      catPressXY = { x: e.clientX, y: e.clientY };
      cancelCatPress();
      catPressTimer = setTimeout(() => {
        catPressTimer = null;
        catPressFired = true;
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (err) { /* 无振动则忽略 */ }
        confirmDeleteCat(chip.dataset.rpcat);
      }, CAT_PRESS_MS);
    });
    rpChips.addEventListener("pointermove", (e) => {
      if (!catPressTimer || !catPressXY) return;
      if (Math.abs(e.clientX - catPressXY.x) > 10 || Math.abs(e.clientY - catPressXY.y) > 10) {
        cancelCatPress(); // 手指滑动（滚动意图）→ 取消长按
      }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
      rpChips.addEventListener(ev, cancelCatPress));
    rpChips.addEventListener("contextmenu", (e) => {
      if (e.target.closest("[data-rpcat]")) e.preventDefault(); // 长按不弹系统文本菜单
    });
    rpChips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-rpcat]");
      if (!chip) return;
      if (catPressFired) { catPressFired = false; return; } // 长按触发删除后吞掉本次 click
      if (chip.dataset.rpcat === repoFilter) return;
      repoFilter = chip.dataset.rpcat;
      renderRepo(); // 切换类型后按「新类型 + 现有关键词」重新筛选
    });
    $("#rp-list").addEventListener("click", (e) => {
      const src = e.target.closest("[data-src]");
      if (src) {
        // Repository → 来源 → 返回原文：沿用既有 paraIndex 定位，
        // 并以该条目保存的「核心内容」作为荧光高亮目标（每次重渲染，不残留上一次）
        const card = src.closest(".rp-card");
        const entry = card && repo.entries.find((x) => x.id === card.dataset.id);
        const paraIdx = src.dataset.p !== "" ? parseInt(src.dataset.p, 10) : null;
        // 记录离开 Repository 时的状态快照，返回时还原（滚动 + 展开的卡片；
        // 类型/搜索为内存与 DOM 态，无需快照）
        repoBackState = {
          scroll: window.scrollY || 0,
          openId: card ? card.dataset.id : null
        };
        if (!openReader(src.dataset.m, paraIdx, entry ? entry.content : "", "repository"))
          showToast("该资料已被删除 · 条目与来源记录仍完整保留");
        return;
      }
      const del = e.target.closest("[data-rpdel]");
      if (del) {
        if (!del.classList.contains("confirm")) {
          del.classList.add("confirm");
          del.textContent = "确认删除";
          setTimeout(() => { del.classList.remove("confirm"); del.textContent = "删除"; }, 2600);
          return;
        }
        deleteEntry(del.closest(".rp-card").dataset.id);
        return;
      }
      const head = e.target.closest(".rp-card-head");
      if (head) {
        const card = head.closest(".rp-card");
        const willOpen = !card.classList.contains("open");
        document.querySelectorAll("#rp-list .rp-card.open").forEach((c) => c.classList.remove("open"));
        if (willOpen) card.classList.add("open"); // 手风琴：同时只展开一条
      }
    });

    // 划重点：普通阅读模式下文本选择结束 → 自动高亮/取消高亮
    document.addEventListener("mouseup", onTextSelectEnd);
    document.addEventListener("touchend", onTextSelectEnd);

    // 切换主 Tab：彻底清理本模块所有临时状态（追加监听，不改既有处理器）
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
      closeEditor();
      exitSelectMode(false);
      document.body.classList.remove("kn-reading");
      currentMaterial = null;
      setReaderOverlay(false); // 防御性闭环：任何离开阅读页的路径都恢复悬浮条显隐
    }));

    // 前后台切换：后台时清选区（系统可能已清）；回前台校验摘取模式仍有效
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (selMode) { lastSel = null; $("#kn-selbar-confirm").disabled = true; }
      } else if (selMode && activePageId() !== "page-reader") {
        exitSelectMode(false); // 页面栈已变化：模式失效，安全退出
      }
    });
  }

  /* ================= 返回键：装饰既有 window.__back（不修改 app.js） ================= */

  function handleModuleBack() {
    if (selMode) {
      exitSelectMode(selMode === "explanation" || selMode === "context");
      return true;
    }
    if (editorState.open) { closeEditor(); return true; }
    const id = activePageId();
    if (id === "page-reader") {
      backFromReader(); // 系统返回键/全面屏手势与左上角按钮同一返回逻辑（按 entrySource）
      return true;
    }
    if (id === "page-knowledge" || id === "page-repo") {
      switchTab("home");
      renderAll();
      return true;
    }
    return false; // 交回原有处理链（首页等）
  }

  const prevBack = window.__back;
  window.__back = function () {
    if (handleModuleBack()) return true;
    return prevBack ? prevBack.apply(this, arguments) : false;
  };

  /* ================= 对外扩展点（供未来模块只读接入，如复习系统） ================= */

  window.VH_Knowledge = {
    open: openKnowledge,
    openRepo: openRepoPage,
    openReader: openReader,
    registerParser: registerParser,
    get materials() { return materials; },
    get repo() { return repo; }
  };

  /* ================= 初始化 ================= */

  loadStores();
  injectShell();
  bindEvents();
  updateHomeBadges();
  // 注意：selMode / pendingDraft / parseSeq 均为内存态，此处不恢复、
  // 不持久化 —— 冷启动永远是「普通阅读 + 无解析任务」的干净状态
})();
