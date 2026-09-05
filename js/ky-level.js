/* ============================================================
   考研词书释义分级模块
   ------------------------------------------------------------
   - 仅针对软件内置「考研词书」（js/dict.js 的 DICT_DATA）数据；
     ECDICT / 大词典 / 用户自建词条一律不参与（返回 null，走原有逻辑）。
   - 分级数据来源优先级：
     1) 人工标注（js/ky-manual.js 的 KY_MANUAL）：命中即返回人工结果，
        由人工逐条审视词书数据后判定，运行时直接读取、零分析。
     2) 算法兜底（未人工标注的词）：惰性构建全量映射，按「展平释义
        位置 + 单词词频排名」统一机制分类。
   - 每个释义：{ text, level: "common"|"normal"|"rare", obscure: bool }
     · common（绿）= 常见、通用释义
     · normal（黄）= 一般常见释义
     · rare  （灰）= 少见、生僻、冷门释义
     · obscure     = 考研「熟词僻义」标记（释义右上角小「僻」字）
   - 「僻」标记严格保守：宁可少标，不大量误标。
   ============================================================ */
(function () {
  "use strict";

  /* 分级阈值（统一机制，全词书一致） */
  const CFG = {
    commonRatio: 0.4,     // 展平位置前 40% → common（绿）
    rareRatio: 0.72,      // 展平位置后 28% → rare（灰）
    wordRankRatio: 0.18,  // 词频前 18% 的常见单词才可能标「僻」
    minN: 8,              // 释义数 < 8 不标「僻」（保守）
    obscureRatio: 0.72,   // 释义须位于展平位置后 28% 才可能为「僻」
    maxObscure: 1,        // 每词「僻」标记上限 1 条（宁可少标）
    maxLen: 4             // 复合/衍生释义（>4 字）不算「僻」
  };

  let LEVEL = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- 词性标准化（唯一规则源，主应用 / 悬浮条 / 导出共用） ----------
     词典原始数据存在旧式/异常词性标记：ECDICT 沿用旧词典约定（"a." 表形容词
     约 3.7 万条、"ad." 表副词、"vbl." 表动词），考研词书也存在个别脏数据
     （"vi. & ." / "vt. & vi. & ." / "n.n."）。展示层统一归一：
       · a. → adj.    ad. → adv.    vbl. → v.    interj. → int.    n.n. → n.
     · 复合词性（"vt. & vi. & ."）逐段归一，剔除空段（"."）与重复段；
     · 语域/学科域标签（"[经]"、"<美俚>"）与其他语义不唯一的标记
       （na./un./pl./comb./pref./suf./abbr. 等）原样保留，绝不猜测改写，
       保证原本显示正确的词条零变化。 */
  const POS_ALIASES = {
    "a.": "adj.",
    "ad.": "adv.",
    "vbl.": "v.",
    "interj.": "int.",
    "n.n.": "n.",
  };
  function normPos(pos) {
    const p = String(pos == null ? "" : pos).trim();
    if (!p) return p;
    const c0 = p.charAt(0);
    if (c0 === "[" || c0 === "<") return p; // 域标签原样保留
    if (p.indexOf("&") >= 0) {
      const seen = new Set();
      const out = [];
      p.split("&").forEach((seg) => {
        const s = normPos(seg); // 逐段递归：去空白 + 别名映射
        if (!s || s === ".") return; // 空段（脏数据 "vt. & vi. & ."）剔除
        const k = s.toLowerCase();
        if (seen.has(k)) return; // 重复段去重
        seen.add(k);
        out.push(s);
      });
      return out.length ? out.join(" & ") : p;
    }
    const mapped = POS_ALIASES[p.toLowerCase()];
    return mapped || p;
  }

  /* 语域 / 学科 / 用法标签 → 该释义天然偏专业、生僻、冷门（rare 强信号）。
     词书释义前缀形如 [方] / [俚] / <美俚> / [非标准用语、方言] 等。 */
  const RARE_TAGS = ["方", "俚", "古", "语", "哲", "医", "体", "音", "乐", "化", "物", "数", "法", "经", "纺", "商", "军", "宗", "律", "美俚", "英俚", "生物", "电子", "非标准用语", "方言"];
  function hasRareTag(t) {
    const m = /^(?:\[|<)([^\]>]+)(?:\]|>)/.exec(t);
    if (!m) return false;
    return RARE_TAGS.some((tag) => m[1].indexOf(tag) !== -1);
  }

  /** 两个中文字符串共享的字符数（用于判断释义是否语义相近） */
  function sharedChineseChars(a, b) {
    let n = 0;
    const setB = new Set(String(b));
    for (const ch of String(a)) { if (setB.has(ch)) n++; }
    return n;
  }

  /** 对单个词条分级：返回 { rows: [{pos, meanings:[{text,level,obscure}]}] }（与 senses 同构）。
      等级判定依据（不再只看全局展平位置，避免"中低频释义因词书排序靠前被标绿"）：
      1) 语域/学科标签 → rare（强信号，与位置无关）；
      2) 否则按「词性块内位置 × 块序号权重」：第一块（最常用词性）释义整体更常见，
         后续词性块逐级降权，块内靠后的释义降级；
      3) 全局位置仅作兜底（防止过长词条尾部误判）。 */
  function classify(senses, rankRatio) {
    const flat = [];
    senses.forEach(([, defs]) => (defs || []).forEach((t) => flat.push(t)));
    const N = flat.length;

    const rows = [];
    const items = [];
    senses.forEach(([pos, defs], si) => {
      const len = (defs || []).length;
      const meanings = (defs || []).map((t, fi) => {
        const m = { text: t, level: "normal", obscure: false };
        const globalIdx = items.length;
        const globalRatio = N <= 1 ? 0 : globalIdx / N;
        const local = len <= 1 ? 0 : (fi / len) * (1 - si * 0.12);
        if (N <= 2) m.level = "common";
        else if (hasRareTag(t)) m.level = "rare";
        else if (si === 0) {
          // 第一块（最常见词性）：块内靠前 → common，中部 → normal，靠后 → rare
          if (local <= 0.30 && globalRatio < 0.85) m.level = "common";
          else if (local <= 0.62) m.level = "normal";
          else m.level = "rare";
        } else {
          // 第二块及以后：最高 normal（避免"非主块开头释义无脑标绿"），靠后 → rare
          if (local <= 0.70) m.level = "normal";
          else m.level = "rare";
        }
        items.push({ m, ratio: globalRatio });
        return m;
      });
      rows.push({ pos: normPos(pos), meanings });
    });

    // 2) 僻义标记（严格保守）：
    //    单词须常见（词频前 wordRankRatio）、释义数足够、释义须位于后 obscureRatio、
    //    与首要释义语义区分明显（共享字 < 2）、非复合/衍生形态。
    const first = items.length ? items[0].m.text : "";
    const candidates = items.filter((it, i) => {
      if (rankRatio >= CFG.wordRankRatio) return false;   // 单词不够常见，不标
      if (N < CFG.minN) return false;                     // 释义太少，不标
      if (i === 0) return false;
      if (it.ratio < CFG.obscureRatio) return false;      // 位置靠前，不标
      const t = it.m.text;
      if (t.length > CFG.maxLen) return false;            // 复合/衍生词，不标
      if (/[（）()【】〔〕]/.test(t)) return false;        // 带说明性括号，不标
      if (hasRareTag(t)) return false;                    // 本身带生僻标签，不另标「僻」
      if (t === first) return false;
      if (sharedChineseChars(first, t) >= 2) return false; // 与首要释义相近，不标
      return true;
    });
    // 每词最多取最靠后的 maxObscure 条（宁可少标）
    candidates.slice(-CFG.maxObscure).forEach((it) => { it.m.obscure = true; });

    return { rows };
  }

  function buildAll() {
    const KEYS = Object.keys(DICT_DATA);
    const total = KEYS.length;
    const map = {};
    KEYS.forEach((word, rank) => {
      const d = DICT_DATA[word];
      if (!d || !d.senses) return;
      map[word] = classify(d.senses, rank / total);
    });
    LEVEL = map;
  }

  function ensure() { if (!LEVEL) buildAll(); return LEVEL; }

  /** 仅考研词书：分级数据 {rows:[{pos, meanings:[{text,level,obscure}]}]}；非考研词书返回 null。
      人工标注（KY_MANUAL）优先；未标注的词回退算法。 */
  function kyLevel(word) {
    const w = String(word || "").trim().toLowerCase();
    if (!w || !DICT_DATA[w]) return null;
    const manual = window.KY_MANUAL && KY_MANUAL[w];
    if (manual) {
      return {
        rows: manual.map((row) => ({
          pos: normPos(row.pos),
          meanings: row.meanings.map(([text, level, obscure]) => ({
            text,
            level: level === "rare" ? "rare" : level === "common" ? "common" : "normal",
            obscure: !!obscure
          }))
        }))
      };
    }
    return ensure()[w] || null;
  }

  /** 展平后的分级释义数组（按 senses 顺序，与 topSensesText/allSensesText 对齐） */
  function kyFlatMeanings(word) {
    const g = kyLevel(word);
    if (!g) return null;
    const out = [];
    g.rows.forEach((r) => r.meanings.forEach((m) => out.push(m)));
    return out;
  }

  /** 考研词书：按「高频优先」选出最具代表性的 N 条释义（供「看词选义」中文选项显示）。
      筛选优先级（绝不虚构释义，不足 N 条就少给）：
        1) common（绿 · 高频/常见）→ 2 条及以上取其中最核心的两条；
        2) 仅 1 条绿色时用 normal（黄 · 一般常见）补足；
        3) 仍不足 → 从该单词其余有效释义（含 rare 灰）补足。
      同级内保持词书原始顺序（最核心者在前）；最终展示顺序统一还原为词书原顺序。
      @param {string} word 单词
      @param {number} max  最多取几条（默认 2）
      @returns {Array<{pos:string,text:string,level:string,obscure:boolean}>|null}
               非考研词书（ECDICT / 大词典 / 自建词条）返回 null，由调用方回退原逻辑。 */
  function kyTopSenses(word, max = 2) {
    const g = kyLevel(word);
    if (!g) return null;

    const items = [];
    g.rows.forEach((r) => r.meanings.forEach((m) => {
      items.push({ pos: r.pos, text: m.text, level: m.level, obscure: m.obscure });
    }));
    if (!items.length) return null;

    const limit = Math.max(1, max | 0);
    const picked = [];
    const used = new Set();
    const texts = new Set();
    // 同词不同词性的重复释义（如 vt. 停止 / vi. 停止）只保留一次
    const fresh = (it) => !used.has(it) && !texts.has(it.text);
    const pick = (it) => { used.add(it); texts.add(it.text); picked.push(it); };

    const take = (level) => {
      for (const it of items) {
        if (picked.length >= limit) return;
        if (it.level !== level || !fresh(it)) continue;
        pick(it);
      }
    };
    take("common");   // 1) 绿色：高频 / 常见释义优先
    take("normal");   // 2) 黄色：绿色不足时补足
    for (const it of items) {   // 3) 兜底：其余有效释义补足（仍不虚构）
      if (picked.length >= limit) break;
      if (!fresh(it)) continue;
      pick(it);
    }
    // 展示顺序还原为词书原顺序，保持「由主到次」的阅读习惯
    picked.sort((a, b) => items.indexOf(a) - items.indexOf(b));
    return picked;
  }

  /** 单个释义 → HTML（等级色 span + 「僻」角标） */
  function kySpan(m) {
    const cls = m.level === "common" ? "ky-lv ky-lv-common"
      : m.level === "rare" ? "ky-lv ky-lv-rare"
      : "ky-lv ky-lv-normal";
    return `<span class="${cls}">${esc(m.text)}${m.obscure ? '<sup class="ky-ob">僻</sup>' : ""}</span>`;
  }

  /** 释义序列 → 以「；」连接的 span HTML */
  function kyJoin(meanings) {
    return (meanings || []).map(kySpan).join("；");
  }

  /** 词典详情释义行 HTML（首页 App 与悬浮条共用，唯一渲染入口）：
      - 命中考研词书 → 每行「词性 + 逐条等级着色释义 + 「僻」角标」，分级数据
        来自 kyLevel 单一数据源（人工标注优先、算法兜底），不重新判定；
      - 未命中考研词书（ECDICT / 大词典 / 用户自建词条）→ 回退为调用方给定的
        纯文本释义行，保持原有显示方式，不套用任何等级颜色。
      查询优先级（考研优先、EC 兜底）由调用方决定，本函数只负责渲染。
      @param {string} word 查询词
      @param {string[]} fallbackLines 非考研词书时的纯文本释义行（senseLines / lines 结果）
      @param {string} cls 行容器 class（首页 "detail-meaning"、悬浮条 "d-line"）
      @returns {string} 拼接后的 HTML */
  function detailHtml(word, fallbackLines, cls) {
    const lineCls = cls || "detail-meaning";
    const g = kyLevel(word);
    if (!g) return (fallbackLines || []).map((l) => `<p class="${lineCls}">${esc(l)}</p>`).join("");
    return g.rows.map((row) =>
      `<p class="${lineCls}">${row.pos ? `${esc(row.pos)} ` : ""}${kyJoin(row.meanings)}</p>`
    ).join("");
  }

  /** 选项文本分级渲染：与 topSensesText(word, n) 按索引对齐（前 n 个展平释义） */
  function kyOptionHtml(word, optionText) {
    const flat = kyFlatMeanings(word);
    if (!flat || !flat.length) return esc(optionText);
    const parts = String(optionText || "").split("；").filter(Boolean);
    return parts.map((p, i) => {
      const m = flat[i] && flat[i].text === p ? flat[i] : { text: p, level: "normal", obscure: false };
      return kySpan(m);
    }).join("；");
  }

  /* ---------- 导出专用（PDF / PNG / Word 与 App 内同一套分级与颜色） ---------- */

  /** 导出等级色：固定取浅色态（与 css/ky-level.css :root 变量同值同步）。
      导出模板（线条小狗纸面 / Word 白底）恒为浅色背景，若跟随 App 深色
      主题取色会在浅底上失去对比度；分级与「僻」标记逻辑与 App 内完全
      同一（kyLevel 单一数据源），仅色值恒用浅色态。改色时需同步此处与
      CSS :root 变量。 */
  const EXPORT_COLORS = {
    common: "#3F8E5C",
    normal: "#A6782B",
    rare:   "#87909F",
    obscure: "#B8846E",
  };

  function levelColors() { return { ...EXPORT_COLORS }; }

  function levelColor(colors, level) {
    return level === "common" ? colors.common
      : level === "rare" ? colors.rare
      : colors.normal;
  }

  /** 考研词书 → 导出富文本行：[{ segs: [{t, c?, sup?}] }]。
      - 逐条释义沿用 kyLevel 的等级与 obscure（不重新判定）；
      - c = 等级色（缺省为导出正文色）；sup = 「僻」角标 token（由渲染端缩小上标绘制）；
      - 词性与「；」分隔符不带颜色（与 App 内 detailMeaningsHtml 的纯色一致）。
      非考研词书返回 null（调用方回退原有纯文本行）。 */
  function exportLines(word) {
    const g = kyLevel(word);
    if (!g) return null;
    const colors = levelColors();
    return g.rows.map((row) => {
      const segs = [];
      if (row.pos) segs.push({ t: `${row.pos} ` });
      row.meanings.forEach((m, i) => {
        if (i) segs.push({ t: "；" });
        segs.push({ t: m.text, c: levelColor(colors, m.level) });
        if (m.obscure) segs.push({ t: "僻", c: colors.obscure, sup: true });
      });
      return { segs };
    });
  }

  /** 考研词书 → 自包含着色 HTML 行数组（Word / 回退 HTML 导出用）。
      颜色内联 style（导出文件不依赖 ky-level.css），取值同样来自 CSS 变量。
      返回 ["<div>…</div>", …]；非考研词书返回 null。 */
  function exportHtml(word) {
    const lines = exportLines(word);
    if (!lines) return null;
    return lines.map((line) => {
      const inner = line.segs.map((s) => {
        const text = esc(s.t);
        if (s.sup) return `<sup style="color:${s.c};font-size:0.52em;font-weight:600;line-height:1;">${text}</sup>`;
        return s.c ? `<span style="color:${s.c}">${text}</span>` : text;
      }).join("");
      return `<div>${inner}</div>`;
    });
  }

  window.KY = { kyLevel, kyFlatMeanings, kyTopSenses, kySpan, kyJoin, normPos, detailHtml, kyOptionHtml, levelColors, exportLines, exportHtml, config: CFG };
})();
