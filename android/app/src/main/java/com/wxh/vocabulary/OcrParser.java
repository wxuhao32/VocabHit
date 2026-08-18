package com.wxh.vocabulary;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * 图片 OCR 解析器（Knowledge 图片导入 · v0.8.9 基线恢复版）。
 *
 * 设计原则：ML Kit 返回的 block/line 结构与 line.getText() 是文本与版式的
 * 唯一可信来源 —— 后处理只做「阅读顺序重排与段落分隔」，绝不从元素坐标
 * 重建空格或重组合并行（v0.8.8 曾这样做，导致英文词间空格消失、换行丢失、
 * 多区域挤成一整段的回归，本版已彻底移除该路径）。
 *
 * 管线：
 *   加载（EXIF 方向纠正 + 长边压至 2048）
 *   → 中文识别器识别（覆盖中英混排；v0.8.9 不做图像预处理 —— 恢复到
 *     v0.8.7 稳定基线，预处理待后续版本 A/B 实测后再决定是否启用，
 *     原实现保留于 preprocess() 未调用）
 *   → 方向自检（有效字符过少 → 依次尝试 90/180/270 度，显著更优才采用）
 *   → 拉丁占比 ≥80% → Latin 识别器重跑（字母/空格/标点更准）
 *   → 输出：行 = ML Kit 原生行（\n 分隔）；块边界按行间距判定段落（\n\n）
 *     或换行（\n）；保守双栏重排；英文行尾连字符断词合并
 *   → 诊断文件 ocr_debug/ocr_<时间>.txt（A 引擎原始结构 + B 后处理结果）
 *
 * 识别范围：印刷体中文/英文/中英混排 + 数字 + 常见英文标点。
 * 模型 bundled 打包进 APK，完全离线，无需 Google Play Services。
 */
public final class OcrParser {

    private OcrParser() {}

    public interface Callback {
        /** text = 按阅读顺序提取的纯文本；null = 识别失败 */
        void onDone(String text);
    }

    private static final String TAG = "VH_OCR";
    /** 识别尺寸上限：ML Kit 最佳区间（过长边反而降速降准） */
    private static final int MAX_SIDE = 2048;
    /** 有效字符低于该值才触发旋转自检（正常方向页面不受罚） */
    private static final int MIN_CHARS_BEFORE_ROTATE = 25;
    /** 拉丁字母占比达到该值时切换 Latin 识别器重跑 */
    private static final double LATIN_RERUN_RATIO = 0.80;
    /** 光照场下采样系数（仅 preprocess 使用，当前未启用） */
    private static final int BG_SAMPLE_DIV = 12;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    public static void parse(Context ctx, Uri uri, final Callback cb) {
        final Context appCtx = ctx.getApplicationContext();
        new Thread(() -> {
            String out = null;
            try {
                out = run(appCtx, uri);
            } catch (Exception ignored) { }
            final String r = out;
            MAIN.post(() -> cb.onDone(r));
        }, "ocr-parse").start();
    }

    private static String run(Context ctx, Uri uri) {
        Bitmap bmp;
        try {
            Bitmap src = load(ctx, uri);
            if (src == null) return null;
            // v0.8.9：恢复基线 —— 不做图像预处理（光照平坦化/对比度拉伸未经
            // A/B 实测，疑似伤害英文识别；待后续版本按质量度量自动取优后启用）
            bmp = src;
        } catch (Exception e) {
            return null;
        }

        List<String> notes = new ArrayList<>();

        // —— 中文识别器（中英混排主力）——
        Text zh = recognize(bmp, false);
        if (zh == null) {
            bmp.recycle();
            return null;
        }
        Text best = zh;
        Bitmap bestBmp = bmp;
        String text = layout(zh, bmp.getWidth(), notes);
        double score = quality(zh);
        int chars = contentScore(text);

        // —— 方向自检：有效字符过少 → 旋转 90/180/270 重试，显著更优才采用 ——
        if (chars < MIN_CHARS_BEFORE_ROTATE) {
            for (int deg : new int[]{90, 180, 270}) {
                Bitmap rb = rotate(bmp, deg);
                Text t = recognize(rb, false);
                if (t == null) {
                    rb.recycle();
                    continue;
                }
                String s = layout(t, rb.getWidth(), null);
                int sc = contentScore(s);
                double q = quality(t);
                if (sc > chars && q > score * 1.5) { // 需显著优于当前结果，防噪声误切
                    if (bestBmp != bmp) bestBmp.recycle();
                    bestBmp = rb;
                    best = t;
                    text = s;
                    score = q;
                    chars = sc;
                    note(notes, "方向纠正：旋转 " + deg + "° 采用");
                } else {
                    rb.recycle();
                }
            }
        }

        // —— 纯英文页面 → Latin 识别器重跑（字母/空格/标点精度更高）——
        if (latinRatio(text) >= LATIN_RERUN_RATIO && countLatin(text) >= 40) {
            Text la = recognize(bestBmp, true);
            if (la != null) {
                String s = layout(la, bestBmp.getWidth(), null);
                int sc = contentScore(s);
                double q = quality(la);
                if (sc >= chars * 8 / 10 && q >= score * 0.8) {
                    best = la;
                    text = s;
                    score = q;
                    chars = sc;
                    note(notes, "Latin 识别器重跑采用");
                }
            }
        }

        int imgW = bmp.getWidth(), imgH = bmp.getHeight();
        if (bestBmp != bmp) bestBmp.recycle();
        bmp.recycle();

        dumpDebug(ctx, best, imgW, imgH, notes, text);
        return text;
    }

    /* ================= 加载：EXIF 方向 + 分辨率优化 ================= */

    private static Bitmap load(Context ctx, Uri uri) {
        Bitmap b;
        try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
            b = BitmapFactory.decodeStream(in);
        } catch (Exception e) {
            return null;
        }
        if (b == null) return null;

        int rot = readExifRotation(ctx, uri); // 拍摄元数据方向（JPEG）
        if (rot != 0) {
            Matrix m = new Matrix();
            m.postRotate(rot);
            Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            if (r != b) b.recycle();
            b = r;
        }

        int maxSide = Math.max(b.getWidth(), b.getHeight());
        if (maxSide > MAX_SIDE) {
            float s = (float) MAX_SIDE / maxSide;
            Bitmap r = Bitmap.createScaledBitmap(
                    b, Math.round(b.getWidth() * s), Math.round(b.getHeight() * s), true);
            if (r != b) b.recycle();
            b = r;
        }
        return b;
    }

    private static int readExifRotation(Context ctx, Uri uri) {
        try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
            ExifInterface e = new ExifInterface(in);
            int o = e.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (o == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (o == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (Exception ignored) { }
        return 0;
    }

    private static Bitmap rotate(Bitmap b, int deg) {
        Matrix m = new Matrix();
        m.postRotate(deg);
        return Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
    }

    /* ================= 预处理（v0.8.9 暂未启用，保留供后续 A/B 验证） ================= */

    /** 灰度 → 光照场平坦化 → 1%/99% 分位拉伸。v0.8.8 曾无条件启用，疑似伤害
        英文识别且从未经实测对比 —— v0.8.9 起不再调用，待后续版本以
        「原图 vs 预处理图」识别质量自动取优的方式重新验证后才可能启用 */
    private static Bitmap preprocess(Bitmap src) {
        final int w = src.getWidth(), h = src.getHeight(), n = w * h;

        int[] px = new int[n];
        src.getPixels(px, 0, w, 0, 0, w, h);
        int[] gray = new int[n];
        for (int i = 0; i < n; i++) {
            int p = px[i];
            gray[i] = ((p >> 16 & 0xFF) * 299 + (p >> 8 & 0xFF) * 587 + (p & 0xFF) * 114) / 1000;
        }
        px = null;

        // 光照场估计：强下采样 + 平滑放大（低频分量 = 背景亮度分布）
        int[] cw = new int[n];
        for (int i = 0; i < n; i++) {
            int v = gray[i];
            cw[i] = 0xFF000000 | (v << 16) | (v << 8) | v;
        }
        Bitmap gb = Bitmap.createBitmap(cw, w, h, Bitmap.Config.ARGB_8888);
        cw = null;
        Bitmap small = Bitmap.createScaledBitmap(gb, Math.max(2, w / BG_SAMPLE_DIV), Math.max(2, h / BG_SAMPLE_DIV), true);
        gb.recycle();
        Bitmap bgB = Bitmap.createScaledBitmap(small, w, h, true);
        small.recycle();
        int[] bgPx = new int[n];
        bgB.getPixels(bgPx, 0, w, 0, 0, w, h);
        bgB.recycle();

        // 平坦化：pixel / background 归一（阴影区文字对比度恢复）+ 直方图
        int[] flat = new int[n];
        int[] hist = new int[256];
        for (int i = 0; i < n; i++) {
            int bg = (bgPx[i] >> 8) & 0xFF;
            int v = gray[i] * 255 / Math.max(bg, 30);
            if (v > 255) v = 255;
            flat[i] = v;
            hist[v]++;
        }
        gray = null;
        bgPx = null;

        // 1% / 99% 分位线性拉伸（对比度增强）
        int lo = 0, hi = 255;
        long acc = 0, lowCut = n / 100;
        for (int v = 0; v < 255; v++) { acc += hist[v]; if (acc > lowCut) { lo = v; break; } }
        acc = 0;
        long highCut = n / 100;
        for (int v = 255; v > 0; v--) { acc += hist[v]; if (acc > highCut) { hi = v; break; } }
        if (hi <= lo) { lo = 0; hi = 255; }

        int range = Math.max(1, hi - lo);
        int[] out = new int[n];
        for (int i = 0; i < n; i++) {
            int v = (flat[i] - lo) * 255 / range;
            if (v > 255) v = 255; else if (v < 0) v = 0;
            out[i] = 0xFF000000 | (v << 16) | (v << 8) | v;
        }
        return Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888);
    }

    /* ================= 识别（同步等待，后台线程调用） ================= */

    private static Text recognize(Bitmap bmp, boolean latin) {
        try {
            TextRecognizer r = latin
                    ? TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                    : TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            Text t = Tasks.await(r.process(InputImage.fromBitmap(bmp, 0)), 30, TimeUnit.SECONDS);
            r.close();
            return t;
        } catch (Exception e) {
            return null;
        }
    }

    /* ================= 阅读顺序重排（ML Kit 原生结构为准） ================= */

    private static final class LineItem {
        final Rect box;
        final String text;
        LineItem(Rect box, String text) { this.box = box; this.text = text; }
    }

    private static final class BlockItem {
        final Rect box;
        final List<LineItem> lines = new ArrayList<>();
        BlockItem(Rect box) { this.box = box; }
    }

    /** 阅读顺序重排：块级排序（top 优先 + 保守双栏检测），行边界与行内文本
        完全采用 ML Kit 原生结果 —— 不跨块聚类行、不从坐标重建空格 */
    private static String layout(Text text, int pageW, List<String> notes) {
        List<BlockItem> blocks = new ArrayList<>();
        List<LineItem> allLines = new ArrayList<>();
        for (Text.TextBlock block : text.getTextBlocks()) {
            Rect br = block.getBoundingBox();
            if (br == null) return legacyJoin(text); // 无坐标信息 → 回退检测顺序
            BlockItem bi = new BlockItem(new Rect(br));
            for (Text.Line line : block.getLines()) {
                Rect lr = line.getBoundingBox();
                if (lr == null) return legacyJoin(text);
                String s = lineText(line);
                if (s.isEmpty()) continue;
                LineItem li = new LineItem(new Rect(lr), s);
                bi.lines.add(li);
                allLines.add(li);
            }
            if (!bi.lines.isEmpty()) blocks.add(bi);
        }
        if (blocks.isEmpty()) return "";
        int medianH = medianHeight(allLines);

        // 保守双栏检测：仅调整块的阅读顺序（先左栏后右栏），绝不重组行
        int splitX = detectColumnSplit(allLines, pageW);
        List<BlockItem> ordered = new ArrayList<>();
        if (splitX > 0) {
            List<BlockItem> left = new ArrayList<>(), right = new ArrayList<>();
            for (BlockItem b : blocks) (b.box.centerX() < splitX ? left : right).add(b);
            sortByTop(left);
            sortByTop(right);
            ordered.addAll(left);
            ordered.add(null); // 栏分隔标记 → 强制段落分隔
            ordered.addAll(right);
            note(notes, "双栏重排（分界 x=" + splitX + "，左 " + left.size()
                    + " 块 / 右 " + right.size() + " 块）");
        } else {
            sortByTop(blocks);
            ordered.addAll(blocks);
        }
        return joinBlocks(ordered, medianH);
    }

    private static void sortByTop(List<BlockItem> list) {
        Collections.sort(list, Comparator.comparingInt((BlockItem b) -> b.box.top)
                .thenComparingInt(b -> b.box.left));
    }

    /** 行文本：直接采用 ML Kit line.getText()（词间空格由引擎给出）；
        仅对「整行英文长串无任何空格」的病态输出用元素间隙做保守空格修复 */
    private static String lineText(Text.Line line) {
        String s = line.getText();
        if (s == null) return "";
        s = s.trim();
        if (s.isEmpty()) return "";
        if (hasSpacelessLatinRun(s)) {
            String fixed = repairSpaces(line);
            if (fixed != null) s = fixed;
        }
        return s;
    }

    /** 是否含连续 ≥8 个拉丁字母且无空格的片段（中文识别器偶发丢失英文词间空格） */
    private static boolean hasSpacelessLatinRun(String s) {
        int run = 0;
        for (int i = 0; i < s.length(); i++) {
            run = isLatin(s.charAt(i)) ? run + 1 : 0;
            if (run >= 8) return true;
        }
        return false;
    }

    /** 保守空格修复：元素按 x 排序重建，间隙 > 0.15×行高补空格；
        元素无坐标/仅一个/修复后有效字符变少 → 一律返回 null 保留原文（绝不更差） */
    private static String repairSpaces(Text.Line line) {
        List<Text.Element> els = line.getElements();
        if (els == null || els.size() < 2) return null;
        for (Text.Element e : els) if (e.getBoundingBox() == null) return null;
        Rect lb = line.getBoundingBox();
        int h = lb != null && lb.height() > 4 ? lb.height() : 24;
        List<Text.Element> sorted = new ArrayList<>(els);
        Collections.sort(sorted, Comparator.comparingInt(e -> e.getBoundingBox().left));
        StringBuilder sb = new StringBuilder();
        Rect prev = null;
        for (Text.Element e : sorted) {
            Rect r = e.getBoundingBox();
            if (prev != null && r.left - prev.right > h * 3 / 20) sb.append(' ');
            sb.append(e.getText());
            prev = r;
        }
        String out = sb.toString().trim();
        return contentScore(out) >= contentScore(line.getText()) ? out : null;
    }

    /** 双栏检测（保守）：行级 x 投影找「空白带」（允许 ≤12.5% 的行跨越，如全宽标题）；
        带需 ≥15% 页宽、不贴边、两侧各 ≥4 行 —— 仅用于块级排序，不重组行 */
    private static int detectColumnSplit(List<LineItem> lines, int pageW) {
        if (lines.size() < 8 || pageW <= 0) return 0;
        final int BINS = 48;
        int[] occ = new int[BINS];
        for (LineItem l : lines) {
            int b0 = Math.max(0, Math.min(BINS - 1, (int) ((long) l.box.left * BINS / pageW)));
            int b1 = Math.max(0, Math.min(BINS - 1, (int) ((long) l.box.right * BINS / pageW)));
            for (int b = b0; b <= b1; b++) occ[b]++;
        }
        int allow = Math.max(1, lines.size() / 8);
        int bestLen = 0, bestStart = -1, i = 0;
        while (i < BINS) {
            if (occ[i] <= allow) {
                int j = i;
                while (j < BINS && occ[j] <= allow) j++;
                if (i > 2 && j < BINS - 2 && j - i > bestLen) { bestLen = j - i; bestStart = i; }
                i = j;
            } else {
                i++;
            }
        }
        if (bestStart < 0 || bestLen < 8) return 0; // 带宽不足 ~15% 页宽 → 不判双栏
        int splitX = (bestStart + bestLen / 2) * pageW / BINS;
        int lc = 0, rc = 0;
        for (LineItem l : lines) { if (l.box.centerX() < splitX) lc++; else rc++; }
        if (lc < 4 || rc < 4) return 0; // 误检保护：两栏都须有足够内容
        return splitX;
    }

    /** 块/行 → 文本：行内即 ML Kit 原生行；同块行间 '\n'，跨块按行间距判定
        段落（>0.6×中位行高 → '\n\n'）或换行；英文行尾连字符断词合并 */
    private static String joinBlocks(List<BlockItem> ordered, int medianH) {
        StringBuilder sb = new StringBuilder();
        LineItem prev = null;
        boolean blockStart = true;
        for (BlockItem b : ordered) {
            if (b == null) { // 栏分隔标记：强制新段落
                if (sb.length() > 0) sb.append("\n\n");
                prev = null;
                blockStart = true;
                continue;
            }
            for (LineItem cur : b.lines) {
                if (prev != null) {
                    int vgap = cur.box.top - prev.box.bottom;
                    boolean para = blockStart && vgap > medianH * 6 / 10;
                    boolean hyphen = !para
                            && prev.text.length() >= 2 && prev.text.endsWith("-")
                            && isLatin(prev.text.charAt(prev.text.length() - 2))
                            && !cur.text.isEmpty() && isLatin(cur.text.charAt(0));
                    if (para) {
                        sb.append("\n\n");
                    } else if (hyphen) {
                        sb.setLength(sb.length() - 1); // 去连字符直接拼接断词
                    } else {
                        sb.append('\n');
                    }
                }
                sb.append(cur.text);
                prev = cur;
                blockStart = false;
            }
            blockStart = true;
        }
        return sb.toString()
                .replaceAll("[ \t]+", " ")
                .replaceAll(" ?\n ?", "\n")
                .trim();
    }

    private static boolean isLatin(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }

    private static int medianHeight(List<LineItem> lines) {
        int[] hs = new int[lines.size()];
        for (int i = 0; i < hs.length; i++) hs[i] = Math.max(4, lines.get(i).box.height());
        Arrays.sort(hs);
        return Math.max(8, hs[hs.length / 2]);
    }

    /** 无坐标兜底：按 ML Kit 检测顺序输出（块间空行分隔） */
    private static String legacyJoin(Text text) {
        StringBuilder sb = new StringBuilder();
        for (Text.TextBlock block : text.getTextBlocks()) {
            StringBuilder lb = new StringBuilder();
            for (Text.Line line : block.getLines()) {
                String s = line.getText().trim();
                if (s.isEmpty()) continue;
                if (lb.length() > 0) lb.append('\n');
                lb.append(s);
            }
            if (lb.length() == 0) continue;
            if (sb.length() > 0) sb.append("\n\n");
            sb.append(lb);
        }
        return sb.toString();
    }

    /* ================= 诊断记录（A 引擎原始结果 / B 后处理结果） ================= */

    /** 每次 OCR 写一份诊断文件到 getExternalFilesDir("ocr_debug")（免权限、
        系统文件管理器可读），并输出 Logcat（tag VH_OCR）——用于区分问题发生在
        引擎识别层还是后处理层；C 级（阅读器显示）即 Knowledge 阅读页本身 */
    private static void dumpDebug(Context ctx, Text best, int imgW, int imgH,
                                  List<String> notes, String finalText) {
        try {
            File dir = ctx.getExternalFilesDir("ocr_debug");
            if (dir == null) return;
            String ts = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
            File f = new File(dir, "ocr_" + ts + ".txt");

            StringBuilder sb = new StringBuilder(64 * 1024);
            sb.append("VocabHit OCR 诊断文件\n");
            sb.append("时间：").append(ts).append('\n');
            sb.append("输入图片：").append(imgW).append('x').append(imgH).append('\n');
            sb.append("管线决策：").append(notes.isEmpty()
                    ? "默认路径（中文识别器，无图像预处理）"
                    : TextUtils.join(" | ", notes)).append('\n');
            sb.append("最终文本有效字符：").append(contentScore(finalText)).append("\n\n");

            sb.append("======== A. OCR 引擎原始结果（ML Kit block/line 结构） ========\n");
            int bi = 0;
            for (Text.TextBlock block : best.getTextBlocks()) {
                sb.append("[Block ").append(bi++).append("] box=")
                        .append(rectStr(block.getBoundingBox())).append('\n');
                int li = 0;
                for (Text.Line line : block.getLines()) {
                    sb.append("  [Line ").append(li++).append("] conf=")
                            .append(String.format(Locale.US, "%.2f", line.getConfidence()))
                            .append(" angle=").append(String.format(Locale.US, "%.1f", line.getAngle()))
                            .append(" box=").append(rectStr(line.getBoundingBox()))
                            .append(" text=").append(line.getText()).append('\n');
                }
            }
            sb.append("\n======== B. 后处理结果（OcrParser 输出 = 传入 Knowledge 阅读器） ========\n");
            sb.append(finalText).append('\n');

            Writer w = new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8);
            try {
                w.write(sb.toString());
            } finally {
                w.close();
            }
            Log.i(TAG, "OCR 完成：最终 " + contentScore(finalText) + " 有效字符；诊断文件 " + f.getAbsolutePath());
        } catch (Exception e) {
            Log.w(TAG, "诊断文件写入失败：" + e.getMessage());
        }
    }

    private static String rectStr(Rect r) {
        return r == null ? "null" : (r.left + "," + r.top + "-" + r.right + "," + r.bottom);
    }

    private static void note(List<String> notes, String msg) {
        if (notes != null) notes.add(msg);
    }

    /* ================= 统计工具 ================= */

    private static int contentScore(String s) {
        int c = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (isLatin(ch) || (ch >= '0' && ch <= '9') || (ch >= 0x4E00 && ch <= 0x9FFF)) c++;
        }
        return c;
    }

    private static int countLatin(String s) {
        int c = 0;
        for (int i = 0; i < s.length(); i++) if (isLatin(s.charAt(i))) c++;
        return c;
    }

    private static double latinRatio(String s) {
        int la = 0, cj = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (isLatin(ch)) la++;
            else if (ch >= 0x4E00 && ch <= 0x9FFF) cj++;
        }
        return (la + cj) == 0 ? 0 : (double) la / (la + cj);
    }

    /** 质量度量：Σ(行有效字符 × 行置信度)；置信度缺失时该行按纯字符计 */
    private static double quality(Text t) {
        if (t == null) return 0;
        double q = 0;
        for (Text.TextBlock block : t.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                int c = contentScore(line.getText());
                if (c == 0) continue;
                float conf = line.getConfidence();
                q += conf > 0 ? c * conf : c;
            }
        }
        return q;
    }
}
