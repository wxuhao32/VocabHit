/* ============================================================
   FSRS · Free Spaced Repetition Scheduler · 纯算法模块 v1
   ------------------------------------------------------------
   挂载到 window.VH_FSRS。
   职责：只做「给定记忆状态 + 本次评分 → 新记忆状态 + 建议间隔」。
   不读写 localStorage，不接触 DOM，不依赖任何其它文件 —— 纯函数。
   由 js/app.js 的 answerReview() 调用（Review 生词复习唯一调度入口）。
   ============================================================
   算法：FSRS（DSR 模型：Difficulty / Stability / Retrievability）
   实现基线：FSRS-5 核心（19 个默认参数 w0–w18，含短期稳定性 w17/w18），
   幂遗忘曲线 R(t,S) = (1 + FACTOR·t/S)^DECAY，DECAY = -0.5。
   参数与公式对齐 FSRS 官方实现（open-spaced-repetition/fsrs-rs）。
   ============================================================
   记忆状态字段（存于 reviewStore.words[w].fsrs）：
     s      稳定性 Stability：记忆半衰期，单位天（R 衰减到 0.9 所需天数）
     d      难度 Difficulty：该词对此用户的固有难度，1.0–10.0
     dr     期望保留率 Desired Retention：目标记忆保持概率（默认 0.9）
     reps   已复习次数
     lapses 遗忘次数（评分 Again 的次数）
     lastReviewedAt  上次复习的时间戳（ms），用于计算实际经过天数
     lastElapsed     上次复习时的实际经过天数（诊断用）
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 常量 ---------- */

  /** FSRS-5 默认参数（19 个，w0–w18）。
      w0–w3   各评分的初始稳定性（Again/Hard/Good/Easy）
      w4–w7   难度：基准 / 指数 / 变化率 / 均值回归权重
      w8–w10  成功后稳定性：基数 / 幂次 / 可提取性影响
      w11–w14 遗忘后稳定性
      w15     Hard 惩罚系数
      w16     Easy 奖励系数
      w17–w18 短期（同日）稳定性：基数 / 评分偏移
      注：均 > 0，因此允许短期间隔（与官方 FSRS 的 params[17]>0 && params[18]>0 判定一致） */
  var DEFAULT_PARAMS = [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925,
    1.9395, 0.11, 0.29605, 2.2698,
    0.2315, 2.9898,
    0.51655, 0.6621
  ];

  /** 评分（与 Review 三态对应）：
      1 = Again  不认识   → VocabHit "unknown"
      2 = Hard   模糊     → VocabHit "fuzzy"
      3 = Good   认识     → VocabHit "known" */
  var RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

  var DECAY = -0.5;                                 // 幂遗忘曲线衰减常数
  var FACTOR = Math.pow(0.9, 1 / DECAY) - 1;        // ≈ 0.234568，使 R(S,S)=0.9
  var S_MIN = 0.1;                                  // 稳定性下限（天）
  var S_MAX = 36500;                                // 稳定性上限（约 100 年）
  var D_MIN = 1;                                    // 难度下限
  var D_MAX = 10;                                   // 难度上限

  /** 最小复习间隔（天）。VocabHit 的整个调度体系以「业务日 04:00」为锚点
      （vocabDay / businessDayAt / reviewQueue / 提醒快照均按天粒度），
      因此把 FSRS 算出的不足 1 天的间隔收敛到 1 天，避免出现「当天重复结算」
      与「设置页显示时间 ≠ 实际调度时间」的不一致。 */
  var MIN_INTERVAL_DAYS = 1;

  var DEFAULT_DR = 0.9;                             // 默认期望保留率

  /* ---------- 工具 ---------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------- 数学核心 ---------- */

  /** 可提取性 Retrievability：经过 t 天后还能想起来的概率 */
  function retrievability(elapsedDays, stability) {
    if (!(stability > 0)) return 1;
    if (elapsedDays <= 0) return 1;
    return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
  }

  /** 由稳定性反解「保留率降到 targetR 所需天数」 */
  function intervalFor(stability, targetR) {
    if (!(stability > 0)) return MIN_INTERVAL_DAYS;
    var t = stability / FACTOR * (Math.pow(targetR, 1 / DECAY) - 1);
    return Math.max(MIN_INTERVAL_DAYS, t);
  }

  /** 初始稳定性：S0(rating) = w[rating-1] */
  function initStability(rating) {
    var r = clamp(rating, 1, 4);
    return clamp(DEFAULT_PARAMS[r - 1], S_MIN, S_MAX);
  }

  /** 初始难度：D0(rating) = clamp(w4 - (rating-3)·w5, 1, 10) */
  function initDifficulty(rating) {
    var r = clamp(rating, 1, 4);
    return clamp(DEFAULT_PARAMS[4] - (r - 3) * DEFAULT_PARAMS[5], D_MIN, D_MAX);
  }

  /** 难度更新：线性阻尼 + 向 D0(4) 的均值回归 */
  function nextDifficulty(d, rating) {
    var r = clamp(rating, 1, 4);
    var deltaD = -DEFAULT_PARAMS[6] * (r - 3);
    var damped = d + deltaD * (D_MAX - d) / (D_MAX - D_MIN);
    var reverted = DEFAULT_PARAMS[7] * initDifficulty(4) + (1 - DEFAULT_PARAMS[7]) * damped;
    return clamp(reverted, D_MIN, D_MAX);
  }

  /** 成功（rating ≥ 2）后的稳定性。Hard 乘惩罚 w15，Easy 乘奖励 w16。
      结果不允许低于原稳定性（同一回忆不会让记忆变弱）。 */
  function stabilityAfterSuccess(s, d, r, rating) {
    var hardPenalty = rating === RATING.HARD ? DEFAULT_PARAMS[15] : 1;
    var easyBonus = rating === RATING.EASY ? DEFAULT_PARAMS[16] : 1;
    var grown = s * (1
      + Math.exp(DEFAULT_PARAMS[8]) * (11 - d)
      * Math.pow(s, -DEFAULT_PARAMS[9])
      * (Math.exp(DEFAULT_PARAMS[10] * (1 - r)) - 1)
      * hardPenalty * easyBonus);
    return clamp(Math.max(grown, s), S_MIN, S_MAX);
  }

  /** 遗忘（rating = 1）后的稳定性。之前记得越牢（S 越大）、
      失败时可提取性越低（R 越小），残留稳定性越高。 */
  function stabilityAfterFailure(s, d, r) {
    var after = DEFAULT_PARAMS[11]
      * Math.pow(d, -DEFAULT_PARAMS[12])
      * (Math.pow(s + 1, DEFAULT_PARAMS[13]) - 1)
      * Math.exp(DEFAULT_PARAMS[14] * (1 - r));
    return clamp(after, S_MIN, S_MAX);
  }

  /** 短期（同日，elapsedDays = 0）稳定性。 */
  function stabilityShortTerm(s, rating) {
    var r = clamp(rating, 1, 4);
    var after = s * Math.exp(DEFAULT_PARAMS[17] * (r - 3 + DEFAULT_PARAMS[18]));
    return clamp(after, S_MIN, S_MAX);
  }

  /* ---------- 对外 API ---------- */

  /** 新词的空记忆状态：s/d 为 null，首次评分时由 w0–w3 初始化 */
  function newState(dr) {
    return {
      s: null,
      d: null,
      dr: (typeof dr === "number" && dr > 0.5 && dr < 1) ? dr : DEFAULT_DR,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
      lastElapsed: null
    };
  }

  /**
   * 一次复习的完整状态更新（FSRS 调度核心）。
   * @param {object} state  当前记忆状态（见文件头字段说明；旧数据可为 null）
   * @param {number} rating 1=Again(不认识) 2=Hard(模糊) 3=Good(认识)
   * @param {number} now    本次复习时间戳（ms）
   * @param {object} [opts] 可选：{ countRep:boolean } —— 同一记忆轮次内的后续证据
   *                        （如拼写态在词义三态之后的二次评分）传入 countRep:false，
   *                        只更新稳定性/难度，不重复累计 reps/lapses，保持「整词一轮」口径。
   * @returns {{state:object, intervalDays:number, retrievability:number}}
   *          state   更新后的记忆状态（直接写回 reviewStore.words[w].fsrs）
   *          intervalDays 建议间隔天数（已收敛到 ≥ MIN_INTERVAL_DAYS）
   */
  function review(state, rating, now, opts) {
    var st = state && typeof state === "object" ? state : newState();
    var r = clamp(rating | 0, 1, 4);
    var nowMs = now || Date.now();
    var countRep = !(opts && opts.countRep === false);

    var elapsedDays = (st.lastReviewedAt && st.s)
      ? Math.max(0, (nowMs - st.lastReviewedAt) / 86400000)
      : 0;

    var sNew, dNew, rNow;

    if (st.s == null || !(st.s > 0)) {
      /* 首次复习：由评分初始化 S/D */
      sNew = initStability(r);
      dNew = initDifficulty(r);
      rNow = 1;
    } else {
      var s = clamp(st.s, S_MIN, S_MAX);
      var d = clamp(st.d == null ? initDifficulty(r) : st.d, D_MIN, D_MAX);
      rNow = retrievability(elapsedDays, s);

      if (elapsedDays < 1) {
        /* 不足 1 天（同日 / 当天稍后）→ 短期稳定性公式。
            成功公式在 elapsedDays→0 时增益趋于 0（exp(w10·(1-R))-1 → 0），
            无法表达「当天再复习仍能小幅提升记忆」，故 FSRS 用独立短期公式。 */
        sNew = stabilityShortTerm(s, r);
      } else if (r === RATING.AGAIN) {
        /* 遗忘 → 失败公式 */
        sNew = stabilityAfterFailure(s, d, rNow);
      } else {
        /* 成功 → 成功公式 */
        sNew = stabilityAfterSuccess(s, d, rNow, r);
      }
      dNew = nextDifficulty(d, r);
    }

    var intervalDays = intervalFor(sNew, st.dr || DEFAULT_DR);

    var out = {
      s: sNew,
      d: dNew,
      dr: st.dr || DEFAULT_DR,
      reps: (st.reps || 0) + (countRep ? 1 : 0),
      lapses: (st.lapses || 0) + (r === RATING.AGAIN && countRep ? 1 : 0),
      lastReviewedAt: nowMs,
      lastElapsed: elapsedDays
    };

    return { state: out, intervalDays: intervalDays, retrievability: rNow };
  }

  /**
   * 旧数据迁移：由 VocabHit 既有字段推导初始 FSRS 记忆状态。
   * 稳定性：旧系统的 nextAt 间隔即为「按 0.9 保留率排期」的间隔，
   *          而当历史保留率 = 期望保留率 = 0.9 时，FSRS 稳定性恰等于间隔
   *          （intervalFor(S, 0.9) === S），因此直接取旧间隔。
   * 难度：用历史失败占比在 D0(Easy) 与 D0(Again) 之间线性插值 ——
   *          完全复用 FSRS 自身的初始化原语，不引入额外常数。
   * @param {object} legacy { intervalDays, total, known, fuzzy, unknown }
   * @returns {object} FSRS 记忆状态
   */
  function fromLegacy(legacy) {
    var lg = legacy || {};
    var total = lg.total || 0;

    if (total <= 0 || !(lg.intervalDays > 0)) {
      /* 从未复习过（或无有效间隔）→ 空状态，首次评分时初始化 */
      return newState();
    }

    var intervalDays = clamp(lg.intervalDays, S_MIN, S_MAX);
    var failed = (lg.unknown || 0) + (lg.fuzzy || 0);
    var failRatio = clamp(failed / total, 0, 1);
    var dLow = initDifficulty(RATING.EASY);   // 最熟：难度最低
    var dHigh = initDifficulty(RATING.AGAIN); // 最生：难度最高
    var d = clamp(dLow + failRatio * (dHigh - dLow), D_MIN, D_MAX);

    return {
      s: intervalDays,
      d: d,
      dr: DEFAULT_DR,
      reps: total,
      lapses: lg.unknown || 0,
      lastReviewedAt: lg.lastReviewedAt || null,
      lastElapsed: null
    };
  }

  /** 旧六档间隔表（与 app.js 的 R_INTERVALS 一致，仅用于下面的兼容映射） */
  var LEGACY_INTERVALS = [0, 3, 7, 10, 20, 30, 30];

  /**
   * 由间隔天数反推旧版 stage（0–6），用于兼容仍读取 st.stage 的旧展示逻辑。
   * 取旧间隔表中与新间隔最接近的档位（纯展示用途，不参与调度）。
   * 例：3 天→1，7 天→2，10 天→3，20 天→4，29 天→5（最近 30），≥30 天→6。
   */
  function stageFromInterval(days) {
    if (!(days > 0)) return 0;
    var best = 1, bestDiff = Infinity;
    for (var k = 1; k <= 6; k++) {
      var diff = Math.abs(LEGACY_INTERVALS[k] - days);
      if (diff < bestDiff) { bestDiff = diff; best = k; }
    }
    // 间隔表末两档同为 30 天（stage 6 = 长期/每月封顶）：
    // 达到 30 天及以上一律归入 stage 6，避免并列取整误落入 stage 5
    if (days >= LEGACY_INTERVALS[6]) return 6;
    return best;
  }

  window.VH_FSRS = {
    VERSION: 1,
    RATING: RATING,
    DEFAULT_PARAMS: DEFAULT_PARAMS,
    DEFAULT_DR: DEFAULT_DR,
    MIN_INTERVAL_DAYS: MIN_INTERVAL_DAYS,
    DECAY: DECAY,
    FACTOR: FACTOR,
    retrievability: retrievability,
    intervalFor: intervalFor,
    newState: newState,
    review: review,
    fromLegacy: fromLegacy,
    stageFromInterval: stageFromInterval
  };
})();
