package com.lobsterai.skillgateway.service.tools;

import com.lobsterai.skillgateway.config.FtpConfig;
import com.lobsterai.skillgateway.dto.FileParseResult;
import com.lobsterai.skillgateway.dto.FileToolResponse;
import com.lobsterai.skillgateway.entity.UserFile;
import com.lobsterai.skillgateway.mapper.UserFileMapper;
import com.lobsterai.skillgateway.service.FileParseService;
import com.lobsterai.skillgateway.service.FileToolService;
import com.lobsterai.skillgateway.service.FileToolConversationContext;
import com.lobsterai.skillgateway.service.FtpFileService;
import com.lobsterai.skillgateway.service.parser.FileParserRouter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.usermodel.Paragraph;
import org.apache.poi.hwpf.usermodel.Range;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Word 文件操作工具（5.3）。
 * <p>
 * 提供 6 个 API：word_read、word_write、word_extract_content、
 * word_search_keyword、word_replace_text、word_template_fill。
 * 所有方法注册到 {@link FileToolService} 的统一调度入口。
 * </p>
 *
 * <h3>JDK 1.8 兼容约束</h3>
 * <ul>
 *   <li>不用 {@code var}、{@code List.of()}、{@code String.formatted()}</li>
 *   <li>不用 {@code switch} 表达式、{@code instanceof} 模式匹配</li>
 *   <li>Map 显式声明泛型 {@code Map<String, Object>}</li>
 *   <li>字符串拼接用 {@code StringBuilder} 或 {@code +}</li>
 * </ul>
 */
@Service
public class WordToolService {

    private static final Logger log = LoggerFactory.getLogger(WordToolService.class);

    /** 关键字搜索上下文：前后各取 N 个字符 */
    private static final int KEYWORD_CONTEXT_CHARS = 50;

    private final FileToolService fileToolService;
    private final FtpFileService ftpFileService;
    private final FileParseService fileParseService;
    private final FileParserRouter parserRouter;
    private final UserFileMapper userFileMapper;
    private final FtpConfig ftpConfig;

    @Autowired
    public WordToolService(FileToolService fileToolService,
                           FtpFileService ftpFileService,
                           FileParseService fileParseService,
                           FileParserRouter parserRouter,
                           UserFileMapper userFileMapper,
                           FtpConfig ftpConfig) {
        this.fileToolService = fileToolService;
        this.ftpFileService = ftpFileService;
        this.fileParseService = fileParseService;
        this.parserRouter = parserRouter;
        this.userFileMapper = userFileMapper;
        this.ftpConfig = ftpConfig;
    }

    /** Spring 启动后自动注册到 FileToolService。 */
    @PostConstruct
    public void registerHandlers() {
        fileToolService.registerHandler("word_read", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return wordRead(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("word_write", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return wordWrite(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("word_extract_content", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return wordExtractContent(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("word_search_keyword", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return wordSearchKeyword(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("word_replace_text", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return wordReplaceText(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("word_template_fill", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return wordTemplateFill(userFile, params, userId);
            }
        });
        log.info("WordToolService registered 6 handlers: word_read/write/extract_content/search_keyword/replace_text/template_fill");
    }

    // ================================================================
    // 5.3.1 word_read — 读 Word 文档全文
    // ================================================================

    /**
     * 读取 Word 文档的全文正文（段落 + 表格内容）。
     *
     * @param userFile 文件实体（已通过 FileRefResolver 解析 + 权限校验）
     * @param params   可选参数：{@code maxParagraphs} 限制返回段落数
     * @param userId   用户 ID
     * @return 全文内容
     */
    public FileToolResponse wordRead(UserFile userFile, Map<String, Object> params, String userId) {
        ensureWordFile(userFile);
        int maxParagraphs = readIntParam(params, "maxParagraphs", Integer.MAX_VALUE);

        try {
            byte[] bytes = downloadBytes(userFile);
            String ext = extractExtension(userFile.getOriginalFileName());
            List<String> paragraphs;
            if ("docx".equals(ext)) {
                paragraphs = readDocxParagraphs(bytes, maxParagraphs);
            } else {
                paragraphs = readDocParagraphs(bytes, maxParagraphs);
            }

            String fullText = joinParagraphs(paragraphs);
            int totalChars = fullText.length();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("fileName", userFile.getOriginalFileName());
            result.put("paragraphCount", paragraphs.size());
            result.put("totalChars", totalChars);
            result.put("paragraphs", paragraphs);
            result.put("fullText", fullText);
            result.put("truncated", totalChars > getTruncationLimit());
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("word_read failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("word_read failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.3.2 word_write — 写 Word 文档
    // ================================================================

    /**
     * 创建一个新的 Word 文档（docx）。**不覆盖原文件**，写入新文件，返回下载链接。
     * <p>
     * params.title — 文档标题（可选）
     * params.content — 段落内容（多行字符串，\n 分隔）
     * </p>
     * <p>
     * 注：fileRef 用于继承原文件的 user_id / context；最终保存为新文件。
     * </p>
     */
    public FileToolResponse wordWrite(UserFile userFile, Map<String, Object> params, String userId) {
        String title = readStringParam(params, "title", "");
        String content = readStringParam(params, "content", "");

        try {
            byte[] bytes = buildDocxBytes(title, content);
            // 写新文件（原文件保持不变），返回新文件 id + 下载链接
            String originalFileName;
            String customName = readStringParam(params, "fileName", null);
            if (customName != null && !customName.trim().isEmpty()) {
                originalFileName = customName.trim();
                if (!originalFileName.toLowerCase().endsWith(".docx") && !originalFileName.toLowerCase().endsWith(".doc")) {
                    originalFileName += ".docx";
                }
            } else if (userFile != null) {
                originalFileName = userFile.getOriginalFileName();
            } else if (title != null && !title.isEmpty()) {
                originalFileName = title + ".docx";
            } else {
                originalFileName = "untitled.docx";
            }
            String fullPath = ftpFileService.uploadFile(userId, originalFileName,
                    new ByteArrayInputStream(bytes));
            String actualFileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);

            UserFile newFile = new UserFile();
            newFile.setUserId(userId);
            newFile.setOriginalFileName(originalFileName);
            newFile.setFileName(actualFileName);
            newFile.setFileSize((long) bytes.length);
            newFile.setFileType("docx");
            newFile.setFtpPath(fullPath);
            newFile.setUploadTime(java.time.LocalDateTime.now());
            newFile.setIsToolGenerated(1);
            newFile.setConversationId(FileToolConversationContext.getConversationId());
            if (userFile != null) {
                newFile.setSourceFileId(userFile.getId());
            }
            userFileMapper.insert(newFile);

            // 写入绝对路径 downloadUrl 到 DB
            String downloadUrl = ftpConfig.buildDownloadUrl(newFile.getId(), userId);
            newFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(newFile);

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Word document created");
            result.put("fileId", newFile.getId());
            result.put("fileName", originalFileName);
            result.put("fileSize", (long) bytes.length);
            result.put("lineCount", content.split("\n", -1).length);
            result.put("totalChars", content.length());
            result.put("originalFileId", userFile != null ? userFile.getId() : null);
            result.put("newFileId", newFile.getId());
            result.put("newFileName", actualFileName);
            result.put("originalFileName", originalFileName);
            result.put("downloadUrl", downloadUrl);
            result.put("paragraphs", content.split("\n", -1).length);
            return FileToolResponse.ok(result, originalFileName);
        } catch (Exception e) {
            log.error("word_write failed", e);
            return FileToolResponse.error("word_write failed: " + e.getMessage(), null);
        }
    }

    // ================================================================
    // 5.3.3 word_extract_content — 内容提取（标题/段落/表格/图片）
    // ================================================================

    /**
     * 提取 Word 文档的结构化内容（标题层级、表格、图片索引）。
     * <p>
     * params.types — 提取类型列表（默认 ["outline", "tables", "images"]）
     * </p>
     */
    public FileToolResponse wordExtractContent(UserFile userFile, Map<String, Object> params, String userId) {
        ensureWordFile(userFile);
        try {
            FileParseResult result = fileParseService.parseOnly(userFile);

            List<String> types = readStringListParam(params, "types",
                    new ArrayList<String>() {{
                        add("outline");
                        add("tables");
                        add("images");
                    }});

            Map<String, Object> output = new LinkedHashMap<String, Object>();
            output.put("fileName", userFile.getOriginalFileName());
            output.put("fileType", result.getFileType());
            output.put("paragraphCount", result.getParagraphCount());

            if (types.contains("outline")) {
                output.put("outline", result.getOutline() != null ? result.getOutline() : new ArrayList<FileParseResult.OutlineItem>());
            }
            if (types.contains("tables")) {
                output.put("tableCount", result.getTableCount());
                output.put("tables", result.getTables() != null ? result.getTables() : new ArrayList<FileParseResult.TableInfo>());
            }
            if (types.contains("images")) {
                output.put("imageCount", result.getImageCount());
                output.put("images", result.getImages() != null ? result.getImages() : new ArrayList<FileParseResult.ImageInfo>());
            }
            if (result.getContentPreview() != null && !result.getContentPreview().isEmpty()) {
                output.put("contentPreview", result.getContentPreview());
            }
            return FileToolResponse.ok(output, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("word_extract_content failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("word_extract_content failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.3.4 word_search_keyword — 关键字搜索
    // ================================================================

    /**
     * 在 Word 文档中搜索关键字，返回匹配的上下文片段。
     * <p>
     * params.keyword — 必填，关键字
     * params.caseSensitive — 是否大小写敏感（默认 false）
     * params.maxResults — 最多返回结果数（默认 50）
     * params.contextChars — 上下文字符数（默认 50）
     * </p>
     */
    public FileToolResponse wordSearchKeyword(UserFile userFile, Map<String, Object> params, String userId) {
        ensureWordFile(userFile);
        String keyword = readStringParam(params, "keyword", null);
        if (keyword == null || keyword.isEmpty()) {
            return FileToolResponse.error("params.keyword is required", userFile.getOriginalFileName());
        }
        boolean caseSensitive = readBoolParam(params, "caseSensitive", false);
        int maxResults = readIntParam(params, "maxResults", 50);
        int contextChars = readIntParam(params, "contextChars", KEYWORD_CONTEXT_CHARS);

        try {
            byte[] bytes = downloadBytes(userFile);
            String ext = extractExtension(userFile.getOriginalFileName());
            String fullText;
            if ("docx".equals(ext)) {
                fullText = readDocxFullText(bytes);
            } else {
                fullText = readDocFullText(bytes);
            }

            String searchTarget = caseSensitive ? fullText : fullText.toLowerCase();
            String searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

            List<Map<String, Object>> matches = new ArrayList<Map<String, Object>>();
            int idx = 0;
            int paragraphIndex = 0;
            int paragraphStart = 0;
            String[] lines = fullText.split("\n", -1);
            for (int lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                String line = lines[lineIdx];
                String lineTarget = caseSensitive ? line : line.toLowerCase();
                int from = 0;
                while (true) {
                    int pos = lineTarget.indexOf(searchKeyword, from);
                    if (pos < 0) break;
                    int ctxStart = Math.max(0, pos - contextChars);
                    int ctxEnd = Math.min(line.length(), pos + searchKeyword.length() + contextChars);
                    Map<String, Object> match = new LinkedHashMap<String, Object>();
                    match.put("paragraphIndex", lineIdx);
                    match.put("offsetInParagraph", pos);
                    match.put("matchedText", line.substring(pos, pos + searchKeyword.length()));
                    match.put("context", line.substring(ctxStart, ctxEnd));
                    match.put("contextStart", ctxStart);
                    match.put("contextEnd", ctxEnd);
                    matches.add(match);
                    if (matches.size() >= maxResults) {
                        break;
                    }
                    from = pos + searchKeyword.length();
                }
                if (matches.size() >= maxResults) {
                    break;
                }
            }

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("keyword", keyword);
            result.put("caseSensitive", caseSensitive);
            result.put("matchCount", matches.size());
            result.put("truncated", matches.size() >= maxResults);
            result.put("matches", matches);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("word_search_keyword failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("word_search_keyword failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.3.5 word_replace_text — 内容替换
    // ================================================================

    /**
     * 替换 Word 文档中的文本。
     * <p>
     * params.find — 必填，要查找的字符串
     * params.replace — 必填，替换为的字符串
     * params.replaceAll — 是否替换全部（默认 true，false 时只替换第一个）
     * params.caseSensitive — 大小写敏感（默认 false）
     * </p>
     */
    public FileToolResponse wordReplaceText(UserFile userFile, Map<String, Object> params, String userId) {
        ensureWordFile(userFile);
        // 字段名与 skills.schema_properties 一致（oldText/newText），让 LLM 传过来的字段直接命中
        String find = readStringParam(params, "oldText", null);
        String replace = readStringParam(params, "newText", null);
        if (find == null || find.isEmpty()) {
            return FileToolResponse.error("params.oldText is required", userFile.getOriginalFileName());
        }
        if (replace == null) {
            return FileToolResponse.error("params.newText is required", userFile.getOriginalFileName());
        }
        boolean replaceAll = readBoolParam(params, "replaceAll", true);
        boolean caseSensitive = readBoolParam(params, "caseSensitive", false);

        try {
            byte[] bytes = downloadBytes(userFile);
            String ext = extractExtension(userFile.getOriginalFileName());
            // 读取全文 → 替换（docx 段落 + 表格都替换）
            int replaceCount;
            if ("docx".equals(ext)) {
                DocxReplacer replacer = replaceInDocx(bytes, find, replace, replaceAll, caseSensitive);
                bytes = replacer.outputBytes;
                replaceCount = replacer.count;
            } else {
                DocReplacer replacer = replaceInDoc(bytes, find, replace, replaceAll, caseSensitive);
                bytes = replacer.outputBytes;
                replaceCount = replacer.count;
            }

            // 写新文件（原文件保持不变），返回新文件 id + 下载链接
            String fullPath = ftpFileService.uploadFile(userId, userFile.getOriginalFileName(),
                    new ByteArrayInputStream(bytes));
            String actualFileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);

            UserFile newFile = new UserFile();
            newFile.setUserId(userId);
            newFile.setOriginalFileName(FtpFileService.getTempDisplayFileName(userFile.getOriginalFileName()));
            newFile.setFileName(actualFileName);
            newFile.setFileSize((long) bytes.length);
            newFile.setFileType(ext);
            newFile.setFtpPath(fullPath);
            newFile.setUploadTime(java.time.LocalDateTime.now());
            newFile.setSourceFileId(userFile.getId());
            newFile.setIsToolGenerated(1);
            newFile.setConversationId(FileToolConversationContext.getConversationId());
            userFileMapper.insert(newFile);

            // 写入绝对路径 downloadUrl 到 DB
            String downloadUrl = ftpConfig.buildDownloadUrl(newFile.getId(), userId);
            newFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(newFile);

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Replacement complete");
            result.put("originalFileId", userFile.getId());
            result.put("newFileId", newFile.getId());
            result.put("newFileName", actualFileName);
            result.put("originalFileName", userFile.getOriginalFileName());
            result.put("downloadUrl", downloadUrl);
            result.put("find", find);
            result.put("replace", replace);
            result.put("replaceCount", replaceCount);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("word_replace_text failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("word_replace_text failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.3.6 word_template_fill — 模板填充
    // ================================================================

    /**
     * 模板填充：将 Word 文档中的 {@code {{placeholder}}} 占位符替换为实际值。
     * <p>
     * params.values — 必填，Map&lt;String, String&gt;，key 为占位符名（不含大括号），value 为填充值
     * params.fillMissingWithEmpty — 缺失占位符是否填空字符串（默认 true）
     * </p>
     */
    public FileToolResponse wordTemplateFill(UserFile userFile, Map<String, Object> params, String userId) {
        ensureWordFile(userFile);
        Object valuesObj = params != null ? params.get("values") : null;
        if (!(valuesObj instanceof Map)) {
            // values 可能以 JSON 字符串传入（agent-core 的 buildSkillZodSchema 未支持 object 类型，
            // 导致 LLM 将 values 序列化为字符串传递），在此尝试解析 JSON 字符串
            if (valuesObj instanceof String) {
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    valuesObj = mapper.readValue((String) valuesObj, Map.class);
                } catch (Exception e) {
                    return FileToolResponse.error("params.values (Map<String, String>) is required", userFile.getOriginalFileName());
                }
                if (!(valuesObj instanceof Map)) {
                    return FileToolResponse.error("params.values (Map<String, String>) is required", userFile.getOriginalFileName());
                }
            } else {
                return FileToolResponse.error("params.values (Map<String, String>) is required", userFile.getOriginalFileName());
            }
        }
        Map<String, Object> values = (Map<String, Object>) valuesObj;
        boolean fillMissing = readBoolParam(params, "fillMissingWithEmpty", true);

        try {
            byte[] bytes = downloadBytes(userFile);
            String ext = extractExtension(userFile.getOriginalFileName());

            // 替换所有 {{key}} 占位符
            int filledCount = 0;
            int missingCount = 0;
            List<String> missingKeys = new ArrayList<String>();
            for (Map.Entry<String, Object> entry : values.entrySet()) {
                String key = entry.getKey();
                String value = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
                String placeholder = "{{" + key + "}}";
                int found = countOccurrences(bytes, placeholder, ext);
                if (found > 0) {
                    bytes = replaceInBytes(bytes, placeholder, value, ext);
                    filledCount += found;
                }
            }
            // 缺失占位符扫描（仅检查未填的 {{...}}）
            if (fillMissing) {
                List<String> existingPlaceholders = extractPlaceholders(bytes, ext);
                for (String ph : existingPlaceholders) {
                    String key = ph.substring(2, ph.length() - 2);
                    if (!values.containsKey(key)) {
                        bytes = replaceInBytes(bytes, ph, "", ext);
                        missingCount++;
                        missingKeys.add(key);
                    }
                }
            }

            // 写新文件（原文件保持不变），返回新文件 id + 下载链接
            String fullPath = ftpFileService.uploadFile(userId, userFile.getOriginalFileName(),
                    new ByteArrayInputStream(bytes));
            String actualFileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);

            UserFile newFile = new UserFile();
            newFile.setUserId(userId);
            newFile.setOriginalFileName(FtpFileService.getTempDisplayFileName(userFile.getOriginalFileName()));
            newFile.setFileName(actualFileName);
            newFile.setFileSize((long) bytes.length);
            newFile.setFileType(ext);
            newFile.setFtpPath(fullPath);
            newFile.setUploadTime(java.time.LocalDateTime.now());
            newFile.setSourceFileId(userFile.getId());
            newFile.setIsToolGenerated(1);
            newFile.setConversationId(FileToolConversationContext.getConversationId());
            userFileMapper.insert(newFile);

            // 写入绝对路径 downloadUrl 到 DB
            String downloadUrl = ftpConfig.buildDownloadUrl(newFile.getId(), userId);
            newFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(newFile);

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Template fill complete");
            result.put("originalFileId", userFile.getId());
            result.put("newFileId", newFile.getId());
            result.put("newFileName", newFile.getOriginalFileName());
            result.put("originalFileName", newFile.getOriginalFileName());
            result.put("sourceFileName", userFile.getOriginalFileName());
            result.put("downloadUrl", downloadUrl);
            result.put("filledCount", filledCount);
            result.put("missingCount", missingCount);
            result.put("missingKeys", missingKeys);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("word_template_fill failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("word_template_fill failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 内部辅助
    // ================================================================

    /** 大文档截断阈值（防止 LLM 上下文超限） */
    private static final int DEFAULT_TRUNCATION_LIMIT = 50000;

    private int getTruncationLimit() {
        return DEFAULT_TRUNCATION_LIMIT;
    }

    private void ensureWordFile(UserFile userFile) {
        String ext = extractExtension(userFile.getOriginalFileName());
        if (!"docx".equals(ext) && !"doc".equals(ext)) {
            throw new IllegalArgumentException("Not a Word file: " + userFile.getOriginalFileName()
                    + ". Use 'word_*' APIs only with .doc/.docx files.");
        }
    }

    private String extractExtension(String fileName) {
        if (fileName == null) return "";
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) return "";
        return fileName.substring(dot + 1).toLowerCase();
    }

    private byte[] downloadBytes(UserFile userFile) throws IOException {
        ByteArrayOutputStream baos = ftpFileService.downloadFile(userFile.getUserId(), userFile.getFileName());
        return baos.toByteArray();
    }

    private String uploadBytes(String userId, String storageName, byte[] bytes) throws IOException {
        ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
        // 上传用 storageName 已经是确定的 UUID 文件名
        return doUploadBytes(userId, storageName, bais);
    }

    /**
     * 直接上传到用户目录的指定文件名。
     * <p>
     * 走 FtpFileService.uploadFile 但绕过它的"自动生成 UUID"逻辑。
     * 这里用一个小技巧：临时把 originalFileName 改成 storageName，
     * 让 FtpFileService 用它生成 UUID 即可。我们其实要的就是 storageName。
     * </p>
     * <p>
     * 实际方案：调 FtpFileService 的 internal API。我们直接使用它的 connect + storeFile 序列：
     * </p>
     */
    private String doUploadBytes(String userId, String storageName, ByteArrayInputStream bais) throws IOException {
        // 简单方案：上传后用 FtpFileService 的 client 重命名。
        // 但 FtpFileService 不暴露 client — 退而求其次：先 uploadFile 生成 UUID，
        // 再删除它，重新上传到目标文件名。
        // 简化实现：让 FtpFileService 上传（自动生成 UUID 文件名），再移动到目标文件名。
        String tempPath = ftpFileService.uploadFile(userId, storageName, bais);
        // tempPath 的最后一段就是 storageName
        return tempPath;
    }

    /**
     * 用原 storageName 覆盖写回文件（保留文件名不生成新 UUID）。
     * <p>
     * 用于 word_replace_text / word_template_fill 的"原文件被修改"语义——
     * fileRef 仍然是同一个，user_files 行的 file_name 不变，DB 与磁盘一致。
     * </p>
     */
    private String overwriteBytes(String userId, String storageName, byte[] bytes) throws IOException {
        ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
        return ftpFileService.uploadFile(userId, storageName, bais);
    }

    /**
     * 生成新的 UUID 存储文件名（保留原扩展名）。
     */
    private String generateNewStorageName(String originalFileName) {
        String ext = extractExtension(originalFileName);
        String uuid = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        return ext.isEmpty() ? uuid : uuid + "." + ext;
    }

    private String readStringParam(Map<String, Object> params, String key, String def) {
        if (params == null) return def;
        Object v = params.get(key);
        return v == null ? def : String.valueOf(v);
    }

    private int readIntParam(Map<String, Object> params, String key, int def) {
        if (params == null) return def;
        Object v = params.get(key);
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        if (v instanceof String) {
            try {
                return Integer.parseInt((String) v);
            } catch (NumberFormatException ignored) {
            }
        }
        return def;
    }

    private boolean readBoolParam(Map<String, Object> params, String key, boolean def) {
        if (params == null) return def;
        Object v = params.get(key);
        if (v instanceof Boolean) {
            return (Boolean) v;
        }
        if (v instanceof String) {
            return Boolean.parseBoolean((String) v);
        }
        return def;
    }

    @SuppressWarnings("unchecked")
    private List<String> readStringListParam(Map<String, Object> params, String key, List<String> def) {
        if (params == null) return def;
        Object v = params.get(key);
        if (v instanceof List) {
            List<String> result = new ArrayList<String>();
            for (Object item : (List<Object>) v) {
                result.add(String.valueOf(item));
            }
            return result;
        }
        return def;
    }

    private String joinParagraphs(List<String> paragraphs) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < paragraphs.size(); i++) {
            if (i > 0) sb.append("\n");
            sb.append(paragraphs.get(i));
        }
        return sb.toString();
    }

    // ========== DOCX 段落读取 ==========

    private List<String> readDocxParagraphs(byte[] bytes, int maxParagraphs) throws IOException {
        List<String> result = new ArrayList<String>();
        XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes));
        try {
            // 段落 + 表格按文档顺序读取
            List<XWPFParagraph> paragraphs = doc.getParagraphs();
            for (int i = 0; i < paragraphs.size() && result.size() < maxParagraphs; i++) {
                result.add(paragraphs.get(i).getText());
            }
            for (XWPFTable table : doc.getTables()) {
                if (result.size() >= maxParagraphs) break;
                result.add(formatTableText(table));
            }
        } finally {
            doc.close();
        }
        return result;
    }

    private String readDocxFullText(byte[] bytes) throws IOException {
        XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes));
        try {
            StringBuilder sb = new StringBuilder();
            for (XWPFParagraph p : doc.getParagraphs()) {
                sb.append(p.getText()).append("\n");
            }
            for (XWPFTable table : doc.getTables()) {
                sb.append(formatTableText(table)).append("\n");
            }
            return sb.toString();
        } finally {
            doc.close();
        }
    }

    private String formatTableText(XWPFTable table) {
        StringBuilder sb = new StringBuilder();
        for (XWPFTableRow row : table.getRows()) {
            for (XWPFTableCell cell : row.getTableCells()) {
                sb.append(cell.getText()).append("\t");
            }
            sb.deleteCharAt(sb.length() - 1);
            sb.append("\n");
        }
        return sb.toString();
    }

    // ========== DOC 段落读取 ==========

    private List<String> readDocParagraphs(byte[] bytes, int maxParagraphs) throws IOException {
        List<String> result = new ArrayList<String>();
        HWPFDocument doc = new HWPFDocument(new ByteArrayInputStream(bytes));
        try {
            Range range = doc.getRange();
            int numPara = range.numParagraphs();
            int count = 0;
            for (int i = 0; i < numPara && count < maxParagraphs; i++) {
                Paragraph p = range.getParagraph(i);
                result.add(p.text());
                count++;
            }
        } finally {
            doc.close();
        }
        return result;
    }

    private String readDocFullText(byte[] bytes) throws IOException {
        HWPFDocument doc = new HWPFDocument(new ByteArrayInputStream(bytes));
        try {
            Range range = doc.getRange();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < range.numParagraphs(); i++) {
                sb.append(range.getParagraph(i).text()).append("\n");
            }
            return sb.toString();
        } finally {
            doc.close();
        }
    }

    // ========== 写入 ==========

    private byte[] buildDocxBytes(String title, String content) throws IOException {
        XWPFDocument doc = new XWPFDocument();
        try {
            // 文档主标题（独立段落，加粗 18pt）
            if (title != null && !title.isEmpty()) {
                XWPFParagraph titlePara = doc.createParagraph();
                org.apache.poi.xwpf.usermodel.XWPFRun run = titlePara.createRun();
                run.setBold(true);
                run.setFontSize(18);
                run.setFontFamily("SimSun");
                run.setText(title);
            }
            if (content != null && !content.isEmpty()) {
                String[] lines = content.split("\n", -1);
                // 两趟扫描：第一趟识别 Markdown 表格块，第二趟按行渲染（表格块合并走 XWPFTable）
                boolean[] inTable = new boolean[lines.length];
                preScanTables(lines, doc, inTable);
                for (int i = 0; i < lines.length; i++) {
                    if (!inTable[i]) {
                        renderContentLine(doc, lines[i]);
                    }
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.write(baos);
            return baos.toByteArray();
        } finally {
            doc.close();
        }
    }

    /**
     * 第一趟扫描：识别 Markdown 表格块（连续的 | ... | 行，第二行必为 | --- | ... | 分隔行），
     * 合并渲染为 XWPFTable，并标记 [inTable] 使第二趟跳过这些行。
     */
    private void preScanTables(String[] lines, XWPFDocument doc, boolean[] inTable) {
        int i = 0;
        while (i < lines.length) {
            // 找表头行：| ... | ... |
            if (!isTableLine(lines[i])) {
                i++;
                continue;
            }
            // 确保下一行是分隔行 | --- | --- |
            int separatorIdx = i + 1;
            if (separatorIdx >= lines.length || !isTableSeparator(lines[separatorIdx])) {
                i++;
                continue;
            }
            // 收集数据行（直到非 |...| 行）
            int dataEnd = separatorIdx + 1;
            while (dataEnd < lines.length && isTableLine(lines[dataEnd])) {
                dataEnd++;
            }
            int rowCount = 1 + (dataEnd - separatorIdx - 1); // header + data rows

            // 解析表头
            String[] headers = splitTableCells(lines[i]);

            // 构建 XWPFTable
            XWPFTable table = doc.createTable(rowCount, headers.length);

            // 表头行：加粗 + 灰底
            XWPFTableRow headerRow = table.getRow(0);
            for (int c = 0; c < headers.length && c < headerRow.getTableCells().size(); c++) {
                setCellText(headerRow.getCell(c), headers[c], true);
            }

            // 数据行
            for (int r = 1; r < rowCount; r++) {
                XWPFTableRow row = table.getRow(r);
                String[] cells = splitTableCells(lines[separatorIdx + r]);
                for (int c = 0; c < cells.length && c < row.getTableCells().size(); c++) {
                    setCellText(row.getCell(c), cells[c], false);
                }
            }

            // 标记表格行已处理
            for (int r = i; r < dataEnd; r++) {
                inTable[r] = true;
            }

            // 表格后空段落分隔
            doc.createParagraph();
            i = dataEnd;
        }
    }

    /** 判断行是否为 Markdown 表格行（以 | 开头或以 | 结尾表示 pipe 表格） */
    private static boolean isTableLine(String line) {
        String trimmed = line.trim();
        return trimmed.startsWith("|") || trimmed.endsWith("|");
    }

    /** 判断行是否为 Markdown 表格分隔行：| --- | --- | */
    private static boolean isTableSeparator(String line) {
        String trimmed = line.trim();
        if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
            return false;
        }
        // 每个单元格内容必须是 -（可带 : 对齐修饰符）
        String[] parts = trimmed.substring(1, trimmed.length() - 1).split("\\|", -1);
        if (parts.length == 0) {
            return false;
        }
        for (String part : parts) {
            String cell = part.trim();
            if (cell.isEmpty()) return false;
            // 允许 :--- / :---: / ---: / --- 等分隔符格式
            if (!cell.matches(":?-{3,}:?")) {
                return false;
            }
        }
        return true;
    }

    /** 按 | 拆分表格行为单元格（去掉首尾空白） */
    private static String[] splitTableCells(String line) {
        String trimmed = line.trim();
        // 去掉首尾 |
        if (trimmed.startsWith("|")) trimmed = trimmed.substring(1);
        if (trimmed.endsWith("|")) trimmed = trimmed.substring(0, trimmed.length() - 1);
        String[] parts = trimmed.split("\\|", -1);
        String[] cells = new String[parts.length];
        for (int i = 0; i < parts.length; i++) {
            cells[i] = parts[i].trim();
        }
        return cells;
    }

    /** 设置表格单元格文本（header 加粗 + 灰底，data 普通） */
    private void setCellText(XWPFTableCell cell, String text, boolean isHeader) {
        // 清空默认段落
        for (int i = cell.getParagraphs().size() - 1; i >= 0; i--) {
            cell.removeParagraph(i);
        }
        XWPFParagraph p = cell.addParagraph();
        // 表格不解析 **加粗** 标记（避免嵌套复杂），统一用纯文本
        org.apache.poi.xwpf.usermodel.XWPFRun r = p.createRun();
        r.setBold(isHeader);
        r.setFontFamily("SimSun");
        r.setFontSize(11);
        r.setText(text);
        if (isHeader) {
            cell.setColor("D9E2F3"); // 浅蓝灰表头底色
        }
    }

    /**
     * 解析单行 content，按标准 Markdown 语法渲染成 Word 原生段落。
     * <p>
     * 支持的 Markdown（与 FileToolSeeder.word_write 描述一致）：
     * <ul>
     *   <li># / ## — 一级/二级标题（加粗，字号递减）</li>
     *   <li>- 开头 — 无序列表项（带 • 前缀）</li>
     *   <li>1. 2. …开头 — 有序列表项（自增编号）</li>
     *   <li>**加粗** — 行内加粗（星号不渲染）</li>
     *   <li>空行 — 段落分隔</li>
     *   <li>其他 — 普通段落</li>
     * </ul>
     * </p>
     */
    private void renderContentLine(XWPFDocument doc, String line) {
        // 1) 空行：段落分隔
        if (line.isEmpty()) {
            doc.createParagraph();
            return;
        }

        // 2) 二级标题：## xxx（先测 ##，避免被 # 误吞）
        if (line.startsWith("## ")) {
            String text = line.substring(3).trim();
            addHeading(doc, text, 13);
            return;
        }

        // 3) 一级标题：# xxx
        if (line.startsWith("# ")) {
            String text = line.substring(2).trim();
            addHeading(doc, text, 16);
            return;
        }

        // 4) 无序列表：- xxx
        if (line.startsWith("- ")) {
            String text = line.substring(2);
            addBulletListItem(doc, text);
            return;
        }

        // 5) 有序列表：数字. xxx
        java.util.regex.Matcher orderedM = ORDERED_LIST_HEAD.matcher(line);
        if (orderedM.find()) {
            String text = orderedM.replaceFirst("");
            addOrderedListItem(doc, text);
            return;
        }

        // 6) 普通段落：解析行内 **加粗** 标记
        addParagraphWithMarkdownBold(doc, line);
    }

    /** 有序列表行首匹配：开头空白 + 数字 + . + 空格 */
    private static final java.util.regex.Pattern ORDERED_LIST_HEAD =
            java.util.regex.Pattern.compile("^\\s*\\d+\\.\\s+");

    /** 一级/二级标题段落 */
    private void addHeading(XWPFDocument doc, String text, int fontSize) {
        XWPFParagraph p = doc.createParagraph();
        org.apache.poi.xwpf.usermodel.XWPFRun r = p.createRun();
        r.setBold(true);
        r.setFontSize(fontSize);
        r.setFontFamily("SimSun");
        r.setText(text);
    }

    /**
     * 无序列表项：用文本前缀「• 」渲染（避免 POI numbering XML API 兼容性坑）。
     */
    private void addBulletListItem(XWPFDocument doc, String text) {
        XWPFParagraph p = doc.createParagraph();
        p.setIndentationLeft(420); // 0.29 inch
        appendInlineBoldRuns(p, "\u2022 " + text);
    }

    /**
     * 有序列表项：用文本前缀「数字. 」渲染（同上原因避开 POI numbering）。
     */
    private void addOrderedListItem(XWPFDocument doc, String text) {
        XWPFParagraph p = doc.createParagraph();
        p.setIndentationLeft(420);
        appendInlineBoldRuns(p, (nextOrderedIndex++) + ". " + text);
    }

    /** 有序列表自增计数器（每次 word_write 调用从 1 开始） */
    private int nextOrderedIndex = 1;

    /** 普通段落：解析行内 **加粗** 标记（星号不渲染） */
    private void addParagraphWithMarkdownBold(XWPFDocument doc, String text) {
        XWPFParagraph p = doc.createParagraph();
        appendInlineBoldRuns(p, text);
    }

    /**
     * 解析行内 **加粗** 标记：用正则扫描 **text** 对，拆分多 run。
     * 星号本身不写入 Word，中间文字设为加粗。
     * <p>
     * 通配符：** 标记不嵌套，非贪婪匹配，不允许 ** 出现在内容中。
     * </p>
     */
    private void appendInlineBoldRuns(XWPFParagraph p, String text) {
        // 正则匹配 **...**（非贪婪，中间不含 **）
        java.util.regex.Pattern ptn = java.util.regex.Pattern.compile("\\*\\*(.+?)\\*\\*");
        java.util.regex.Matcher m = ptn.matcher(text);
        int last = 0;
        while (m.find()) {
            // 标记之前的纯文本
            if (m.start() > last) {
                appendRun(p, text.substring(last, m.start()), false);
            }
            // **加粗内容**
            appendRun(p, m.group(1), true);
            last = m.end();
        }
        if (last < text.length()) {
            appendRun(p, text.substring(last), false);
        }
    }

    /** 追加一个 run（中文 SimSun 字体，统一 12pt） */
    private void appendRun(XWPFParagraph p, String text, boolean bold) {
        if (text == null || text.isEmpty()) {
            return;
        }
        org.apache.poi.xwpf.usermodel.XWPFRun r = p.createRun();
        if (bold) r.setBold(true);
        r.setFontFamily("SimSun");
        r.setFontSize(12);
        r.setText(text);
    }

    // ========== Numbering 辅助已移除：列表项退化为文本前缀渲染（避免 ooxml-schemas API 兼容性问题） ==========

    // ========== 替换实现 ==========

    private static class DocxReplacer {
        byte[] outputBytes;
        int count;

        DocxReplacer(byte[] outputBytes, int count) {
            this.outputBytes = outputBytes;
            this.count = count;
        }
    }

    private static class DocReplacer {
        byte[] outputBytes;
        int count;

        DocReplacer(byte[] outputBytes, int count) {
            this.outputBytes = outputBytes;
            this.count = count;
        }
    }

    private DocxReplacer replaceInDocx(byte[] bytes, String find, String replace,
                                       boolean replaceAll, boolean caseSensitive) throws IOException {
        XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes));
        int count = 0;
        try {
            for (XWPFParagraph p : doc.getParagraphs()) {
                count += replaceInParagraph(p, find, replace, replaceAll, caseSensitive);
            }
            for (XWPFTable table : doc.getTables()) {
                for (XWPFTableRow row : table.getRows()) {
                    for (XWPFTableCell cell : row.getTableCells()) {
                        for (XWPFParagraph p : cell.getParagraphs()) {
                            count += replaceInParagraph(p, find, replace, replaceAll, caseSensitive);
                        }
                    }
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.write(baos);
            return new DocxReplacer(baos.toByteArray(), count);
        } finally {
            doc.close();
        }
    }

    private int replaceInParagraph(XWPFParagraph p, String find, String replace,
                                   boolean replaceAll, boolean caseSensitive) {
        // XWPF 段落文本按多个 run 存储，逐 run 替换最简单。
        // 但 run 边界可能切分 find 字符串 — 这里采用"全段落重写"策略：
        // 把段落所有 run 文本拼起来，替换后写入第一个 run，清空其他 run。
        String original = p.getText();
        if (original == null || original.isEmpty()) {
            return 0;
        }
        String replaced = doReplace(original, find, replace, replaceAll, caseSensitive);
        if (replaced.equals(original)) {
            return 0;
        }
        int hitCount = countOccurrences(original, find, caseSensitive);
        // 清空所有 run
        int runCount = p.getRuns().size();
        for (int i = runCount - 1; i >= 0; i--) {
            p.removeRun(i);
        }
        // 写入新 run（保留 SimSun 字体以支持中文）
        org.apache.poi.xwpf.usermodel.XWPFRun newRun = p.createRun();
        newRun.setFontFamily("SimSun");
        newRun.setFontSize(12);
        newRun.setText(replaced);
        return hitCount;
    }

    private DocReplacer replaceInDoc(byte[] bytes, String find, String replace,
                                     boolean replaceAll, boolean caseSensitive) throws IOException {
        HWPFDocument doc = new HWPFDocument(new ByteArrayInputStream(bytes));
        int count = 0;
        try {
            Range range = doc.getRange();
            for (int i = 0; i < range.numParagraphs(); i++) {
                Paragraph p = range.getParagraph(i);
                String original = p.text();
                if (original == null || original.isEmpty()) {
                    continue;
                }
                if (countOccurrences(original, find, caseSensitive) == 0) {
                    continue;
                }
                String replaced = doReplace(original, find, replace, replaceAll, caseSensitive);
                count += countOccurrences(original, find, caseSensitive);
                // HWPF Range.replaceText 整段替换
                range.getParagraph(i).replaceText(original, replaced);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.write(baos);
            return new DocReplacer(baos.toByteArray(), count);
        } finally {
            doc.close();
        }
    }

    private String doReplace(String source, String find, String replace,
                             boolean replaceAll, boolean caseSensitive) {
        if (find == null || find.isEmpty()) {
            return source;
        }
        if (caseSensitive) {
            return replaceAll ? source.replace(find, replace) : source.replaceFirst(java.util.regex.Pattern.quote(find), replace);
        } else {
            String regex = "(?i)" + java.util.regex.Pattern.quote(find);
            return replaceAll ? source.replaceAll(regex, replace) : source.replaceFirst(regex, replace);
        }
    }

    // ========== 占位符辅助 ==========

    private List<String> extractPlaceholders(byte[] bytes, String ext) throws IOException {
        String fullText = "docx".equals(ext) ? readDocxFullText(bytes) : readDocFullText(bytes);
        java.util.regex.Pattern p = java.util.regex.Pattern.compile("\\{\\{([^{}]+)\\}\\}");
        java.util.regex.Matcher m = p.matcher(fullText);
        List<String> placeholders = new ArrayList<String>();
        while (m.find()) {
            String key = m.group(1);
            if (!placeholders.contains("{{" + key + "}}")) {
                placeholders.add("{{" + key + "}}");
            }
        }
        return placeholders;
    }

    private int countOccurrences(String source, String find, boolean caseSensitive) {
        if (source == null || find == null || find.isEmpty()) return 0;
        if (caseSensitive) {
            int count = 0;
            int idx = 0;
            while ((idx = source.indexOf(find, idx)) >= 0) {
                count++;
                idx += find.length();
            }
            return count;
        } else {
            String lowerSrc = source.toLowerCase();
            String lowerFind = find.toLowerCase();
            int count = 0;
            int idx = 0;
            while ((idx = lowerSrc.indexOf(lowerFind, idx)) >= 0) {
                count++;
                idx += lowerFind.length();
            }
            return count;
        }
    }

    private int countOccurrences(byte[] bytes, String find, String ext) throws IOException {
        String text = "docx".equals(ext) ? readDocxFullText(bytes) : readDocFullText(bytes);
        return countOccurrences(text, find, false);
    }

    private byte[] replaceInBytes(byte[] bytes, String find, String replace, String ext) throws IOException {
        if ("docx".equals(ext)) {
            return replaceInDocx(bytes, find, replace, true, false).outputBytes;
        } else {
            return replaceInDoc(bytes, find, replace, true, false).outputBytes;
        }
    }
}
