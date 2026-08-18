package com.wxh.vocabulary;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Knowledge 模块 — 学习文档解析器（独立新增类，不依赖项目任何既有类）。
 *
 * 职责：把用户选择的文档忠实转换为纯文本，尽最大可能保留
 * 标题/正文/中英文/数字/标点/段落/空行，不增删改任何原文文字。
 *
 * - .docx：本质是 ZIP，正文位于 word/document.xml；XmlPullParser 流式提取
 *          w:p(段落) / w:t(文本) / w:tab / w:br，段落以 \n 分隔，空段落保留为空行。
 * - .txt ：BOM 探测(UTF-8/UTF-16) → UTF-8 严格校验 → GBK 回退。
 * - .doc(旧版二进制) / .pdf：明确报错（宁可诚实失败，不产出乱码）。
 */
public final class DocumentParser {

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

    private DocumentParser() { }

    /** 入口：依据文件名 / MIME / 内容嗅探选择解析策略 */
    public static Result parse(ContentResolver cr, Uri uri) {
        String name = displayName(cr, uri);
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        String mime = null;
        try { mime = cr.getType(uri); } catch (Exception ignored) { }

        boolean docx = lower.endsWith(".docx") || MIME_DOCX.equals(mime);
        boolean txt = lower.endsWith(".txt") || MIME_TXT.equals(mime);

        InputStream in = null;
        try {
            in = cr.openInputStream(uri);
            if (!(in instanceof BufferedInputStream)) in = new BufferedInputStream(in);

            if (docx) return parseDocx(in);
            if (txt) return parseTxt(in);
            if (lower.endsWith(".doc"))
                return Result.err("暂不支持旧版 .doc，请在 Word 中「另存为 .docx」后重试");
            if (lower.endsWith(".pdf"))
                return Result.err("暂不支持 PDF，请先转换为 .docx 或 .txt");

            // 无扩展名/未知类型：按内容嗅探 —— ZIP 魔数 PK→按 docx；否则按纯文本尝试
            in.mark(4);
            byte[] head = new byte[2];
            int n = in.read(head);
            in.reset();
            if (n == 2 && (head[0] & 0xFF) == 0x50 && (head[1] & 0xFF) == 0x4B) {
                return parseDocx(in);
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
