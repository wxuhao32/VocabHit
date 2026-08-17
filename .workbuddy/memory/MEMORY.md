# VocabHit 项目长期记忆

## 项目身份
- 项目名：VocabHit（原 CET4Prep，2026-08 v0.7.4 更名）
- 包名：com.wxh.vocabulary；minSdk 26 / targetSdk 34 / compileSdk 34
- 入口：android/app/src/main/assets/www/index.html（WebView 加载本地资源）
- 调试：app.js / style.css / preview-review.html 均同步至 assets/www/，修改后需一并拷贝

## Review 复习（v0.7.14 重设计后）
- 两阶段沉浸式：Phase1 词义回忆（认识/模糊/不认识 → 释义确认）→ Phase2 拼写（随机队列，按释义拼写）
- 数据：`vc-review`（reviewStore）+ `vc-review-session-v2`（reviewSession）
- 入口：首页 #review-entry，点击进入 → openReview() 加 body.review-active，渲染 renderReviewByPhase()
- 阶段渲染统一经 rvRender(fn) 做淡出/淡入切换
- 表现层助手：`rvSetProgress(cur,total)`、`rvHideProgress()`、`rvWordSizeClass(word)`、`rvSenseRows(word)`、`rvRender(fn)`，均仅 UI 不动业务
- Review ↔ 生词本同步：syncReviewWithWords 在 load 时删除不在生词本中的 review 词 → preview-review.html 必须同时注入 vc-records 才能避免清空

## 设计系统
- CSS 变量：--bg / --surface / --surface-2 / --text / --text-2 / --text-3 / --accent / --accent-soft / --hairline / --r-card / --r-field / --r-btn / --ease / --t-fast / --t-med / --rv-glass / --rv-glass-active
- 暗色：html[data-theme="dark"] + prefers-color-scheme media query（html[data-theme="system"]）
- 安全区：--sat / --sab（env safe-area-inset）；输入法：--ime（Android 原生注入）
- 缓存戳：修改 css → `?v=N`+1；修改 js → `?v=N`+1

## 测试
- 预览：preview-review.html 注入 vc-review + vc-records → 800ms 跳转 index.html
- 自动化：puppeteer-core + 系统 Chrome（headless new），http://127.0.0.1:8765/ 起本地服务器（file:// 下 localStorage 不共享）
- 直接 DOM click (`page.evaluate(el.click())`) + 显式冷却等待（>= 450ms），规避 puppeteer actionability 与动画竞态

## 构建 & 备份约定（用户长期约定）
- 版本号升：android/app/build.gradle 的 versionCode/versionName + index.html 设置页显示版本
- 备份到：D:\Vocabulary\<项目名>-v<版本>-YYYY-MM-DD\，内含 src/（android/app/src、buildgrad、gradle wrapper、根级 web 资源、README/LICENSE/.gitignore/CHANGELOG）+ <项目名>-v<版本>-debug.apk + README.txt（含回滚说明）
- 项目根保留 VocabHit-<版本>-debug.apk 调试包（git tracked）
- 构建：cd android && gradlew assembleDebug（gradlew.bat；需 ANDROID_HOME 指向 C:/Users/wxh06/AppData/Local/Android/sdk）