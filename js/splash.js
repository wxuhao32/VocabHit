/* ---------- 启动闪屏：8 个字母从不同方向自然掉落拼成 "VocabHit" ----------
   与首页初始化的时序约定：
   - 动画与首页加载完全并行：transform/opacity 由合成器线程驱动，不占主线程
   - 关闭条件 = 「动画到达自然结束点（字母落位 + 极短停留）」且「首页就绪」
     （app.js 初始化完成后调用 window.__vhSplash.appReady()）
   - 首页先就绪：动画播到自然结束点立即淡出，不做任何人为延迟
   - 首页未就绪：字母落位后安静保持，就绪瞬间立即淡出
   - HARD_CAP_MS 强制上限：任何异常都不会把用户困在闪屏 */
(function () {
  var overlay = document.getElementById("splash");
  if (!overlay) return;

  var HOLD_MS = 260;      // 拼成后的停留：让用户看清品牌名，随即离开
  var FADE_MS = 300;      // 整体淡出过渡
  var HARD_CAP_MS = 3500; // 强制关闭上限（初始化异常兜底）

  var appReady = false;
  var animDone = false;
  var finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    overlay.style.transition = "opacity " + FADE_MS + "ms ease";
    void overlay.offsetWidth; // 强制回流，确保过渡生效
    overlay.style.opacity = "0";
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, FADE_MS + 80);
  }

  function maybeFinish() {
    if (appReady && animDone) finish();
  }

  window.__vhSplash = {
    appReady: function () { appReady = true; maybeFinish(); },
    force: finish
  };
  setTimeout(finish, HARD_CAP_MS);

  var letters = [].slice.call(overlay.querySelectorAll(".splash-letter"));
  var reduce = window.matchMedia &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 系统「减少动态效果」/ 动画 API 不可用：字母静态呈现，等首页就绪后淡出
  if (reduce || !letters.length || !letters[0].animate) {
    animDone = true;
    maybeFinish();
    return;
  }

  var vw = window.innerWidth || 360;
  var vh = window.innerHeight || 640;
  var lastEnd = 0;

  letters.forEach(function (el, i) {
    // 左右方向交替打底再叠加随机，保证「左上 / 右上斜入」混合出现
    var dir = i % 2 === 0 ? -1 : 1;
    if (Math.random() < 0.3) dir = -dir;
    // 约 1/3 字母走斜向轨迹（横向位移大、纵向短），其余从高处近垂直落下
    var sideEntry = Math.random() < 0.34;
    var dx = dir * vw * (sideEntry ? 0.34 + Math.random() * 0.24
                                     : 0.10 + Math.random() * 0.22);
    var dy = -vh * (sideEntry ? 0.18 + Math.random() * 0.26
                              : 0.55 + Math.random() * 0.35);
    var r0 = (16 + Math.random() * 42) * (Math.random() < 0.5 ? -1 : 1);
    var dur = 560 + Math.random() * 260;   // 每个字母速度不同
    var delay = i * 16 + Math.random() * 80; // 轻微错峰，不齐刷掉落
    lastEnd = Math.max(lastEnd, delay + dur);

    try {
      el.animate([
        { transform: "translate(" + dx + "px," + dy + "px) rotate(" + r0 + "deg)",
          opacity: 0,
          easing: "cubic-bezier(.5,.08,.74,.4)" },              // 起势加速（重力感）
        { transform: "translate(" + dx * 0.3 + "px," + dy * 0.34 + "px) rotate(" + r0 * 0.45 + "deg)",
          opacity: 1, offset: 0.44,
          easing: "cubic-bezier(.22,.72,.36,1)" },              // 中段收拢，轨迹带弧度
        { transform: "translate(0px,4px) rotate(" + r0 * 0.05 + "deg) scale(1.04,.95)",
          offset: 0.84,
          easing: "cubic-bezier(.32,.68,.44,1)" },              // 落位轻压回弹
        { transform: "translate(0,0) rotate(0deg) scale(1,1)", opacity: 1 }
      ], { duration: dur, delay: delay, fill: "both" });
    } catch (e) {
      animDone = true; // 极端兼容兜底：直接视为动画完成
    }
  });

  // 最后一个字母落位 + 极短停留 → 到达自然结束点
  setTimeout(function () { animDone = true; maybeFinish(); }, lastEnd + HOLD_MS);
})();
