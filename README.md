# VocabHit

考研向的本地优先英语词汇 App：离线词典 / 生词本 / 艾宾浩斯复习 / 知识库 / Math Canvas / 划重点 / 悬浮窗查词。

纯前端 + Android WebView，无第三方运行时框架依赖，单 APK 就能跑。

## 主要功能

词典 / 生词
- 离线词典查询：基于 [ECDICT](https://github.com/skywind3000/ECDICT) 开源词库，本地分片打包，支持 20 万+ 词条
- 生词三级分类：今日生词 / 历史生词 / 查询记录
- 拼写复习（Spelling）：输入 → 确认 → 翻页，错词留底、正确即过，音频提示辅助
- 艾宾浩斯曲线复习（SR）：基于 Ebbinghaus 遗忘曲线智能排期，含手动重置 / 跳过 / 长期状态锁定

知识库
- 多格式导入：Word / Excel / PDF / TXT，自动解析为知识条目
- 划重点 / 高亮：资料详情页支持跨段落、跨行、跨表格的高亮标注
- 每日任务：可设生效时间区间，完成统计 + 打卡
- 主题切换：浅色 / 深色 / 跟随系统

Math Canvas
- 横屏全屏数学画布：白板 + 工具栏 + 撤销 / 重做，滚动、拖动、缩放、双击复位全部流畅
- 函数 / 几何 / 标注 / 预设一应俱全
- 状态栏避让：解决 Android WebView 顶部白边，画布 100dvh 满屏渲染

悬浮窗
- 全局悬浮查词：其他 App 顶部浮窗选中即查，与主应用数据同步

## 技术栈

- 前端：纯 HTML / CSS / JavaScript（无第三方运行时框架）
- Android 壳：原生 WebView + Java 桥接（MainActivity / OverlayService / DocumentParser / OcrParser）
- 词典数据：ECDICT 分片打包（MIT License），按字母 a~z + 标点分 27 个 JS 文件
- 构建：Gradle 8.9 / JDK 17 / Android minSdk 26 / targetSdk 34
- ML Kit：Google ML Kit OCR（可选，导入扫描件用）
- WebView 桥：@JavascriptInterface 双向通信

设计原则：单 APK 离线优先、隐私默认开启、不引入 npm 依赖（用浏览器原生 API 即可解决 99% 场景）。

## 目录结构

`
VocabHit/
├── index.html                 # 主应用入口
├── overlay.html               # 悬浮窗页面
│
├── js/                        # 前端源码（与 assets/www 同步）
│   ├── app.js                 # 主应用逻辑
│   ├── knowledge.js           # 知识库模块
│   ├── stats.js               # 每日任务 / 统计
│   ├── math-lab/              # Math Canvas 模块
│   │   ├── mathCanvas.js      #   画布 + 工具
│   │   ├── mathEngine.js      #   计算引擎
│   │   ├── mathLab.js         #   入口
│   │   ├── mathLabConfig.js   #   配置
│   │   ├── mathLabData.js     #   数据
│   │   ├── mathPresets.js     #   预设
│   │   └── mathRenderer.js    #   渲染
│   └── spaced-repetition/     # 艾宾浩斯复习
│       ├── srData.js          #   复习数据
│       └── srUI.js            #   复习交互
│
├── css/                       # 样式
│   ├── style.css              # 主样式
│   ├── knowledge.css          # 知识库
│   ├── math-lab.css           # Math Canvas
│   └── spaced-repetition.css  # 复习
│
├── audio/                     # 音频资源
│   └── next.mp3               # 拼写复习「下一题」提示音
│
├── data/                      # ECDICT 词库分片
│   └── ecdict-*.js            # 按字母 a~z 分片
│
├── android/                   # Android 原生工程
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── assets/www/    # WebView 资源（与根 js/ css/ audio/ 同步）
│   │       ├── java/com/wxh/vocabulary/
│   │       │   ├── MainActivity.java      # 主 Activity + WebView 桥
│   │       │   ├── OverlayService.java    # 悬浮窗服务
│   │       │   ├── DocumentParser.java    # 文档解析（Word/Excel/PDF）
│   │       │   └── OcrParser.java         # ML Kit OCR 封装
│   │       └── res/            # 图标 / 主题
│   ├── build.gradle
│   └── gradle/wrapper/
│
├── README.md                  # 本文件
├── CHANGELOG.md               # 详细更新日志
└── LICENSE                    # MIT
`

## 快速开始

Android Studio（推荐）
1. 用 Android Studio 打开 ndroid/ 目录
2. 等待 Gradle Sync 完成
3. 点击 Run 或 Build → Build APK(s)

命令行

`ash
cd android

# Windows
gradlew.bat assembleDebug

# macOS / Linux
./gradlew assembleDebug
`

构建产物位于 ndroid/app/build/outputs/apk/debug/app-debug.apk。

首次构建会下载 Gradle 8.9 + 依赖，请保持网络通畅。

本地 Web 预览（不打包 APK）

`ash
# 任意静态服务器都能跑
python -m http.server 8080
# 浏览器打开 http://127.0.0.1:8080/
`

注意：本地预览没有 WebView 桥接（悬浮窗 / 文档解析 / OCR 不可用），仅用于 UI 调试。

## 数据来源

- 词库：[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）
- ML Kit OCR：Google ML Kit on-device（可选能力）

## 隐私

- 无网络请求（除在线发音兜底 / ML Kit 模型下载）
- 无广告 / 无统计 SDK / 无追踪
- 所有学习数据保存在设备本地
- 词典文件随 APK 打包，离线可用

Clone 本仓库、构建 APK、装到任何 Android 6.0+ 设备，全程无需联网、无需注册。

## 版本与更新日志

当前版本：v0.9.12 / APK 1.0.2（debug）

详细更新见 [CHANGELOG.md](CHANGELOG.md)。

最近更新
- v0.9.12（2026-08-22）— 拼写复习交互修复 + Math Canvas 真全屏
- v0.9.11 — 生词 Review 三项增强
- v0.9.10 — 知识库 OCR 接入 + 划重点 v2

## 常见问题

Q: 词典数据为什么是 27 个分片 JS 而不是 JSON？

A: WebView 加载 JS 比 fetch JSON 更兼容（无 CORS、无 MIME 问题、加载顺序可控），分片降低单文件体积。

Q: 为什么没用 React / Vue？

A: 单一作者 + 长期维护 + 单 APK 分发，引入框架会让 APK 膨胀 200KB+ 而收益有限。原生 DOM + 极小工具函数（~2KB）足够。

Q: ML Kit 一定要装吗？

A: 不装也能用，只是知识库的 OCR 识别功能不可用。首次调用会按需下载 OCR 模型（~10MB），设备本地推理。

Q: iOS 呢？

A: 当前只发布 Android。iOS 计划中，需要把 WebView 桥接从 Java 翻译成 Swift / Objective-C。

Q: 怎么贡献？

A: Issue / PR 都欢迎。注意：
- 提交前跑 	ools/test_*.js / test_*.py 里的相关测试
- 不要提交 	ools/、uild_log*.txt、preview-*.html、REVIEW_ANALYSIS.md、hub.yaml、APK 等
- 新增模块请放在 js/<module>/ 下，CSS 镜像到 css/<module>.css

## License

MIT License — 详见 [LICENSE](LICENSE)

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）