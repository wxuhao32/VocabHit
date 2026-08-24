package com.wxh.vocabulary;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.media.AudioAttributes;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

/**
 * Vocabulary — 本地生词查询工具 WebView 壳。
 * 前端全部位于 assets/www，离线运行；localStorage 承担数据持久化。
 * AndroidBridge：
 *   exportFile(name, fmt, html)          导出 pdf / word / png
 *   setSystemBarsDark(dark)              状态栏/导航栏图标随主题
 *   canDrawOverlays() / requestOverlayPermission() / setOverlayEnabled(on)
 *                                        后台悬浮查词（系统级 Overlay）
 */
public class MainActivity extends Activity {

    private WebView webView;
    private String[] pendingExport; // name, fmt, html（旧系统等待权限后重试）
    private int lastInsetTop = -1, lastInsetBottom = -1, lastInsetIme = 0; // 最近一次安全区（页面加载后重放）
    private TextToSpeech tts; // 单词读音（系统 TTS）
    private volatile boolean ttsReady = false; // 引擎初始化成功（语言回退后仍可用）
    private Runnable pendingSpeak = null; // 引擎就绪前的待播请求（只保留最新一次）
    private boolean ttsToastShown = false; // 「语音引擎不可用」只提示一次
    private long ttsFailAt = 0; // 引擎不可用标记时间（短时内不再重复尝试）
    private String ttsText = "";
    private int ttsRemain = 0; // 剩余播放次数（连续播 2 次）
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);   // localStorage 持久化
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setTextZoom(100);
        // 禁用一切缩放：防止聚焦输入框时 WebView 自动放大导致 UI 累积变大
        webView.getSettings().setSupportZoom(false);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.setBackgroundColor(Color.parseColor("#F7F7F8"));
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file://")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) { }
                return true; // 外部链接交给系统浏览器，应用内仅 file://
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                applyInsetVars(lastInsetTop, lastInsetBottom, lastInsetIme); // 页面就绪后重放安全区
            }
        });
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(webView);
        PDFBoxResourceLoader.init(getApplicationContext()); // PDFBox 字体资源从 APK 加载（PDF 文本层解析前置条件）
        setupEdgeToEdge();
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    /* ---------- 前后台互斥：应用在前台时隐藏系统悬浮条 ----------
       例外：Knowledge / Repository 阅读页内保持显示（与软件外同一悬浮条，
       由前端 AndroidBridge.setOverlayInApp 通知进入/退出阅读页） */

    /** 前端处于阅读页（Knowledge 原文 / Repository 来源原文）时为 true：
        onResume 据此保持系统悬浮条可见，实现软件内阅读页复用同一悬浮查词条 */
    private volatile boolean overlayInApp = false;

    @Override
    protected void onResume() {
        super.onResume();
        OverlayService.requestVisibility(this, overlayInApp);
    }

    @Override
    protected void onPause() {
        super.onPause();
        OverlayService.requestVisibility(this, true);
    }

    /** 系统返回键（传统三键导航 + 全面屏手势返回均触发）：
        交给前端 window.__back 按页面栈返回；前端返回 false（首页无上层）时退出 App */
    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("window.__back&&window.__back()", value -> {
                if ("false".equals(value)) {
                    MainActivity.super.onBackPressed();
                }
            });
        } else {
            super.onBackPressed();
        }
    }

    /* ---------- Edge-to-Edge：内容延伸到系统栏下方，安全区交给前端 ---------- */

    private void setupEdgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        // 布局延伸至状态栏与导航栏下方（真全屏，无白边）
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            // Edge-to-edge 下 adjustResize 不再压缩窗口（部分 ROM 仍会压缩并与 --ime 双重避让，
            // 导致搜索面板被顶出屏幕）。统一改 ADJUST_NOTHING：窗口恒全屏，键盘避让完全由
            // 前端 --ime 变量完成（.sheet { bottom: var(--ime) }）
            getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        }
        setBarAppearance(false); // 默认浅色图标，前端加载后按主题纠正

        // 系统栏/输入法 insets → 前端 CSS 变量 --sat/--sab/--ime
        // 注：WebView 不支持 setPadding，键盘避让由前端 .sheet { bottom: var(--ime) } 完成
        getWindow().getDecorView().setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom, ime = 0;
            if (Build.VERSION.SDK_INT >= 30) {
                top = insets.getInsets(WindowInsets.Type.systemBars()).top;
                bottom = insets.getInsets(WindowInsets.Type.systemBars()).bottom;
                ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
                android.util.Log.d("VocabInset", "top=" + top + " nav=" + bottom + " ime=" + ime);
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
                // API 26-29 由 adjustResize 自动压缩窗口
            }
            applyInsetVars(top, bottom, ime);
            return insets;
        });
    }

    /** 安全区/输入法像素值注入前端（转 CSS px：物理 px / density） */
    private void applyInsetVars(int top, int bottom, int ime) {
        if (top < 0 || bottom < 0 || webView == null) return;
        lastInsetTop = top;
        lastInsetBottom = bottom;
        lastInsetIme = ime;
        float d = getResources().getDisplayMetrics().density;
        final String js = "document.documentElement.style.setProperty('--sat','" + (int) Math.ceil(top / d) + "px'),"
                + "document.documentElement.style.setProperty('--sab','" + (int) Math.ceil(bottom / d) + "px'),"
                + "document.documentElement.style.setProperty('--ime','" + (int) Math.ceil(ime / d) + "px');";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    /** 状态栏/导航栏图标外观：dark=true 用浅色图标（深色主题） */
    private void setBarAppearance(boolean dark) {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().getInsetsController().setSystemBarsAppearance(
                    dark ? 0
                            : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                    | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else {
            int flags = getWindow().getDecorView().getSystemUiVisibility()
                    & ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    protected void onDestroy() {
        ttsReady = false; // 先断开就绪标志，避免异步回调/待播任务访问已释放的 TTS
        pendingSpeak = null;
        if (webView != null) webView.destroy();
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) { }
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
        }
        super.onDestroy();
    }

    /** TTS 提示（进程内只提示一次，避免连续失败刷屏） */
    private void toastTts(final String msg) {
        if (ttsToastShown) return;
        ttsToastShown = true;
        try { Toast.makeText(this, msg, Toast.LENGTH_LONG).show(); } catch (Exception ignored) { }
    }

    /**
     * 安全播放：引擎就绪 → 直接播（QUEUE_FLUSH 打断旧播放，连续点击只播最新）；
     * 引擎初始化中 → 排队（覆盖旧请求）；初始化失败/无引擎/播放失败 → 精准提示原因。
     * 任何异常均被捕获，绝不让 TTS 问题导致 App 崩溃。
     */
    private void safeSpeak(final String text, final int times) {
        if (text == null || text.isEmpty()) return;
        final Runnable task = () -> {
            if (tts == null || !ttsReady) { android.util.Log.d("VocabTTS", "skip speak (not ready)"); return; }
            try {
                ttsText = text;
                ttsRemain = Math.max(1, times);
                int r = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tts_" + System.currentTimeMillis());
                android.util.Log.d("VocabTTS", "speak(" + text + "x" + ttsRemain + ") ret=" + r + " (0=SUCCESS, <0=ERROR)");
            } catch (Exception e) {
                android.util.Log.d("VocabTTS", "speak exception", e);
                toastTts("语音播放失败，请检查系统语音设置");
            }
        };
        runOnUiThread(() -> {
            if (tts != null && ttsReady) { task.run(); return; }
            pendingSpeak = task; // 未就绪：只保留最新一次请求
            ensureTts();
        });
    }

    /** 惰性创建 TTS。
        - 先探测 TTS 引擎（PackageManager 查 TTS_SERVICE），无引擎直接提示（不盲目构造）；
        - 用第一个可用引擎构造（绕过「默认引擎被禁用」的 ROM 问题）；
        - init 回调统一回主线程；语言设置失败不阻断出声（回退引擎默认语言）；
        - 超时 15 秒仅提示、不销毁对象（慢引擎初始化完成后仍可播放，避免误杀）；
        - 失败后 5 秒内短时缓存，避免每次点击都干等重试。 */
    private void ensureTts() {
        if (tts != null) return;
        if (ttsFailAt > 0 && System.currentTimeMillis() - ttsFailAt < 5000) {
            toastTts("语音引擎不可用，请检查系统语音设置");
            return;
        }
        // 1. 引擎探测（PackageManager 查询 TTS_SERVICE 服务，绕过默认引擎被禁用的 ROM 问题）
        String engine = null;
        try {
            java.util.List<android.content.pm.ResolveInfo> list =
                    getPackageManager().queryIntentServices(new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0);
            if (list == null || list.isEmpty()) {
                android.util.Log.d("VocabTTS", "no TTS engines found");
                ttsFailAt = System.currentTimeMillis();
                toastTts("未检测到语音引擎，请在系统设置-语音中开启");
                return;
            }
            engine = list.get(0).serviceInfo.packageName;
            StringBuilder sb = new StringBuilder("engines:");
            for (android.content.pm.ResolveInfo ri : list) sb.append(" [").append(ri.serviceInfo.packageName).append("]");
            android.util.Log.d("VocabTTS", sb + " → use: " + engine);
        } catch (Exception e) {
            android.util.Log.d("VocabTTS", "engine probe exception", e);
        }
        try {
            final String fEngine = engine;
            tts = new TextToSpeech(this, status -> runOnUiThread(() -> {
                if (tts == null) return; // Activity 已销毁，忽略回调
                ttsFailAt = 0; // 回调最终到达 → 清除失败标记（即使初始化慢）
                android.util.Log.d("VocabTTS", "init status=" + status + " (0=SUCCESS)");
                if (status == TextToSpeech.SUCCESS) {
                    // 英语语音可用性预检（仅日志，不阻断）
                    try {
                        int avUs = tts.isLanguageAvailable(Locale.US);
                        int avEn = tts.isLanguageAvailable(Locale.ENGLISH);
                        android.util.Log.d("VocabTTS", "langAvail US=" + avUs + " EN=" + avEn
                                + " (0=AVAILABLE, 1=COUNTRY, 2=VAR, -1=MISSING_DATA, -2=NOT_SUPPORTED)");
                    } catch (Exception e) { android.util.Log.d("VocabTTS", "lang probe exception", e); }
                    final boolean[] langMissing = { false };
                    // 语言：优先美式英语；MISSING/NOT_SUPPORTED → 回退英语 → 仍失败则用引擎默认语言（不阻断出声）
                    try {
                        int r = tts.setLanguage(Locale.US);
                        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                            int r2 = tts.setLanguage(Locale.ENGLISH);
                            android.util.Log.d("VocabTTS", "setLanguage US=" + r + " EN=" + r2);
                            if (r2 == TextToSpeech.LANG_MISSING_DATA || r2 == TextToSpeech.LANG_NOT_SUPPORTED) langMissing[0] = true;
                        } else {
                            android.util.Log.d("VocabTTS", "setLanguage US=" + r);
                        }
                    } catch (Exception e) {
                        android.util.Log.d("VocabTTS", "setLanguage exception", e);
                    }
                    try {
                        tts.setSpeechRate(0.95f);
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override public void onStart(String id) { android.util.Log.d("VocabTTS", "onStart " + id); }
                            @Override public void onDone(String id) {
                                runOnUiThread(() -> {
                                    if (tts != null && ttsReady && --ttsRemain > 0) {
                                        try {
                                            tts.speak(ttsText, TextToSpeech.QUEUE_FLUSH, null, "tts_" + System.currentTimeMillis());
                                        } catch (Exception ignored) { }
                                    }
                                });
                            }
                            @Override public void onError(String id, int code) {
                                android.util.Log.d("VocabTTS", "onError " + id + " code=" + code
                                        + " (-4=SYNTHESIS -5=SERVICE -6=OUTPUT)");
                                runOnUiThread(() -> toastTts(langMissing[0]
                                        ? "未找到英语语音数据，请在系统设置-语音中安装"
                                        : "语音播放失败，请检查系统语音设置"));
                            }
                            @Override public void onError(String id) { onError(id, -1); }
                        });
                        ttsReady = true;
                        android.util.Log.d("VocabTTS", "READY");
                    } catch (Exception e) {
                        android.util.Log.d("VocabTTS", "configure exception", e);
                    }
                } else {
                    android.util.Log.d("VocabTTS", "init FAILED status=" + status);
                    ttsFailAt = System.currentTimeMillis();
                    runOnUiThread(() -> toastTts("语音引擎初始化失败，请在系统设置-语音中检查"));
                }
                Runnable p = pendingSpeak; pendingSpeak = null;
                if (p != null && ttsReady) p.run();
            }), fEngine);
            // 超时兜底：15 秒未就绪 → 提示一次，但**不销毁对象**（引擎初始化慢时回调到达仍可播放）
            mainHandler.postDelayed(() -> {
                if (tts != null && !ttsReady) {
                    android.util.Log.d("VocabTTS", "init SLOW (>15s)");
                    ttsFailAt = System.currentTimeMillis();
                    runOnUiThread(() -> toastTts("语音引擎初始化较慢或无响应，请检查系统语音设置"));
                }
            }, 15000);
        } catch (Exception e) {
            // new TextToSpeech 本身抛异常（个别 ROM/系统版本，如指定引擎无效）
            android.util.Log.d("VocabTTS", "new TextToSpeech exception", e);
            try { if (tts != null) tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
            ttsFailAt = System.currentTimeMillis();
            runOnUiThread(() -> toastTts("语音功能初始化失败，请检查系统语音设置"));
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void exportFile(final String name, final String fmt, final String html) {
            runOnUiThread(() -> startExport(name, fmt, html));
        }

        /** 读取 ECDICT 分片数据（assets/www/data/ecdict-<letter>.js），返回整段 JS 文本；失败返回 null */
        @JavascriptInterface
        public String readDictionary(final String letter) {
            if (letter == null || !letter.matches("[a-z#]")) return null;
            try (InputStream is = getAssets().open("www/data/ecdict-" + letter + ".js")) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
                return bos.toString("UTF-8");
            } catch (IOException e) {
                return null;
            }
        }

        @JavascriptInterface
        public void setSystemBarsDark(final boolean dark) {
            runOnUiThread(() -> {
                setBarAppearance(dark);
                webView.setBackgroundColor(Color.parseColor(dark ? "#131315" : "#F7F7F8"));
            });
        }

        /* ---------- 单词读音（系统 TTS；speakTimes 连续播放 times 次，前端无需回调） ---------- */

        @JavascriptInterface
        public void speakTimes(final String text, final int times) {
            safeSpeak(text, times);
        }

        @JavascriptInterface
        public void ttsStop() {
            runOnUiThread(() -> { if (tts != null) { try { tts.stop(); } catch (Exception ignored) { } } });
        }

        /* ---------- 番茄钟沉浸式全屏（隐藏状态栏/导航栏；退出恢复） ---------- */

        @JavascriptInterface
        public void setImmersive(final boolean on) {
            runOnUiThread(() -> {
                try {
                    View decor = getWindow().getDecorView();
                    if (on) {
                        if (Build.VERSION.SDK_INT >= 30) {
                            android.view.WindowInsetsController c = decor.getWindowInsetsController();
                            if (c != null) {
                                c.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                                c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                            }
                        } else {
                            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
                        }
                    } else {
                        if (Build.VERSION.SDK_INT >= 30) {
                            android.view.WindowInsetsController c = decor.getWindowInsetsController();
                            if (c != null) {
                                c.show(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                            }
                        } else {
                            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
                        }
                    }
                } catch (Exception ignored) { }
            });
        }

        /* ---------- 后台悬浮查词（系统级 Overlay） ---------- */

        @JavascriptInterface
        public boolean canDrawOverlays() {
            return Settings.canDrawOverlays(MainActivity.this);
        }

        @JavascriptInterface
        public void requestOverlayPermission() {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
            }
        }

        @JavascriptInterface
        public void setOverlayEnabled(final boolean on) {
            Intent svc = new Intent(MainActivity.this, OverlayService.class);
            if (on) {
                if (!Settings.canDrawOverlays(MainActivity.this)) return;
                svc.putExtra(OverlayService.EXTRA_SHOW, false); // 开启时应用在前台，先隐藏
                startForegroundService(svc);
            } else {
                stopService(svc);
            }
        }

        /* ---------- 应用内阅读页悬浮查词（复用系统级悬浮条：同一 UI/拖动/查询，纯新增段） ---------- */

        /** 进入/退出 Knowledge / Repository 阅读页：控制应用前台时系统悬浮条的显隐。
            前端已确认「后台悬浮查词」开关开启（vc-overlay）才会传 true。 */
        @JavascriptInterface
        public void setOverlayInApp(final boolean on) {
            overlayInApp = on;
            if (!on) {
                OverlayService.requestVisibility(MainActivity.this, false);
                return;
            }
            if (!Settings.canDrawOverlays(MainActivity.this)) return;
            Intent svc = new Intent(MainActivity.this, OverlayService.class);
            svc.putExtra(OverlayService.EXTRA_SHOW, true);
            try {
                startForegroundService(svc);
            } catch (Exception e) {
                try { startService(svc); } catch (Exception ignored) { }
            }
        }

        /** 阅读页普通阅读态选中英文单词/短语 → 悬浮条自动展开并查询（摘取模式下前端不会调用） */
        @JavascriptInterface
        public void overlayQuery(final String word) {
            final String w = word == null ? "" : word.trim();
            if (w.isEmpty()) return;
            if (!Settings.canDrawOverlays(MainActivity.this)) return;
            Intent svc = new Intent(MainActivity.this, OverlayService.class);
            svc.putExtra(OverlayService.EXTRA_SHOW, true);
            svc.putExtra(OverlayService.EXTRA_QUERY, w);
            try {
                startForegroundService(svc);
            } catch (Exception e) {
                try { startService(svc); } catch (Exception ignored) { }
            }
        }

        /** 进入摘取模式/编辑面板时收起悬浮条展开态（两种文字交互互不干扰；不启动服务） */
        @JavascriptInterface
        public void overlayCollapse() {
            OverlayService.requestCollapse(MainActivity.this);
        }

        /* ---------- Knowledge 模块：学习文档选择（纯新增，结果经 window.__onDocParsed 回调前端） ---------- */

        @JavascriptInterface
        public void pickDocument() {
            runOnUiThread(() -> {
                try {
                    Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    it.addCategory(Intent.CATEGORY_OPENABLE);
                    it.setType("*/*"); // 部分机型对 docx/pdf 的 MIME 过滤不可靠，放宽后由解析器嗅探
                    it.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                            "text/plain",
                            "text/markdown",
                            "application/pdf",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "application/octet-stream",
                            "application/zip"
                    });
                    startActivityForResult(it, REQ_PICK_DOC);
                } catch (Exception e) {
                    toast("无法打开文件选择器");
                    emitDocParsed(null); // 通知前端复位「正在解析」状态
                }
            });
        }

        /* ---------- Knowledge 模块：图片 OCR 导入（相册 / 拍照，纯新增段） ----------
           结果经 window.__onImageParsed 回传前端；OCR 由 OcrParser（ML Kit 离线中文模型）完成 */

        /** 相册选择 JPG/JPEG/PNG 图片 */
        @JavascriptInterface
        public void pickImage() {
            runOnUiThread(() -> {
                try {
                    Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    it.addCategory(Intent.CATEGORY_OPENABLE);
                    it.setType("image/*");
                    it.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png"});
                    startActivityForResult(it, REQ_PICK_IMG);
                } catch (Exception e) {
                    toast("无法打开相册");
                    emitImageParsed(null);
                }
            });
        }

        /** 调用系统相机拍摄照片（临时文件经 FileProvider 共享，OCR 后自动清理） */
        @JavascriptInterface
        public void takePhoto() {
            runOnUiThread(() -> {
                try {
                    java.io.File dir = new java.io.File(getCacheDir(), "ocr");
                    if (!dir.exists()) dir.mkdirs();
                    java.io.File photo = new java.io.File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
                    photoUri = androidx.core.content.FileProvider.getUriForFile(
                            MainActivity.this, getPackageName() + ".fileprovider", photo);
                    Intent it = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                    it.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, photoUri);
                    it.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(it, REQ_TAKE_PHOTO);
                } catch (Exception e) {
                    toast("无法打开相机");
                    emitImageParsed(null);
                }
            });
        }

        /* ---------- 我的错题模块：图片持久化通道（纯新增段） ----------
           选择/拍摄的图片复制到应用私有目录 filesDir/mistakes/，前端仅存 file:// 路径 ——
           不依赖系统文档 Uri 的临时读取权限，App 重启后图片仍然有效；
           结果经 window.__onMistakeImage(path|null) 回传前端 */

        /** 相册选择错题原图（选中后复制持久化） */
        @JavascriptInterface
        public void pickMistakeImage() {
            runOnUiThread(() -> {
                try {
                    Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    it.addCategory(Intent.CATEGORY_OPENABLE);
                    it.setType("image/*");
                    startActivityForResult(it, REQ_PICK_MIS_IMG);
                } catch (Exception e) {
                    toast("无法打开相册");
                    emitMistakeImage(null);
                }
            });
        }

        /** 拍摄错题原图（临时文件经 FileProvider 共享，复制持久化后自动清理） */
        @JavascriptInterface
        public void captureMistakeImage() {
            runOnUiThread(() -> {
                try {
                    java.io.File dir = new java.io.File(getCacheDir(), "ocr");
                    if (!dir.exists()) dir.mkdirs();
                    java.io.File photo = new java.io.File(dir, "mis_" + System.currentTimeMillis() + ".jpg");
                    misPhotoUri = androidx.core.content.FileProvider.getUriForFile(
                            MainActivity.this, getPackageName() + ".fileprovider", photo);
                    Intent it = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                    it.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, misPhotoUri);
                    it.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(it, REQ_TAKE_MIS_IMG);
                } catch (Exception e) {
                    toast("无法打开相机");
                    emitMistakeImage(null);
                }
            });
        }

        /** 删除不再被引用的错题图片（仅接受 mistakes 目录内的文件，其余路径直接忽略） */
        @JavascriptInterface
        public void deleteImageFile(final String path) {
            if (path == null || path.isEmpty()) return;
            try {
                String p = path.startsWith("file://") ? path.substring(7) : path;
                java.io.File f = new java.io.File(p);
                java.io.File base = new java.io.File(getFilesDir(), "mistakes");
                if (!f.getCanonicalPath().startsWith(base.getCanonicalPath())) return;
                if (f.exists()) f.delete();
            } catch (Exception ignored) { }
        }
    }

    /* ---------- Knowledge 模块：文档/图片解析结果回传（纯新增段，不影响既有导出/权限流程） ---------- */

    private static final int REQ_PICK_DOC = 4101;
    private static final int REQ_PICK_IMG = 4102;
    private static final int REQ_TAKE_PHOTO = 4103;
    private static final int REQ_PICK_MIS_IMG = 4104;  // 我的错题：相册选图
    private static final int REQ_TAKE_MIS_IMG = 4105;  // 我的错题：拍照
    private Uri photoUri = null; // 拍照临时文件 URI（OCR 完成后清理）
    private Uri misPhotoUri = null; // 错题拍照临时文件 URI（复制持久化后清理）

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_PICK_DOC) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                emitDocParsed(null); // 用户取消
                return;
            }
            final Uri uri = data.getData();
            // 解析放后台线程（文档可能较大），完成后主线程回调前端
            new Thread(() -> {
                org.json.JSONObject json = new org.json.JSONObject();
                try {
                    DocumentParser.Result r = DocumentParser.parse(getContentResolver(), uri);
                    if (r.ok) {
                        json.put("ok", true).put("text", r.text)
                            .put("name", queryDisplayName(uri));
                    } else if (DocumentParser.ERR_PDF_SCAN.equals(r.error)) {
                        // 扫描版/图片型 PDF：文本层为空 → PdfRenderer 渲染位图逐页 OCR
                        String text = ocrScannedPdf(uri);
                        if (text == null || text.trim().isEmpty()) {
                            json.put("ok", false)
                                .put("error", "OCR_FAILED_PDF");
                        } else {
                            json.put("ok", true).put("text", text)
                                .put("name", queryDisplayName(uri));
                        }
                    } else {
                        json.put("ok", false).put("error", r.error);
                    }
                } catch (Exception e) {
                    try { json.put("ok", false).put("error", "解析失败：" + e.getMessage()); }
                    catch (Exception ignored) { }
                }
                emitDocParsed(json.toString());
            }, "doc-parse").start();
            return;
        }

        /* 图片 OCR：相册选择与拍照共用同一解析链路（ML Kit 离线识别） */
        if (requestCode == REQ_PICK_IMG || requestCode == REQ_TAKE_PHOTO) {
            final Uri uri;
            if (requestCode == REQ_PICK_IMG) {
                uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            } else { // 拍照：结果写往 photoUri（Intent data 为空）
                uri = (resultCode == RESULT_OK) ? photoUri : null;
            }
            if (uri == null) {
                emitImageParsed(null); // 用户取消
                return;
            }
            final String name = requestCode == REQ_PICK_IMG
                    ? queryDisplayName(uri) : "拍照图片_" + new java.text.SimpleDateFormat(
                        "MMdd_HHmm", java.util.Locale.US).format(new java.util.Date()) + ".jpg";
            OcrParser.parse(this, uri, text -> {
                runOnUiThread(() -> {
                    if (requestCode == REQ_TAKE_PHOTO) deletePhotoTemp(uri); // 拍照临时文件用后即删
                    org.json.JSONObject json = new org.json.JSONObject();
                    try {
                        if (text == null) json.put("ok", false).put("error", "OCR_UNAVAILABLE");
                        else if (text.trim().isEmpty()) json.put("ok", false).put("error", "OCR_EMPTY");
                        else json.put("ok", true).put("text", text).put("name", name);
                    } catch (Exception ignored) { }
                    emitImageParsed(json.toString());
                });
            });
        }

        /* 我的错题图片：复制到应用私有目录持久化，再把 file:// 路径回传前端（重启 App 后仍有效） */
        if (requestCode == REQ_PICK_MIS_IMG || requestCode == REQ_TAKE_MIS_IMG) {
            final Uri uri;
            if (requestCode == REQ_PICK_MIS_IMG) {
                uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            } else { // 拍照：结果写往 misPhotoUri（Intent data 为空）
                uri = (resultCode == RESULT_OK) ? misPhotoUri : null;
            }
            if (uri == null) {
                emitMistakeImage(null); // 用户取消
                return;
            }
            final Uri srcUri = uri;
            new Thread(() -> {
                String saved = null;
                try {
                    java.io.File dir = new java.io.File(getFilesDir(), "mistakes");
                    if (!dir.exists()) dir.mkdirs();
                    java.io.File dst = new java.io.File(dir, "mis_" + System.currentTimeMillis() + ".jpg");
                    java.io.InputStream in = getContentResolver().openInputStream(srcUri);
                    if (in != null) {
                        java.io.OutputStream out = new java.io.FileOutputStream(dst);
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        out.close();
                        in.close();
                        saved = "file://" + dst.getAbsolutePath();
                    }
                } catch (Exception ignored) { }
                final String path = saved;
                runOnUiThread(() -> {
                    if (requestCode == REQ_TAKE_MIS_IMG) { // 拍照临时文件已复制，用后即删
                        try {
                            java.io.File f = new java.io.File(srcUri.getPath());
                            if (f.exists()) f.delete();
                        } catch (Exception ignored) { }
                        misPhotoUri = null;
                    }
                    emitMistakeImage(path);
                });
            }, "mis-img-copy").start();
        }
    }

    /** 错题图片路径注入前端：window.__onMistakeImage('file://…'|null)；null = 取消或复制失败 */
    private void emitMistakeImage(final String path) {
        final String js = "window.__onMistakeImage&&window.__onMistakeImage("
                + (path == null ? "null" : "'" + path.replace("'", "\\'") + "'") + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    /** 图片 OCR 结果注入前端：window.__onImageParsed(json|null)；null = 用户取消 */
    private void emitImageParsed(final String jsonArg) {
        final String js = "window.__onImageParsed&&window.__onImageParsed("
                + (jsonArg == null ? "null" : jsonArg) + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    /** 清理拍照临时文件（OCR 文本已持久化，图片原件不保留） */
    private void deletePhotoTemp(Uri uri) {
        try {
            if (photoUri != null && photoUri.equals(uri)) {
                java.io.File f = new java.io.File(uri.getPath());
                if (f.exists()) f.delete();
                photoUri = null;
            }
        } catch (Exception ignored) { }
    }

    /** 解析结果注入前端：window.__onDocParsed(json|null)；null = 用户取消 */
    private void emitDocParsed(final String jsonArg) {
        final String js = "window.__onDocParsed&&window.__onDocParsed("
                + (jsonArg == null ? "null" : jsonArg) + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    /* ---------- 扫描版 PDF → OCR（DocumentParser 判定无文本层时才走此链路） ----------
       PdfRenderer 逐页渲染位图（长边目标 2048px，白底）→ OcrParser.parseBitmapSync
       （中文识别器 + 方向自检 + Latin 重跑 + 结构重建，与图片导入同一管线）。
       页数上限 20：扫描版 OCR 逐页同步执行，超出部分诚实告知「仅识别前 N 页」。 */

    private static final int PDF_OCR_PAGE_LIMIT = 20;

    /** @return 结构化文本；null = 渲染/识别全部失败 */
    private String ocrScannedPdf(Uri uri) {
        StringBuilder out = new StringBuilder();
        try (android.os.ParcelFileDescriptor pfd =
                     getContentResolver().openFileDescriptor(uri, "r")) {
            if (pfd == null) return null;
            try (android.graphics.pdf.PdfRenderer renderer =
                         new android.graphics.pdf.PdfRenderer(pfd)) {
                int pageCount = renderer.getPageCount();
                int pages = Math.min(pageCount, PDF_OCR_PAGE_LIMIT);
                for (int i = 0; i < pages; i++) {
                    try (android.graphics.pdf.PdfRenderer.Page page = renderer.openPage(i)) {
                        int w = page.getWidth(), h = page.getHeight();
                        if (w <= 0 || h <= 0) continue;
                        double scale = 2048.0 / Math.max(w, h); // 长边目标 2048（ML Kit 最佳区间）
                        if (scale > 2.5) scale = 2.5;
                        if (scale < 1.0) scale = 1.0;
                        Bitmap bmp = Bitmap.createBitmap(
                                Math.max(1, (int) (w * scale)),
                                Math.max(1, (int) (h * scale)),
                                Bitmap.Config.ARGB_8888);
                        bmp.eraseColor(Color.WHITE); // PDF 页透明区域铺白底，OCR 不吃透明噪点
                        page.render(bmp, null, null,
                                android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        String t = OcrParser.parseBitmapSync(this, bmp); // 内部不复用位图，需自行回收
                        bmp.recycle();
                        if (t != null && !t.trim().isEmpty()) {
                            if (out.length() > 0) out.append("\n\n");
                            out.append(t.trim());
                        }
                    }
                }
                if (pageCount > pages) out.append("\n\n（仅识别前 ").append(pages).append(" 页）");
            }
        } catch (Exception e) {
            return out.length() == 0 ? null : out.toString();
        }
        return out.length() == 0 ? null : out.toString();
    }

    private String queryDisplayName(Uri uri) {
        try (android.database.Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) { }
        return uri.getLastPathSegment();
    }

    private void startExport(String name, String fmt, String html) {
        // Android 9 及以下旧式存储需要写权限
        if (Build.VERSION.SDK_INT < 29 && !"pdf".equals(fmt)
                && checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE")
                != PackageManager.PERMISSION_GRANTED) {
            pendingExport = new String[]{name, fmt, html};
            requestPermissions(new String[]{"android.permission.WRITE_EXTERNAL_STORAGE"}, 1);
            return;
        }
        try {
            if ("pdf".equals(fmt)) {
                printHtml(name, html);
            } else if ("word".equals(fmt)) {
                saveBytes(name + ".doc", "application/msword",
                        ("\ufeff" + html).getBytes(StandardCharsets.UTF_8));
            } else if ("png".equals(fmt)) {
                renderPng(name, html);
            }
        } catch (Exception e) {
            toast("导出失败：" + e.getMessage());
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == 1 && pendingExport != null
                && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            String[] p = pendingExport;
            pendingExport = null;
            startExport(p[0], p[1], p[2]);
        } else if (code == 1) {
            pendingExport = null;
            toast("需要存储权限才能导出");
        }
    }

    /* ---------- PDF：系统打印 → 另存为 PDF ---------- */
    private void printHtml(String name, String html) {
        final WebView pw = buildOffscreenWebView();
        pw.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(name + ".pdf");
                pm.print(name, adapter, new PrintAttributes.Builder().build());
            }
        });
        pw.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /* ---------- PNG：离屏 WebView 渲染 → Bitmap → PNG ---------- */
    private void renderPng(String name, String html) {
        final WebView pw = buildOffscreenWebView();
        // PNG 视口必须等于视图宽（720css）：默认宽视口(980css)会让内容居中偏移出画布
        pw.getSettings().setJavaScriptEnabled(true); // 仅用于测量文档真实高度
        pw.getSettings().setUseWideViewPort(false);
        pw.getSettings().setLoadWithOverviewMode(false);
        // 加载前固定为 720×400css 布局：矮视口让 scrollHeight 反映真实内容高度
        float d0 = getResources().getDisplayMetrics().density;
        pw.layout(0, 0, Math.round(720 * d0), Math.round(400 * d0));
        pw.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                new Handler(Looper.getMainLooper()).postDelayed(() ->
                    v.evaluateJavascript(
                        "(function(){var d=document.querySelector('.doc');" +
                        "return d? Math.ceil(d.getBoundingClientRect().bottom)+24 :" +
                        " Math.ceil(Math.max(document.body.scrollHeight," +
                        "document.documentElement.scrollHeight));})()",
                        heightStr -> drawPng(v, name, heightStr)), 400);
            }
        });
        pw.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /** 依据 JS 测得的内容高度布局并绘制 PNG */
    private void drawPng(WebView v, String name, String heightStr) {
        try {
            float density = getResources().getDisplayMetrics().density;
            int cssHeight = 1200;
            try { cssHeight = (int) Math.ceil(Double.parseDouble(heightStr)); }
            catch (Exception ignored) { /* 保持回退值 */ }
            if (cssHeight <= 0) cssHeight = 1200;
            final int w = v.getWidth();
            final int h = Math.round(cssHeight * density);
            android.util.Log.d("VocabPng", "measured cssHeight=" + cssHeight + " view=" + w + "x" + h);
            v.layout(0, 0, w, h); // 视口展开到全部内容，长内容不被截断
            // 注意：离屏 WebView 未 attach，View.postDelayed 不会执行，必须用 Handler
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    final int cap = 12000; // Bitmap 单边高度上限，防 OOM
                    float drawScale = Math.min(1f, (float) cap / h);
                    Bitmap bmp = Bitmap.createBitmap(
                            Math.max(1, Math.round(w * drawScale)),
                            Math.max(1, Math.round(h * drawScale)),
                            Bitmap.Config.ARGB_8888);
                    Canvas c = new Canvas(bmp);
                    c.drawColor(Color.WHITE);
                    c.scale(drawScale, drawScale);
                    v.draw(c); // 1:1 设备像素绘制（画布已是物理尺寸，不再乘 density）
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, bos);
                    saveBytes(name + ".png", "image/png", bos.toByteArray());
                    bmp.recycle();
                } catch (Exception e) {
                    toast("导出失败：" + e.getMessage());
                }
            }, 150); // 等待重排后再绘制
        } catch (Exception e) {
            toast("导出失败：" + e.getMessage());
        }
    }

    /** 宽 720 CSS px 的离屏 WebView（与前端导出排版宽度一致） */
    @SuppressLint("SetJavaScriptEnabled")
    private WebView buildOffscreenWebView() {
        WebView wv = new WebView(this);
        wv.getSettings().setJavaScriptEnabled(false);
        wv.getSettings().setTextZoom(100);
        float density = getResources().getDisplayMetrics().density;
        wv.layout(0, 0, Math.round(720 * density), Math.round(1200 * density));
        wv.measure(
                View.MeasureSpec.makeMeasureSpec(Math.round(720 * density), View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        wv.layout(0, 0, wv.getMeasuredWidth(), wv.getMeasuredHeight());
        return wv;
    }

    /* ---------- 保存到 Downloads（MediaStore，Android 10+ 免权限） ---------- */
    private void saveBytes(String displayName, String mime, byte[] data) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, displayName);
                cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("MediaStore insert failed");
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    os.write(data);
                }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                try (FileOutputStream fos = new FileOutputStream(new File(dir, displayName))) {
                    fos.write(data);
                }
            }
            toast("已保存 · Downloads/" + displayName);
        } catch (Exception e) {
            toast("保存失败：" + e.getMessage());
        }
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }
}
