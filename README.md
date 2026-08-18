# VocabHit

Android 词汇查询与学习应用，支持离线词典、生词本、记忆曲线复习、知识库管理等功能。

## 功能特性

- **离线词典查询**：基于 ECDICT 开源词典，支持 20 万+ 词条本地查询
- **生词管理**：今日生词、历史生词、查询记录三级分类
- **记忆曲线复习**：基于艾宾浩斯遗忘曲线的智能复习系统
- **知识库学习**：支持导入 Word/Excel/PDF/TXT 文档，自动解析为知识条目
- **划重点功能**：资料详情页支持跨段落、跨行、跨表格的高亮标注
- **悬浮窗查词**：全局悬浮窗快速查词，与主应用数据同步
- **每日任务**：支持设置任务生效时间区间，完成统计与打卡
- **主题切换**：浅色/深色/跟随系统

## 技术栈

- **前端**：纯 HTML/CSS/JavaScript，无第三方框架依赖
- **Android 壳**：原生 Android WebView + Java 桥接
- **词典数据**：ECDICT 分片打包（MIT License）
- **构建工具**：Gradle 8.9 / JDK 17 / minSdk 26 / targetSdk 34

## 构建方法

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

构建产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`

## 目录结构

```
VocabHit/
├── android/                    # Android 工程
│   ├── app/src/main/
│   │   ├── assets/www/        # WebView 资源
│   │   │   ├── data/          # ECDICT 词典分片
│   │   │   ├── js/            # 前端逻辑
│   │   │   └── css/           # 样式文件
│   │   └── java/              # 原生服务（悬浮窗、文档解析等）
├── js/                         # 前端源码（与 assets/www 同步）
├── css/                        # 样式源码
├── data/                       # ECDICT 词典源数据
├── index.html                  # 主应用页面
├── overlay.html                # 悬浮窗页面
└── CHANGELOG.md                # 更新日志
```

## 隐私说明

- 无网络请求（除在线发音兜底）
- 无广告、无统计 SDK
- 所有数据保存在设备本地

## 开源协议

MIT License

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）
