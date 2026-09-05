# VocabHit

**考研向 · 本地优先 · 纯离线** 的英语学习 App：查词、生词、FSRS 间隔复习、知识库、错题本、Math Canvas、番茄钟、任务打卡、悬浮窗查词、学习提醒，一个 APK 全部搞定。

- 当前版本：**v1.3.1**（versionCode 97）
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
| 词典增强信息 | 词形变化 / 考试标签 / 柯林斯星级 / 牛津3000 / BNC·COCA 词频 / 中英例句 |
| 考研词书 | 内置 6357 词条考研词汇书，释义带音标与分级 |
| 释义分级 | 每个释义标注 常见(绿) / 一般(黄) / 生僻(灰)，熟词僻义标「僻」 |
| 生词本 | 今日生词 / 历史生词 / 查询记录三级分类 |
| Review | **FSRS-5 记忆算法** + 四态统一结算 + 个性化自适应层 + 拼写复习 |
| 娴熟毕业 | 彻底掌握的词一键退出复习队列，历史数据完整保留 |
| 知识库 | 导入 Word / Excel / PDF / TXT，忠实原文阅读 + 划重点 + 知识条目 |
| 存储库 | 按「类型」组织知识条目，支持编辑 / 删除 / 搜索 / 来源回跳 |
| 错题本 | 拍照或选图录入错题，记录错因与思路，支持编辑与 OCR |
| 间隔重复 SR | 知识条目独立复习队列，提问型 / 挖空型两种考察方式 |
| Math Lab | 全屏数学画布 + 自研表达式解析与数值计算引擎 |
| 番茄钟 | 标准 / 深度 / 短时 / 自定义四档预设，记录计入学习时长 |
| 任务 | 每日区间任务与单日任务，配套目标与奖励机制 |
| 坚持看板 | 连续天数、最长记录、可切换月份日历、学习统计折线图 |
| 悬浮窗查词 | 系统级浮窗，任意 App 上选中即查，与主应用数据同步，同样展示词典增强信息 |
| 学习提醒 | 系统 `AlarmManager` 精确闹钟，进程被杀也能准点提醒 |
| 导出 | PDF / Word / PNG 三种格式 + 学习统计报告 + 全量 JSON 备份 |

---

## 核心功能

### 1. 查词与生词

- **离线词典**：基于 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT），按首字母切成 27 个 JS 分片（`data/ecdict-{a-z,#}.js`）随 APK 打包，无需联网
- **双向搜索**：输入英文查释义，输入中文反查英文
- **考研词书兜底**：内置 6357 词条的考研词汇书（`js/dict.js`），命中时展示带分级的考研释义
- **生词三级分类**：今日生词（按业务日 04:00 归档）/ 历史生词 / 永久查询记录
- **单词笔记**：每个词可独立记笔记，随 JSON 备份一起迁移
- **发音**：系统 TTS 朗读，支持指定朗读次数

### 2. 词典增强信息（ECDICT-EXT）

在基础音标与释义之外，另有一套 27 个增强数据分片（`data/ecdict-ext-{a-z,#}.js`），按需懒加载，命中时在详情页展示：

| 信息 | 数据字段 | 展示形式 |
|------|---------|---------|
| 考试标签 | `tag` | 渐变胶囊：中考 / 高考 / 四级 / 六级 / 考研 / 托福 / 雅思 / GRE |
| 柯林斯星级 | `col` | 黄色 ★（1–5 星） |
| 牛津 3000 | `ox` | 绿色描边芯片 |
| 词频 | `bnc` / `frq` | BNC #N · 当代 #N |
| 词形变化 | `ex` | 过去式 / 过去分词 / 现在分词 / 三单 / 比较级 / 最高级 / 复数 / 原形 |
| 中英例句 | `eg` | 例句中的单词及其变形高亮为红色，中英对照 |

- **双端一致**：主应用查词详情与悬浮窗查词面板展示同一套增强信息
- **异步无阻塞**：增强分片首次查词时按需加载（原生桥 `readDictionaryExt` / Web 回退 `<script>` 注入），加载完成前详情页先行渲染基础内容，输入切换自动作废过期结果

### 3. 考研释义分级（KY Level）

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

### 4. Review 复习引擎（FSRS）

v1.3.0 起，生词复习的调度算法从固定艾宾浩斯档位全面迁移为 **FSRS（Free Spaced Repetition Scheduler）**——与 Anki 同源的现代记忆算法，并叠加 VocabHit 自研的个性化自适应层。

**四种考察方式，一个记忆模型：**

| 考察方式 | 内容 | 评分 |
|---------|------|------|
| 词义回忆 `recall` | 显示单词，判断 认识 / 模糊 / 不认识 | 3 / 2 / 1 |
| 看词选义 `w2m` | 四选一，看单词选中文释义 | 对=3 / 错=1 |
| 看义选词 `m2w` | 四选一，看中文释义选单词 | 对=3 / 错=1 |
| 拼写 `spell` | 拼写单词，回车即提交 | 对=3 / 错或跳过=1 |

- **全局记忆状态**：每个单词只有一份 FSRS 状态（稳定性 `s` / 难度 `d` / 期望保留率 `dr` / 复习数 `reps` / 遗忘数 `lapses`），四种考察方式的每次作答都是「这个词的记忆证据」，加权进同一状态
- **两阶段结算**：三态完成时按组合评分表结算一次（T1）；拼写完成时再作为第二次证据走短期稳定性公式（T2），同轮不重复累计 `reps/lapses`
- **选择题不再一票否决**：一道选择题答错只把评级从 Good 降为 Hard（间隔收紧），不再整词按「不认识」处理；词义回忆「不认识」仍一票到底
- **不推翻历史**：单次答错只按当前稳定性阻尼式衰减，绝不清零长期积累
- **娴熟毕业**：复习中或词详情页可对已彻底掌握的词点「娴熟」——该词 `nextAt` 清零、永久退出复习队列；生词本记录与全部学习历史保留，随时可查
- **会话可恢复**：中断后从 `vc-review-session-v2` 继续，不丢进度；「娴熟」与队末重排状态同样可恢复
- **音频反馈**：答对「滴」声（`audio/next.mp3`）、答错错误提示音、拼写正确进下一题

### 5. 知识库与存储库

- **多格式导入**：Word（docx）、Excel（xlsx）、PDF、TXT，原生解析后忠实还原原文
- **OCR 兜底**：扫描件 / 图片走 Google ML Kit 端侧识别（首次按需下载约 10MB 模型，设备本地推理）
- **忠实原文阅读**：段落、表格、标题结构完整还原，**普通阅读与摘取模式彻底分离**——普通长按时走系统原生选择 / 复制，不注入任何 UI
- **划重点**：跨段落、跨行、跨表格的高亮标注
- **存储库**：知识条目按「类型」组织，支持分类筛选、关键词搜索、展开查看、来源回跳原文
- **条目编辑**：支持就地编辑，按 id 更新原条目，绝不生成重复；写入失败自动回滚不误报

### 6. 错题本

- 拍照或从相册选图录入，记录错因与思路
- 支持科目分类、原图留存、编辑与删除
- 数据键 `vc-mistakes`，随 JSON 备份迁移

### 7. 间隔重复（SR）

知识条目有**完全独立**的间隔重复系统（`vc-spaced-repetition`），与生词 Review 零耦合：

- 六档间隔可自定义（默认 1 / 3 / 7 / 10 / 20 / 30 天）
- 四档判断：认识 / 模糊 / 忘记 / 已掌握
- 考察方式每条目独立：**提问型**（问题 + 答案对照）/ **挖空型**（自动判分，忽略大小写与多余空白）
- 阶段可回退（≥1），比生词 Review 更严格

### 8. Math Lab

- **全屏数学画布**：白板 + 工具栏 + 撤销 / 重做，滚动、拖动、缩放、双击复位
- **自研表达式引擎**（`js/math-lab/mathEngine.js`，零依赖）：
  词法分析 → 递归下降语法分析 → 编译为求值闭包
- **数值计算**：中心差分求导数、复合 Simpson 求定积分、变号扫描 + 二分求根、单侧逐次逼近求极限
- **支持**：`sin/cos/tan/exp/ln/log/sqrt/abs/min/max` 等 30+ 函数，常数 `pi/e/tau`，隐式乘法（`2x`、`2sin(x)`），中文符号别名（`× ÷ − （ ） √`）

### 9. 番茄钟 / 任务 / 坚持看板

- **番茄钟**：标准（25+5）、深度（50+10）、短时（15+3）、自定义四档预设；专注 / 休息双阶段，支持暂停；番茄记录按业务日归档并计入学习时长
- **任务**：每日区间任务（可设起止日期）与单日任务，可关联目标；配套**目标**（带截止日期）与**奖励**（可绑定到目标达成触发）
- **坚持看板**：连续天数、最长记录、已完成总数；可切换月份的打卡日历；学习统计折线图（点选任意一天查看当日数据）
- **首页连续天数**：紫色卡片「连续 X 天」按「每日 Review 任务是否完成」口径计算（`vc-review-days` 逐日落盘），当天无需复习则跳过不中断

### 10. 悬浮窗查词

系统级浮窗（`SYSTEM_ALERT_WINDOW`），在任意 App 上选中文本即查词，数据与主应用完全同步。词典增强信息（考试标签 / 星级 / 词频 / 词形变化 / 例句）与主应用同一套渲染逻辑。开关位于「设置 → 通用 → 后台悬浮查词」。

### 11. 学习提醒

- 基于 Android `AlarmManager` **精确闹钟**（`setAlarmClock` + `USE_EXACT_ALARM`），App 进程被杀、WebView 未打开均不影响触发
- 到点检查今日单词复习与学习任务，未完成时分别提醒，点击通知直达对应页面
- **自动恢复排期**：开机、应用更新、时间 / 时区变更后由 `ReminderReceiver` 自动重建
- 触发后自动排下一天，形成每日循环；同一 `PendingIntent` 覆盖替换，不会重复提醒
- 引导用户关闭电池优化，保证 Doze / 省电模式下准点

### 12. 导出与备份

- **生词导出**：PDF / Word / PNG 三种格式，A4 竖版模板，含音标与分级着色释义，「僻」标记同步输出
- **导出前二次选择**：默认（最多 150 词）或勾选式选择性导出
- **学习统计导出**：Canvas 绘制的统计报告图（8 张核心卡片 + 双柱图 + 趋势折线）
- **全量 JSON 备份 / 恢复**（`js/data-manager.js`）：20+ 类数据一键导出为 JSON，换机或重装后完整恢复；导入前自动备份现状，事务式写入中途异常自动回滚；FSRS 记忆状态、复习日志、自适应参数全部纳入白名单

### 13. 外观与启动体验

- **三态主题**：浅色 / 深色 / 跟随系统；首屏脚本在 CSS 加载前先行定色，消除白闪帧
- **应用背景**：默认 1（纯色）/ 默认 2（内置 9:16 设计底图）/ 自定义（从相册选图，自动降采样至长边 1920，重启不丢）；进入复习界面时自动隐藏，保证专注
- **启动闪屏**：8 个字母从不同方向掉落拼成 "VocabHit"，动画由合成器线程驱动不占主线程，与首页初始化完全并行，首页就绪即淡出
- **滚动条视觉隐藏**：全局 `::-webkit-scrollbar` 清零 + WebView 原生层双保险，触摸滚动能力不受影响

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript（ES2017+），无框架、无构建、无打包 |
| Android 壳 | 原生 WebView + Java 桥接（`@JavascriptInterface` 双向通信） |
| 词典数据 | ECDICT 基础分片 + 增强分片（MIT），各 27 个 JS 文件（a~z + #） |
| 复习算法 | 自实现 FSRS-5（`js/fsrs.js`，纯函数，对齐 open-spaced-repetition/fsrs-rs） |
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
> 词典分片在 Web 预览下通过动态 `<script>` 标签加载，功能与 APK 内一致。

---

## 目录结构

```
VocabHit/
├── index.html                 # 主应用入口（首页/生词/记录/设置/导出/通知/Review/番茄钟/任务/看板）
├── overlay.html               # 悬浮窗页面
│
├── js/                        # 前端源码（根目录为开发源，需同步到 assets/www）
│   ├── app.js                 # 主应用：查词/生词/Review 结算/番茄钟/任务/看板/通知/导出
│   ├── fsrs.js                # FSRS-5 纯算法模块（VH_FSRS，零依赖、不碰 DOM 与存储）
│   ├── dict.js                # 考研词汇书数据（DICT_DATA，6357 词条）
│   ├── ecdict.js              # 词典加载器工厂（基础分片 ECDICT + 增强分片 ECDICT_EXT）
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
│       └── srUI.js            #   复习交互界面 + 复习计划页（FSRS 状态透明展示）
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
├── data/                      # 词库分片（各 27 个 JS 文件）
│   ├── ecdict-{a-z,#}.js      #   基础词条：音标 + 释义
│   └── ecdict-ext-{a-z,#}.js  #   增强信息：词形变化/考试标签/星级/词频/例句
├── img/                       # 应用内图片（吉祥物 / 内置背景）
├── audio/                     # 提示音（答对「滴」声等）
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

### 业务日与时间边界

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

### FSRS 记忆模型（DSR）

`js/fsrs.js` 实现 FSRS-5 核心（19 个默认参数 `w0–w18`，对齐 [open-spaced-repetition/fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs)，即 Anki 内置同源算法），纯函数、零依赖、不读写存储。每个单词维护一份记忆状态：

| 字段 | 含义 |
|------|------|
| `s` | 稳定性 Stability：记忆强度的度量（R 衰减到 0.9 所需天数），单位天 |
| `d` | 难度 Difficulty：该词对此用户的固有难度，1.0–10.0 |
| `dr` | 期望保留率 Desired Retention：目标记忆保持概率（默认 0.9） |
| `reps` / `lapses` | 已复习轮次 / 遗忘次数 |
| `lastReviewedAt` / `lastElapsed` | 上次复习时间戳 / 当时实际经过天数 |

**幂遗忘曲线**——可提取性随时间衰减、随稳定性放缓：

```
R(t, S) = (1 + FACTOR · t / S) ^ DECAY     DECAY = -0.5, FACTOR = 19/81
```

**调度目标**：给定期望保留率 `dr`，反解使「下次复习时记忆保持概率 = dr」的间隔：

```
intervalDays = S / FACTOR · (dr^(1/DECAY) − 1)，最小 1 天
```

**状态更新**（评分 Again=1 / Hard=2 / Good=3 / Easy=4）：

- 首次复习：`s = w[rating]`（`w0–w3` 分别对应四种评分的初始稳定性），`d` 由评分初始化
- 复习成功：`s` 按当前稳定性、难度、可提取性与评分幂次增长（Hard 乘惩罚系数 `w15`、Easy 乘奖励系数 `w16`），阻尼式前进，永不跳变
- 复习失败（Again）：`s` 按失败后稳定性公式衰减（不清零），`lapses + 1`，难度按均值回归上调
- 同日二次评分（短期）：走 `w17/w18` 短期稳定性公式——Good 约 ×1.41 小幅增强，Again 约 ×0.50 收紧

### 四态统一结算（融合层）

四种考察方式不再各记各的账，而是作为同一个词的记忆证据分两次结算进全局状态：

**T1 · 三态完成时**——组合评分表（选择题从「一票否决」降为「一票降级」）：

| recall | w2m | m2w | 组合评级 | 效果 |
|--------|-----|-----|---------|------|
| 认识 | 对 | 对 | Good | 全熟，间隔拉长 |
| 认识 | 对 | 错（任一） | Hard | 一道选择弱 → 收紧 |
| 认识 | 错 | 错 | Again | 两道选择弱 → 短间隔 |
| 模糊 | 对 | 对 | Hard | 词义模糊保守 |
| 模糊 | 任一错 | 任一错 | Again | 模糊 + 选择弱 |
| 不认识 | 任意 | 任意 | Again | 一票到底 |

叠加弱态惩罚：存在弱态失败时评级再降一档（Good→Hard、Hard→Again）。

**T2 · 拼写完成时**——拼写结果作为第二次证据，同日走短期稳定性公式（`countRep: false`，不重复累计 `reps/lapses`）：

```
拼写正确 → 短期 Good：s ≈ ×1.41（小幅增强）
拼写错误/跳过 → 短期 Again：s ≈ ×0.50（收紧）
```

**典型场景**：词义很熟但拼写差 → T1 Good 拉长、T2 Again 收紧，最终间隔中等偏短但绝不清零；长期稳定后突然答错 → 按当前 `s` 阻尼衰减，历史积累保留。

**结算链路**：

```
四态首次评分 → T1 组合评级 → VH_FSRS.review()
→ （拼写完成）T2 短期结算 → intervalDays × 自适应 scale
→ nextAt = businessDayAt(round(finalInterval))   // 04:00 业务日边界
→ 追加复习日志（Revlog）
```

每考察方式每业务日仅**首次有效作答**计一次证据；队尾重排、选择题重试、拼写重拼不再重复刷状态。当天首次判断锁定长期间隔基准，队内重复考察只决定「今天是否继续排队」。

### 个性化自适应层

FSRS 默认参数对所有用户一致（千人一面），自适应层用你自己的复习历史把它调成「你的参数」（千人千面），全部在设备本地完成：

- **可调参数**：间隔缩放系数 `scale ∈ [0.5, 1.5]`、期望保留率 `dr ∈ [0.85, 0.95]`、四态权重（合计 = 1）；FSRS 核心 `w0–w18` 保持默认不动，保证科学性
- **训练数据**：复习日志 `vc-review-revlogs`（追加式，只增不改），每条记录四态评分、组合评级、结算前后 `s/d`、间隔与实际落盘日
- **冷启动分档**（样本不足绝不乱调）：

| 正式结算条数 | 策略 |
|---|---|
| < 100 | 纯 FSRS 默认参数，不启用自适应 |
| 100–300 | 仅微调 `scale`（±0.1 步进） |
| 300–400 | `scale` + `dr` |
| ≥ 400 | 全量拟合（权重 + 阈值 + scale + dr） |

- **回退保护（生命线）**：候选参数与当前参数在同一训练集上比 log_loss，**不严格改善就不采纳**
- **防过拟合**：参数钳制 + 与默认值偏差的正则惩罚 + 近 90 天滚动窗口与全量混合训练
- **触发节奏**：每 100 次正式结算或每 6 小时后台重拟合一次，异步执行不阻塞答题
- **效果**：拼写常错 → 拼写弱的词间隔更短；选择题区分度低 → 降低其权重；整体遗忘率高 → 自动调低 `dr` 收紧全局间隔

### 旧数据迁移与娴熟毕业

**迁移（升级无感）**：旧版本按艾宾浩斯 7 档排期的存量数据，升级时由 `ensureFsrsState` 一次性推导为 FSRS 状态——稳定性取旧排期间隔、难度由历史失败占比插值（`VH_FSRS.fromLegacy`），随后 `migrateLegacyIntervalsToFsrs` 用 FSRS 重算未来排期。旧字段（`stage/mode/known/fuzzy/unknown/total`）原样保留，学习历史零丢失、零删除；已在新版结算过或已毕业的词一律不动。

**娴熟毕业**：`mastered = true` 且 `nextAt = 0` 的词被复习队列、复习计划页、提醒快照一致过滤；不删除生词本记录与任何学习历史；迁移不会让毕业词「复活」。入口覆盖词义回忆页、词义详情页、选择题页与拼写页。

### MCQ 干扰项生成

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

### 知识库间隔重复（SR）

与生词 Review 完全独立，数据位于 `localStorage["vc-spaced-repetition"]`。

| 维度 | 生词 Review | 知识库 SR |
|------|------------|-----------|
| 调度算法 | FSRS-5 + 自适应层 | 固定档位状态机 |
| 间隔档位 | 算法连续计算，最小 1 天 | 可自定义 6 档（默认 1·3·7·10·20·30） |
| 判断类型 | known / fuzzy / unknown | known / fuzzy / forgot / mastered |
| 忘记处理 | FSRS Again 阻尼衰减，历史不清零 | 阶段回退（≥1），次日复习 |
| 模糊处理 | Hard 评级，增长放缓 | 阶段不变，间隔减半（≥1 天） |
| 考察方式 | 固定（词义 + 选择 + 拼写） | 每条目独立：提问型 / 挖空型 |

```
known    → stage = min(6, stage + 1), nextAt = intervals[stage - 1] 天后
fuzzy    → stage 不变,  nextAt = max(1, round(intervals[stage - 1] / 2)) 天后
forgot   → stage = max(1, stage - 1), nextAt = 1 天后
mastered → reviewEnabled = false（退出队列，数据保留可重新加入）
```

### 数学计算引擎

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

### 学习时长统计

学习时长 = **复习有效时长**（答题间隔累加，单次封顶 3 分钟防挂机虚增）+ **专注番茄时长**（`vc-pomo-records` 按业务日归档）。

全部来自本地真实记录，零模拟；累计数据永久连续，「近 7 天」只是图表滚动窗口，不随窗口重置。

---

## 数据存储

所有数据保存在设备本地 `localStorage`，JSON 全量备份覆盖以下键：

| 键 | 内容 |
|----|------|
| `vc-records` | 生词与查询记录 |
| `vc-review` | Review 复习状态（含每词 FSRS 记忆状态） |
| `vc-review-session-v2` | Review 进行中会话 |
| `vc-review-today` | Review 今日记录（词义 / 选择 / 拼写三栏） |
| `vc-review-days` | Review 连续完成记录 |
| `vc-review-revlogs` | 复习日志（FSRS 自适应训练数据，追加式） |
| `vc-fsrs-adaptive` | FSRS 自适应参数（scale / dr / 权重） |
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
- FSRS 自适应拟合完全在设备端完成，复习日志不出本机
- 学习提醒走系统 `AlarmManager`，不依赖任何后端推送

Clone 本仓库、构建 APK、装到任何 Android 8.0+ 设备，全程无需联网、无需注册。

---

## 常见问题

**Q: FSRS 和 Anki 是同一套算法吗？**

A: 核心公式同源——本项目实现的是 FSRS-5（19 参数、幂遗忘曲线，对齐 fsrs-rs / Anki 内置调度器），但代码是零依赖自实现的纯函数模块，并叠加了 VocabHit 自研的用户级自适应层（本地拟合、回退保护、冷启动门槛），这部分与 Anki 无关。

**Q: 从旧版本升级，艾宾浩斯排期的老数据会丢吗？**

A: 不会。升级时自动把旧的阶段 / 间隔推导为 FSRS 记忆状态（稳定性取旧间隔、难度由历史失败占比插值），再用 FSRS 重算未来排期；全部学习历史计数原样保留，零删除。

**Q: 词典为什么是 27 个 JS 分片而不是一个 JSON？**

A: WebView 加载 JS 比 fetch JSON 更兼容（无 CORS、无 MIME 问题、加载顺序可控），分片降低单文件体积，按首字母按需加载。增强信息（词形变化 / 例句 / 词频等）单独放 `ecdict-ext-*` 分片，与基础词条解耦、同样懒加载。

**Q: 为什么坚持不用前端框架？**

A: 单一作者长期维护 + 单 APK 分发。框架会带来 200KB+ 体积增长和长期的升级负担，而这里的需求用原生 DOM 完全够用。

**Q: 生词 Review 和知识库 SR 是同一套算法吗？**

A: 不是。生词 Review 走 FSRS-5 + 自适应层；知识库 SR 是独立的固定档位状态机，阶段可回退、间隔可自定义、支持提问 / 挖空考察方式。详见「核心算法详解」。

**Q: 释义分级对所有词都生效吗？**

A: 只对内置考研词汇书（`dict.js` 的 `DICT_DATA`）生效。ECDICT 查词、大词典、用户自建词条不参与分级。人工标注优先，未标注的由算法统一分类。

**Q: 「娴熟」毕业后的词还能回来吗？**

A: 词与全部学习历史都还在生词本里，只是退出复习队列（`nextAt = 0`）。需要时清除毕业标记即可恢复排期。

**Q: App 关掉后学习提醒还会响吗？**

A: 会。提醒基于系统 `AlarmManager` 精确闹钟，不依赖 App 前台运行或后台 Service。系统重启 / 应用更新 / 时区变更后会自动恢复排期。

**Q: 为什么每日切换是凌晨 04:00 而不是 00:00？**

A: 符合考研党熬夜学习的真实作息——凌晨两点背的单词不会因为跨零点就「过期」。

**Q: 有 iOS 版本吗？**

A: 当前只发布 Android。iOS 需要把 WebView 桥接从 Java 翻译成 Swift / Objective-C，欢迎 PR。

---

## 参与贡献

Issue 与 PR 都欢迎。提交前请注意：

- **不要提交** `tools/`、`icon_design/`、`.tmp-dm-test/`、`backup-*/`、`build_log*.txt`、`build-log*.txt`、`*.bak-*`、`dev-seed.html`、`preview-*.html`、`inject-preview.html`、`REVIEW_ANALYSIS.md`、`hub.yaml`、`*.apk`、截图与个人文档等非源码文件（已在 `.gitignore` 中排除）
- 新增模块放在 `js/<module>/` 下，CSS 镜像到 `css/<module>.css`
- 遵循**开闭原则**：新模块自注入 DOM、自装饰 `window.__back`，尽量不修改 `app.js` 与 `style.css`
- **前端源码修改后必须同步到 `android/app/src/main/assets/www/` 对应目录**，这是最容易漏的一步（`js/`、`css/`、`data/`、`img/`、`audio/`、`index.html`、`overlay.html` 全部双份）
- 修改复习调度请同时回归：队列构建、会话恢复、设置页复习计划、提醒快照四处口径必须同源（都读 `nextAt`）
- 新增图片资源需在 `.gitignore` 中添加对应例外规则（仓库默认忽略 `*.png` / `*.jpg`）

---

## License

**MIT License** — 详见 [LICENSE](LICENSE)

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）
FSRS 算法参考 [open-spaced-repetition/fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs)（本项目为零依赖独立实现）
