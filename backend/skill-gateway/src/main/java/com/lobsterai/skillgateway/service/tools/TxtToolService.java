package com.lobsterai.skillgateway.service.tools;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.lobsterai.skillgateway.config.FtpConfig;
import com.lobsterai.skillgateway.dto.FileToolResponse;
import com.lobsterai.skillgateway.entity.UserFile;
import com.lobsterai.skillgateway.mapper.UserFileMapper;
import com.lobsterai.skillgateway.service.FileToolConversationContext;
import com.lobsterai.skillgateway.service.FileToolService;
import com.lobsterai.skillgateway.service.FtpFileService;

/**
 * TXT/MD 文件操作工具（5.4）。
 * <p>
 * 提供 10 个 API：txt_read、txt_write、txt_keyword_lines、txt_regex、
 * txt_line_range、txt_section、txt_stats、txt_distinct_lines、txt_sort_lines、txt_keyword_freq。
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
public class TxtToolService {

    private static final Logger log = LoggerFactory.getLogger(TxtToolService.class);

    /** 默认编码（中文 Windows 常用 GBK，UTF-8 是默认值） */
    private static final String DEFAULT_ENCODING = "UTF-8";

    /** 大文档截断阈值（防止 LLM 上下文超限） */
    private static final int DEFAULT_TRUNCATION_LIMIT = 50000;

    private final FileToolService fileToolService;
    private final FtpFileService ftpFileService;
    private final UserFileMapper userFileMapper;
    private final FtpConfig ftpConfig;

    @Autowired
    public TxtToolService(FileToolService fileToolService,
                          FtpFileService ftpFileService,
                          UserFileMapper userFileMapper,
                          FtpConfig ftpConfig) {
        this.fileToolService = fileToolService;
        this.ftpFileService = ftpFileService;
        this.userFileMapper = userFileMapper;
        this.ftpConfig = ftpConfig;
    }

    /** Spring 启动后自动注册到 FileToolService。 */
    @PostConstruct
    public void registerHandlers() {
        fileToolService.registerHandler("txt_read", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtRead(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_init_temp", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtInitTemp(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_write", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtWrite(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_keyword_lines", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtKeywordLines(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_regex", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtRegex(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_line_range", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtLineRange(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_section", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtSection(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_stats", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtStats(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_distinct_lines", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtDistinctLines(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_sort_lines", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtSortLines(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("txt_keyword_freq", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return txtKeywordFreq(userFile, params, userId);
            }
        });
        log.info("TxtToolService registered 10 handlers: txt_read/write/keyword_lines/regex/line_range/section/stats/distinct_lines/sort_lines/keyword_freq");
    }

    // ================================================================
    // 5.4.1 txt_read — 读 TXT/MD 文件
    // ================================================================

    /**
     * 读取 TXT/MD 文本文件全部内容（支持指定编码）。
     * <p>
     * params.encoding — 文本编码（默认 UTF-8）
     * params.startLine — 起始行（0-based，默认 0）
     * params.maxLines — 最多返回行数（默认全部）
     * </p>
     */
    public FileToolResponse txtRead(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        int startLine = readIntParam(params, "startLine", 0);
        int maxLines = readIntParam(params, "maxLines", Integer.MAX_VALUE);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            int total = allLines.size();
            int endIdx = Math.min(total, startLine + maxLines);
            int actualStart = Math.max(0, Math.min(startLine, total));
            List<String> slice = new ArrayList<String>();
            for (int i = actualStart; i < endIdx; i++) {
                slice.add(allLines.get(i));
            }
            String fullText = joinLines(slice, "\n");

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("fileName", userFile.getOriginalFileName());
            result.put("encoding", encoding);
            result.put("totalLines", total);
            result.put("startLine", actualStart);
            result.put("returnedLines", slice.size());
            result.put("lines", slice);
            result.put("text", fullText);
            result.put("truncated", endIdx < total);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_read failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_read failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.2 txt_write — 写 TXT/MD 文件
    // ================================================================
    // txt_init_temp — 初始化临时文件（创建副本，后续操作在其上进行）

    public FileToolResponse txtInitTemp(UserFile userFile, Map<String, Object> params, String userId) {
        try {
            Long sourceFileId = userFile.getId();

            // 读取源文件内容
            byte[] fileBytes = ftpFileService.downloadFile(userId, userFile.getFileName()).toByteArray();

            // 生成临时文件名
            String tempFileName = generateTempOriginalName(userFile.getOriginalFileName());

            // 上传临时文件到 FTP
            String ftpPath = ftpFileService.uploadFileWithFileName(userId, tempFileName, new java.io.ByteArrayInputStream(fileBytes));
            String storageFileName = ftpPath.substring(ftpPath.lastIndexOf('/') + 1);

            // 在 user_files 表中创建新记录
            String conversationId = FileToolConversationContext.getConversationId();
            UserFile tempUserFile = new UserFile();
            tempUserFile.setUserId(userId);
            tempUserFile.setOriginalFileName(tempFileName);
            tempUserFile.setFileName(storageFileName);
            tempUserFile.setFileSize((long) fileBytes.length);
            tempUserFile.setFileType(userFile.getFileType());
            tempUserFile.setFtpPath(ftpPath);
            tempUserFile.setSourceFileId(sourceFileId);
            tempUserFile.setIsToolGenerated(1);
            tempUserFile.setConversationId(conversationId);
            tempUserFile.setUploadTime(java.time.LocalDateTime.now());
            userFileMapper.insert(tempUserFile);

            Long tempFileId = tempUserFile.getId();

            // 生成带签名的下载 URL
            String downloadUrl = ftpConfig.buildDownloadUrl(tempFileId, userId);
            tempUserFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(tempUserFile);

            log.info("txt_init_temp created temp file: id={}, sourceFileId={}, tempFileName={}, downloadUrl={}",
                    tempFileId, sourceFileId, tempFileName, downloadUrl);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("message", "临时文件初始化成功");
            result.put("fileId", tempFileId);
            result.put("sourceFileId", sourceFileId);
            result.put("fileName", tempFileName);
            result.put("filePath", ftpPath);
            result.put("downloadUrl", downloadUrl);

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("txt_init_temp failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_init_temp failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    /**
     * 无源文件时创建全新 .txt 临时文件（对齐 md_write"不传 fileId 时创建全新文件"语义）。
     * @param customFileName LLM 指定的文件名（如 "报告.txt"），为 null 时自动生成
     */
    private FileToolResponse createNewTempFile(String content, String encoding, String userId, String customFileName) {
        try {
            byte[] fileBytes = content.getBytes(java.nio.charset.Charset.forName(encoding));
            // 用户友好的显示文件名（中文等非 ASCII 字符无问题，仅用于 originalFileName 和返回给 LLM）
            String displayFileName;
            if (customFileName != null && !customFileName.trim().isEmpty()) {
                displayFileName = generateTempOriginalName(customFileName.trim());
            } else {
                displayFileName = "new_" + System.currentTimeMillis() + "_temp.txt";
            }
            // FTP 存储用 uploadFile（内部 generateStorageFileName 生成纯 ASCII UUID 名，避免中文 FTP 编码问题）
            String ftpPath = ftpFileService.uploadFile(userId, displayFileName,
                    new java.io.ByteArrayInputStream(fileBytes));
            String storageFileName = ftpPath.substring(ftpPath.lastIndexOf('/') + 1);

            String conversationId = FileToolConversationContext.getConversationId();
            UserFile tempUserFile = new UserFile();
            tempUserFile.setUserId(userId);
            tempUserFile.setOriginalFileName(displayFileName);
            tempUserFile.setFileName(storageFileName);
            tempUserFile.setFileSize((long) fileBytes.length);
            tempUserFile.setFileType("text/plain");
            tempUserFile.setFtpPath(ftpPath);
            tempUserFile.setIsToolGenerated(1);
            tempUserFile.setConversationId(conversationId);
            tempUserFile.setUploadTime(java.time.LocalDateTime.now());
            userFileMapper.insert(tempUserFile);

            Long newFileId = tempUserFile.getId();
            String downloadUrl = ftpConfig.buildDownloadUrl(newFileId, userId);
            tempUserFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(tempUserFile);

            log.info("txt_write created new temp file: id={}, fileName={}, downloadUrl={}",
                    newFileId, displayFileName, downloadUrl);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("message", "全新 TXT 临时文件创建成功");
            result.put("fileId", newFileId);
            result.put("fileName", displayFileName);
            result.put("filePath", ftpPath);
            result.put("downloadUrl", downloadUrl);
            result.put("fileSize", (long) fileBytes.length);
            result.put("lineCount", content.split("\n", -1).length);
            result.put("totalChars", content.length());
            result.put("encoding", encoding);
            return FileToolResponse.ok(result, displayFileName);
        } catch (Exception e) {
            log.error("txt_write createNewTempFile failed", e);
            return FileToolResponse.error("创建新文件失败: " + e.getMessage(), "(new file)");
        }
    }

    // ================================================================
    // txt_write — 写入/追加文本内容（v2 隔离语义）

    /**
     * 写入 TXT/MD 文本文件（覆盖式）。
     * <p>
     * params.content — 必填，文本内容
     * params.encoding — 写入编码（默认 UTF-8）
     * params.append — 是否追加（默认 false 覆盖）
     * </p>
     */
    /**
     * txt_write — 写入/追加文本（始终产出 _temp 临时文件，不修改源文件）。
     *
     * <p>语义（v2 隔离）：每次调用都基于源文件生成一份 _temp 副本，
     * 把写入/追加后的内容落到临时文件上，源文件保持不变。
     * 返回临时文件的 {@code downloadUrl}，供前端展示与下载。
     *
     * <p>参数：
     * <ul>
     *   <li>{@code content} — 必填，写入/追加的文本内容</li>
     *   <li>{@code append} — 可选，true=追加到源文件副本尾部（默认 false=覆盖副本内容）</li>
     *   <li>{@code originalFileName} — 可选，自定义临时文件名（不含 _temp 后缀），缺省 = 源文件名</li>
     *   <li>{@code encoding} — 可选，默认 UTF-8</li>
     * </ul>
     *
     * <p>result 关键字段：
     * <ul>
     *   <li>{@code fileId} — 临时文件 ID（前端下载入口的主键）</li>
     *   <li>{@code sourceFileId} — 源文件 ID（如有）</li>
     *   <li>{@code fileName} — 临时文件名（&lt;name&gt;_temp.&lt;ext&gt;）</li>
     *   <li>{@code downloadUrl} — 临时文件带签名下载链接</li>
     * </ul>
     */
    public FileToolResponse txtWrite(UserFile userFile, Map<String, Object> params, String userId) {
        String content = readStringParam(params, "content", null);
        if (content == null) {
            return FileToolResponse.error("params.content is required",
                    userFile != null ? userFile.getOriginalFileName() : null);
        }
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        if (userFile == null) {
            // 无源文件 → 创建全新 .txt 临时文件（对齐 md_write 语义）
            String customFileName = readStringParam(params, "originalFileName", null);
            return createNewTempFile(content, encoding, userId, customFileName);
        }
        ensureTextFile(userFile);

        boolean append = readBoolParam(params, "append", false);
        String baseName = readStringParam(params, "originalFileName", userFile.getOriginalFileName());

        try {
            // 解析"根源文件 ID"：如果 userFile 本身已是临时文件（有 sourceFileId），
            // 向上追溯到根源文件；否则 userFile 就是根源文件。
            // 这样不管 LLM 传的是源文件还是之前生成的临时文件，所有写操作都锚定到同一个根源文件，
            // 保证 findLatestTempBySourceFileId 能正确命中已有的临时文件。
            String conversationId = FileToolConversationContext.getConversationId();
            Long rootSourceFileId = (userFile.getSourceFileId() != null)
                    ? userFile.getSourceFileId()
                    : userFile.getId();
            java.util.List<UserFile> existingTemps = userFileMapper
                    .findLatestTempBySourceFileId(conversationId, userId, rootSourceFileId);

            UserFile tempFile;          // 最终被写入/修改的目标临时文件行
            boolean isReuseExistingTemp = !existingTemps.isEmpty();
            if (isReuseExistingTemp) {
                // 复用最近一个临时文件 — 后续写操作都在它上面做
                tempFile = existingTemps.get(0);
            } else {
                // 首次调用：基于源文件创建临时文件
                tempFile = new UserFile();
                tempFile.setUserId(userId);
                tempFile.setOriginalFileName(generateTempOriginalName(baseName));
                // 注意：fileName 不能在这里自己生成 UUID，必须等 FTP upload 返回 fullPath 后再解析，
                // 否则 ftpConfig.generateStorageFileName 内部会再生成新 UUID，DB 与 FTP 路径不一致 → 下载 500。
                tempFile.setFileName(null);
                tempFile.setFileType(extractExtension(baseName));
                tempFile.setSourceFileId(rootSourceFileId);
                tempFile.setIsToolGenerated(1);
                tempFile.setConversationId(conversationId);
                tempFile.setUploadTime(java.time.LocalDateTime.now());
            }

            byte[] bytes;
            if (append) {
                // 追加：临时文件现有内容 + 换行 + 新内容 → 写回临时文件（首次调用临时文件不存在 → 走源文件）
                if (isReuseExistingTemp) {
                    ByteArrayOutputStream baos = ftpFileService.downloadFile(
                            tempFile.getUserId(), tempFile.getFileName());
                    ByteArrayOutputStream merged = new ByteArrayOutputStream();
                    byte[] existing = baos.toByteArray();
                    merged.write(existing);
                    // 如果已有内容不以换行结尾，先补一个换行符
                    if (existing.length > 0 && existing[existing.length - 1] != '\n') {
                        merged.write('\n');
                    }
                    merged.write(content.getBytes(Charset.forName(encoding)));
                    bytes = merged.toByteArray();
                } else {
                    // 首次 + append：从源文件开始 + 换行 + 拼新内容
                    ByteArrayOutputStream baos = ftpFileService.downloadFile(
                            userFile.getUserId(), userFile.getFileName());
                    ByteArrayOutputStream merged = new ByteArrayOutputStream();
                    byte[] existing = baos.toByteArray();
                    merged.write(existing);
                    if (existing.length > 0 && existing[existing.length - 1] != '\n') {
                        merged.write('\n');
                    }
                    merged.write(content.getBytes(Charset.forName(encoding)));
                    bytes = merged.toByteArray();
                }
            } else {
                // 覆盖：直接用 content（无论首次/后续，临时文件内容 = content）
                bytes = content.getBytes(Charset.forName(encoding));
            }

            // 写 FTP（首次 → 新上传；后续 → overwrite 同一 storageName）
            String fullPath;
            if (isReuseExistingTemp) {
                // 兜底：如果历史数据的 file_name 与 ftp_path 不一致（修复前的旧 bug 产物），
                // 从 ftp_path 重新解析 storageName，避免下载 500。
                String storageName = tempFile.getFileName();
                String ftpPathStored = tempFile.getFtpPath();
                if (ftpPathStored != null && ftpPathStored.contains("/")) {
                    String pathStorageName = ftpPathStored.substring(ftpPathStored.lastIndexOf('/') + 1);
                    if (storageName == null || !storageName.equals(pathStorageName)) {
                        log.warn("txt_write: 历史临时文件 file_name={} 与 ftp_path={} 不一致，按 ftp_path 修正", storageName, ftpPathStored);
                        storageName = pathStorageName;
                        tempFile.setFileName(storageName);
                    }
                }
                fullPath = overwriteBytes(tempFile.getUserId(), storageName, bytes);
            } else {
                fullPath = ftpFileService.uploadFile(userId, baseName,
                        new ByteArrayInputStream(bytes));
                // ftpFileService.uploadFile 内部用 generateStorageFileName(baseName) 生成最终 storageName，
                // 必须用这个返回值（不要再用我们自己 generateNewStorageName 生成的名字），否则 DB 与 FTP 路径不一致。
                String actualStorageName = fullPath.substring(fullPath.lastIndexOf('/') + 1);
                tempFile.setFileName(actualStorageName);
            }

            tempFile.setFtpPath(fullPath);
            tempFile.setFileSize((long) bytes.length);
            tempFile.setUploadTime(java.time.LocalDateTime.now());

            if (isReuseExistingTemp) {
                userFileMapper.updateById(tempFile);
            } else {
                userFileMapper.insert(tempFile);
            }

            // 生成带签名的下载链接（浏览器可直接点击）
            String downloadUrl = ftpConfig.buildDownloadUrl(tempFile.getId(), userId);
            tempFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(tempFile);

            log.info("txt_write {} temp file: id={}, sourceFileId={}, tempFileName={}, mode={}, size={}",
                    isReuseExistingTemp ? "updated" : "created",
                    tempFile.getId(), userFile.getId(), tempFile.getOriginalFileName(),
                    append ? "append" : "overwrite", bytes.length);

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", append
                    ? (isReuseExistingTemp ? "Text appended to temp file" : "Text appended (first time)")
                    : (isReuseExistingTemp ? "Text overwrote temp file" : "Text written (first time)"));
            result.put("fileId", tempFile.getId());
            result.put("sourceFileId", userFile.getId());
            result.put("fileName", tempFile.getOriginalFileName());
            result.put("storageName", tempFile.getFileName());
            result.put("downloadUrl", downloadUrl);
            result.put("writtenBack", false);
            result.put("reusedExistingTemp", isReuseExistingTemp);
            result.put("encoding", encoding);
            result.put("fileSize", (long) bytes.length);
            result.put("lineCount", content.split("\n", -1).length);
            result.put("totalChars", content.length());
            result.put("mode", append ? "append" : "overwrite");
            return FileToolResponse.ok(result, tempFile.getOriginalFileName());
        } catch (Exception e) {
            String failedName = userFile != null ? userFile.getOriginalFileName() : null;
            log.error("txt_write failed for {}", failedName, e);
            return FileToolResponse.error("txt_write failed: " + e.getMessage(), failedName);
        }
    }

    /** 生成临时文件名：foo.txt → foo_temp.txt；无扩展名时直接追加 _temp。 */
    private String generateTempOriginalName(String baseName) {
        int dot = baseName.lastIndexOf('.');
        if (dot <= 0) {
            return baseName + "_temp";
        }
        return baseName.substring(0, dot) + "_temp" + baseName.substring(dot);
    }

    /** 在原文件名基础上加后缀生成新文件名，例如 foo.txt → foo_copy.txt；无扩展名时直接追加 _copy。 */
    private String generateNewOriginalName(String baseName, String suffix) {
        int dot = baseName.lastIndexOf('.');
        if (dot <= 0) {
            return baseName + "_" + suffix;
        }
        return baseName.substring(0, dot) + "_" + suffix + baseName.substring(dot);
    }

    // ================================================================
    // 5.4.3 txt_keyword_lines — 关键词行提取
    // ================================================================

    /**
     * 提取包含关键词的所有行。
     * <p>
     * params.keyword — 必填
     * params.caseSensitive — 大小写敏感（默认 false）
     * params.contextLines — 命中行前后各取 N 行作为上下文（默认 0）
     * </p>
     */
    public FileToolResponse txtKeywordLines(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String keyword = readStringParam(params, "keyword", null);
        if (keyword == null || keyword.isEmpty()) {
            return FileToolResponse.error("params.keyword is required", userFile.getOriginalFileName());
        }
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        boolean caseSensitive = readBoolParam(params, "caseSensitive", false);
        int contextLines = readIntParam(params, "contextLines", 0);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            String searchKey = caseSensitive ? keyword : keyword.toLowerCase();
            List<Map<String, Object>> matches = new ArrayList<Map<String, Object>>();
            int total = allLines.size();
            for (int i = 0; i < total; i++) {
                String line = allLines.get(i);
                String target = caseSensitive ? line : line.toLowerCase();
                if (target.contains(searchKey)) {
                    Map<String, Object> hit = new LinkedHashMap<String, Object>();
                    hit.put("lineNumber", i + 1); // 1-based
                    hit.put("line", line);
                    if (contextLines > 0) {
                        int from = Math.max(0, i - contextLines);
                        int to = Math.min(total - 1, i + contextLines);
                        List<String> ctx = new ArrayList<String>();
                        for (int k = from; k <= to; k++) {
                            ctx.add(allLines.get(k));
                        }
                        hit.put("contextLines", ctx);
                        hit.put("contextStart", from + 1);
                        hit.put("contextEnd", to + 1);
                    }
                    matches.add(hit);
                }
            }
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("keyword", keyword);
            result.put("caseSensitive", caseSensitive);
            result.put("matchCount", matches.size());
            result.put("matches", matches);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_keyword_lines failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_keyword_lines failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.4 txt_regex — 正则匹配/提取
    // ================================================================

    /**
     * 用正则匹配每行，返回捕获组。
     * <p>
     * params.pattern — 必填，正则表达式字符串
     * params.flags — 可选，Java 正则 flags 整数（默认 0）
     * params.groupNames — 命名捕获组别名数组（可选）
     * </p>
     */
    @SuppressWarnings("unchecked")
    public FileToolResponse txtRegex(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String patternStr = readStringParam(params, "pattern", null);
        if (patternStr == null || patternStr.isEmpty()) {
            return FileToolResponse.error("params.pattern is required", userFile.getOriginalFileName());
        }
        int flags = readIntParam(params, "flags", 0);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        List<String> groupNames = (List<String>) readListParam(params, "groupNames", null);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            Pattern p = Pattern.compile(patternStr, flags);
            List<Map<String, Object>> matches = new ArrayList<Map<String, Object>>();
            int totalMatched = 0;
            for (int i = 0; i < allLines.size(); i++) {
                String line = allLines.get(i);
                Matcher m = p.matcher(line);
                while (m.find()) {
                    totalMatched++;
                    Map<String, Object> hit = new LinkedHashMap<String, Object>();
                    hit.put("lineNumber", i + 1);
                    hit.put("matchedText", m.group());
                    hit.put("start", m.start());
                    hit.put("end", m.end());
                    // 捕获组
                    Map<String, Object> groups = new LinkedHashMap<String, Object>();
                    int gc = m.groupCount();
                    for (int g = 1; g <= gc; g++) {
                        String groupValue = m.group(g);
                        String name;
                        if (groupNames != null && g - 1 < groupNames.size()) {
                            name = groupNames.get(g - 1);
                        } else {
                            try {
                                name = m.group(g) != null ? String.valueOf(g) : String.valueOf(g);
                            } catch (Exception ex) {
                                name = String.valueOf(g);
                            }
                            // 尝试按名字取
                            try {
                                String namedGroup = null;
                                // 仅在 JDK 1.8 中 Pattern 不直接支持按名字取；JDK 8+ 提供 group(String)
                                // 这里通过 m.group(name) 兼容命名捕获组
                                if (groupNames != null) {
                                    // 实际命名组的 key 应在 groupNames 中
                                }
                            } catch (Exception ex) {
                                // ignore
                            }
                        }
                        // 也尝试用命名捕获
                        groups.put(name, groupValue);
                    }
                    hit.put("groups", groups);
                    hit.put("line", line);
                    matches.add(hit);
                }
            }
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("pattern", patternStr);
            result.put("matchCount", matches.size());
            result.put("totalMatched", totalMatched);
            result.put("matches", matches);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_regex failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_regex failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.5 txt_line_range — 行范围提取
    // ================================================================

    /**
     * 提取指定行范围（1-based，含两端）。
     * <p>
     * params.startLine — 起始行 1-based（默认 1）
     * params.endLine — 结束行 1-based（默认文件末）
     * </p>
     */
    public FileToolResponse txtLineRange(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        int startLine = readIntParam(params, "startLine", 1);
        int endLine = readIntParam(params, "endLine", Integer.MAX_VALUE);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            int total = allLines.size();
            int s = Math.max(1, Math.min(startLine, total + 1));
            int e = Math.max(s - 1, Math.min(endLine, total));
            List<String> slice = new ArrayList<String>();
            for (int i = s - 1; i < e; i++) {
                slice.add(allLines.get(i));
            }
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("fileName", userFile.getOriginalFileName());
            result.put("totalLines", total);
            result.put("startLine", s);
            result.put("endLine", e);
            result.put("returnedLines", slice.size());
            result.put("lines", slice);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_line_range failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_line_range failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.6 txt_section — MD 标题章节提取
    // ================================================================

    /**
     * 提取指定标题（Markdown #/##/### 风格）下的章节内容。
     * <p>
     * params.heading — 必填，目标标题（不含 # 号）
     * params.level — 标题级别（1-6，默认 1）
     * params.includeNested — 是否包含子章节（默认 true）
     * </p>
     */
    public FileToolResponse txtSection(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String heading = readStringParam(params, "heading", null);
        if (heading == null || heading.isEmpty()) {
            return FileToolResponse.error("params.heading is required", userFile.getOriginalFileName());
        }
        int level = readIntParam(params, "level", 1);
        if (level < 1 || level > 6) {
            return FileToolResponse.error("params.level must be 1-6", userFile.getOriginalFileName());
        }
        boolean includeNested = readBoolParam(params, "includeNested", true);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            // 构造 # 模式
            StringBuilder hashPrefix = new StringBuilder();
            for (int i = 0; i < level; i++) hashPrefix.append("#");
            String targetPrefix = hashPrefix.toString() + " " + heading;
            // 找到目标行索引
            int startIdx = -1;
            for (int i = 0; i < allLines.size(); i++) {
                String line = allLines.get(i).trim();
                if (line.equals(targetPrefix)) {
                    startIdx = i;
                    break;
                }
            }
            if (startIdx < 0) {
                Map<String, Object> result = new LinkedHashMap<String, Object>();
                result.put("heading", heading);
                result.put("level", level);
                result.put("found", false);
                result.put("message", "Heading not found: " + targetPrefix);
                return FileToolResponse.ok(result, userFile.getOriginalFileName());
            }
            // 找结束（同级或更浅级标题）
            int endIdx = allLines.size();
            if (!includeNested) {
                for (int i = startIdx + 1; i < allLines.size(); i++) {
                    String line = allLines.get(i).trim();
                    if (line.startsWith("#")) {
                        // 数 # 数量
                        int hashCount = 0;
                        for (int j = 0; j < line.length() && line.charAt(j) == '#'; j++) hashCount++;
                        if (hashCount <= level) {
                            endIdx = i;
                            break;
                        }
                    }
                }
            } else {
                for (int i = startIdx + 1; i < allLines.size(); i++) {
                    String line = allLines.get(i).trim();
                    if (line.startsWith("#")) {
                        int hashCount = 0;
                        for (int j = 0; j < line.length() && line.charAt(j) == '#'; j++) hashCount++;
                        if (hashCount <= level) {
                            endIdx = i;
                            break;
                        }
                    }
                }
            }
            List<String> sectionLines = new ArrayList<String>();
            for (int i = startIdx; i < endIdx; i++) {
                sectionLines.add(allLines.get(i));
            }
            String content = joinLines(sectionLines, "\n");
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("heading", heading);
            result.put("level", level);
            result.put("found", true);
            result.put("startLine", startIdx + 1);
            result.put("endLine", endIdx);
            result.put("lineCount", sectionLines.size());
            result.put("content", content);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_section failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_section failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.7 txt_stats — 字符数/词数/行数统计
    // ================================================================

    /**
     * 统计字符数、词数、行数。
     * <p>
     * params.includeWhitespace — 是否将空白计入字符数（默认 true）
     * params.encoding — 文本编码（默认 UTF-8）
     * </p>
     */
    public FileToolResponse txtStats(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        boolean includeWs = readBoolParam(params, "includeWhitespace", true);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            int totalLines = allLines.size();
            int nonEmptyLines = 0;
            int totalChars = 0;
            int nonWsChars = 0;
            int totalWords = 0;
            for (String line : allLines) {
                if (line != null && !line.trim().isEmpty()) {
                    nonEmptyLines++;
                }
                if (line != null) {
                    totalChars += line.length();
                    for (int i = 0; i < line.length(); i++) {
                        if (!Character.isWhitespace(line.charAt(i))) {
                            nonWsChars++;
                        }
                    }
                    // 简易词数：按空白 split
                    String trimmed = line.trim();
                    if (!trimmed.isEmpty()) {
                        String[] tokens = trimmed.split("\\s+");
                        totalWords += tokens.length;
                    }
                }
            }
            long byteSize = userFile.getFileSize() != null ? userFile.getFileSize() : 0L;
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("fileName", userFile.getOriginalFileName());
            result.put("encoding", encoding);
            result.put("totalLines", totalLines);
            result.put("nonEmptyLines", nonEmptyLines);
            result.put("charCount", includeWs ? totalChars : nonWsChars);
            result.put("charCountWithWs", totalChars);
            result.put("charCountNoWs", nonWsChars);
            result.put("wordCount", totalWords);
            result.put("byteSize", byteSize);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_stats failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_stats failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.8 txt_distinct_lines — 去重行
    // ================================================================

    /**
     * 去重行（保留首次出现顺序）。**不修改原文件**，写入新文件，返回下载链接。
     * <p>
     * params.caseSensitive — 大小写敏感（默认 true）
     * params.keepEmpty — 是否保留空行（默认 true）
     * </p>
     * <p>
     * 返回字段：originalFileId, newFileId, newFileName, downloadUrl, originalLines, distinctLines, removed
     * </p>
     */
    public FileToolResponse txtDistinctLines(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        boolean caseSensitive = readBoolParam(params, "caseSensitive", true);
        boolean keepEmpty = readBoolParam(params, "keepEmpty", true);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            Set<String> seen = new LinkedHashSet<String>();
            List<String> dedup = new ArrayList<String>();
            for (String line : allLines) {
                if (line == null) continue;
                if (line.isEmpty() && !keepEmpty) continue;
                String key = caseSensitive ? line : line.toLowerCase();
                if (!seen.contains(key)) {
                    seen.add(key);
                    dedup.add(line);
                }
            }
            int original = allLines.size();
            int removed = original - dedup.size();

            // 写新文件（原文件保持不变），返回新文件 id + 下载链接
            String content = joinLines(dedup, "\n");
            byte[] bytes = content.getBytes(Charset.forName(encoding));
            String fullPath = ftpFileService.uploadFile(userId, userFile.getOriginalFileName(),
                    new ByteArrayInputStream(bytes));
            String actualFileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);

            UserFile newFile = new UserFile();
            newFile.setUserId(userId);
            newFile.setOriginalFileName(FtpFileService.getTempDisplayFileName(userFile.getOriginalFileName()));
            newFile.setFileName(actualFileName);
            newFile.setFileSize((long) bytes.length);
            newFile.setFileType(userFile.getFileType());
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
            result.put("originalFileId", userFile.getId());
            result.put("newFileId", newFile.getId());
            result.put("newFileName", newFile.getOriginalFileName());
            result.put("originalFileName", newFile.getOriginalFileName());
            result.put("sourceFileName", userFile.getOriginalFileName());
            result.put("downloadUrl", downloadUrl);
            result.put("originalLines", original);
            result.put("distinctLines", dedup.size());
            result.put("removed", removed);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_distinct_lines failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_distinct_lines failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.9 txt_sort_lines — 排序行
    // ================================================================

    /**
     * 排序行（字典序/数字序）。**不修改原文件**，写入新文件，返回下载链接。
     * <p>
     * params.order — 升序/降序（asc/desc，默认 asc）
     * params.numeric — 是否按数字排序（默认 false 字典序）
     * params.caseSensitive — 字典序时是否大小写敏感（默认 false）
     * </p>
     * <p>
     * 返回字段：originalFileId, newFileId, newFileName, downloadUrl, order, numeric, lineCount
     * </p>
     */
    public FileToolResponse txtSortLines(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String order = readStringParam(params, "order", "asc").toLowerCase();
        boolean numeric = readBoolParam(params, "numeric", false);
        boolean caseSensitive = readBoolParam(params, "caseSensitive", false);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            List<String> sorted = new ArrayList<String>(allLines);
            final boolean asc = "asc".equals(order);
            final boolean num = numeric;
            final boolean cs = caseSensitive;
            Collections.sort(sorted, new Comparator<String>() {
                @Override
                public int compare(String a, String b) {
                    int cmp;
                    if (num) {
                        // 抽取每行的首个数字用于比较
                        double na = extractLeadingNumber(a);
                        double nb = extractLeadingNumber(b);
                        cmp = Double.compare(na, nb);
                    } else {
                        String sa = cs ? a : (a == null ? "" : a.toLowerCase());
                        String sb = cs ? b : (b == null ? "" : b.toLowerCase());
                        cmp = sa.compareTo(sb);
                    }
                    return asc ? cmp : -cmp;
                }
            });

            // 写新文件（原文件保持不变），返回新文件 id + 下载链接
            String content = joinLines(sorted, "\n");
            byte[] bytes = content.getBytes(Charset.forName(encoding));
            String fullPath = ftpFileService.uploadFile(userId, userFile.getOriginalFileName(),
                    new ByteArrayInputStream(bytes));
            String actualFileName = fullPath.substring(fullPath.lastIndexOf('/') + 1);

            UserFile newFile = new UserFile();
            newFile.setUserId(userId);
            newFile.setOriginalFileName(FtpFileService.getTempDisplayFileName(userFile.getOriginalFileName()));
            newFile.setFileName(actualFileName);
            newFile.setFileSize((long) bytes.length);
            newFile.setFileType(userFile.getFileType());
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
            result.put("originalFileId", userFile.getId());
            result.put("newFileId", newFile.getId());
            result.put("newFileName", newFile.getOriginalFileName());
            result.put("originalFileName", newFile.getOriginalFileName());
            result.put("sourceFileName", userFile.getOriginalFileName());
            result.put("downloadUrl", downloadUrl);
            result.put("order", asc ? "asc" : "desc");
            result.put("numeric", numeric);
            result.put("lineCount", sorted.size());
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_sort_lines failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_sort_lines failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 5.4.10 txt_keyword_freq — 关键词频率统计
    // ================================================================

    /**
     * 关键词（子串）频率统计。
     * <p>
     * params.keywords — 必填，关键词列表（List&lt;String&gt;）
     * params.caseSensitive — 大小写敏感（默认 false）
     * params.topN — 最多返回前 N 个（默认全部）
     * </p>
     */
    @SuppressWarnings("unchecked")
    public FileToolResponse txtKeywordFreq(UserFile userFile, Map<String, Object> params, String userId) {
        ensureTextFile(userFile);
        String keywordsStr = readStringParam(params, "keywords", null);
        if (keywordsStr == null || keywordsStr.trim().isEmpty()) {
            return FileToolResponse.error("params.keywords is required", userFile.getOriginalFileName());
        }
        List<String> keywords = new ArrayList<String>();
        for (String kw : keywordsStr.split(",")) {
            String trimmed = kw.trim();
            if (!trimmed.isEmpty()) keywords.add(trimmed);
        }
        if (keywords.isEmpty()) {
            return FileToolResponse.error("params.keywords must not be empty", userFile.getOriginalFileName());
        }
        boolean caseSensitive = readBoolParam(params, "caseSensitive", false);
        int topN = readIntParam(params, "topN", Integer.MAX_VALUE);
        String encoding = readStringParam(params, "encoding", DEFAULT_ENCODING);
        try {
            List<String> allLines = readAllLines(userFile, encoding);
            String text = joinLines(allLines, "\n");
            String targetText = caseSensitive ? text : text.toLowerCase();

            List<Map<String, Object>> freqList = new ArrayList<Map<String, Object>>();
            int totalMatches = 0;
            for (String kw : keywords) {
                if (kw == null || kw.isEmpty()) continue;
                String searchKey = caseSensitive ? kw : kw.toLowerCase();
                int count = 0;
                int idx = 0;
                while ((idx = targetText.indexOf(searchKey, idx)) >= 0) {
                    count++;
                    idx += searchKey.length();
                }
                totalMatches += count;
                Map<String, Object> entry = new LinkedHashMap<String, Object>();
                entry.put("keyword", kw);
                entry.put("count", count);
                freqList.add(entry);
            }
            // 按 count 降序排
            Collections.sort(freqList, new Comparator<Map<String, Object>>() {
                @Override
                public int compare(Map<String, Object> a, Map<String, Object> b) {
                    int ca = (Integer) a.get("count");
                    int cb = (Integer) b.get("count");
                    return Integer.compare(cb, ca);
                }
            });
            // topN 截断
            List<Map<String, Object>> limited = new ArrayList<Map<String, Object>>();
            for (int i = 0; i < Math.min(topN, freqList.size()); i++) {
                limited.add(freqList.get(i));
            }

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("fileName", userFile.getOriginalFileName());
            result.put("caseSensitive", caseSensitive);
            result.put("totalKeywords", keywords.size());
            result.put("totalMatches", totalMatches);
            result.put("frequency", limited);
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("txt_keyword_freq failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("txt_keyword_freq failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 内部辅助
    // ================================================================

    private void ensureTextFile(UserFile userFile) {
        String ext = extractExtension(userFile.getOriginalFileName());
        if (!"txt".equals(ext) && !"md".equals(ext) && !"markdown".equals(ext)) {
            throw new IllegalArgumentException("Not a text file: " + userFile.getOriginalFileName()
                    + ". Use 'txt_*' APIs only with .txt/.md/.markdown files.");
        }
    }

    private String extractExtension(String fileName) {
        if (fileName == null) return "";
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) return "";
        return fileName.substring(dot + 1).toLowerCase();
    }

    private List<String> readAllLines(UserFile userFile, String encoding) throws IOException {
        ByteArrayOutputStream baos = ftpFileService.downloadFile(userFile.getUserId(), userFile.getFileName());
        Charset cs = Charset.forName(encoding);
        List<String> lines = new ArrayList<String>();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ByteArrayInputStream(baos.toByteArray()), cs));
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                lines.add(line);
            }
        } finally {
            try { reader.close(); } catch (Exception ignored) {}
        }
        return lines;
    }

    private String uploadBytes(String userId, String storageName, byte[] bytes) throws IOException {
        ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
        return ftpFileService.uploadFile(userId, storageName, bais);
    }

    /**
     * 用原 storageName 覆盖写回文件（保留文件名不生成新 UUID）。
     * <p>
     * 用于 inPlace 语义的去重/排序/替换等场景，确保"原文件被修改"——
     * fileRef 仍然是同一个，user_files 行的 file_name 不变，DB 与磁盘一致。
     * </p>
     */
    /**
     * 用指定 storageName 覆盖 FTP 文件（不做 UUID 重命名，保证 DB 的 fileName 与 FTP 路径始终一致）。
     * 注意：必须用 {@code uploadFileWithFileName}（指定文件名覆盖），而非 {@code uploadFile}
     *（后者内部会 generateStorageFileName 生成新 UUID，导致 DB fileName 与 FTP 文件不同）。
     */
    private String overwriteBytes(String userId, String storageName, byte[] bytes) throws IOException {
        ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
        return ftpFileService.uploadFileWithFileName(userId, storageName, bais);
    }

    private String generateNewStorageName(String originalFileName) {
        String ext = extractExtension(originalFileName);
        String uuid = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        return ext.isEmpty() ? uuid : uuid + "." + ext;
    }

    private String joinLines(List<String> lines, String sep) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(lines.get(i));
        }
        return sb.toString();
    }

    private double extractLeadingNumber(String s) {
        if (s == null) return 0.0;
        String trimmed = s.trim();
        int i = 0;
        if (i < trimmed.length() && (trimmed.charAt(i) == '-' || trimmed.charAt(i) == '+')) i++;
        int start = i;
        boolean dotFound = false;
        while (i < trimmed.length()) {
            char c = trimmed.charAt(i);
            if (c >= '0' && c <= '9') {
                i++;
            } else if (c == '.' && !dotFound) {
                dotFound = true;
                i++;
            } else {
                break;
            }
        }
        if (i == start) return 0.0;
        try {
            return Double.parseDouble(trimmed.substring(0, i));
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    // ========== 参数读取 ==========

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
    private Object readListParam(Map<String, Object> params, String key, Object def) {
        if (params == null) return def;
        Object v = params.get(key);
        if (v instanceof List) {
            return v;
        }
        return def;
    }
}
