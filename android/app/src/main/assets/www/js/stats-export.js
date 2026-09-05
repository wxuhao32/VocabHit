/* ============================================================
   Stats Export · 学习统计「学习报告」导出渲染器
   ------------------------------------------------------------
   数据口径：全部来自 window.VH_STATS 现有真实统计（零虚构、
   不改动 stats.js 任何计算逻辑，仅做可视化呈现）。
     - snapshot()：今日/累计 词汇·知识点·时长 卡片数字
     - last7()  ：近 7 天逐日 词汇复习 / 知识点复习 / 学习时长
   输出：
     - renderReport() → { page, bar, lineCum, lineDaily, days, snap }
       page=完整报告画布（PNG 长图 / PDF 页面），bar/lineCum/lineDaily=单图裁切
       （Word 内嵌高质量图表图片用；折线图拆分为累计+每日两张）
     - buildWordMhtml(report) → Word 可直接打开的 MHTML 文本
       （图表以 base64 图片嵌入 + 统计数字表格 + 说明文字）
   导出链路复用既有能力：PDF 走 VH_ExportTemplate 的 JPEG→PDF /
   Android exportPdfImages；PNG 走 stackedPng / exportImageFile；
   Word 走 exportTextFile（Android）或 Blob 下载（Web）。
   视觉：与 VocabHit 一致的简洁柔和风格（浅底、紫主题色、圆角卡片）。
   ============================================================ */

"use strict";

(function () {
  /* ---------- 页面与样式常量 ---------- */

  const PW = 840, PH = 1510;   // 报告画布 CSS 尺寸（折线图拆分为累计/每日两张后页面加高）
  const SCALE = 2;             // 超采样：文字与线条锐利
  const MARGIN = 44;

  const FONT = `-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`;
  const INK = "#1D1D1F";       // 主文字
  const SUB = "#86868B";       // 次文字
  const FAINT = "#B0B0B5";     // 眉标
  const RULE = "#ECECEE";      // 分割线
  const CARD_BG = "#F6F6F9";   // 卡片底
  const VIOLET = "#5856D6";    // 主题紫（词汇复习 / 折线）
  const TEAL = "#3EBD93";      // 柔和青绿（知识点复习）
  const HIGHLIGHT_BG = "#F1F1F8"; // 今日列底

  /* 图表区域（css 坐标，供 Word 单图裁切）；
     折线图拆分为两张：累计在上（LINE_RECT）、每日在下（LINE_RECT2），尺寸样式一致 */
  const BAR_RECT = { x: MARGIN, y: 424, w: PW - MARGIN * 2, h: 282 };
  const LINE_RECT = { x: MARGIN, y: 742, w: PW - MARGIN * 2, h: 306 };
  const LINE_RECT2 = { x: MARGIN, y: 1064, w: PW - MARGIN * 2, h: 306 };

  /* ---------- 小工具 ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fmtNum(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /** 时长格式化：>=10h 显示小时，其余分钟 */
  function fmtMin(m) {
    if (m >= 600) return `${(m / 60).toFixed(1)} 小时`;
    return `${fmtNum(m)} 分钟`;
  }

  /** 图表上的数值标签：<10 保留 1 位小数，否则取整 */
  function fmtTick(v) {
    if (v > 0 && v < 10) return (Math.round(v * 10) / 10).toString();
    return fmtNum(v);
  }

  /** y 轴上限：向上取「1/2/5 × 10^n」的整数刻度 */
  function niceMax(v) {
    if (v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    for (const k of [1, 2, 5, 10]) {
      if (k * pow >= v) return k * pow;
    }
    return 10 * pow;
  }

  function bizDateOf(dayStr) {
    const p = dayStr.split("-");
    return `${parseInt(p[1], 10)}月${parseInt(p[2], 10)}日`;
  }

  /* ---------- 绘制：报告整页 ---------- */

  function drawReport(days, snap) {
    const canvas = document.createElement("canvas");
    canvas.width = PW * SCALE;
    canvas.height = PH * SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    /* 底色 */
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, PW, PH);

    drawHeader(ctx, days);
    drawStatCards(ctx, snap);
    drawBarChart(ctx, days);
    drawLineChart(ctx, days, "cum", LINE_RECT);   // 累计折线图（上）
    drawLineChart(ctx, days, "daily", LINE_RECT2); // 每日折线图（下）
    drawFooter(ctx);

    return canvas;
  }

  function drawHeader(ctx, days) {
    const exported = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const dateStr = `${exported.getFullYear()}年${exported.getMonth() + 1}月${exported.getDate()}日 ${p(exported.getHours())}:${p(exported.getMinutes())}`;
    const range = `${bizDateOf(days[0].day)} – ${bizDateOf(days[days.length - 1].day)}`;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = FAINT;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText("V O C A B H I T · 学 习 报 告", MARGIN, 72);

    ctx.fillStyle = INK;
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText("学习统计报告", MARGIN, 112);

    ctx.fillStyle = SUB;
    ctx.font = `400 14px ${FONT}`;
    ctx.fillText(`统计周期 ${range}（近 7 天） · 导出于 ${dateStr}`, MARGIN, 140);

    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN, 164);
    ctx.lineTo(PW - MARGIN, 164);
    ctx.stroke();
  }

  function drawStatCards(ctx, snap) {
    const cols = 4, gap = 12;
    const w = (PW - MARGIN * 2 - gap * (cols - 1)) / cols;
    const h = 92;
    const rows = [
      { y: 190, cards: [
        { label: "今日复习", value: fmtNum(snap.today.vocab + snap.today.entry), unit: "次" },
        { label: "累计复习", value: fmtNum(snap.total.vocab + snap.total.entry), unit: "次" },
        { label: "今日学习时长", value: fmtMin(snap.today.min), unit: "" },
        { label: "累计学习时长", value: fmtMin(snap.total.min), unit: "" },
      ]},
      { y: 190 + h + 14, cards: [
        { label: "今日词汇复习", value: fmtNum(snap.today.vocab), unit: "词" },
        { label: "今日知识点复习", value: fmtNum(snap.today.entry), unit: "条" },
        { label: "累计词汇复习", value: fmtNum(snap.total.vocab), unit: "词" },
        { label: "累计知识点复习", value: fmtNum(snap.total.entry), unit: "条" },
      ]},
    ];
    rows.forEach((row) => {
      row.cards.forEach((c, i) => {
        const x = MARGIN + i * (w + gap);
        roundRect(ctx, x, row.y, w, h, 14);
        ctx.fillStyle = CARD_BG;
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = SUB;
        ctx.font = `500 12.5px ${FONT}`;
        ctx.fillText(c.label, x + 16, row.y + 28);
        ctx.fillStyle = INK;
        ctx.font = `700 22px ${FONT}`;
        const full = c.unit ? `${c.value} ${c.unit}` : c.value;
        // 数值超宽时缩小字号兜底（长数字卡片不溢出）
        let fs = 22;
        while (fs > 14 && ctx.measureText(full).width > w - 32) {
          fs -= 1;
          ctx.font = `700 ${fs}px ${FONT}`;
        }
        ctx.fillText(full, x + 16, row.y + 62);
      });
    });
  }

  /** 区块标题 + 图例（返回标题基线 y） */
  function sectionTitle(ctx, y, title, legend) {
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(title, MARGIN, y);
    if (legend && legend.length) {
      let lx = PW - MARGIN;
      ctx.textAlign = "right";
      ctx.font = `400 12px ${FONT}`;
      for (let i = legend.length - 1; i >= 0; i--) {
        const item = legend[i];
        ctx.fillStyle = SUB;
        ctx.fillText(item.name, lx, y);
        lx -= ctx.measureText(item.name).width + 6;
        ctx.fillStyle = item.color;
        roundRect(ctx, lx - 10, y - 9, 10, 10, 3);
        ctx.fill();
        lx -= 24;
      }
    }
    ctx.textAlign = "left";
  }

  function drawPlotFrame(ctx, plot, maxV, ticks, unit) {
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.font = `400 11px ${FONT}`;
    ctx.fillStyle = FAINT;
    for (let t = 0; t <= ticks; t++) {
      const v = (maxV / ticks) * t;
      const y = plot.y1 - (plot.y1 - plot.y0) * (t / ticks);
      ctx.beginPath();
      ctx.moveTo(plot.x0, y);
      ctx.lineTo(plot.x1, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtTick(v), plot.x0 - 8, y);
    }
    if (unit) {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = FAINT;
      ctx.fillText(unit, plot.x0 - 8, plot.y0 - 10);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  /** 今日列高亮底 */
  function todayBand(ctx, plot, idx, n) {
    const gw = (plot.x1 - plot.x0) / n;
    ctx.fillStyle = HIGHLIGHT_BG;
    roundRect(ctx, plot.x0 + gw * idx + 3, plot.y0, gw - 6, plot.y1 - plot.y0, 8);
    ctx.fill();
  }

  function drawBarChart(ctx, days) {
    sectionTitle(ctx, BAR_RECT.y + 20, "复习数量 · 近 7 天", [
      { name: "词汇复习", color: VIOLET },
      { name: "知识点复习", color: TEAL },
    ]);

    const plot = {
      x0: BAR_RECT.x + 46, x1: BAR_RECT.x + BAR_RECT.w - 4,
      y0: BAR_RECT.y + 66, y1: BAR_RECT.y + 232,
    };
    const n = days.length;
    const maxV = niceMax(Math.max(1, ...days.map((d) => Math.max(d.vocab, d.entry))));

    const todayIdx = days.findIndex((d) => d.isToday);
    if (todayIdx >= 0) todayBand(ctx, plot, todayIdx, n);
    drawPlotFrame(ctx, plot, maxV, 4, "个");

    if (!days.some((d) => d.vocab || d.entry)) {
      ctx.fillStyle = FAINT;
      ctx.font = `400 14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("近 7 天暂无复习记录", (plot.x0 + plot.x1) / 2, (plot.y0 + plot.y1) / 2);
      ctx.textAlign = "left";
    } else {
      const gw = (plot.x1 - plot.x0) / n;
      const barW = Math.min(18, gw * 0.24);
      const pairGap = 5;
      days.forEach((d, i) => {
        const cx = plot.x0 + gw * i + gw / 2;
        const bars = [
          { v: d.vocab, color: VIOLET },
          { v: d.entry, color: TEAL },
        ];
        const totalW = barW * 2 + pairGap;
        bars.forEach((b, bi) => {
          const x = cx - totalW / 2 + bi * (barW + pairGap);
          const bh = Math.max(0, (plot.y1 - plot.y0) * (b.v / maxV));
          if (bh > 0) {
            roundRect(ctx, x, plot.y1 - bh, barW, bh, Math.min(4, barW / 2));
            ctx.fillStyle = b.color;
            ctx.fill();
            ctx.fillStyle = b.color;
            ctx.font = `600 10.5px ${FONT}`;
            ctx.textAlign = "center";
            ctx.fillText(fmtTick(b.v), x + barW / 2, plot.y1 - bh - 5);
          }
        });
      });
    }

    /* 日期标签 */
    ctx.font = `400 12px ${FONT}`;
    days.forEach((d, i) => {
      const cx = plot.x0 + ((plot.x1 - plot.x0) / n) * i + ((plot.x1 - plot.x0) / n) / 2;
      ctx.textAlign = "center";
      if (d.isToday) { ctx.fillStyle = VIOLET; ctx.font = `700 12px ${FONT}`; }
      else { ctx.fillStyle = SUB; ctx.font = `400 12px ${FONT}`; }
      ctx.fillText(d.label, cx, plot.y1 + 22);
      if (d.isToday) { ctx.font = `400 10px ${FONT}`; ctx.fillStyle = VIOLET; ctx.fillText("今日", cx, plot.y1 + 38); }
    });
    ctx.textAlign = "left";
    ctx.fillStyle = FAINT;
    ctx.font = `400 11px ${FONT}`;
    ctx.fillText("词汇复习 = 生词 Review · 知识点复习 = 知识条目间隔重复", BAR_RECT.x + 2, BAR_RECT.y + BAR_RECT.h - 4);
  }

  /* 折线图（学习时长，单系列）：series="cum" 累计 / "daily" 每日。
     原双线同图拆分为两张独立折线图（累计在上、每日在下），
     绘制/字体/样式逻辑不变，仅按系列分别取值（cum=cumMin / daily=dailyMin）。 */
  function drawLineChart(ctx, days, series, rect) {
    const isCum = series === "cum";
    sectionTitle(ctx, rect.y + 20, isCum ? "累计学习时长 · 近 7 天" : "每日学习时长 · 近 7 天", [
      { name: isCum ? "累计时长（分钟）" : "每日时长（分钟）", color: VIOLET },
    ]);

    const plot = {
      x0: rect.x + 46, x1: rect.x + rect.w - 10,
      y0: rect.y + 66, y1: rect.y + 258,
    };
    const n = days.length;
    const maxV = niceMax(Math.max(1, ...days.map((d) => (isCum ? d.cumMin : d.dailyMin))));

    const todayIdx = days.findIndex((d) => d.isToday);
    if (todayIdx >= 0) todayBand(ctx, plot, todayIdx, n);
    drawPlotFrame(ctx, plot, maxV, 4, "分钟");

    const vals = days.map((d) => (isCum ? d.cumMin : d.dailyMin));
    const px = (i) => plot.x0 + ((plot.x1 - plot.x0) / (n - 1)) * i;
    const py = (v) => plot.y1 - (plot.y1 - plot.y0) * (Math.min(v, maxV) / maxV);

    if (!vals.some((v) => v > 0)) {
      ctx.fillStyle = FAINT;
      ctx.font = `400 14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("近 7 天暂无学习时长", (plot.x0 + plot.x1) / 2, (plot.y0 + plot.y1) / 2);
      ctx.textAlign = "left";
    } else {
      /* 面积渐变 */
      const grad = ctx.createLinearGradient(0, plot.y0, 0, plot.y1);
      grad.addColorStop(0, "rgba(88, 86, 214, 0.16)");
      grad.addColorStop(1, "rgba(88, 86, 214, 0)");
      ctx.beginPath();
      ctx.moveTo(px(0), plot.y1);
      vals.forEach((v, i) => ctx.lineTo(px(i), py(v)));
      ctx.lineTo(px(n - 1), plot.y1);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      /* 折线 */
      ctx.beginPath();
      vals.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
      ctx.strokeStyle = VIOLET;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      /* 数据点 + 数值标签 */
      vals.forEach((v, i) => {
        const x = px(i), y = py(v);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = VIOLET;
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.font = `600 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(fmtTick(v), x, y - 10);
      });
    }

    /* 日期标签 */
    days.forEach((d, i) => {
      const x = px(i);
      ctx.textAlign = "center";
      if (d.isToday) { ctx.fillStyle = VIOLET; ctx.font = `700 12px ${FONT}`; }
      else { ctx.fillStyle = SUB; ctx.font = `400 12px ${FONT}`; }
      ctx.fillText(d.label, x, plot.y1 + 22);
    });
    ctx.textAlign = "left";
    ctx.fillStyle = FAINT;
    ctx.font = `400 11px ${FONT}`;
    ctx.fillText("学习时长 = 复习有效时长 + 专注番茄时长 · 每日按 04:00 业务日划分", rect.x + 2, rect.y + rect.h - 4);
  }

  function drawFooter(ctx) {
    const y = PH - 52;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PW - MARGIN, y);
    ctx.stroke();
    ctx.fillStyle = FAINT;
    ctx.font = `400 11px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("数据来自 VocabHit 本地真实学习记录（生词复习 · 知识条目复习 · 专注番茄）· 由 VocabHit 生成", PW / 2, y + 22);
    ctx.textAlign = "left";
  }

  /* ---------- Word：图表裁切 + MHTML 组装 ---------- */

  /** 从整页画布按 css 坐标裁切高清子图 */
  function cropRegion(pageCanvas, rect) {
    const c = document.createElement("canvas");
    c.width = rect.w * SCALE;
    c.height = rect.h * SCALE;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(pageCanvas, rect.x * SCALE, rect.y * SCALE, rect.w * SCALE, rect.h * SCALE,
      0, 0, c.width, c.height);
    return c;
  }

  function utf8B64(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }

  function b64Wrap(b64) {
    return b64.replace(/(.{76})/g, "$1\r\n");
  }

  function canvasB64(canvas) {
    return canvas.toDataURL("image/png").split(",")[1];
  }

  /** Word 文档 HTML（图表图片 + 统计数字表格 + 说明文字）
      折线图拆分为两张：累计（上）/ 每日（下），排版与样式沿用原有结构 */
  function buildWordHtml(days, snap, barB64, lineCumB64, lineDailyB64) {
    const exported = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const dateStr = `${exported.getFullYear()}年${exported.getMonth() + 1}月${exported.getDate()}日 ${p(exported.getHours())}:${p(exported.getMinutes())}`;
    const range = `${bizDateOf(days[0].day)} – ${bizDateOf(days[days.length - 1].day)}`;

    const card = (label, value) =>
      `<td><div class="card-value">${value}</div><div class="card-label">${label}</div></td>`;
    const cardsRow1 = [
      card("今日复习", `${fmtNum(snap.today.vocab + snap.today.entry)} 次`),
      card("累计复习", `${fmtNum(snap.total.vocab + snap.total.entry)} 次`),
      card("今日学习时长", fmtMin(snap.today.min)),
      card("累计学习时长", fmtMin(snap.total.min)),
    ].join("");
    const cardsRow2 = [
      card("今日词汇复习", `${fmtNum(snap.today.vocab)} 词`),
      card("今日知识点复习", `${fmtNum(snap.today.entry)} 条`),
      card("累计词汇复习", `${fmtNum(snap.total.vocab)} 词`),
      card("累计知识点复习", `${fmtNum(snap.total.entry)} 条`),
    ].join("");

    const barTable = days.map((d) =>
      `<tr><td>${d.label}${d.isToday ? "（今日）" : ""}</td><td>${fmtNum(d.vocab)}</td><td>${fmtNum(d.entry)}</td></tr>`).join("");
    const lineTable = days.map((d) =>
      `<tr><td>${d.label}${d.isToday ? "（今日）" : ""}</td><td>${fmtTick(d.dailyMin)}</td></tr>`).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>VocabHit 学习统计报告</title>
<style>
body { font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; color: #1D1D1F; }
.doc { max-width: 680px; margin: 0 auto; padding: 24px 20px; }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #B0B0B5; }
h1 { font-size: 24px; font-weight: 700; margin: 4px 0 6px; }
.meta { font-size: 12px; color: #86868B; }
hr { border: none; border-top: 1px solid #ECECEE; margin: 16px 0; }
table.cards { width: 100%; border-collapse: separate; border-spacing: 6px 6px; margin: 4px 0 8px; }
table.cards td { width: 25%; background: #F6F6F9; border-radius: 10px; padding: 12px 8px; text-align: center; }
.card-value { font-size: 20px; font-weight: 700; }
.card-label { font-size: 11.5px; color: #86868B; margin-top: 3px; }
h2 { font-size: 17px; font-weight: 700; margin: 20px 0 2px; }
.desc { font-size: 12.5px; color: #86868B; margin: 0 0 10px; }
img.chart { width: 640px; max-width: 100%; height: auto; }
table.data { width: 100%; border-collapse: collapse; font-size: 11.5px; margin: 8px 0 2px; }
table.data th, table.data td { border: 1px solid #ECECEE; padding: 5px 6px; text-align: center; }
table.data th { background: #F6F6F9; font-weight: 600; }
.footer { font-size: 11px; color: #B0B0B5; margin-top: 18px; }
</style></head><body><div class="doc">
<p class="eyebrow">VOCABHIT · 学习报告</p>
<h1>学习统计报告</h1>
<p class="meta">统计周期 ${range}（近 7 天） · 导出于 ${dateStr}</p>
<hr>
<table class="cards"><tr>${cardsRow1}</tr><tr>${cardsRow2}</tr></table>
<h2>一、复习数量（近 7 天）</h2>
<p class="desc">词汇复习（生词 Review）与知识点复习（知识条目间隔重复）的每日数量对比，两色柱形分别呈现。</p>
<p><img class="chart" src="vh-chart-bar.png" alt="复习数量柱状图"></p>
<table class="data"><tr><th>日期</th><th>词汇复习（个）</th><th>知识点复习（个）</th></tr>${barTable}</table>
<h2>二、累计学习时长（近 7 天）</h2>
<p class="desc">累计学习 / 复习时长（分钟）趋势，累计数据永久连续、不随窗口重置。</p>
<p><img class="chart" src="vh-chart-line-cum.png" alt="累计学习时长折线图"></p>
<h2>三、每日学习时长（近 7 天）</h2>
<p class="desc">每日学习 / 复习时长（分钟）趋势，时长 = 复习有效时长 + 专注番茄时长，按 04:00 业务日划分。</p>
<p><img class="chart" src="vh-chart-line-daily.png" alt="每日学习时长折线图"></p>
<table class="data"><tr><th>日期</th><th>学习时长（分钟）</th></tr>${lineTable}</table>
<p class="footer">数据来自 VocabHit 本地真实学习记录 · 由 VocabHit 生成</p>
</div></body></html>`;
  }

  /** 组装 MHTML（Word 单文件网页格式：HTML + base64 图片部件，
      兼容 Microsoft Word / WPS 的 .doc 打开路径） */
  function buildMhtml(html, images) {
    const B = `----=_VocabHit_${Date.now().toString(36)}`;
    let out = "";
    out += "MIME-Version: 1.0\r\n";
    out += `Content-Type: multipart/related; boundary="${B}"; type="text/html"\r\n\r\n`;
    out += "This document is a Single File Web Page, also known as a Web Archive file.\r\n\r\n";
    out += `--${B}\r\nContent-Location: file:///C:/VocabHit/report.html\r\n` +
      "Content-Transfer-Encoding: base64\r\nContent-Type: text/html; charset=\"utf-8\"\r\n\r\n";
    out += b64Wrap(utf8B64(html)) + "\r\n\r\n";
    images.forEach((img) => {
      out += `--${B}\r\nContent-Location: file:///C:/VocabHit/${img.name}\r\n` +
        `Content-Transfer-Encoding: base64\r\nContent-Type: ${img.type}\r\n\r\n`;
      out += b64Wrap(img.b64) + "\r\n\r\n";
    });
    out += `--${B}--\r\n`;
    return out;
  }

  function buildWordMhtml(report) {
    const html = buildWordHtml(report.days, report.snap,
      canvasB64(report.bar), canvasB64(report.lineCum), canvasB64(report.lineDaily));
    return buildMhtml(html, [
      { name: "vh-chart-bar.png", type: "image/png", b64: canvasB64(report.bar) },
      { name: "vh-chart-line-cum.png", type: "image/png", b64: canvasB64(report.lineCum) },
      { name: "vh-chart-line-daily.png", type: "image/png", b64: canvasB64(report.lineDaily) },
    ]);
  }

  /* ---------- 对外 ---------- */

  /** 渲染报告（同步、纯本地）。VH_STATS 缺失时返回 null（上层提示）。 */
  function renderReport() {
    if (!window.VH_STATS || !window.VH_STATS.last7 || !window.VH_STATS.snapshot) return null;
    const days = window.VH_STATS.last7();
    const snap = window.VH_STATS.snapshot();
    if (!days || !days.length) return null;
    const page = drawReport(days, snap);
    return {
      page,
      bar: cropRegion(page, BAR_RECT),
      lineCum: cropRegion(page, LINE_RECT),    // 累计折线图（上）
      lineDaily: cropRegion(page, LINE_RECT2), // 每日折线图（下）
      days,
      snap,
    };
  }

  window.VH_StatsExport = { renderReport, buildWordMhtml };
})();
