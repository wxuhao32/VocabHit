/* ============================================================
   应用背景模块（v1.2.6 纯新增，独立文件 · 开闭原则）
   ------------------------------------------------------------
   职责：背景层内容装配 + 设置项「应用背景」+ 自定义选图。
   不修改任何既有函数/DOM 结构；Review 排除由 app-bg.css 的
   body.review-active 规则完成（本文件只负责装配背景图内容）。

   存储：
   · vc-appbg        当前模式："default1" | "default2" | "custom"
   · vc-appbg-custom 自定义背景：APK 内为 file:// 路径（原生已复制
     到应用私有目录，重启不丢）；Web 回退为压缩后的 dataURL

   显示规则：
   · default1 = 现有默认背景（不启用图片层，零影响）
   · default2 = 内置 img/app-bg.jpg（随包分发的 9:16 设计背景）
   · custom   = 用户所选图片（CSS cover 等比缩放居中裁剪，不拉伸）
   · 主题适配：仅给背景层本身叠一层主题色薄纱（浅/深两套），
     保证文字可读性；不改动任何组件的颜色与结构
   ============================================================ */

(function () {
  "use strict";

  const BG_KEY = "vc-appbg";
  const BG_CUSTOM_KEY = "vc-appbg-custom";
  const BUILTIN_BG = "img/app-bg.jpg"; // 默认 2：内置背景图（随包分发）

  /* 主题薄纱：背景只是装饰层，文字/组件可读性优先（不触碰任何组件） */
  const VEILS = {
    light: "linear-gradient(rgba(247,248,250,0.48), rgba(247,248,250,0.48))",
    dark: "linear-gradient(rgba(11,14,20,0.72), rgba(11,14,20,0.72))"
  };

  const MODE_NAMES = { default1: "默认 1", default2: "默认 2", custom: "自定义" };

  /* ---------- 背景层：body 第一个子节点 → 恒在所有内容之下 ---------- */

  const layer = document.createElement("div");
  layer.id = "app-bg";
  layer.setAttribute("aria-hidden", "true"); // 纯视觉装饰，不是可交互元素
  document.body.insertBefore(layer, document.body.firstChild);

  function getMode() {
    const m = localStorage.getItem(BG_KEY);
    return m === "default2" || m === "custom" ? m : "default1";
  }

  function getCustom() { return localStorage.getItem(BG_CUSTOM_KEY) || ""; }

  function hasAndroidBridge() {
    return !!(window.AndroidBridge && typeof window.AndroidBridge.pickBackgroundImage === "function");
  }

  /* ---------- 装配：按模式设置背景层内容并同步设置项 UI ---------- */

  function currentVeil() {
    return document.documentElement.dataset.theme === "dark" ? VEILS.dark : VEILS.light;
  }

  function resolveImage(mode) {
    if (mode === "default2") return BUILTIN_BG;
    if (mode === "custom") return getCustom();
    return "";
  }

  function applyBackground() {
    const mode = getMode();
    const img = resolveImage(mode);
    const active = !!img; // 自定义未选图时视为仍用默认背景
    layer.style.backgroundImage = active ? currentVeil() + ', url("' + img + '")' : "";
    document.body.classList.toggle("has-app-bg", active);
    syncSettingsUI();
  }

  function syncSettingsUI() {
    const mode = getMode();
    document.querySelectorAll("#bg-seg .seg-btn").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.value === mode)));
    const val = document.getElementById("bg-value");
    if (val) val.textContent = MODE_NAMES[mode] + (mode === "custom" && !getCustom() ? " · 未选图" : "");
    const change = document.getElementById("bg-change");
    if (change) change.hidden = mode !== "custom"; // 仅自定义模式显示「更换图片」入口
  }

  /* ---------- 设置项交互 ---------- */

  const seg = document.getElementById("bg-seg");
  if (seg) {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      const mode = btn.dataset.value;
      localStorage.setItem(BG_KEY, mode);
      applyBackground();
      // 选择自定义但还没有图：立即打开选图（取消选择也不破坏现状）
      if (mode === "custom" && !getCustom()) openPicker();
    });
  }
  const changeBtn = document.getElementById("bg-change");
  if (changeBtn) changeBtn.addEventListener("click", openPicker);

  function openPicker() {
    if (hasAndroidBridge()) {
      try { window.AndroidBridge.pickBackgroundImage(); return; } // 结果经 __onBackgroundImage
      catch (e) { /* 桥接异常落入 Web 回退 */ }
    }
    const input = document.getElementById("bg-file");
    if (input) input.click();
  }

  /* ---------- 自定义背景：APK 原生通道（图片已复制到应用私有目录） ---------- */

  window.__onBackgroundImage = function (path) {
    if (!path) return; // 用户取消或复制失败：保持现状
    if (saveCustom(path)) showToast("自定义背景已应用");
  };

  /* ---------- 自定义背景：Web 回退（文件输入 → 压缩为 9:16 dataURL） ----------
     长边压到 1920、JPEG 0.85：控制 localStorage 占用，视觉无损于屏幕显示；
     按 9:16 居中裁剪（cover 语义），只裁剪不拉伸，保持背景视觉完整 */
  const fileInput = document.getElementById("bg-file");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type)) { showToast("请选择图片文件"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const dataURL = compressTo916(img);
            if (saveCustom(dataURL)) showToast("自定义背景已应用");
          } catch (e) {
            showToast("图片处理失败，请换一张试试");
          }
        };
        img.onerror = () => showToast("图片读取失败，请换一张试试");
        img.src = String(reader.result || "");
      };
      reader.onerror = () => showToast("图片读取失败，请换一张试试");
      reader.readAsDataURL(file);
    });
  }

  function compressTo916(img) {
    const TARGET_H = 1920;
    const cropW = Math.min(img.width, img.height * 9 / 16); // cover 裁剪窗（居中）
    const cropH = cropW * 16 / 9;
    const outH = Math.min(TARGET_H, Math.round(cropH));
    const outW = Math.round(outH * 9 / 16);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, (img.width - cropW) / 2, (img.height - cropH) / 2, cropW, cropH, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  /** 保存自定义背景：写入失败（空间不足等）提示且不切换模式，原背景不受影响 */
  function saveCustom(value) {
    try {
      localStorage.setItem(BG_CUSTOM_KEY, value);
    } catch (e) {
      showToast("存储空间不足，背景图未保存");
      return false;
    }
    localStorage.setItem(BG_KEY, "custom");
    applyBackground();
    return true;
  }

  /* ---------- 主题切换：跟随现有 applyTheme 的 html[data-theme]，只重装薄纱 ---------- */

  new MutationObserver(applyBackground).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });

  applyBackground();
})();
