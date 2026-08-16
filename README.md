# VocabHit — 考研词汇查询 · 生词捕获系统

> 一个完全本地、离线可用的 Android 背单词应用。查词、生词本、记忆曲线复习、番茄钟、坚持打卡，一个 App 全搞定。

## ✨ 功能特性

- **词典查询**：考研核心词书 + **ECDICT 开源词典（20 万+ 词条）** 完全离线打包，无网络也能查词
- **生词体系**：今日生词 / 历史生词 / 永久查询记录，三个概念彻底分离
  - 查询记录：每次查询都保留（`年/月/日 时:分`），永久保存
  - 今日生词：按凌晨 4:00 业务日自动切换
  - 累计/今日查询次数：独立统计，不混淆
- **单词发音**：Web Speech 优先，有道在线发音兜底（无系统 TTS 引擎也能发声）
- **记忆曲线复习**（Review）：
  - 认识/模糊/不认识 + 记忆曲线间隔（3/7/10/20/30 天…）
  - 释义确认 + **拼写训练**（确认 / 下一个 同一行）
  - 每天 04:00 自动构建复习队列，严格只复习"仍在生词本中的词"
- **番茄钟**：全屏专注，横屏大字号电子钟 / 竖屏自适应字号，Web Audio 柔和提示音
- **任务与坚持**：
  - 每日固定任务（支持开始/结束日期生效区间）+ 单日任务
  - 目标（截止日期）+ 奖励（触发条件）
  - **坚持看板**：连续天数 / 最长连续 / 已完成天数 / 可切换月份日历 / 目标日期标记 / 点击日期查看当日完成情况
  - 删除每日任务 = 软删除（只停止未来生成，历史完成记录全部保留）
- **悬浮窗查词**：任何 App 上悬浮查词，与主应用数据实时同步
- **主题**：浅色 / 深色 / 跟随系统
- **数据导出**：生词本导出（CSV/TXT），数据 100% 保存在本地

## 🛠 技术栈

- **壳**：原生 Android（WebView）+ Java 桥接（悬浮窗服务、TTS、系统按键）
- **前端**：纯 HTML / CSS / JavaScript，无任何第三方框架与运行时依赖
- **词典数据**：[ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）分片打包进 APK
- **构建**：Gradle 8.9 / JDK 17 / minSdk 26 / targetSdk 34

## 📦 构建方法

### 方式一：Android Studio（推荐）

1. 用 Android Studio 打开 `android/` 目录
2. 等待 Gradle Sync 完成
3. 点击 Run ▶ 或 Build → Build APK(s)

### 方式二：命令行

```bash
cd android
# Windows
gradlew.bat assembleDebug
# macOS / Linux
./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

> 已内置 Gradle Wrapper（Gradle 8.9），无需预装 Gradle；需要 JDK 17+。

## 📁 目录结构

```
VocabHit/
├── index.html          # 主应用页面
├── overlay.html        # 悬浮查词窗口页面
├── css/                # 样式
├── js/                 # 逻辑（app.js 主逻辑 / dict.js 词典引擎 / ecdict.js 分片加载）
├── data/               # ECDICT 词典源数据分片（构建时打包进 assets）
├── android/            # Android 工程（WebView 壳 + 原生服务）
└── VocabHit-*.apk      # 预编译 APK
```

## 🔒 隐私与数据

- **无网络请求**（除用户主动查词时的在线发音兜底）、**无广告**、**无统计 SDK**
- 所有数据（生词、记录、复习状态、打卡）仅保存在设备本地（`localStorage`）
- 无需任何权限（悬浮窗为可选功能，需用户手动授权）

## ⚖️ 开源协议

本项目基于 **MIT License** 开源。词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）。

---

Made with ❤️ for 考研人 · 生词本 = VocabHit
