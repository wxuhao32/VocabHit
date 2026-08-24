package com.wxh.vocabulary;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Xml;

import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import com.tom_roush.pdfbox.text.TextPosition;

import org.xmlpull.v1.XmlPullParser;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Knowledge 模块 — 学习文档解析器（独立新增类，不依赖项目任何既有类）。
 *
 * 职责：把用户选择的文档忠实转换为「统一文档模型」文本（行首控制字符标记结构），
 * 尽最大可能保留标题/正文/中英文/数字/标点/段落/空行/表格/阅读顺序，
 * 不增删改任何原文文字。
 *
 * - .docx：本质是 ZIP，正文位于 word/document.xml；XmlPullParser 流式提取
 *          w:p(段落) / w:t(文本) / w:tab / w:br，段落以 \n 分隔，空段落保留为空行。
 * - .txt ：BOM 探测(UTF-8/UTF-16) → UTF-8 严格校验 → GBK 回退。
 * - .md  ：按纯文本读出原文，结构化转换由前端 mdToDocModel 统一完成（双路径一致）。
 * - .pdf ：PDFBox 提取自带文本层（绝不盲目 OCR）→ 行聚类 + 双栏阅读顺序重排 +
 *          空格重建 + 标题/表格/段落识别 → 统一模型；无文本层（扫描版/图片型）
 *          返回 PDF_SCAN，由 MainActivity 转 PdfRenderer + ML Kit OCR 链路。
 * - .doc(旧版二进制)：明确报错（宁可诚实失败，不产出乱码）。
 */
public final class DocumentParser {

    /** 扫描版 PDF 标记：无文本层，调用方（MainActivity）转 OCR 链路处理 */
    public static final String ERR_PDF_SCAN = "PDF_SCAN";

    /** 解析结果：ok=true 时 text 有效；ok=false 时 error 为用户可读原因 */
    public static final class Result {
        public final boolean ok;
        public final String text;
        public final String error;

        private Result(boolean ok, String text, String error) {
            this.ok = ok;
            this.text = text;
            this.error = error;
        }

        static Result ok(String text) { return new Result(true, text, null); }

        static Result err(String error) { return new Result(false, null, error); }
    }

    private static final String MIME_DOCX =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String MIME_TXT = "text/plain";
    private static final String MIME_PDF = "application/pdf";

    private DocumentParser() { }

    /** 入口：依据文件名 / MIME / 内容嗅探选择解析策略 */
    public static Result parse(ContentResolver cr, Uri uri) {
        String name = displayName(cr, uri);
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        String mime = null;
        try { mime = cr.getType(uri); } catch (Exception ignored) { }

        boolean docx = lower.endsWith(".docx") || MIME_DOCX.equals(mime);
        boolean md = lower.endsWith(".md") || lower.endsWith(".markdown")
                || lower.endsWith(".mdown") || lower.endsWith(".mkd")
                || "text/markdown".equals(mime) || "text/x-markdown".equals(mime);
        boolean pdf = lower.endsWith(".pdf") || MIME_PDF.equals(mime);
        boolean txt = lower.endsWith(".txt") || MIME_TXT.equals(mime);

        InputStream in = null;
        try {
            in = cr.openInputStream(uri);
            if (!(in instanceof BufferedInputStream)) in = new BufferedInputStream(in);

            if (docx) return parseDocx(in);
            if (md) return parseTxt(in); // 原文返回：结构化在前端 ingestParseResult 统一完成
            if (pdf) return parsePdf(in);
            if (txt) return parseTxt(in);
            if (lower.endsWith(".doc"))
                return Result.err("暂不支持旧版 .doc，请在 Word 中「另存为 .docx」后重试");

            // 无扩展名/未知类型：按内容嗅探 —— ZIP 魔数 PK→docx；%PDF→pdf；否则按纯文本尝试
            in.mark(5);
            byte[] head = new byte[5];
            int n = in.read(head);
            in.reset();
            if (n >= 2 && (head[0] & 0xFF) == 0x50 && (head[1] & 0xFF) == 0x4B) {
                return parseDocx(in);
            }
            if (n >= 4 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F') {
                return parsePdf(in);
            }
            return parseTxt(in);
        } catch (IOException e) {
            return Result.err("无法读取文件：" + e.getMessage());
        } catch (Exception e) {
            return Result.err("解析失败：" + e.getMessage());
        } finally {
            try { if (in != null) in.close(); } catch (IOException ignored) { }
        }
    }

    /* ---------- .docx ---------- */

    private static Result parseDocx(InputStream raw) throws Exception {
        ZipInputStream zin = new ZipInputStream(raw);
        ZipEntry entry;
        while ((entry = zin.getNextEntry()) != null) {
            if ("word/document.xml".equals(entry.getName())) {
                String text = documentXmlToText(zin);
                if (text.trim().isEmpty()) return Result.err("文档中没有可提取的文字内容");
                return Result.ok(text);
            }
        }
        return Result.err("不是有效的 .docx 文档（缺少正文）");
    }

    /**
     * 流式提取 document.xml 文本。
     * w:p 结束 → 追加换行（空段落自然形成空行）；w:t 内文字原样保留；
     * w:tab → \t；w:br / w:cr → \n。绝不改写、重排或合并用户原文。
     *
     * 标题层级保留：检测 w:pStyle 的 val（如 Heading1 / 标题 1 / 1），
     * 在对应段落文本前 prepend 单字节标记（\u0001=H1、\u0002=H2、\u0003=H3），
     * 前端 renderReaderText 据此渲染为 h1/h2/h3，不破坏原文文字本身。
     */
    private static String documentXmlToText(InputStream in) throws Exception {
        XmlPullParser p = Xml.newPullParser();
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true);
        p.setInput(in, null); // XML 声明自带编码
        StringBuilder out = new StringBuilder();
        StringBuilder para = new StringBuilder();
        boolean inText = false; // 位于 <w:t> 内
        String paraMarker = ""; // 当前段落对应的标题标记（空串 = 普通段落）
        // 表格状态跟踪
        boolean inTable = false;  // 位于 <w:tbl> 内
        boolean inCell = false;   // 位于 <w:tc> 内
        StringBuilder tblRow = new StringBuilder(); // 当前行内容（cell1\u0007cell2\u0007...）
        int ev = p.getEventType();
        while (ev != XmlPullParser.END_DOCUMENT) {
            if (ev == XmlPullParser.START_TAG) {
                String tag = p.getName();
                if ("tbl".equals(tag)) {
                    inTable = true;
                } else if ("tc".equals(tag)) {
                    inCell = true;
                } else if ("p".equals(tag)) {
                    paraMarker = ""; // 新段落：重置样式标记
                } else if ("pStyle".equals(tag)) {
                    String val = p.getAttributeValue(
                            "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "val");
                    if (val == null) val = p.getAttributeValue(null, "val");
                    if (val != null) {
                        String v = val.toLowerCase(Locale.ROOT).replace(" ", "");
                        if ("heading1".equals(v) || "\u6807\u98981".equals(v) || "1".equals(v)) {
                            paraMarker = "\u0001";
                        } else if ("heading2".equals(v) || "\u6807\u98982".equals(v) || "2".equals(v)) {
                            paraMarker = "\u0002";
                        } else if ("heading3".equals(v) || "\u6807\u98983".equals(v) || "3".equals(v)) {
                            paraMarker = "\u0003";
                        }
                    }
                } else if ("t".equals(tag) || "instrText".equals(tag)) {
                    inText = true;
                } else if ("tab".equals(tag) || "ptab".equals(tag)) {
                    para.append('\t');
                } else if ("br".equals(tag) || "cr".equals(tag)) {
                    para.append('\n');
                }
            } else if (ev == XmlPullParser.TEXT && inText) {
                para.append(p.getText());
            } else if (ev == XmlPullParser.END_TAG) {
                String tag = p.getName();
                if ("t".equals(tag) || "instrText".equals(tag)) {
                    inText = false;
                } else if ("p".equals(tag)) {
                    if (inCell) {
                        // 单元格内段落：将 \n（含 <w:br>/<w:cr>）替换为 \u001E，避免破坏表格行分割
                        String cellPara = para.toString().replace('\n', '\u001E');
                        if (tblRow.length() > 0 && tblRow.charAt(tblRow.length() - 1) != '\u0007')
                            tblRow.append('\u001E'); // 多段落间分隔
                        tblRow.append(cellPara);
                    } else {
                        out.append(paraMarker).append(para).append('\n');
                    }
                    para.setLength(0);
                    paraMarker = "";
                } else if ("tc".equals(tag)) {
                    inCell = false;
                    tblRow.append('\u0007'); // 单元格分隔符
                } else if ("tr".equals(tag)) {
                    // 行结束：输出表格行（\u0006 前缀）
                    if (tblRow.length() > 0 && tblRow.charAt(tblRow.length() - 1) == '\u0007')
                        tblRow.setLength(tblRow.length() - 1); // 去掉末尾多余分隔符
                    out.append('\u0006').append(tblRow).append('\n');
                    tblRow.setLength(0);
                } else if ("tbl".equals(tag)) {
                    inTable = false;
                }
            }
            ev = p.next();
        }
        if (para.length() > 0) out.append(para); // 文档末尾无 </w:p> 收尾的兜底
        return out.toString();
    }

    /* ---------- .txt ---------- */

    private static Result parseTxt(InputStream raw) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = raw.read(buf)) != -1) bos.write(buf, 0, n);
        String text = decodeText(bos.toByteArray());
        if (text.trim().isEmpty()) return Result.err("文件中没有文字内容");
        return Result.ok(text);
    }

    /** 编码探测：BOM(UTF-8/UTF-16LE/BE) → UTF-8 严格校验 → GBK 回退 → UTF-8 宽容 */
    static String decodeText(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF)
            return new String(b, 3, b.length - 3, StandardCharsets.UTF_8);
        if (b.length >= 2 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xFE)
            return new String(b, 2, b.length - 2, StandardCharsets.UTF_16LE);
        if (b.length >= 2 && (b[0] & 0xFF) == 0xFE && (b[1] & 0xFF) == 0xFF)
            return new String(b, 2, b.length - 2, StandardCharsets.UTF_16BE);
        if (isStrictUtf8(b)) return new String(b, StandardCharsets.UTF_8);
        try {
            return new String(b, "GBK"); // 中文 Windows 记事本常见编码
        } catch (Exception e) {
            return new String(b, StandardCharsets.UTF_8);
        }
    }

    /** UTF-8 严格解码校验（含 GBK 双字节中文时必然失败 → 触发回退） */
    private static boolean isStrictUtf8(byte[] b) {
        try {
            CharsetDecoder d = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            d.decode(ByteBuffer.wrap(b));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /* ---------- .pdf（PDFBox 文本层 → 统一文档模型） ----------
       原则：绝不盲目 OCR —— 只有无文本层（扫描版/图片型）才返回 PDF_SCAN 转 OCR。
       管线：字符级坐标收集 → y 聚类成行（行内 x 排序 + 词间空格重建）
       → x 投影双栏检测（左栏读完再右栏，杜绝 A D B E 交错）
       → 标题（字号 ≥1.35×正文中位）/ 表格（连续行列分割点跨行对齐）/ 段落空行识别。 */

    /** PDF 单字符：文字 + 起始 x / 基线 y / 宽度 / 字号 */
    private static final class PdfChar {
        final String s;
        final double x, y, w;
        final float size;
        PdfChar(String s, double x, double y, double w, float size) {
            this.s = s; this.x = x; this.y = y; this.w = w; this.size = size;
        }
    }

    /** PDF 聚类行：文本 + 版式元数据（minX/maxX/基线/最大字号/列分割候选点/分段文本） */
    private static final class PdfRow {
        String text = "";
        double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, y;
        float maxSize = 0;
        final List<Double> splits = new ArrayList<>(); // 行内大间隙位置（表格列边界候选）
        final List<String> cells = new ArrayList<>();  // 按大间隙切分的行内分段（表格单元格）
    }

    private static Result parsePdf(InputStream raw) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = raw.read(buf)) != -1) bos.write(buf, 0, n);
        try (PDDocument doc = PDDocument.load(bos.toByteArray())) {
            int pageCount = doc.getNumberOfPages();
            int pages = Math.min(pageCount, 200); // 超大文档保护
            StringBuilder out = new StringBuilder();
            int totalChars = 0;
            for (int p = 1; p <= pages; p++) {
                final List<PdfChar> chars = new ArrayList<>();
                PDFTextStripper stripper = new PDFTextStripper() {
                    @Override
                    protected void writeString(String text, List<TextPosition> positions) {
                        for (TextPosition tp : positions) {
                            String u = tp.getUnicode();
                            if (u == null || u.isEmpty()) continue;
                            chars.add(new PdfChar(u, tp.getXDirAdj(), tp.getYDirAdj(),
                                    tp.getWidthDirAdj(), tp.getFontSizeInPt()));
                        }
                    }
                };
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                stripper.writeText(doc, new java.io.StringWriter());
                totalChars += chars.size();
                if (p > 1) out.append('\n');
                float pageW = 595f;
                try {
                    PDRectangle box = doc.getPage(p - 1).getCropBox();
                    if (box != null && box.getWidth() > 0) pageW = box.getWidth();
                } catch (Exception ignored) { }
                out.append(pdfPageToDocModel(chars, pageW));
            }
            // 文本层近空 = 扫描版/图片型 PDF → 转逐页 OCR（仅此情况才动用 OCR）
            if (totalChars < Math.max(40, pages * 8)) return Result.err(ERR_PDF_SCAN);
            String text = out.toString();
            if (text.trim().isEmpty()) return Result.err(ERR_PDF_SCAN);
            if (pageCount > pages) text = text + "\n\n（仅解析前 " + pages + " 页）";
            return Result.ok(text);
        } catch (IOException e) {
            return Result.err("PDF 解析失败：" + e.getMessage());
        }
    }

    /** 单页字符集 → 统一模型文本：行聚类 → 双栏重排 → 标题/表格/空行 */
    private static String pdfPageToDocModel(List<PdfChar> chars, float pageW) {
        if (chars.isEmpty()) return "";
        // 1) 行聚类：按 y 从上到下（PDF 用户空间 y 向上，大值在上），基线差 ≤3.5pt 同行
        List<PdfChar> byY = new ArrayList<>(chars);
        byY.sort((a, b) -> Double.compare(b.y, a.y));
        List<List<PdfChar>> rawRows = new ArrayList<>();
        double rowRefY = Double.NaN;
        for (PdfChar c : byY) {
            if (!rawRows.isEmpty() && Math.abs(c.y - rowRefY) <= 3.5) {
                rawRows.get(rawRows.size() - 1).add(c);
                continue;
            }
            List<PdfChar> row = new ArrayList<>();
            row.add(c);
            rawRows.add(row);
            rowRefY = c.y;
        }
        // 2) 行内 x 排序 + 分段（大间隙 = 列边界候选）+ 词间空格重建 + 行元数据
        List<PdfRow> rows = new ArrayList<>();
        for (List<PdfChar> raw : rawRows) {
            raw.sort(Comparator.comparingDouble(c -> c.x));
            List<StringBuilder> segs = new ArrayList<>();
            StringBuilder cur = new StringBuilder();
            for (int k = 0; k < raw.size(); k++) {
                PdfChar c = raw.get(k);
                if (k > 0) {
                    PdfChar prev = raw.get(k - 1);
                    double gap = c.x - (prev.x + prev.w);
                    if (gap > Math.max(prev.size * 1.2, 6.0)) {
                        // 大间隙：新分段（表格列边界候选）；行文本以单空格连接分段
                        segs.add(cur);
                        cur = new StringBuilder();
                    } else if (gap > prev.size * 0.65
                            && isLatinOrDigit(prev.s.charAt(0))
                            && isLatinOrDigit(c.s.charAt(0))
                            && cur.length() > 0 && cur.charAt(cur.length() - 1) != ' ') {
                        // 词间物理空隙兜底重建（多数 PDF 空格本身已是字符，此处仅补丢失场景；
                        // 中文之间不补 —— 中文字距均匀，gap 大是排版不是分词）
                        cur.append(' ');
                    }
                }
                cur.append(c.s);
            }
            segs.add(cur);
            List<String> cells = new ArrayList<>();
            for (StringBuilder s : segs) {
                String t = s.toString().replace("\u00a0", " ").trim();
                if (!t.isEmpty()) cells.add(t);
            }
            if (cells.isEmpty()) continue;
            PdfRow r = new PdfRow();
            r.cells.addAll(cells);
            // 行文本 = 分段以单空格连接（普通行 = 单段；表格行多段 → 与渲染端
            // tr.textContent 语义一致，摘取/来源定位闭环成立）
            r.text = join(" ", cells);
            r.y = raw.get(0).y;
            for (PdfChar c : raw) {
                r.minX = Math.min(r.minX, c.x);
                r.maxX = Math.max(r.maxX, c.x + c.w);
                r.maxSize = Math.max(r.maxSize, c.size);
            }
            // 列分割候选点 = 各分段（首段除外）起始字符的真实 x（表格列对齐判定用）
            for (int k = 0; k < raw.size(); k++) {
                if (k == 0) continue;
                PdfChar c = raw.get(k);
                PdfChar prev = raw.get(k - 1);
                if (c.x - (prev.x + prev.w) > Math.max(prev.size * 1.2, 6.0)) {
                    r.splits.add(c.x);
                }
            }
            rows.add(r);
        }
        if (rows.isEmpty()) return "";

        // 3) 双栏检测与重排：x 投影找竖直空白带 → 左栏全部行读完再右栏
        List<PdfRow> ordered = reorderColumns(rows, pageW);

        // 4) 字号中位（正文主导）与行距中位（空行判定基准）
        double medianSize = medianCharSize(chars);
        double medianGap = medianRowGap(ordered);

        // 5) 结构化输出：表格组 / 标题 / 空行
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < ordered.size()) {
            PdfRow r = ordered.get(i);
            // 表格：连续 ≥3 行列分割点数量一致且逐点对齐（±4pt）
            int tblEnd = tableRunEnd(ordered, i);
            if (tblEnd > i) {
                if (out.length() > 0) out.append('\n'); // 表格前空行（与正文分隔）
                for (int k = i; k <= tblEnd; k++) out.append('\u0006')
                        .append(tableRowText(ordered, i, tblEnd, k)).append('\n');
                out.append('\n'); // 表格后空行
                i = tblEnd + 1;
                continue;
            }
            // 空行判定：与上一行基线差 > 1.7×中位行距 → 段落分隔（空行）；
            // 基线差为负（当前行反而在上一行上方）→ 双栏换栏/阅读顺序跳变，同样分隔
            if (i > 0) {
                double gap = ordered.get(i - 1).y - r.y;
                if (gap > medianGap * 1.7 || gap < -medianGap) out.append('\n');
            }
            if (r.text.length() <= 80) {
                if (r.maxSize >= medianSize * 1.9) out.append('\u0001');
                else if (r.maxSize >= medianSize * 1.6) out.append('\u0002');
                else if (r.maxSize >= medianSize * 1.35) out.append('\u0003');
            }
            out.append(r.text).append('\n');
            i++;
        }
        return out.toString();
    }

    /** 双栏重排：竖直空白带检测（x 投影，行 box 覆盖计数）。
        命中 → 左栏（centerX < 分界）全部行按 y 降序 + 强制空行 + 右栏行；
        未命中 → 全部行 y 降序。绝不重组行内文字，只调整行序。 */
    private static List<PdfRow> reorderColumns(List<PdfRow> rows, float pageW) {
        List<PdfRow> ordered = new ArrayList<>(rows);
        if (rows.size() < 8 || pageW <= 0) return ordered;
        final int BINS = 48;
        int[] occ = new int[BINS];
        for (PdfRow r : rows) {
            int b0 = clampBin((int) (r.minX * BINS / pageW), BINS);
            int b1 = clampBin((int) (r.maxX * BINS / pageW), BINS);
            for (int b = b0; b <= b1; b++) occ[b]++;
        }
        int allow = Math.max(1, rows.size() / 8); // 允许少量全宽行（标题）跨越
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
        if (bestStart < 0 || bestLen < 8) return ordered; // 空白带 < ~15% 页宽 → 不判双栏
        double splitX = (bestStart + bestLen / 2.0) * pageW / BINS;
        List<PdfRow> left = new ArrayList<>(), right = new ArrayList<>();
        for (PdfRow r : rows) {
            ((r.minX + r.maxX) / 2 < splitX ? left : right).add(r);
        }
        if (left.size() < 4 || right.size() < 4) return ordered; // 误检保护：两栏都要有内容
        Comparator<PdfRow> byTop = (a, b) -> Double.compare(b.y, a.y);
        left.sort(byTop);
        right.sort(byTop);
        ordered = new ArrayList<>(left.size() + right.size());
        ordered.addAll(left);
        ordered.addAll(right); // 页级连续输出，行间空行由第 5 步基线差判定（跨栏 gap 大 → 空行）
        return ordered;
    }

    /** 表格组结束行（含）：行 i 起连续行 splits 数一致且逐点对齐；不成组返回 i-1 */
    private static int tableRunEnd(List<PdfRow> rows, int i) {
        PdfRow base = rows.get(i);
        if (base.splits.size() < 2 || i + 2 >= rows.size()) return i - 1; // ≥2 分割点且 ≥3 行
        if (!splitsAligned(base, rows.get(i + 1)) || !splitsAligned(base, rows.get(i + 2)))
            return i - 1;
        int j = i + 2;
        while (j + 1 < rows.size() && splitsAligned(base, rows.get(j + 1))) j++;
        return j;
    }

    /** 两行列分割点数量一致且逐点对齐（±4pt） */
    private static boolean splitsAligned(PdfRow a, PdfRow b) {
        if (a.splits.size() != b.splits.size()) return false;
        for (int k = 0; k < a.splits.size(); k++) {
            if (Math.abs(a.splits.get(k) - b.splits.get(k)) > 4.0) return false;
        }
        return true;
    }

    /** 表格行 k 文本：单元格分段已在大间隙聚类时捕获（row.cells），
        直接以 \u0007 分隔逐格输出（列结构由调用方的跨行对齐校验保证） */
    private static String tableRowText(List<PdfRow> rows, int start, int end, int k) {
        return join("\u0007", rows.get(k).cells);
    }

    private static int clampBin(int b, int bins) {
        return Math.max(0, Math.min(bins - 1, b));
    }

    /** 以分隔符连接字符串列表（空列表 → 空串） */
    private static String join(String sep, List<String> parts) {
        if (parts == null || parts.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(parts.get(i));
        }
        return sb.toString();
    }

    private static boolean isLatinOrDigit(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
    }

    /** 字符级字号中位（正文主导，标题判定基准） */
    private static double medianCharSize(List<PdfChar> chars) {
        float[] sizes = new float[chars.size()];
        for (int i = 0; i < sizes.length; i++) sizes[i] = chars.get(i).size;
        Arrays.sort(sizes);
        return Math.max(1f, sizes[sizes.length / 2]);
    }

    /** 行距中位（相邻行基线差，空行判定基准） */
    private static double medianRowGap(List<PdfRow> rows) {
        if (rows.size() < 2) return 14;
        double[] gaps = new double[rows.size() - 1];
        for (int i = 1; i < rows.size(); i++) gaps[i - 1] = Math.abs(rows.get(i - 1).y - rows.get(i).y);
        Arrays.sort(gaps);
        return Math.max(4, gaps[gaps.length / 2]);
    }

    /* ---------- 工具 ---------- */

    private static String displayName(ContentResolver cr, Uri uri) {
        Cursor c = null;
        try {
            c = cr.query(uri, null, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) try { c.close(); } catch (Exception ignored) { }
        }
        return uri.getLastPathSegment();
    }
}
