# VocabHit

**考研向 · 本地优先 · 纯离线** 的英语学习 App：查词、生词、艾宾浩斯复习、知识库、错题本、Math Canvas、番茄钟、任务打卡、悬浮窗查词、学习提醒，一个 APK 全部搞定。

- 当前版本：**v1.2.7**（versionCode 93）
- 运行环境：Android 8.0+（minSdk 26 / targetSdk 34）
- 技术形态：纯 HTML/CSS/JS 前端 + Android WebView 壳，**零第三方运行时框架、零 npm 依赖**
- 分发形态：单个 APK，词典随包分发，**装完即可离线使用**

> 设计原则：离线优先、隐私默认开启、单 APK 分发、不引入任何前端框架。
> 99% 的需求用浏览器原生 API 就能解决，剩下的 1% 用极小的工具函数（约 2KB）补齐。

---

## 功能总览

| 模块 | 一句话说明 |
|------|-----------|
| 离线词典 | ECDICT 20 万+ 词条分片随包，支持中英双向搜索 |
| 考研词书 | 内置 6357 词条考研词汇书，释义带音标与分级 |
| 释义分级 | 每个释义标注 常见(绿) / 一般(黄) / 生僻(灰)，熟词僻义标「僻」 |
| 生词本 | 今日生词 / 历史生词 / 查询记录三级分类 |
| Review | 艾宾浩斯遗忘曲线排期 + 两阶段复习任务池 + 拼写复习 |
| 知识库 | 导入 Word / Excel / PDF / TXT，忠实原文阅读 + 划重点 + 知识条目 |
| 存储库 | 按「类型」组织知识条目，支持编辑 / 删除 / 搜索 / 来源回跳 |
| 错题本 | 拍照或选图录入错题，记录错因与思路，支持编辑与 OCR |
| 间隔重复 SR | 知识条目独立复习队列，提问型 / 挖空型两种考察方式 |
| Math Lab | 全屏数学画布 + 自研表达式解析与数值计算引擎 |
| 番茄钟 | 标准 / 深度 / 短时 / 自定义四档预设，记录计入学习时长 |
| 任务 | 每日区间任务与单日任务，配套目标与奖励机制 |
| 坚持看板 | 连续天数、最长记录、可切换月份日历、学习统计折线图 |
| 悬浮窗查词 | 系统级浮窗，任意 App 上选中即查，与主应用数据同步 |
| 学习提醒 | 系统 `AlarmManager` 精确闹钟，进程被杀也能准点提醒 |
| 导出 | PDF / Word / PNG 三种格式 + 学习统计报告 + 全量 JSON 备份 |

---

## 核心功能

### 1. 查词与生词

- **离线词典**：基于 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT），按首字母切成 27 个 JS 分片随 APK 打包，无需联网
- **双向搜索**：输入英文查释义，输入中文反查英文
- **考研词书兜底**：内置 6357 词条的考研词汇书（`js/dict.js`），命中时展示带分级的考研释义
- **生词三级分类**：今日生词（按业务日 04:00 归档）/ 历史生词 / 永久查询记录
- **单词笔记**：每个词可独立记笔记，随 JSON 备份一起迁移
- **发音**：系统 TTS 朗读，支持指定朗读次数

### 2. 考研释义分级（KY Level）

考研阅读的难点从来不是「不认识」，而是「认识的那个义项不是考的那个」。KY Level 就是对症下药：

| 级别 | 颜色 | 含义 |
|------|------|------|
| `common` | 绿 | 常见、通用释义 |
| `normal` | 黄 | 一般常见释义 |
| `rare` | 灰 | 少见、生僻、冷门释义 |
| `obscure` | 右上角「僻」 | 考研「熟词僻义」标记 |

- **人工标注优先**：`js/ky-manual.js` 中人工逐条审视的结果直接命中，运行时零分析
- **算法兜底**：未标注的词按「展平释义位置 + 单词词频排名」统一分类，全词书口径一致
- **严格保守**：每词「僻」标记上限 1 条，宁可少标不滥标
- **只对考研词书生效**：ECDICT 查词、大词典、自建词条不参与分级，走原有展示逻辑

### 3. Review 复习引擎

- **艾宾浩斯排期**：7 档间隔（0 / 3 / 7 / 10 / 20 / 30 / 30 天），按「业务日」而非自然 24 小时计算
- **两阶段任务池**：每个单词拆成 3 个独立任务（主动回忆 / 英选中 / 中选英），Fisher-Yates 打乱后统一排队，Phase 2 进入拼写复习
- **三档判断**：认识 / 模糊 / 不认识。模糊进「booster 强化」，不认识进「daily 每日」，但**长期阶段绝不回退**
- **会话可恢复**：中断后从 `vc-review-session-v2` 继续，不丢进度
- **音频辅助**：拼写与答题环节有提示音反馈

### 4. 知识库与存储库

- **多格式导入**：Word（docx）、Excel（xlsx）、PDF、TXT，原生解析后忠实还原原文
- **OCR 兜底**：扫描件 / 图片走 Google ML Kit 端侧识别（首次按需下载约 10MB 模型，设备本地推理）
- **忠实原文阅读**：段落、表格、标题结构完整还原，**普通阅读与摘取模式彻底分离**——普通长按时走系统原生选择 / 复制，不注入任何 UI
- **划重点**：跨段落、跨行、跨表格的高亮标注
- **存储库**：知识条目按「类型」组织，支持分类筛选、关键词搜索、展开查看、来源回跳原文
- **条目编辑**：`v1.2.5` 起支持就地编辑，按 id 更新原条目，绝不生成重复

### 5. 错题本

- 拍照或从相册选图录入，记录错因与思路
- 支持科目分类、原图留存、编辑与删除
- 数据键 `vc-mistakes`，随 JSON 备份迁移

### 6. 间隔重复（SR）

知识条目有**完全独立**的间隔重复系统（`vc-spaced-repetition`），与生词 Review 零耦合：

- 六档间隔可自定义（默认 1 / 3 / 7 / 10 / 20 / 30 天）
- 四档判断：认识 / 模糊 / 忘记 / 已掌握
- 考察方式每条目独立：**提问型**（问题 + 答案对照）/ **挖空型**（自动判分，忽略大小写与多余空白）
- 阶段可回退（≥1），比生词 Review 更严格

### 7. Math Lab

- **全屏数学画布**：白板 + 工具栏 + 撤销 / 重做，滚动、拖动、缩放、双击复位
- **自研表达式引擎**（`js/math-lab/mathEngine.js`，零依赖）：
  词法分析 → 递归下降语法分析 → 编译为求值闭包
- **数值计算**：中心差分求导数、复合 Simpson 求定积分、变号扫描 + 二分求根、单侧逐次逼近求极限
- **支持**：`sin/cos/tan/exp/ln/log/sqrt/abs/min/max` 等 30+ 函数，常数 `pi/e/tau`，隐式乘法（`2x`、`2sin(x)`），中文符号别名（`× ÷ − （ ） √`）

### 8. 番茄钟 / 任务 / 坚持看板

- **番茄钟**：标准（25+5）、深度（50+10）、短时（15+3）、自定义四档预设；专注 / 休息双阶段，支持暂停；番茄记录按业务日归档并计入学习时长
- **任务**：每日区间任务（可设起止日期）与单日任务，可关联目标；配套**目标**（带截止日期）与**奖励**（可绑定到目标达成触发）
- **坚持看板**：连续天数、最长记录、已完成总数；可切换月份的打卡日历；学习统计折线图（点选任意一天查看当日数据）

### 9. 悬浮窗查词

系统级浮窗（`SYSTEM_ALERT_WINDOW`），在任意 App 上选中文本即查词，数据与主应用完全同步。开关位于「设置 → 通用 → 后台悬浮查词」。

### 10. 学习提醒

- 基于 Android `AlarmManager` **精确闹钟**（`setAlarmClock` + `USE_EXACT_ALARM`），App 进程被杀、WebView 未打开均不影响触发
- 到点检查今日单词复习与学习任务，未完成时分别提醒，点击通知直达对应页面
- **自动恢复排期**：开机、应用更新、时间 / 时区变更后由 `ReminderReceiver` 自动重建
- 触发后自动排下一天，形成每日循环；同一 `PendingIntent` 覆盖替换，不会重复提醒
- 引导用户关闭电池优化，保证 Doze / 省电模式下准点

### 11. 导出与备份

- **生词导出**：PDF / Word / PNG 三种格式，A4 竖版模板，含音标与分级着色释义，「僻」标记同步输出
- **导出前二次选择**：默认（最多 150 词）或勾选式选择性导出
- **学习统计导出**：Canvas 绘制的统计报告图（趋势 + 汇总）
- **全量 JSON 备份 / 恢复**（`js/data-manager.js`）：18 类数据一键导出为 JSON，换机或重装后完整恢复

### 12. 外观与启动体验

- **三态主题**：浅色 / 深色 / 跟随系统；首屏脚本在 CSS 加载前先行定色，消除白闪帧
- **应用背景**：默认 1（纯色）/ 默认 2（内置 9:16 设计底图）/ 自定义（从相册选图，自动降采样至长边 1920，重启不丢）；进入复习界面时自动隐藏，保证专注
- **启动闪屏**：8 个字母从不同方向掉落拼成 "VocabHit"，动画由合成器线程驱动不占主线程，与首页初始化完全并行，首页就绪即淡出

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript（ES2017+），无框架、无构建、无打包 |
| Android 壳 | 原生 WebView + Java 桥接（`@JavascriptInterface` 双向通信） |
| 词典数据 | ECDICT 分片打包（MIT），按字母 a~z + 标点共 27 个 JS 文件 |
| 构建 | Gradle 8.9 / AGP 8.7.3 / JDK 17，minSdk 26 / targetSdk 34 / compileSdk 34 |
| 提醒 | `AlarmManager` + `BroadcastReceiver` + `SharedPreferences` |
| OCR | Google ML Kit on-device（中英文双模型，可选） |
| PDF 解析 | pdfbox-android 2.0.27.0（字符级坐标提取） |
| 存储 | `localStorage`（Web 层）+ `SharedPreferences` / 内部存储（Android 层） |

**为什么不用 React / Vue？**
单一作者 + 长期维护 + 单 APK 分发。引入框架会让 APK 膨胀 200KB+，而收益有限；原生 DOM + 极小工具函数已经足够。

---

## 快速开始

### 构建 APK

```bash
cd android

# Windows
gradlew.bat assembleDebug

# macOS / Linux
./gradlew assembleDebug
```

产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。
首次构建会下载 Gradle 8.9 与依赖，请保持网络通畅。

也可以用 Android Studio 直接打开 `android/` 目录，Sync 完成后点击 Run。

### 本地 Web 预览（不打包 APK）

```bash
python -m http.server 8080
# 浏览器打开 http://127.0.0.1:8080/
```

> 本地预览**没有 WebView 桥接**，因此悬浮窗、文档解析、OCR、学习提醒、原生导出不可用，仅用于 UI 调试。

---

## 目录结构

```
VocabHit/
├── index.html                 # 主应用入口（首页/生词/记录/设置/导出/通知/Review/番茄钟/任务/看板）
├── overlay.html               # 悬浮窗页面
│
├── js/                        # 前端源码（根目录为开发源，需同步到 assets/www）
│   ├── app.js                 # 主应用：查词/生词/Review/番茄钟/任务/看板/通知/导出
│   ├── dict.js                # 考研词汇书数据（DICT_DATA，6357 词条）
│   ├── ecdict.js              # ECDICT 词典加载器（分片按需加载）
│   ├── knowledge.js           # 知识库：导入/解析/阅读/划重点/存储库/错题
│   ├── ky-level.js            # 考研释义分级（common/normal/rare + 僻）
│   ├── ky-manual.js           # 释义分级人工标注数据（优先于算法）
│   ├── stats.js               # 学习统计（坚持看板底部统计区）
│   ├── stats-export.js        # 学习统计导出（Canvas 绘图）
│   ├── data-manager.js        # 全量 JSON 备份 / 恢复
│   ├── export-template.js     # PDF / PNG 导出模板（A4 版面）
│   ├── splash.js              # 启动闪屏动画
│   ├── app-bg.js              # 应用背景层控制
│   ├── math-lab/              # Math Lab 模块
│   │   ├── mathEngine.js      #   表达式解析 + 数值计算引擎（零依赖）
│   │   ├── mathRenderer.js    #   Canvas 渲染
│   │   ├── mathCanvas.js      #   画布交互 + 工具栏
│   │   ├── mathPresets.js     #   函数 / 几何预设
│   │   ├── mathLabData.js     #   数据持久化
│   │   ├── mathLabConfig.js   #   配置
│   │   └── mathLab.js         #   模块入口
│   └── spaced-repetition/     # 知识条目间隔重复
│       ├── srData.js          #   复习数据 + 调度算法
│       └── srUI.js            #   复习交互界面
│
├── css/                       # 样式（与 js 模块一一对应）
│   ├── style.css              # 主样式
│   ├── knowledge.css          # 知识库 / 错题
│   ├── ky-level.css           # 释义分级配色（CSS 变量，浅/深同值）
│   ├── math-lab.css           # Math Lab
│   ├── spaced-repetition.css  # 间隔重复
│   ├── splash.css             # 启动闪屏
│   └── app-bg.css             # 应用背景层
│
├── data/                      # ECDICT 词库分片（27 个 JS 文件）
│   └── ecdict-{a-z,#}.js
├── img/                       # 应用内图片（吉祥物 / 内置背景）
├── audio/                     # 提示音
│
├── android/                   # Android 原生工程
│   ├── app/build.gradle
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       ├── assets/www/        # WebView 资源（与根 js/ css/ img/ audio/ data/ 同步）
│       ├── java/com/wxh/vocabulary/
│       │   ├── MainActivity.java      # 主 Activity + WebView JS 桥（30+ 接口）
│       │   ├── DocumentParser.java    # 文档解析（docx / xlsx / pdf / txt）
│       │   ├── OcrParser.java         # ML Kit OCR 封装
│       │   ├── OverlayService.java    # 悬浮窗前台服务
│       │   ├── ReminderScheduler.java # 提醒调度中心（AlarmManager）
│       │   ├── ReminderReceiver.java  # 提醒广播接收器（到点触发 + 排下一天）
│       │   ├── ReminderPrefs.java     # 提醒偏好存储
│       │   └── ReminderState.java     # 提醒状态管理
│       └── res/               # 图标 / 主题 / 闪屏 / 通知图标
│
├── README.md
├── CHANGELOG.md               # 逐版本详细更新日志
└── LICENSE                    # MIT
```

---

## 核心算法详解

### 4.1 业务日与时间边界

所有排期以**业务日**为单位，而非自然时间的 `N × 24h`。

```javascript
function businessDayAt(dayOffset, now = Date.now()) {
  const d = new Date(now - 4 * 3600 * 1000); // 当前业务日 D 的 00:00（本地）
  d.setDate(d.getDate() + dayOffset);           // D + dayOffset 个业务日
  d.setHours(4, 0, 0, 0);                       // 该业务日 04:00（开始时刻）
  return d.getTime();
}
```

**每日切换边界 = 凌晨 04:00**。凌晨 04:00 之前仍算前一天——这是为考研党熬夜学习准备的：凌晨两点背的单词不会因为跨了零点就莫名其妙「过期」。

### 4.2 生词复习状态机（Review）

数据位于 `localStorage["vc-review"]`，每个词维护：

| 字段 | 含义 |
|------|------|
| `stage` | 复习阶段 0~6（0=未入长期，6=长期每月） |
| `mode` | `"long"` 长期 / `"daily"` 每日循环 / `"booster"` 模糊强化 / `""` 未开始 |
| `origStage` | 进入 daily/booster 前的原长期阶段（用于恢复） |
| `nextAt` | 下一次复习时间戳（业务日 04:00） |
| `known / fuzzy / unknown / total` | 累计判断计数 |

六档间隔：

```javascript
const R_INTERVALS = [0, 3, 7, 10, 20, 30, 30]; // stage 0~6
```

状态转移：

```
known（认识）
  mode == daily | booster → 恢复原长期阶段（origStage > 0 ? origStage : 1），mode = long
  stage == 0              → stage = 1, mode = long
  其他                     → stage = min(6, stage + 1), mode = long
  nextAt = businessDayAt(R_INTERVALS[stage])

fuzzy（模糊）
  stage > 0 && mode != daily → booster 强化，保留原阶段，nextAt = businessDayAt(2)
  其他                        → daily 模式，nextAt = businessDayAt(firstReview ? 2 : 1)

unknown（不认识）
  stage > 0 && mode != daily → 保留原长期阶段（origStage = stage）
  → mode = daily, nextAt = businessDayAt(1)
```

三个关键设计决策：

1. **当天生词当天不复习**：新词 `nextAt = 次日 04:00`，避免刚查完就被迫复习
2. **长期阶段不回退**：unknown/fuzzy 只切换模式，`stage` 本身不降低。比传统 SM-2 更温和——一次遗忘不该毁掉长期积累
3. **booster 强化期**：模糊不等于不认识，给 2 天强化窗口而非直接降为每日

### 4.3 两阶段复习任务池

每个单词拆为 3 个独立任务，全部打乱后统一排队：

| 任务类型 | 代码 | 内容 |
|---------|------|------|
| 主动回忆 | `recall` | 显示单词，用户判断 known/fuzzy/unknown |
| 英→中 | `w2m` | 四选一，看单词选中文释义 |
| 中→英 | `m2w` | 四选一，看中文释义选单词 |

- **Fisher-Yates 打乱**：三种任务混合排队，用户无法预测下一题类型
- **独立完成跟踪**：`completed["word|step"]` 记录每个任务，答错只重复该任务，不影响其他两种
- **Phase 1 → Phase 2**：词义任务全部完成后进入拼写复习，错词留底、正确即过

### 4.4 MCQ 干扰项生成

干扰项不是随机抽取，而是通过**相似度评分**从 20 万+ 词库中筛选最具迷惑性的选项。

**英→中（w2m）**：共享汉字越多、长度越接近的释义越容易混淆

```
score = sharedChineseChars(candidate, correct) * 2 - |lenDiff|
过滤：|lenDiff| > correctLen + 3 的候选直接排除
```

**中→英（m2w）**：拼写越接近、长度相近、首字母相同的词越容易混淆

```
score = -editDistance(w, target) * 2 - lenDiff + (首字母相同 ? 3 : 0)
过滤：共享前缀 > min(len)*0.6 的同根词排除（make / making）；|lenDiff| > 3 排除
```

编辑距离为标准 Levenshtein 动态规划 `O(mn)`，全库评分后按分数降序取前 3，同分随机。

### 4.5 知识库间隔重复（SR）

与生词 Review 完全独立，数据位于 `localStorage["vc-spaced-repetition"]`。

| 维度 | 生词 Review | 知识库 SR |
|------|------------|-----------|
| 间隔档位 | 固定 7 档 | 可自定义 6 档（默认 1·3·7·10·20·30） |
| 判断类型 | known / fuzzy / unknown | known / fuzzy / forgot / mastered |
| 忘记处理 | 切 daily 模式，阶段不回退 | 阶段回退（≥1），次日复习 |
| 模糊处理 | booster 2 天强化 | 阶段不变，间隔减半（≥1 天） |
| 考察方式 | 固定（词义 + 拼写） | 每条目独立：提问型 / 挖空型 |

```
known    → stage = min(6, stage + 1), nextAt = intervals[stage - 1] 天后
fuzzy    → stage 不变,  nextAt = max(1, round(intervals[stage - 1] / 2)) 天后
forgot   → stage = max(1, stage - 1), nextAt = 1 天后
mastered → reviewEnabled = false（退出队列，数据保留可重新加入）
```

### 4.6 数学计算引擎

三段式流水线，零依赖：

```
输入字符串 → tokenize（词法分析）→ parse（递归下降语法分析）→ compileNode（编译为闭包）→ f(x) 求值
```

优先级从低到高：`parseExpr → parseTerm → parseUnary → parsePower → parseAtom`，`^` 右结合，支持隐式乘法。
AST 节点类型：`num` / `sym` / `neg` / `add` / `sub` / `mul` / `div` / `pow` / `call`，每个节点递归编译为 JS 闭包，避免运行时重复解释 AST。

| 运算 | 方法 | 关键参数 |
|------|------|---------|
| 导数 | 中心差分 `(f(x+h) - f(x-h)) / 2h` | `h = max(1e-6, |x|×1e-6)`，奇点附近放大步长重试 4 次 |
| 定积分 | 复合 Simpson 公式 | n=2000 等分，64 点预检奇点，含奇点返回 NaN |
| 不定积分 | 梯形法累加采样 | 最多 4000 点，断点处 `ys[i]=null` |
| 求根 | 变号扫描 + 二分法 | 900 点扫描变号区间，每区间二分 80 次，精度 `1e-13` |
| 极限 | 单侧逐次逼近 | `10^-1` → `10^-15`，收敛判据 `|v - last| < 1e-7 × max(1, |last|)` |

### 4.7 学习时长统计

学习时长 = **复习有效时长**（答题间隔累加，单次封顶 3 分钟防挂机虚增）+ **专注番茄时长**（`vc-pomo-records` 按业务日归档）。

全部来自本地真实记录，零模拟；累计数据永久连续，「近 7 天」只是图表滚动窗口，不随窗口重置。

---

## 数据存储

所有数据保存在设备本地 `localStorage`，JSON 全量备份覆盖以下键：

| 键 | 内容 |
|----|------|
| `vc-records` | 生词与查询记录 |
| `vc-review` | Review 复习状态 |
| `vc-review-session-v2` | Review 进行中会话 |
| `vc-review-days` | Review 连续完成记录 |
| `vc-stats` | 学习统计（坚持看板） |
| `vc-spaced-repetition` | 知识条目间隔重复 |
| `vc-pomo-records` | 番茄钟记录 |
| `vc-tasks` | 任务 / 目标 / 打卡 |
| `vc-notify` | 提醒设置 |
| `vc-materials` | 学习资料 |
| `vc-repo` | 知识库 / 存储库 |
| `vc-highlights` | 划重点 |
| `vc-word-notes` | 单词笔记 |
| `vc-mistakes` | 我的错题 |
| `vc-theme` / `vc-overlay` | 外观主题 / 悬浮窗开关 |

---

## 隐私

- **无网络请求**（仅在线发音兜底与 ML Kit 模型下载会联网）
- **无广告、无统计 SDK、无追踪、无账号注册**
- 所有学习数据只存在设备本地，词典随包分发离线可用
- 学习提醒走系统 `AlarmManager`，不依赖任何后端推送

Clone 本仓库、构建 APK、装到任何 Android 8.0+ 设备，全程无需联网、无需注册。

---

## 常见问题

**Q: 词典为什么是 27 个 JS 分片而不是一个 JSON？**

A: WebView 加载 JS 比 fetch JSON 更兼容（无 CORS、无 MIME 问题、加载顺序可控），分片降低单文件体积，按首字母按需加载。

**Q: 为什么坚持不用前端框架？**

A: 单一作者长期维护 + 单 APK 分发。框架会带来 200KB+ 体积增长和长期的升级负担，而这里的需求用原生 DOM 完全够用。

**Q: 生词 Review 和知识库 SR 是同一套算法吗？**

A: 不是。两套系统数据隔离、规则不同。生词 Review 有 daily/booster 模式且阶段不回退；知识库 SR 阶段可回退、间隔可自定义、支持提问 / 挖空考察方式。详见「核心算法详解」。

**Q: 释义分级对所有词都生效吗？**

A: 只对内置考研词汇书（`dict.js` 的 `DICT_DATA`）生效。ECDICT 查词、大词典、用户自建词条不参与分级。人工标注优先，未标注的由算法统一分类。

**Q: App 关掉后学习提醒还会响吗？**

A: 会。提醒基于系统 `AlarmManager` 精确闹钟，不依赖 App 前台运行或后台 Service。系统重启 / 应用更新 / 时区变更后会自动恢复排期。

**Q: 为什么每日切换是凌晨 04:00 而不是 00:00？**

A: 符合考研党熬夜学习的真实作息——凌晨两点背的单词不会因为跨零点就「过期」。

**Q: 有 iOS 版本吗？**

A: 当前只发布 Android。iOS 需要把 WebView 桥接从 Java 翻译成 Swift / Objective-C，欢迎 PR。

---

## 参与贡献

Issue 与 PR 都欢迎。提交前请注意：

- **不要提交** `tools/`、`icon_design/`、`.tmp-dm-test/`、`build_log*.txt`、`build_apk_log*.txt`、`preview-*.html`、`inject-preview.html`、`REVIEW_ANALYSIS.md`、`hub.yaml`、`*.apk`、截图与个人文档等非源码文件（已在 `.gitignore` 中排除）
- 新增模块放在 `js/<module>/` 下，CSS 镜像到 `css/<module>.css`
- 遵循**开闭原则**：新模块自注入 DOM、自装饰 `window.__back`，尽量不修改 `app.js` 与 `style.css`
- **前端源码修改后必须同步到 `android/app/src/main/assets/www/` 对应目录**，这是最容易漏的一步
- 新增图片资源需在 `.gitignore` 中添加对应例外规则（仓库默认忽略 `*.png` / `*.jpg`）

---

## License

**MIT License** — 详见 [LICENSE](LICENSE)

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）
