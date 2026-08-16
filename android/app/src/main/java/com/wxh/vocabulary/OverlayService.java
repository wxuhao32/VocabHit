package com.wxh.vocabulary;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.PixelFormat;
import android.os.Build;
import android.media.AudioAttributes;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * 后台悬浮查词服务：系统级 Overlay 悬浮查词条。
 * 窗口尺寸/焦点由 overlay.html 通过 AndroidOverlay 桥接驱动：
 *   resize(w, h)      内容尺寸变化（收起/展开）
 *   setDraggable(b)   收起态可拖动
 *   requestFocus()    展开输入（清除 NOT_FOCUSABLE → 弹出键盘）
 *   releaseFocus()    收起（避免抢占其他应用按键）
 * localStorage 与主界面同源共享，查询记录互通。
 */
public class OverlayService extends Service {

    private static final String CHANNEL_ID = "overlay_search";
    private static final int NOTI_ID = 42;
    public static final String EXTRA_SHOW = "show";

    private TextToSpeech tts; // 单词读音（系统 TTS）
    private volatile boolean ttsReady = false; // 引擎初始化成功（语言回退后仍可用）
    private Runnable pendingSpeak = null; // 引擎就绪前的待播请求（只保留最新一次）
    private boolean ttsToastShown = false; // 「语音引擎不可用」只提示一次
    private long ttsFailAt = 0; // 引擎不可用标记时间（短时内不再重复尝试）
    private String ttsText = "";
    private int ttsRemain = 0;

    private final Handler main = new Handler(Looper.getMainLooper());
    private static boolean running = false; // 服务是否存活（跨进程同生命周期）
    private WindowManager wm;
    private WebView webView;
    private WindowManager.LayoutParams params;
    private boolean added = false;
    private boolean draggable = true;
    private boolean focusable = false;
    private boolean hidden = false; // 主应用在前台时隐藏（避免与应用内悬浮条重复）
    private int edgeSide = 0; // 贴边吸附：0 无 / 1 左 / 2 右
    private ValueAnimator snapAnim;
    /** IME 弹出/收起瞬间（focusable 翻转）→ 短时间内页面 resize 上报的尺寸易出现偏小抖动
     *  （被 IME 占用屏幕下方影响 layout 计算）→ 若此期间报告「偏小」值并写入 params.height，
     *  会导致后续内容溢出 #panel overflow:hidden 截切。短时忽略偏小 resize 即可。
     *  偏大或首次正常接受；不影响正常状态布局。 */
    private long focusableChangeAt = 0;
    /** IME 翻转后忽略偏小 resize 的窗口（ms） */
    private static final long IME_JITTER_WINDOW_MS = 600;
    /** 贴边吸附后 2s 无操作 → 通知页面收缩变淡 */
    private final Runnable edgeShrink = () -> {
        if (added && !focusable && !hidden)
            webView.evaluateJavascript("window.__enterEdge&&window.__enterEdge()", null);
    };

    /** 请求悬浮条可见性（主应用 onResume/onPause 调用）。
     *  仅当服务已在运行（用户开启过悬浮查词）时下发指令；
     *  绝不凭此启动服务：未授予悬浮窗权限的设备上启动会在页面就绪后 addView 崩溃，
     *  表现为「进入首页后过一会儿自动闪退」。 */
    public static void requestVisibility(Context ctx, boolean show) {
        if (!running) return;
        Intent it = new Intent(ctx, OverlayService.class);
        it.putExtra(EXTRA_SHOW, show);
        try { ctx.startService(it); } catch (Exception ignored) { }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra(EXTRA_SHOW)) {
            setShow(intent.getBooleanExtra(EXTRA_SHOW, true));
        }
        return START_STICKY;
    }

    private void setShow(boolean show) {
        hidden = !show;
        main.removeCallbacks(edgeShrink); // 可见性变化时取消挂起的收缩
        View root = added && webView != null ? (View) webView.getTag() : null;
        if (root != null) {
            if (hidden) {
                webView.evaluateJavascript("window.__back&&window.__back()", null); // 展开态先收起
                root.setVisibility(View.GONE);
            } else {
                root.setVisibility(View.VISIBLE);
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        startAsForeground(); // 先满足前台服务义务，再决定去留
        if (!android.provider.Settings.canDrawOverlays(this)) {
            stopSelf(); // 无悬浮窗权限：不再加载页面/创建窗口（部分设备上 addView 会直接崩溃）
            return;
        }
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // 与主界面共享 localStorage（同 origin）
        s.setTextZoom(100);
        // 禁用一切缩放：防止聚焦输入框/窗口重建时 WebView 自动放大导致 UI 累积变大
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setBackgroundResource(0); // 移除 WebView 默认背景 drawable
        // 关闭 WebView 的 View-level elevation：阴影由 root 的圆角 outline + elevation 统一提供
        webView.setElevation(0);
        webView.addJavascriptInterface(new OverlayBridge(), "AndroidOverlay");
        webView.setWebViewClient(new WebViewClient());
        webView.setOnTouchListener(new DragTouchListener());

        // 返回键：展开态先收起（交回页面），而非直接消失
        FrameLayout root = new FrameLayout(this) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent e) {
                if (e.getAction() == KeyEvent.ACTION_DOWN && e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                    webView.evaluateJavascript("window.__back&&window.__back()", null);
                    return true;
                }
                return super.dispatchKeyEvent(e);
            }
        };
        // 原生圆角方案：窗口用圆角 outline 裁剪 + elevation 产生「跟随圆角」的系统阴影。
        // 完全绕开 WebView 内 CSS 阴影（box-shadow/drop-shadow 在透明悬浮窗上渲染不可靠，
        // 会退化为黑色矩形/黑色容器）；系统原生 elevation 阴影永远跟随 outline 圆角形状。
        root.setElevation(dp(12));
        root.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                // 圆角略大于 #bar(14)/#panel(18)/edge(12) 的最大值，覆盖全部状态且不切内容
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(18));
            }
        });
        root.setClipToOutline(true); // 窗口内容（含 WebView）裁剪为圆角，圆角外透明
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        // 关闭系统窗口入场动画：消除悬浮窗刚出现/展开时 ~1 秒内的深色矩形阴影条
        params.windowAnimations = 0;

        webView.loadUrl("file:///android_asset/www/overlay.html");
        // 首次尺寸由页面 ready 后 resize() 上报，再 addView
        webView.setTag(root);
    }

    /** 前台服务（specialUse）：划掉应用后悬浮条仍可用 */
    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                    "后台悬浮查词", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("保持悬浮查词条可用");
            nm.createNotificationChannel(ch);
            startForeground(NOTI_ID, new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle("生词本")
                    .setContentText("悬浮查词运行中 · 点按悬浮条查生词")
                    .setSmallIcon(android.R.drawable.ic_menu_search)
                    .build());
        } else {
            startForeground(NOTI_ID, new Notification.Builder(this)
                    .setContentTitle("生词本 · 悬浮查词运行中")
                    .setSmallIcon(android.R.drawable.ic_menu_search)
                    .build());
        }
    }

    private void attachIfNeeded(int wPx, int hPx) {
        if (added) return;
        // 首帧窗口给足最小宽度，避免文字折行；页面 ready 后会二次校正到真实尺寸
        // 首次高度同样应用上限钳制（防止首帧页面 offsetHeight 异常大时 addView 一个巨大窗口）
        final int maxH = Math.round(440f * getResources().getDisplayMetrics().density);
        params.width = Math.max(Math.min(wPx, Math.round(360f * getResources().getDisplayMetrics().density)), dp(90));
        params.height = Math.max(Math.min(hPx, maxH), dp(40));
        if (params.x == 0 && params.y == 0) { // 初始位置：右侧中部
            int sw = getResources().getDisplayMetrics().widthPixels;
            int sh = getResources().getDisplayMetrics().heightPixels;
            params.x = Math.max(sw - params.width - dp(14), dp(6));
            params.y = Math.max(sh * 38 / 100, dp(90));
        }
        try {
            wm.addView((View) webView.getTag(), params);
        } catch (Exception e) {
            // 权限被回收 / ROM 拒绝等：优雅停止服务，绝不让进程崩溃
            added = false;
            stopSelf();
            return;
        }
        ((View) webView.getTag()).setVisibility(hidden ? View.GONE : View.VISIBLE);
        added = true;
    }

    /** 窗口参数更新兜底：窗口已失效（权限被回收等）时停止服务而非抛异常崩溃 */
    private void safeUpdateLayout() {
        try {
            wm.updateViewLayout((View) webView.getTag(), params);
        } catch (Exception e) {
            added = false;
            stopSelf();
        }
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private int screenW() { return getResources().getDisplayMetrics().widthPixels; }

    /** 按当前状态定位 x：吸附态贴边；普通态保持用户位置但防出屏 */
    private void positionForState() {
        int sw = screenW();
        if (edgeSide == 2) {
            params.x = Math.max(sw - params.width - dp(8), dp(4));
        } else if (edgeSide == 1) {
            params.x = dp(8);
        } else if (params.x + params.width > sw - dp(8)) {
            params.x = Math.max(sw - params.width - dp(8), dp(8));
        }
    }

    /** 拖动结束后：靠近左/右边缘 → 平滑吸附，并在 2s 无操作后通知页面收缩变淡 */
    private void snapToEdge() {
        int sw = screenW();
        int cx = params.x + params.width / 2;
        int side = (cx > sw - dp(72)) ? 2 : (cx < dp(72) ? 1 : 0);
        main.removeCallbacks(edgeShrink);
        if (snapAnim != null) snapAnim.cancel();
        if (side == 0) { edgeSide = 0; return; }
        edgeSide = side;
        final int target = side == 2 ? Math.max(sw - params.width - dp(8), dp(4)) : dp(8);
        snapAnim = ValueAnimator.ofInt(params.x, target);
        snapAnim.setDuration(180);
        snapAnim.setInterpolator(new DecelerateInterpolator());
        snapAnim.addUpdateListener(a -> {
            params.x = (int) a.getAnimatedValue();
            try { safeUpdateLayout(); } catch (Exception ignored) { }
        });
        snapAnim.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator a) {
                if (edgeSide != 0) main.postDelayed(edgeShrink, 2000);
            }
        });
        snapAnim.start();
    }

    private class OverlayBridge {
        /** 读取 ECDICT 分片数据（assets/www/data/ecdict-<letter>.js），失败返回 null */
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

        /* ---------- 单词读音（系统 TTS） ---------- */

        @JavascriptInterface
        public void speakTimes(final String text, final int times) {
            safeSpeak(text, times);
        }

        @JavascriptInterface
        public void ttsStop() {
            main.post(() -> { if (tts != null) { try { tts.stop(); } catch (Exception ignored) { } } });
        }

        @JavascriptInterface
        public void resize(final float wCss, final float hCss) {
            resizeInternal(wCss, hCss, false);
        }

        /** 强制调整窗口尺寸（页面明确要求，如「搜索词清空」收敛布局）：
         *  绕过 IME 抖动忽略，确保空状态小高度立即生效，清除旧结果区残留的透明空白/浅影 */
        @JavascriptInterface
        public void resizeForce(final float wCss, final float hCss) {
            resizeInternal(wCss, hCss, true);
        }

        private void resizeInternal(final float wCss, final float hCss, final boolean force) {
            float d = getResources().getDisplayMetrics().density;
            final int w = Math.round(wCss * d), h = Math.round(hCss * d);
            // 兜底钳制高度：异常撑大（IME 抖动/首帧异常，550+ px）被截回到设计上限附近，
            // 避免 panel 高度过大导致悬浮条下方出现半透明大空白（root 圆角 outline 只裁顶部实际内容）。
            // 正常 panel 最大 ~416 CSS px（输入框 60 + 结果区 300 + 内边距 26 + 边框），上限 440 有余量不误伤。
            final int maxH = Math.round(440f * d);
            final int hFinal = Math.min(Math.max(h, 1), maxH);
            android.util.Log.d("VocabOverlay", "resize" + (force ? "Force" : "") + " " + wCss + "x" + hCss + " -> " + w + "x" + h + " (hFinal " + hFinal + ", maxH " + maxH + ")");
            main.post(() -> {
                if (!added) { attachIfNeeded(w, hFinal); return; }
                // IME 抖动忽略（仅非 force）：focusable 翻转后 600ms 内的「偏小」resize 上报视为 IME 抖动误测，
                // 忽略以避免 params.height 被设小 → 后续内容被 #panel overflow:hidden 截切。
                // 例外：当 params.height 已经异常大（>maxH，遗留/首帧异常），仍允许偏小 resize 修正（自我修复）。
                if (!force) {
                    long sinceFlip = System.currentTimeMillis() - focusableChangeAt;
                    if (focusable && sinceFlip < IME_JITTER_WINDOW_MS && hFinal < params.height && params.height <= maxH && params.height > 0) {
                        android.util.Log.d("VocabOverlay", "resize ignored (IME jitter): " + hFinal + " < current " + params.height + " (sinceFlip=" + sinceFlip + "ms)");
                        return;
                    }
                }
                int newW = Math.max(w, 1), newH = hFinal;
                // 幂等去重：尺寸与当前一致 → 跳过 updateViewLayout。
                // 连续输入/删除触发连续搜索时，结果区 max-height 固定 → panel 高度大多不变，
                // 若每次都 updateViewLayout 会导致 Window 合成层反复重建 → 透明浅影/残留阴影。
                if (params.width == newW && params.height == newH) {
                    return;
                }
                params.width = newW;
                params.height = newH;
                positionForState(); // 吸附态贴边 / 普通态防出屏
                safeUpdateLayout();
            });
        }

        /** 点击贴边收缩条后恢复：脱离吸附、移回屏内标准位置 */
        @JavascriptInterface
        public void exitEdge() {
            main.post(() -> {
                edgeSide = 0;
                main.removeCallbacks(edgeShrink);
                if (!added) return;
                positionForState();
                safeUpdateLayout();
            });
        }

        @JavascriptInterface
        public void setDraggable(final boolean b) { draggable = b; }

        /** 展开：清除 NOT_FOCUSABLE 以唤起键盘 */
        @JavascriptInterface
        public void requestFocus() {
            android.util.Log.d("VocabOverlay", "requestFocus");
            main.post(() -> {
                if (!added || focusable) return;
                focusable = true;
                focusableChangeAt = System.currentTimeMillis(); // 标记 IME 翻转 → resize 偏小忽略窗口开始
                params.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                safeUpdateLayout();
            });
        }

        /** 收起：恢复 NOT_FOCUSABLE，不抢占其他应用按键 */
        @JavascriptInterface
        public void releaseFocus() {
            main.post(() -> {
                if (!added || !focusable) return;
                focusable = false;
                focusableChangeAt = System.currentTimeMillis(); // 标记 IME 收起 → 偏小 resize 同样忽略
                params.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                safeUpdateLayout();
            });
        }

        /** 彻底关闭：停止服务（下次在设置中重新开启） */
        @JavascriptInterface
        public void close() {
            main.post(() -> stopSelf());
        }
    }

    /** 收起态整条可拖动；拖动距离超过阈值则消费事件（点击仍交给页面） */
    private class DragTouchListener implements View.OnTouchListener {
        private float downX, downY, startX, startY;
        private boolean dragging = false;

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouch(View v, MotionEvent e) {
            if (!added) return false;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    dragging = false;
                    android.util.Log.d("VocabOverlay", "touch DOWN " + (int) e.getRawX() + "," + (int) e.getRawY());
                    main.removeCallbacks(edgeShrink); // 用户正在触碰，取消自动收缩
                    downX = e.getRawX(); downY = e.getRawY();
                    startX = params.x; startY = params.y;
                    return false; // 先放行，点击归 WebView
                case MotionEvent.ACTION_MOVE:
                    if (!draggable || focusable) return false;
                    float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                    if (!dragging && dx * dx + dy * dy > 25 * 25) {
                        dragging = true;
                        android.util.Log.d("VocabOverlay", "drag start d=" + (int) dx + "," + (int) dy);
                    }
                    if (dragging) {
                        params.x = Math.max(0, Math.round(startX + dx));
                        params.y = Math.max(0, Math.round(startY + dy));
                        safeUpdateLayout();
                        return true;
                    }
                    return false;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (dragging) {
                        // 仅真实长按拖动（>120ms）才吸附并吞掉点击；系统合成 MOVE 导致的误判不拦截 tap
                        boolean realDrag = e.getActionMasked() == MotionEvent.ACTION_UP
                                && e.getEventTime() - e.getDownTime() > 120;
                        if (realDrag) {
                            snapToEdge();
                        } else {
                            // 误判拖动（轻触带轻微移动）：还原窗口位置，避免位置被污染
                            params.x = Math.round(startX);
                            params.y = Math.round(startY);
                            try { safeUpdateLayout(); } catch (Exception ignored) { }
                        }
                        return realDrag;
                    }
                    return false;
                default:
                    return false;
            }
        }
    }

    /**
     * 安全播放：引擎就绪 → 直接播（QUEUE_FLUSH 打断旧播放，连续点击只播最新）；
     * 引擎初始化中 → 排队（覆盖旧请求）；初始化失败/语言不可用 → 静默放弃并一次性提示。
     * 任何异常均被捕获，绝不让 TTS 问题导致悬浮窗/App 崩溃。
     */
    /** TTS 提示（进程内只提示一次，避免连续失败刷屏） */
    private void toastTts(final String msg) {
        if (ttsToastShown) return;
        ttsToastShown = true;
        try { Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_LONG).show(); } catch (Exception ignored) { }
    }

    /**
     * 安全播放：引擎就绪 → 直接播（QUEUE_FLUSH 打断旧播放，连续点击只播最新）；
     * 引擎初始化中 → 排队（覆盖旧请求）；初始化失败/无引擎/播放失败 → 精准提示原因。
     * 任何异常均被捕获，绝不让 TTS 问题导致悬浮窗/App 崩溃。
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
        main.post(() -> {
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
            tts = new TextToSpeech(this, status -> main.post(() -> {
                if (tts == null) return; // Service 已销毁，忽略回调
                ttsFailAt = 0; // 回调最终到达 → 清除失败标记（即使初始化慢）
                android.util.Log.d("VocabTTS", "init status=" + status + " (0=SUCCESS)");
                if (status == TextToSpeech.SUCCESS) {
                    // 英语语音可用性预检（仅日志，不阻断）
                    try {
                        int avUs = tts.isLanguageAvailable(java.util.Locale.US);
                        int avEn = tts.isLanguageAvailable(java.util.Locale.ENGLISH);
                        android.util.Log.d("VocabTTS", "langAvail US=" + avUs + " EN=" + avEn
                                + " (0=AVAILABLE, 1=COUNTRY, 2=VAR, -1=MISSING_DATA, -2=NOT_SUPPORTED)");
                    } catch (Exception e) { android.util.Log.d("VocabTTS", "lang probe exception", e); }
                    final boolean[] langMissing = { false };
                    // 语言：优先美式英语；MISSING/NOT_SUPPORTED → 回退英语 → 仍失败则用引擎默认语言（不阻断出声）
                    try {
                        int r = tts.setLanguage(java.util.Locale.US);
                        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                            int r2 = tts.setLanguage(java.util.Locale.ENGLISH);
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
                                main.post(() -> {
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
                                main.post(() -> toastTts(langMissing[0]
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
                    main.post(() -> toastTts("语音引擎初始化失败，请在系统设置-语音中检查"));
                }
                Runnable p = pendingSpeak; pendingSpeak = null;
                if (p != null && ttsReady) p.run();
            }), fEngine);
            // 超时兜底：15 秒未就绪 → 提示一次，但**不销毁对象**（引擎初始化慢时回调到达仍可播放）
            main.postDelayed(() -> {
                if (tts != null && !ttsReady) {
                    android.util.Log.d("VocabTTS", "init SLOW (>15s)");
                    ttsFailAt = System.currentTimeMillis();
                    main.post(() -> toastTts("语音引擎初始化较慢或无响应，请检查系统语音设置"));
                }
            }, 15000);
        } catch (Exception e) {
            // new TextToSpeech 本身抛异常（个别 ROM/系统版本，如指定引擎无效）
            android.util.Log.d("VocabTTS", "new TextToSpeech exception", e);
            try { if (tts != null) tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
            ttsFailAt = System.currentTimeMillis();
            main.post(() -> toastTts("语音功能初始化失败，请检查系统语音设置"));
        }
    }

    @Override
    public void onDestroy() {
        ttsReady = false; // 先断开就绪标志，避免异步回调/待播任务访问已释放的 TTS
        pendingSpeak = null;
        running = false;
        main.removeCallbacks(edgeShrink); // 清理挂起的收缩任务，避免作用于已销毁的 WebView
        if (snapAnim != null) snapAnim.cancel();
        if (added) {
            try { wm.removeView((View) webView.getTag()); } catch (Exception ignored) { }
            added = false;
        }
        if (webView != null) webView.destroy();
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) { }
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
        }
        super.onDestroy();
    }
}
