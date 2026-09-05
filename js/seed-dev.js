/* ============================================================
   开发 / 测试数据注入脚本（seed-dev）
   ------------------------------------------------------------
   仅在 URL 含 ?seed=repo 时生效，不影响正常启动。
   注入内容：
     · 3 个生词（vc-records / vc-review）
     · 一个测试存储库「测试库」（vc-repo，含 2 条知识条目）
     · 2 条间隔重复状态（vc-spaced-repetition）：
         - 1 条提问型（question）
         - 1 条挖空型（cloze）
       全部 nextReviewAt 设为已到期，打开「存储库复习」即可立即测试。
   本脚本以非 defer 方式置于 <head>，先于所有业务脚本执行，
   因此各模块初始化时会直接读取到注入的数据。
   ============================================================ */
(function () {
  "use strict";
  try {
    var sp = new URLSearchParams(location.search).get("seed");
    if (sp !== "repo") return;

    var now = Date.now();
    var DAY = 86400000;
    function vd(t) {
      var d = new Date(t - 4 * 3600 * 1000);
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    }

    /* ---------- 1) 3 个生词（vc-records） ---------- */
    var VWORDS = ["ephemeral", "resilient", "candid"];
    var records = {
      day: vd(now),
      history: [],
      words: {},
      qTotal: VWORDS.length,
      qToday: { day: vd(now), n: VWORDS.length }
    };
    VWORDS.forEach(function (w, i) {
      records.words[w] = {
        today: 1,
        total: 2 + i,
        first: vd(now - 7 * DAY),
        last: now - 3600000,
        starred: true,
        starredAt: now - 7 * DAY,
        firstQueriedAt: now - 7 * DAY,
        deleted: false
      };
    });

    /* 2) 生词 Review 队列：注入为「从未复习过」的全新词（复习次数/三态/lastAt/stage 全 0，
          不会显示「已复习 / 已背完 / 今日已完成」）；仅 nextAt 设为已到期 → 打开 Review 直接进队列 */
    var review = { words: {} };
    VWORDS.forEach(function (w, i) {
      review.words[w] = {
        known: 0, fuzzy: 0, unknown: 0,
        total: 0,
        firstAt: now - 7 * DAY,
        lastAt: 0,                    // 从未复习 → 今日记录推导为空，不判「已背完」
        stage: 0, mode: "", origStage: 0,
        fsrs: null,
        nextAt: now - (3 - i) * 600000 // 已到期 → 待复习队列
      };
    });

    /* 3) 存储库（vc-repo）：一个测试库 + 2 条条目（1 提问 / 1 挖空） */
    var libId = "lib-test";
    var repo = {
      v: 2,
      libraries: [{ id: libId, name: "测试库", createdAt: now }],
      customCats: [],
      entries: [
        {
          id: "k-repo-1",
          content: "The early bird catches the worm.",
          explanation: "谚语：早起的鸟儿有虫吃。",
          context: "",
          catId: "sentence",
          libraryId: libId,
          sources: [],
          createdAt: now,
          lastAt: now
        },
        {
          id: "k-repo-2",
          content: "ubiquitous",
          explanation: "adj. 普遍存在的；无处不在的。",
          context: "",
          catId: "phrase",
          libraryId: libId,
          sources: [],
          createdAt: now,
          lastAt: now
        }
      ],
      hiddenPresetCats: { default: [] }
    };
    repo.hiddenPresetCats[libId] = [];

    /* 4) 间隔重复状态（vc-spaced-repetition）：2 条全部已到期 */
    var sr = { v: 3, states: {} };

    // 挖空型：隐藏原文中的 "worm"
    var c1 = "The early bird catches the worm.";
    var wIdx = c1.indexOf("worm");
    sr.states["k-repo-1"] = {
      id: "k-repo-1",
      repositoryId: libId,
      reviewEnabled: true,
      fsrs: null,
      lastReviewAt: 0,
      nextReviewAt: now - 600000,
      reviewCount: 0,
      examType: "cloze",
      examConfig: { blanks: [{ start: wIdx, end: wIdx + "worm".length }] },
      createdAt: now,
      updatedAt: now
    };

    // 提问型 1
    sr.states["k-repo-2"] = {
      id: "k-repo-2",
      repositoryId: libId,
      reviewEnabled: true,
      fsrs: null,
      lastReviewAt: 0,
      nextReviewAt: now - 600000,
      reviewCount: 0,
      examType: "question",
      examConfig: { question: "请写出 ubiquitous 的中文释义", answer: "普遍存在的|无处不在的" },
      createdAt: now,
      updatedAt: now
    };

    localStorage.setItem("vc-records", JSON.stringify(records));
    localStorage.setItem("vc-review", JSON.stringify(review));
    localStorage.setItem("vc-repo", JSON.stringify(repo));
    localStorage.setItem("vc-spaced-repetition", JSON.stringify(sr));

    /* 5) 清除残留的「今日已完成 / 中断会话 / 连续打卡」标记 → 注入的是全新可复习数据，
          首页 Review 不会再显示「复习已完成」 */
    localStorage.removeItem("vc-review-session-v2");
    localStorage.removeItem("vc-review-today");
    localStorage.removeItem("vc-review-days");

    /* 6) 未配置过应用背景时启用内置插画（default2），让测试页直接看到
          「首页同款全屏插画 + 白色浮卡」的统一视觉效果；
          已有自定义/默认背景则保持原样，不覆盖用户选择 */
    if (!localStorage.getItem("vc-appbg")) {
      localStorage.setItem("vc-appbg", "default2");
    }

    /* 模块加载完成后自动进入「单词复习」（本次测试目标），可直接开始过复习；
       想测存储库挖空/提问时：返回 → 设置 → FSRS 算法 → 存储库 */
    window.addEventListener("load", function () {
      try {
        if (typeof window.openReview === "function") { window.openReview(); return; }
        if (window.VH_SR && window.VH_SR.ui) {
          window.VH_SR.ui.openHub();
          setTimeout(function () { try { window.VH_SR.ui.openRepo(); } catch (e) {} }, 60);
        }
      } catch (e) { /* 忽略 */ }
    });

    console.log("[seed-repo] 已注入 3 生词 + 测试库(1 挖空 / 1 提问)");
  } catch (e) {
    console.error("[seed-repo] 注入失败", e);
  }
})();
