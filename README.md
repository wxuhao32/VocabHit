# VocabHit

考研向的本地优先英语词汇 App：离线词典 / 生词本 / 艾宾浩斯复习 / 知识库 / Math Canvas / 划重点 / 悬浮窗查词 / 考研释义分级 / 学习提醒。

纯前端 + Android WebView，无第三方运行时框架依赖，单 APK 就能跑。

> 当前版本：v1.1.1（versionCode 84）· Android minSdk 26 / targetSdk 34

---

## 主要功能

### 词典 / 生词
- **离线词典查询**：基于 [ECDICT](https://github.com/skywind3000/ECDICT) 开源词库，本地分片打包，支持 20 万+ 词条
- **考研词汇释义分级（KY Level）**：对考研词汇书的每个释义自动标注 common（常见·绿）/ normal（一般·黄）/ rare（生僻·灰）三级，人工标注优先、算法兜底；高频词的特殊义项右上角标注「僻」字（熟词僻义），帮你在阅读中精准识别考点
- **生词三级分类**：今日生词 / 历史生词 / 查询记录
- **拼写复习（Spelling）**：输入 → 确认 → 翻页，错词留底、正确即过，音频提示辅助
- **艾宾浩斯曲线复习（Review）**：基于 Ebbinghaus 遗忘曲线智能排期，含手动重置 / 跳过 / 长期状态锁定

### 知识库
- **多格式导入**：Word / Excel / PDF / TXT，自动解析为知识条目
- **划重点 / 高亮**：资料详情页支持跨段落、跨行、跨表格的高亮标注
- **间隔重复（SR）**：知识库条目独立的艾宾浩斯复习队列，支持提问型 / 挖空型两种考察方式
- **每日任务**：可设生效时间区间，完成统计 + 打卡
- **主题切换**：浅色 / 深色 / 跟随系统

### Math Canvas
- **横屏全屏数学画布**：白板 + 工具栏 + 撤销 / 重做，滚动、拖动、缩放、双击复位全部流畅
- **函数 / 几何 / 标注 / 预设一应俱全**
- **表达式解析引擎**：词法分析 → 递归下降语法分析 → 编译为求值闭包，支持导数 / 积分 / 求根 / 极限数值计算
- **状态栏避让**：解决 Android WebView 顶部白边，画布 100dvh 满屏渲染

### 悬浮窗
- **全局悬浮查词**：其他 App 顶部浮窗选中即查，与主应用数据同步

### 学习提醒（Reminder）
- **系统级精确闹钟**：基于 Android `AlarmManager` 精确闹钟，App 进程被杀、WebView 未打开均不影响触发
- **每日循环**：到点弹出通知提醒学习，点击通知直达应用；触发后自动排下一天，形成每日循环
- **持久化恢复**：App 启动 / 系统重启 / 应用更新 / 时区变更时自动从偏好恢复排期，无需手动重设
- **统一调度入口**：开 / 关 / 改时间走同一接口，旧闹钟被同一 PendingIntent 覆盖替换，不会重复提醒

### 启动体验
- **品牌闪屏（Splash）**：8 个字母从不同方向自然掉落拼成 "VocabHit"，动画由合成器线程驱动、不占主线程；与首页初始化完全并行，首页就绪即淡出，无白屏切换；异常情况下限 3.5 秒强制关闭兜底
- **首页吉祥物**：线条小狗形象陪伴学习

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 纯 HTML / CSS / JavaScript（无第三方运行时框架） |
| Android 壳 | 原生 WebView + Java 桥接（`@JavascriptInterface` 双向通信） |
| 词典数据 | ECDICT 分片打包（MIT License），按字母 a~z + 标点分 27 个 JS 文件 |
| 构建 | Gradle 8.9 / JDK 17 / Android minSdk 26 / targetSdk 34 |
| 提醒 | `AlarmManager` 精确闹钟 + `BroadcastReceiver`，需 `SCHEDULE_EXACT_ALARM` 权限 |
| OCR | Google ML Kit on-device（可选，导入扫描件用） |
| 存储 | `localStorage`（Web 层）+ `SharedPreferences` / 内部存储（Android 层） |

**设计原则**：单 APK 离线优先、隐私默认开启、不引入 npm 依赖（用浏览器原生 API 即可解决 99% 场景）。

---

## 核心算法详解

### 4.1 业务日与时间边界

所有复习排期均以**业务日**为单位，而非自然时间的 `N × 24h`。

```javascript
function businessDayAt(dayOffset, now = Date.now()) {
  const d = new Date(now - 4 * 3600 * 1000); // 当前业务日 D 的 00:00（本地）
  d.setDate(d.getDate() + dayOffset);           // D + dayOffset 个业务日
  d.setHours(4, 0, 0, 0);                       // 该业务日 04:00（开始时刻）
  return d.getTime();
}
```

- **每日切换边界 = 凌晨 04:00**：凌晨 04:00 之前仍算前一天，符合考研党熬夜学习的真实作息。
- `businessDayAt(N)` 返回「当前业务日 + N 个业务日」的 04:00 时间戳。
- 所有间隔（3 天 / 7 天 / 每月等）一律调用此函数，保证跨日、跨时区一致性。

---

### 4.2 生词复习间隔重复算法（Review）

这是生词本的核心排期引擎，数据存储在 `localStorage["vc-review"]`。

#### 状态字段

每个生词维护以下状态：

| 字段 | 含义 |
|------|------|
| `stage` | 复习阶段 0~6（0=未入长期，6=长期每月） |
| `mode` | `"long"` 长期 / `"daily"` 每日循环 / `"booster"` 模糊强化 / `""` 未开始 |
| `origStage` | 进入 daily/booster 前的原长期阶段（用于恢复） |
| `nextAt` | 下一次复习时间戳（业务日 04:00） |
| `known / fuzzy / unknown / total` | 累计判断计数 |

#### 六档间隔表

```javascript
const R_INTERVALS = [0, 3, 7, 10, 20, 30, 30]; // stage 0~6（6=每月）
```

| stage | 间隔 | 含义 |
|-------|------|------|
| 0 | 0 天 | 未入长期（首次复习前） |
| 1 | 3 天 | 首次认识后 |
| 2 | 7 天 | |
| 3 | 10 天 | |
| 4 | 20 天 | |
| 5 | 30 天 | |
| 6 | 30 天 | 长期每月（上限，不再递增） |

#### 状态转移规则

一次复习用户给出三种判断：`known`（认识）/ `fuzzy`（模糊）/ `unknown`（不认识）。

**known（认识）**

```
if mode == daily or booster:
    → 恢复原长期阶段（origStage > 0 ? origStage : 1），mode = long
else if stage == 0:
    → stage = 1, mode = long（首次认识，3 天后）
else:
    → stage = min(6, stage + 1), mode = long（进入下一档）
nextAt = businessDayAt(R_INTERVALS[stage])
```

**fuzzy（模糊）**

```
if stage > 0 and mode != daily:
    → 进入 booster 强化模式，保留原阶段（origStage = stage）
    → nextAt = businessDayAt(2)  // 2 个业务日后强化
else:
    → 进入 daily 每日模式
    → nextAt = businessDayAt(firstReview ? 2 : 1)  // 首次模糊 2 天，之后每日
```

**unknown（不认识）**

```
if stage > 0 and mode != daily:
    → 保留原长期阶段（origStage = stage）
→ mode = daily, nextAt = businessDayAt(1)  // 次日复习
```

#### 关键设计决策

1. **当天生词当天不复习**：新词加入时 `nextAt = 次日 04:00`，避免刚查完就被迫复习。
2. **长期阶段不回退**：unknown/fuzzy 只切换到 daily/booster 模式，`stage` 本身不降低，认识后立即恢复原阶段。这比传统 SM-2 更温和，避免一次遗忘毁掉长期积累。
3. **booster 模糊强化**：模糊不等于不认识，给 2 天强化期而非直接降为每日。
4. **生词本是唯一数据源**：移出生词本的词立即从 Review 队列清除，杜绝脏数据残留。

---

### 4.3 知识库间隔重复算法（SR）

知识库条目有一套**完全独立**的间隔重复系统，数据存储在 `localStorage["vc-spaced-repetition"]`，与生词 Review 零耦合、互不读写。

代码位于 `js/spaced-repetition/srData.js`。

#### 与生词 Review 的区别

| 维度 | 生词 Review | 知识库 SR |
|------|------------|-----------|
| 间隔档位 | 固定 7 档（含 stage 0） | 可自定义 6 档（默认 1·3·7·10·20·30） |
| 阶段上限 | 6（每月） | 6（长期重复） |
| 判断类型 | known / fuzzy / unknown | known / fuzzy / forgot / mastered |
| 考察方式 | 固定（词义+拼写） | 每条目独立：提问型 / 挖空型 |
| 忘记处理 | 切 daily 模式，阶段不回退 | 阶段回退（≥1），次日复习 |
| 模糊处理 | booster 2 天强化 | 阶段不变，间隔减半（≥1 天） |

#### 六档间隔（可自定义）

```javascript
var DEFAULT_INTERVALS = [1, 3, 7, 10, 20, 30];
```

用户可在设置中修改为任意 6 个 1~365 的天数，修改仅影响后续调度，已有排期不变。

#### 状态转移

```
known   → stage = min(6, stage + 1), nextAt = intervals[stage - 1] 天后
fuzzy   → stage 不变, nextAt = max(1, round(intervals[stage - 1] / 2)) 天后
forgot  → stage = max(1, stage - 1), nextAt = 1 天后
mastered → reviewEnabled = false（退出队列，数据保留可重新加入）
```

#### 考察方式

每条知识条目可独立设置考察方式：

- **提问型（question）**：预设问题 + 正确答案，复习时显示问题，用户回忆后对照答案。
- **挖空型（cloze）**：在原文中选择若干区间 `{start, end}` 作为空白，复习时填空，系统自动判分（忽略大小写与多余空白）。

```javascript
function judgeCloze(content, blanks, answers) {
  // answers[i] 对应 blanks[i]，忽略大小写与多余空白
  // 返回 { results:[bool], correct, total, allCorrect }
}
```

---

### 4.4 两阶段复习任务池

生词复习采用**任务池（Task Pool）模式**，每个单词拆为 3 个独立任务，全部打乱后统一排队：

| 任务类型 | 代码标识 | 内容 |
|---------|---------|------|
| 主动回忆 | `recall` | 显示单词，用户判断 known/fuzzy/unknown |
| 单词→选释义 | `w2m` | MCQ 四选一，看单词选中文释义 |
| 释义→选单词 | `m2w` | MCQ 四选一，看中文释义选单词 |

**设计要点**：

1. **Fisher-Yates 随机打乱**：三种任务混合排队，用户无法预测下一题类型。
2. **独立完成跟踪**：`completed["word|step"]` 记录每个任务是否完成，答错只重复该任务，不影响其他两种。
3. **Phase 1 → Phase 2**：所有词义任务完成后进入拼写复习（Phase 2），拼写错词留底、正确即过。
4. **会话持久化**：复习会话存储在 `localStorage["vc-review-session-v2"]`，中断后可恢复。

```javascript
function shuffleArray(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

---

### 4.5 MCQ 干扰项生成算法

选择题的干扰项不是随机抽取，而是通过**相似度评分**从 20 万+ 词库中筛选最具迷惑性的选项。

#### 单词→选释义（w2m）干扰项

```javascript
function generateMeaningDistractors(word, correctMeaning, count = 3) {
  // 遍历全词典，对每个候选释义计算评分：
  //   score = sharedChineseChars(text, correctText) * 2 - lenDiff
  // 其中：
  //   sharedChineseChars = 两个中文释义共享的字符数
  //   lenDiff = |候选释义长度 - 正确释义长度|
  // 过滤：长度差 > correctLen + 3 的候选直接排除
  // 排序：score 降序，同分随机
  // 去重：释义文本去重
}
```

**直觉**：共享汉字越多、长度越接近的释义，越容易和正确答案混淆。

#### 释义→选单词（m2w）干扰项

```javascript
function generateWordDistractors(word, count = 3) {
  // 遍历全词典，对每个候选单词计算评分：
  //   score = -editDistance(w, target) * 2 - lenDiff + (首字母相同 ? 3 : 0)
  // 其中：
  //   editDistance = Levenshtein 编辑距离（动态规划 O(mn)）
  //   lenDiff = |候选长度 - 目标长度|
  // 过滤：
  //   1. 同词根/词形变化排除（共享前缀 > min(len)*0.6）
  //   2. 长度差 > 3 排除
  // 排序：score 降序，同分随机
}
```

**直觉**：拼写越接近（编辑距离小）、长度相近、首字母相同的单词，越容易和正确答案混淆。同时排除同根词（如 `make` / `making`），避免干扰项本身就是正确答案的变形。

#### 编辑距离实现

```javascript
function editDistance(a, b) {
  // 标准 Levenshtein 动态规划
  // dp[i][j] = a[0..i-1] 到 b[0..j-1] 的最小编辑次数
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
```

---

### 4.6 数学计算引擎

Math Canvas 内置完整的表达式解析与数值计算引擎，代码位于 `js/math-lab/mathEngine.js`，零依赖、纯前端实现。

#### 架构：三段式流水线

```
输入字符串 → tokenize（词法分析）→ parse（语法分析）→ compileNode（编译为闭包）→ f(x) 求值
```

#### 1. 词法分析（tokenize）

- 数字：支持整数、小数、科学计数法（`1e-5`、`2.5E+3`）
- 标识符：变量名、函数名、常数（`pi` / `π` / `e` / `tau`）
- 运算符：`+ - * / ^ ( )`，以及中文符号别名（`× ÷ − （ ） ， √`）
- 隐式乘法：`2x`、`2sin(x)`、`(x+1)(x-1)` 自动识别为乘法

#### 2. 语法分析（递归下降）

优先级从低到高：

```
parseExpr   → parseTerm (('+' | '-') parseTerm)*
parseTerm   → parseUnary (('*' | '/' | 隐式乘法) parseUnary)*
parseUnary  → ('-' | '+')? parsePower
parsePower  → parseAtom ('^' parseUnary)?    // 右结合
parseAtom   → number | '(' parseExpr ')' | ident '(' args ')' | ident
```

输出 AST 节点类型：`num` / `sym` / `neg` / `add` / `sub` / `mul` / `div` / `pow` / `call`。

#### 3. 编译为求值闭包（compileNode）

AST 递归编译为 JavaScript 闭包，每个节点返回 `function(x) { return value; }`，避免运行时重复解释 AST。

```javascript
case "add":
  var l = compileNode(node.a, varName), r = compileNode(node.b, varName);
  return function (x) { return l(x) + r(x); };
```

#### 4. 数值计算方法

| 运算 | 方法 | 参数 |
|------|------|------|
| **导数** | 中心差分 `(f(x+h) - f(x-h)) / 2h` | 自动步长 `h = max(1e-6, |x|×1e-6)`，奇点附近放大步长重试 4 次 |
| **定积分** | 复合 Simpson 公式 | n=2000 等分，64 点预检奇点，含奇点返回 NaN |
| **不定积分** | 梯形法累加采样 | 最多 4000 点，断点处 `ys[i]=null` |
| **求根** | 变号扫描 + 二分法 | 900 点扫描变号区间，每区间二分 80 次，精度 `1e-13` |
| **极限** | 单侧逐次逼近 | 从 `10^-1` 到 `10^-15` 逐次逼近，收敛判据 `|v - last| < 1e-7 × max(1, |last|)` |

#### 支持的函数与常数

- **常数**：`pi` / `π`、`e`、`tau`（2π）
- **三角函数**：`sin cos tan asin acos atan atan2 sinh cosh tanh`
- **指数对数**：`exp ln log log2 log10`
- **代数**：`sqrt cbrt abs floor ceil round sign pow mod`
- **最值**：`min max`

---

### 4.7 考研词汇释义分级算法（KY Level）

对考研词汇书（`js/dict.js` 的 `DICT_DATA`）的每个释义进行三级分类，ECDICT / 大词典 / 用户自建词条一律不参与（返回 null，走原有逻辑）。

代码位于 `js/ky-level.js`，人工标注数据位于 `js/ky-manual.js`。

#### 分级数据来源优先级

1. **人工标注（`KY_MANUAL`）**：命中即返回人工结果，由人工逐条审视词书数据后判定，运行时直接读取、零分析。
2. **算法兜底**：未人工标注的词，惰性构建全量映射，按「展平释义位置 + 单词词频排名」统一机制分类。

#### 三级释义

每个释义：`{ text, level: "common" | "normal" | "rare", obscure: bool }`

| 级别 | 颜色 | 含义 |
|------|------|------|
| `common` | 绿 | 常见、通用释义 |
| `normal` | 黄 | 一般常见释义 |
| `rare` | 灰 | 少见、生僻、冷门释义 |
| `obscure` | 右上角「僻」 | 考研「熟词僻义」标记 |

#### 算法阈值（统一机制，全词书一致）

```javascript
const CFG = {
  commonRatio: 0.4,     // 展平位置前 40% → common（绿）
  rareRatio: 0.72,      // 展平位置后 28% → rare（灰）
  wordRankRatio: 0.18,  // 词频前 18% 的常见单词才可能标「僻」
  minN: 8,              // 释义数 < 8 不标「僻」（保守）
  obscureRatio: 0.72,   // 释义项位于展平位置后 28% 才可能为「僻」
  maxObscure: 1,        // 每词「僻」标记上限 1 条（宁可少标，不滥标）
  maxLen: 4             // 复合/派生释义（>4 字）不算「僻」
};
```

#### 生僻标签识别

释义前缀形如 `[古]` / `[澳]` / `<美语>` / `[非标准用语、方言]` 等，自动识别为专业/生僻/冷门（rare 开信号）。

#### 「僻」标记原则

严格保守：宁可少标，不大量误标。仅当单词本身高频、该义与常见义明显不同、且考研阅读可能考察的特殊词义时才标注。

---

## 目录结构

```
VocabHit/
├── index.html                 # 主应用入口（含 Splash 闪屏结构）
├── overlay.html               # 悬浮窗页面
│
├── js/                        # 前端源码（与 assets/www 同步）
│   ├── app.js                 # 主应用逻辑（复习算法 / MCQ / 拼写 / 词典）
│   ├── dict.js                # 考研词汇书数据（DICT_DATA）
│   ├── ecdict.js              # ECDICT 词典加载器
│   ├── knowledge.js           # 知识库模块（导入 / 解析 / 高亮）
│   ├── stats.js               # 每日任务 / 学习统计
│   ├── export-template.js     # 导出模板
│   ├── ky-level.js            # 考研词汇释义分级（common/normal/rare + 僻）
│   ├── ky-manual.js           # 释义分级人工标注数据（优先于算法）
│   ├── splash.js              # 启动闪屏动画（字母掉落拼字）
│   ├── math-lab/              # Math Canvas 模块
│   │   ├── mathCanvas.js      #   画布交互 + 工具栏
│   │   ├── mathEngine.js      #   表达式解析 + 数值计算引擎
│   │   ├── mathLab.js         #   模块入口
│   │   ├── mathLabConfig.js   #   配置
│   │   ├── mathLabData.js     #   数据持久化
│   │   ├── mathPresets.js     #   函数/几何预设
│   │   └── mathRenderer.js    #   Canvas 渲染
│   └── spaced-repetition/     # 知识库间隔重复
│       ├── srData.js          #   复习数据 + 调度算法
│       └── srUI.js            #   复习交互界面
│
├── css/                       # 样式
│   ├── style.css              # 主样式
│   ├── knowledge.css          # 知识库
│   ├── ky-level.css           # 释义分级（绿/黄/灰 + 僻标记）
│   ├── splash.css             # 启动闪屏
│   ├── math-lab.css           # Math Canvas
│   └── spaced-repetition.css  # 间隔重复
│
├── img/                       # 应用内图片资源
│   ├── dog.png                # 首页吉祥物（线条小狗）
│   └── mascot.png             # 吉祥物形象
│
├── audio/                     # 音频资源
│   ├── next.mp3               # 拼写复习「下一题」提示音
│   └── 错误提示音.mp3          # 操作错误提示音
│
├── data/                      # ECDICT 词库分片（27 个 JS 文件）
│   └── ecdict-{a-z,#}.js
│
├── android/                   # Android 原生工程
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── assets/www/    # WebView 资源（与根 js/ css/ img/ audio/ data/ 同步）
│   │       ├── java/com/wxh/vocabulary/
│   │       │   ├── MainActivity.java      # 主 Activity + WebView 桥
│   │       │   ├── OverlayService.java    # 悬浮窗服务
│   │       │   ├── DocumentParser.java    # 文档解析（Word/Excel/PDF/TXT）
│   │       │   ├── OcrParser.java         # ML Kit OCR 封装
│   │       │   ├── ReminderScheduler.java # 学习提醒调度中心（AlarmManager）
│   │       │   ├── ReminderReceiver.java  # 提醒广播接收器（到点触发 + 排下一天）
│   │       │   ├── ReminderPrefs.java     # 提醒偏好存储
│   │       │   └── ReminderState.java     # 提醒状态管理
│   │       └── res/            # 图标 / 主题 / 颜色 / 提醒通知图标
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   └── gradle/wrapper/
│
├── README.md                  # 本文件
├── CHANGELOG.md               # 详细更新日志
└── LICENSE                    # MIT
```

---

## 快速开始

### Android Studio（推荐）

1. 用 Android Studio 打开 `android/` 目录
2. 等待 Gradle Sync 完成
3. 点击 Run 或 Build → Build APK(s)

### 命令行

```bash
cd android

# Windows
gradlew.bat assembleDebug

# macOS / Linux
./gradlew assembleDebug
```

构建产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

首次构建会下载 Gradle 8.9 + 依赖，请保持网络通畅。

### 本地 Web 预览（不打包 APK）

```bash
# 任意静态服务器都能跑
python -m http.server 8080

# 浏览器打开 http://127.0.0.1:8080/
```

注意：本地预览没有 WebView 桥接（悬浮窗 / 文档解析 / OCR / 学习提醒不可用），仅用于 UI 调试。

---

## 数据来源

- **词库**：[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)（MIT License），20 万+ 词条，按首字母分片为 27 个 JS 文件随 APK 打包
- **考研词汇书**：内置 `js/dict.js`，释义分级人工标注位于 `js/ky-manual.js`
- **ML Kit OCR**：Google ML Kit on-device（可选能力，首次调用按需下载模型 ~10MB，设备本地推理）

---

## 隐私

- **无网络请求**（除在线发音兜底 / ML Kit 模型下载）
- **无广告 / 无统计 SDK / 无追踪**
- 所有学习数据保存在设备本地 `localStorage`
- 词典文件随 APK 打包，离线可用
- 学习提醒使用系统 AlarmManager，不依赖任何后端推送
- 不要求任何账号注册

Clone 本仓库、构建 APK、装到任何 Android 8.0+ 设备，全程无需联网、无需注册。

---

## 常见问题

**Q: 词典数据为什么是 27 个分片 JS 而不是 JSON？**

A: WebView 加载 JS 比 fetch JSON 更兼容（无 CORS、无 MIME 问题、加载顺序可控），分片降低单文件体积，按需加载首字母分片。

**Q: 为什么没用 React / Vue？**

A: 单一作者 + 长期维护 + 单 APK 分发，引入框架会让 APK 膨胀 200KB+ 而收益有限。原生 DOM + 极小工具函数（~2KB）足够。

**Q: 生词 Review 和知识库 SR 是同一套算法吗？**

A: 不是。两套系统完全独立、数据隔离、规则不同。生词 Review 有 daily/booster 模式且阶段不回退；知识库 SR 阶段可回退、间隔可自定义、支持提问/挖空考察方式。详见上方「核心算法详解」。

**Q: 考研释义分级（KY Level）对所有词都生效吗？**

A: 只对内置考研词汇书（`dict.js` 的 `DICT_DATA`）生效。ECDICT 查词、大词典、用户自建词条不参与分级，走原有展示逻辑。人工标注（`ky-manual.js`）优先，未标注的词由算法按展平位置 + 词频统一分类。

**Q: 学习提醒在 App 关闭后还能响吗？**

A: 能。提醒基于系统 `AlarmManager` 精确闹钟，不依赖 App 前台运行或后台 Service。到点由 `ReminderReceiver` 接收广播并弹出通知，点击通知直达应用。系统重启 / 应用更新 / 时区变更后会自动恢复排期。

**Q: ML Kit 一定要装吗？**

A: 不装也能用，只是知识库的 OCR 识别功能不可用。首次调用会按需下载 OCR 模型（~10MB），设备本地推理。

**Q: iOS 呢？**

A: 当前只发布 Android。iOS 计划中，需要把 WebView 桥接从 Java 翻译成 Swift / Objective-C。

**Q: 怎么贡献？**

A: Issue / PR 都欢迎。注意：
- 不要提交 `tools/`、`icon_design/`、`build_log*.txt`、`build_apk_log*.txt`、`preview-*.html`、`REVIEW_ANALYSIS.md`、`hub.yaml`、APK、截图、个人文档等非源码文件
- 新增模块请放在 `js/<module>/` 下，CSS 镜像到 `css/<module>.css`
- 前端源码修改后需同步到 `android/app/src/main/assets/www/` 对应目录
- 新增图片资源需在 `.gitignore` 中添加对应例外规则

---

## License

MIT License — 详见 [LICENSE](LICENSE)

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）
