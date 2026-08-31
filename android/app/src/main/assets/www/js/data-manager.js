/* ============================================================
   Data Manager · 设置页「导入 / 导出 JSON」
   ------------------------------------------------------------
   挂载 window.VH_DataManager。
   导出：把全部「用户数据」localStorage 键打包为带版本信息的 JSON
         （不含内置词书 / ECDICT 等静态词典 —— 那些随 APK 分发，不在 localStorage）。
   导入：文件 → 解析 → 结构校验（逐键校验，坏键跳过不覆盖）→
         弹窗确认 → 先把当前数据全量备份（Android 存 Downloads / Web 下载）
         → 事务式写入 → 提示后重载页面恢复全部模块状态。
   Android：文件保存走 AndroidBridge.exportTextFile；文件选择走
            AndroidBridge.pickJsonFile → window.__onJsonPicked(text)。
   Web：Blob 下载 + 隐藏 <input type=file>。
   ============================================================ */

(function () {
  "use strict";

  const BACKUP_TYPE = "vocabhit-backup";
  const BACKUP_VERSION = 1;

  /* 用户数据键清单（键名 + 中文名 + 最小结构校验器）。
     校验只做「形状兜底」：坏键跳过并提示，绝不因部分数据异常破坏现有数据。 */
  const USER_KEYS = [
    { key: "vc-records", name: "生词与查询记录",
      ok: (v) => v && typeof v === "object" && typeof v.day === "string" && Array.isArray(v.history) && v.words && typeof v.words === "object" },
    { key: "vc-review", name: "Review 复习状态",
      ok: (v) => v && typeof v === "object" && v.words && typeof v.words === "object" },
    { key: "vc-review-session-v2", name: "Review 进行中会话",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) },
    { key: "vc-review-days", name: "Review 连续完成记录",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) },
    { key: "vc-review-today", name: "Review 今日记录",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.day === "string" && v.meaning && v.mcq && v.spell },
    { key: "vc-review-revlogs", name: "复习日志（FSRS 自适应训练数据）",
      ok: (v) => Array.isArray(v) },
    { key: "vc-fsrs-adaptive", name: "FSRS 自适应参数",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) },
    { key: "vc-stats", name: "学习统计（坚持看板）",
      ok: (v) => v && typeof v === "object" && v.days && typeof v.days === "object" },
    { key: "vc-spaced-repetition", name: "知识条目间隔重复",
      ok: (v) => v && typeof v === "object" && v.states && typeof v.states === "object" },
    { key: "vc-pomo-records", name: "番茄钟记录",
      ok: (v) => Array.isArray(v) },
    { key: "vc-tasks", name: "任务 / 目标 / 打卡",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.daily) },
    { key: "vc-notify", name: "提醒设置",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) },
    { key: "vc-materials", name: "学习资料",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.items) },
    { key: "vc-repo", name: "知识库 / 存储库",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.libraries) && Array.isArray(v.entries) },
    { key: "vc-highlights", name: "划重点",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) },
    { key: "vc-word-notes", name: "单词笔记",
      ok: (v) => v && typeof v === "object" && !Array.isArray(v) },
    { key: "vc-mistakes", name: "我的错题",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.items) },
    { key: "vc-theme", name: "外观主题", plain: true, // 应用以裸字符串读写，不做 JSON 序列化
      ok: (v) => typeof v === "string" },
    { key: "vc-overlay", name: "悬浮查词开关", plain: true,
      ok: (v) => typeof v === "string" },
    { key: "mathLab.presets", name: "Math Lab 预设",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.items) },
    { key: "mathLab.experiments", name: "Math Lab 实验",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.items) },
    { key: "mathLab.recentExperiments", name: "Math Lab 最近实验",
      ok: (v) => v && typeof v === "object" && Array.isArray(v.items) },
  ];

  function hasBridge() { return !!(window.AndroidBridge && window.AndroidBridge.exportTextFile); }

  /* ---------- 收集 / 构建 ---------- */

  /** 读取全部用户数据键。值损坏（非 JSON）时以 { __raw } 原样保留，不丢数据。
      plain 键（vc-theme / vc-overlay）以裸字符串读写：原样导出，绝不 JSON.parse ——
      否则 vc-overlay 的 "1"/"0" 会被解析成数字，导入时被字符串校验器拒绝而丢失设置。 */
  function collectData() {
    const data = {};
    let n = 0;
    USER_KEYS.forEach(({ key, plain }) => {
      let raw = null;
      try { raw = localStorage.getItem(key); } catch (e) { /* 忽略 */ }
      if (raw == null) return;
      if (plain) data[key] = raw;
      else { try { data[key] = JSON.parse(raw); } catch (e) { data[key] = { __raw: raw }; } }
      n++;
    });
    return { data, count: n };
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function buildBackup() {
    const { data } = collectData();
    return {
      app: "VocabHit",
      type: BACKUP_TYPE,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /* ---------- 保存（Android → Downloads；Web → 下载） ---------- */

  function saveText(name, mime, content) {
    if (hasBridge()) {
      window.AndroidBridge.exportTextFile(name, mime, content);
      return;
    }
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** 导出 JSON：成功返回文件名，失败返回 null */
  function exportJson() {
    try {
      const name = `VocabHit-备份-${stamp()}.json`;
      const json = JSON.stringify(buildBackup(), null, 1);
      saveText(name, "application/json", json);
      return name;
    } catch (e) {
      console.error("[data-mgr] export failed", e);
      return null;
    }
  }

  /* ---------- 导入：解析 → 校验 → 确认 → 备份 → 写入 ---------- */

  /** 解析 + 整体校验。返回 { ok, error } 或 { ok:true, plan } */
  function parseAndValidate(text) {
    let obj = null;
    try { obj = JSON.parse(text); }
    catch (e) { return { ok: false, error: "文件不是有效的 JSON 文本，无法导入" }; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj))
      return { ok: false, error: "JSON 结构不符：应为 VocabHit 备份对象" };
    if (obj.app !== "VocabHit" || obj.type !== BACKUP_TYPE)
      return { ok: false, error: "这不是 VocabHit 导出的备份文件（缺少应用标识）" };
    const ver = Number(obj.version || 0);
    if (!ver || ver > BACKUP_VERSION)
      return { ok: false, error: `备份版本（v${ver || "?"}）不受支持，请升级 VocabHit 后再导入` };
    if (!obj.data || typeof obj.data !== "object" || Array.isArray(obj.data))
      return { ok: false, error: "备份数据体（data）缺失或格式错误" };

    const plan = [];   // 将写入 { key, name, value }
    const bad = [];    // 校验未通过（将跳过，保留现有数据）
    const unknown = []; // 备份里有但当前版本不识别的键
    USER_KEYS.forEach(({ key, name, ok, plain }) => {
      if (!(key in obj.data)) return;
      let v = obj.data[key];
      // { __raw } 包裹 = 导出时已损坏的原串：原样写回，保留现场不扩大破坏
      if (v && typeof v === "object" && typeof v.__raw === "string" && Object.keys(v).length === 1) {
        plan.push({ key, name, value: v.__raw, raw: true });
        return;
      }
      // 旧版备份兼容：plain 键曾以数字/布尔导出（如 vc-overlay = 1 / 0），按原串恢复
      if (plain && (typeof v === "number" || typeof v === "boolean")) {
        plan.push({ key, name, value: String(v), raw: false });
        return;
      }
      if (ok(v)) plan.push({ key, name, value: v, raw: false });
      else bad.push(name);
    });
    Object.keys(obj.data).forEach((k) => {
      if (!USER_KEYS.some((u) => u.key === k)) unknown.push(k);
    });
    if (!plan.length)
      return { ok: false, error: "备份中没有任何可识别的数据项" + (bad.length ? `（${bad.length} 项格式异常被跳过）` : "") };
    return { ok: true, plan, bad, unknown, exportedAt: obj.exportedAt || "" };
  }

  /** 执行写入（调用前必须已通过 parseAndValidate 并经用户确认）。
      全部 setItem 为原子单键写入；中途异常时把已写键回滚为导入前快照。
      plain 键（vc-theme / vc-overlay）与应用读写口径一致：裸字符串，不做 JSON 序列化。 */
  function applyImport(plan) {
    const defs = {};
    USER_KEYS.forEach((d) => { defs[d.key] = d; });
    const before = {};
    plan.forEach(({ key }) => {
      try { before[key] = localStorage.getItem(key); } catch (e) { before[key] = undefined; }
    });
    const written = [];
    try {
      plan.forEach(({ key, value, raw }) => {
        const d = defs[key];
        localStorage.setItem(key, (raw || (d && d.plain)) ? String(value) : JSON.stringify(value));
        written.push(key);
      });
    } catch (e) {
      // 回滚：把本次已写的键恢复为导入前状态，现有数据不受破坏
      written.forEach((key) => {
        try {
          if (before[key] === undefined || before[key] === null) localStorage.removeItem(key);
          else localStorage.setItem(key, before[key]);
        } catch (e2) { /* 忽略 */ }
      });
      console.error("[data-mgr] import rolled back", e);
      return { ok: false, error: "写入失败，已恢复导入前数据：" + (e && e.message ? e.message : "存储异常") };
    }
    return { ok: true, count: written.length };
  }

  /* ---------- 确认弹窗（与应用视觉一致的轻量层） ---------- */

  function showDialog({ title, bodyHtml, okText, danger }) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "vh-dlg-overlay";
      ov.innerHTML = `
        <div class="vh-dlg" role="dialog" aria-modal="true">
          <h3 class="vh-dlg-title">${title}</h3>
          <div class="vh-dlg-body">${bodyHtml}</div>
          <div class="vh-dlg-actions">
            <button class="vh-dlg-btn" type="button">取消</button>
            <button class="vh-dlg-btn ${danger ? "danger" : "primary"}" type="button">${okText}</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add("show"));
      const done = (val) => {
        ov.classList.remove("show");
        setTimeout(() => ov.remove(), 200);
        resolve(val);
      };
      ov.addEventListener("click", (e) => {
        if (e.target === ov) return done(false);
        const btn = e.target.closest(".vh-dlg-btn");
        if (!btn) return;
        // 确认按钮带 primary/danger 类；无类按钮 = 取消
        done(btn.classList.contains("primary") || btn.classList.contains("danger"));
      });
    });
  }

  /* ---------- 对外入口（设置页按钮） ---------- */

  function onExportClick() {
    const name = exportJson();
    if (name) showToastSafe(hasBridge() ? `备份中 · ${name}` : `已导出 ${name}`);
    else showToastSafe("导出失败，请重试");
  }

  let picking = false;
  function onImportClick() {
    if (picking) return;
    picking = true;
    if (window.AndroidBridge && window.AndroidBridge.pickJsonFile) {
      window.AndroidBridge.pickJsonFile(); // 结果经 window.__onJsonPicked 回来
      setTimeout(() => { picking = false; }, 1500); // 兜底复位（取消选择场景）
      return;
    }
    // Web 回退：隐藏文件选择
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      picking = false;
      const f = input.files && input.files[0];
      if (f) readImportFile(f);
    };
    input.oncancel = () => { picking = false; };
    input.click();
  }

  function readImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => handlePickedText(String(reader.result || ""));
    reader.onerror = () => showToastSafe("文件读取失败，请重试");
    reader.readAsText(file, "utf-8");
  }

  async function handlePickedText(text) {
    if (text == null) return; // 用户取消
    if (!text.trim()) { showToastSafe("文件为空，无法导入"); return; }
    const r = parseAndValidate(text);
    if (!r.ok) { showToastSafe(r.error); return; }

    const items = r.plan.map((p) => `<li>${p.name}</li>`).join("");
    const warn = [];
    if (r.bad.length) warn.push(`<p class="vh-dlg-warn">${r.bad.length} 项数据格式异常将被跳过（不影响现有数据）</p>`);
    if (r.unknown.length) warn.push(`<p class="vh-dlg-warn">${r.unknown.length} 项未知数据将被忽略</p>`);
    const okd = await showDialog({
      title: "导入备份数据？",
      bodyHtml: `
        <p class="vh-dlg-sub">将写入以下 ${r.plan.length} 项数据，同名现有数据会被覆盖：</p>
        <ul class="vh-dlg-list">${items}</ul>
        ${warn.join("")}
        <p class="vh-dlg-note">导入前会自动把当前全部数据备份到 Downloads，可随时恢复。</p>`,
      okText: "导入",
      danger: true,
    });
    if (!okd) return;

    // 1. 导入前备份（当前数据 → 文件，用户可见可恢复）
    const backupName = exportJson();
    if (!backupName) { showToastSafe("导入前备份失败，已取消导入"); return; }

    // 2. 写入（失败自动回滚）
    const res = applyImport(r.plan);
    if (!res.ok) { showToastSafe(res.error); return; }

    // 3. 成功 → 提示后重载，全部模块从新数据渲染
    const skip = r.bad.length ? ` · 跳过 ${r.bad.length} 项异常` : "";
    showToastSafe(`导入成功 · 恢复 ${res.count} 项${skip} · 即将刷新`);
    setTimeout(() => { try { location.reload(); } catch (e) { /* Web 预览兜底 */ } }, 1400);
  }

  function showToastSafe(msg) {
    if (typeof showToast === "function") { showToast(msg); return; }
    try { console.log("[toast]", msg); } catch (e) { /* ignore */ }
  }

  /* Android 文件选择回传：window.__onJsonPicked(text|null) */
  window.__onJsonPicked = function (text) { picking = false; handlePickedText(text); };

  window.VH_DataManager = {
    exportJson,
    parseAndValidate,
    applyImport,
    buildBackup,
    onExportClick,
    onImportClick,
    USER_KEYS,
    BACKUP_VERSION,
  };
})();
