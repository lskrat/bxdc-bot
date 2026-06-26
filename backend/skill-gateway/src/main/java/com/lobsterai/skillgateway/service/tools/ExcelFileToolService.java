package com.lobsterai.skillgateway.service.tools;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.dto.FileToolResponse;
import com.lobsterai.skillgateway.entity.UserFile;
import com.lobsterai.skillgateway.mapper.UserFileMapper;
import com.lobsterai.skillgateway.config.FtpConfig;
import com.lobsterai.skillgateway.service.FileToolConversationContext;
import com.lobsterai.skillgateway.service.FileToolService;
import com.lobsterai.skillgateway.service.FtpFileService;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.annotation.PostConstruct;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.*;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Excel 文件工具服务（模型工具调用入口）。
 * <p>
 * 为模型调用提供 Excel 文件操作能力，支持链式操作：
 * - 每次操作后将结果保存为新文件，文件名格式：原文件名_temp_v1, _temp_v2, ...
 * - 返回结果包含新文件地址，供下一步操作使用
 * - 支持通过 fileRef 参数引用原始文件或临时文件
 * </p>
 * <p>
 * 与 {@link com.lobsterai.skillgateway.service.ExcelToolService} 的区别：
 * - 本类：供模型工具调用，返回 {@link FileToolResponse}
 * - ExcelToolService：供 REST API 调用，返回 {@link com.lobsterai.skillgateway.dto.ExcelOperationResult}
 * </p>
 */
@Service
public class ExcelFileToolService {

    private static final Logger log = LoggerFactory.getLogger(ExcelFileToolService.class);

    private final FileToolService fileToolService;
    private final FtpFileService ftpFileService;
    private final FtpConfig ftpConfig;
    private final UserFileMapper userFileMapper;

    @Value("${app.base-url:http://localhost:18080}")
    private String baseUrl;

    @Autowired
    public ExcelFileToolService(FileToolService fileToolService, FtpFileService ftpFileService, FtpConfig ftpConfig, UserFileMapper userFileMapper) {
        this.fileToolService = fileToolService;
        this.ftpFileService = ftpFileService;
        this.ftpConfig = ftpConfig;
        this.userFileMapper = userFileMapper;
    }

    /** Spring 启动后自动注册到 FileToolService。 */
    @PostConstruct
    public void registerHandlers() {
        fileToolService.registerHandler("excel_read", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelRead(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_write", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelWrite(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_filter", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelFilter(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_sort", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelSort(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_aggregate", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelAggregate(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_pivot", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelPivot(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_calculate", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelCalculate(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_select_columns", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelSelectColumns(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_clean", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelClean(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_convert_format", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelConvertFormat(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_validate", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelValidate(userFile, params, userId);
            }
        });
        fileToolService.registerHandler("excel_init_temp", new FileToolService.ToolHandler() {
            @Override
            public FileToolResponse handle(UserFile userFile, Map<String, Object> params, String userId) throws Exception {
                return excelInitTemp(userFile, params, userId);
            }
        });
        log.info("ExcelFileToolService registered 12 handlers: excel_read/write/filter/sort/aggregate/pivot/calculate/select_columns/clean/convert_format/validate/init_temp");
    }

    // ================================================================
    // excel_init_temp — 初始化临时文件（创建临时文件副本）
    // ================================================================

    /**
     * 根据原文件生成临时文件，上传到 FTP 并在 user_files 表中创建新记录。
     * 
     * <p>返回新临时文件的 ID，后续文件操作都使用这个临时文件 ID。</p>
     * <p>后续 Excel 操作都在临时文件上进行覆盖更新，最终可将临时文件内容写回源文件。</p>
     * 
     * @param userFile 文件实体
     * @param params   参数：无
     * @param userId   用户 ID
     * @return 临时文件信息，包含临时文件 ID、源文件 ID、下载路径和表头
     */
    public FileToolResponse excelInitTemp(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);

        try {
            // 保存源文件 ID
            Long sourceFileId = userFile.getId();
            
            // 读取原文件内容
            byte[] fileBytes = downloadBytes(userFile);
            int fileSize = fileBytes.length;
            
            // 生成临时文件名
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            
            // 上传临时文件到 FTP（使用新生成的文件名）
            String ftpPath = ftpFileService.uploadFile(userId, tempFileName, new ByteArrayInputStream(fileBytes));
            
            // 提取 FTP 存储的文件名（UUID + 扩展名）
            String storageFileName = ftpPath.substring(ftpPath.lastIndexOf('/') + 1);
            
            // 在 user_files 表中创建新记录
            UserFile tempUserFile = new UserFile();
            tempUserFile.setUserId(userId);
            tempUserFile.setOriginalFileName(tempFileName);
            tempUserFile.setFileName(storageFileName);
            tempUserFile.setFileSize((long) fileSize);
            tempUserFile.setFileType(userFile.getFileType());
            tempUserFile.setFtpPath(ftpPath);
            tempUserFile.setSourceFileId(sourceFileId);
            tempUserFile.setIsToolGenerated(1);
            tempUserFile.setConversationId(FileToolConversationContext.getConversationId());
            tempUserFile.setUploadTime(LocalDateTime.now());
            userFileMapper.insert(tempUserFile);
            
            Long tempFileId = tempUserFile.getId();
            
            // 生成完整下载 URL（包含域名和签名 token）
            String downloadUrl = ftpConfig.buildDownloadUrl(tempFileId, userId);
            tempUserFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(tempUserFile);
            
            log.info("excel_init_temp created temp file: id={}, sourceFileId={}, tempFileName={}, downloadUrl={}", 
                    tempFileId, sourceFileId, tempFileName, downloadUrl);
            
            // 读取文件内容用于返回预览
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = wb.getSheetAt(0);
            
            // 获取表头信息
            List<String> headers = new ArrayList<String>();
            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                int cellCount = headerRow.getPhysicalNumberOfCells();
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = headerRow.getCell(j);
                    headers.add(getCellStringValue(cell));
                }
            }
            
            wb.close();

            // 构建返回结果
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "临时文件初始化成功");
            result.put("fileId", tempFileId);
            result.put("sourceFileId", sourceFileId);
            result.put("fileName", tempFileName);
            result.put("filePath", ftpPath);
            result.put("downloadUrl", downloadUrl);
            result.put("headers", headers);

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_init_temp failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_init_temp failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_read — 读取 Excel 内容（不修改文件，无需保存）
    // ================================================================

    /**
     * 读取 Excel 文件的内容（支持分页和多工作表）。
     *
     * @param userFile 文件实体
     * @param params   参数：page（页码，从 1 开始，默认 1）、pageSize（每页行数，默认 50）、sheetIndex（工作表索引，从 0 开始，默认 0）、sheetName（工作表名称，优先于 sheetIndex）
     * @param userId   用户 ID
     * @return Excel 内容数据（含分页信息和工作表信息）
     */
    public FileToolResponse excelRead(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        int page = Math.max(1, readIntParam(params, "page", 1));
        int pageSize = Math.max(1, readIntParam(params, "pageSize", 50));
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());

            Sheet sheet;
            int actualSheetIndex;
            String actualSheetName;

            if (sheetName != null && !sheetName.trim().isEmpty()) {
                sheet = wb.getSheet(sheetName);
                actualSheetIndex = wb.getSheetIndex(sheet);
                actualSheetName = sheetName;
            } else {
                sheet = wb.getSheetAt(sheetIndex);
                actualSheetIndex = sheetIndex;
                actualSheetName = wb.getSheetName(sheetIndex);
            }

            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            List<String> allSheetNames = new ArrayList<String>();
            for (int i = 0; i < wb.getNumberOfSheets(); i++) {
                allSheetNames.add(wb.getSheetName(i));
            }

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            List<String> headers = new ArrayList<String>();
            List<List<Object>> rows = new ArrayList<List<Object>>();

            int rowCount = sheet.getPhysicalNumberOfRows();
            int dataRowCount = rowCount - 1;
            int totalPages = (int) Math.ceil((double) dataRowCount / pageSize);
            int startRow = (page - 1) * pageSize + 1;
            int endRow = Math.min(startRow + pageSize, rowCount);

            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                int cellCount = headerRow.getPhysicalNumberOfCells();
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = headerRow.getCell(j);
                    headers.add(getCellStringValue(cell));
                }
            }

            for (int i = startRow; i < endRow; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                List<Object> rowData = new ArrayList<Object>();
                int cellCount = row.getPhysicalNumberOfCells();
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = row.getCell(j);
                    rowData.add(getCellValue(cell));
                }
                rows.add(rowData);
            }

            Long resultFileId = userFile.getId();
            String downloadUrl = ftpConfig.buildDownloadUrl(resultFileId, userId);

            result.put("headers", headers);
            result.put("rows", rows);
            result.put("currentPage", page);
            result.put("pageSize", pageSize);
            result.put("totalPages", totalPages);
            result.put("totalRows", dataRowCount);
            result.put("totalCols", headers.size());
            result.put("hasMore", page < totalPages);
            result.put("fileId", resultFileId);
            result.put("fileName", userFile.getOriginalFileName());
            result.put("downloadUrl", downloadUrl);
            result.put("sheetName", actualSheetName);
            result.put("sheetIndex", actualSheetIndex);
            result.put("totalSheets", wb.getNumberOfSheets());
            result.put("sheetNames", allSheetNames);

            wb.close();
            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("excel_read failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_read failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_write — 写入 Excel 文件（新建文件）
    // ================================================================

    /**
     * 创建或覆盖 Excel 文件。
     *
     * @param userFile 文件实体（如果为 null 则创建新文件）
     * @param params   参数：headers（列头）、rows（数据行）
     * @param userId   用户 ID
     * @return 写入结果，包含临时文件地址
     */
    @SuppressWarnings("unchecked")
    public FileToolResponse excelWrite(UserFile userFile, Map<String, Object> params, String userId) {
        try {
            // 安全解析 headers（可能是 List 或 JSON String）
            List<String> headers = parseStringList(params.get("headers"));
            // 安全解析 rows（可能是 List 或 JSON String）
            List<List<Object>> rows = parseRowsList(params.get("rows"));
            // 获取工作表名称，默认为 "Sheet1"
            String sheetName = readStringParam(params, "sheetName", "Sheet1");

            if (headers == null || headers.isEmpty()) {
                return FileToolResponse.error("params.headers is required", 
                        userFile != null ? userFile.getOriginalFileName() : "new.xlsx");
            }

            Workbook wb;
            if (userFile != null) {
                // 有 fileId：在原文件的工作簿上追加/替换工作表，避免整体覆盖丢失已有 sheet
                byte[] existingBytes = downloadBytes(userFile);
                wb = createWorkbook(existingBytes, userFile.getOriginalFileName());
                // 同名工作表已存在则先移除（按 sheetName 覆盖该 sheet），否则追加新 sheet
                int existingIdx = wb.getSheetIndex(sheetName);
                if (existingIdx >= 0) {
                    wb.removeSheetAt(existingIdx);
                }
            } else {
                // 无 fileId：创建全新工作簿
                wb = new XSSFWorkbook();
            }
            Sheet sheet = wb.createSheet(sheetName);
            writeDataToSheet(sheet, headers, rows);

            // 将工作簿写入内存，获取文件大小
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            wb.write(baos);
            byte[] fileBytes = baos.toByteArray();
            long fileSize = fileBytes.length;
            wb.close();

            // 生成文件名
            String fileName;
            Long resultFileId;
            String downloadUrl;
            String ftpPath;
            
            if (userFile != null) {
                // 有 fileId：在临时文件基础上操作
                fileName = getTempFileName(userFile.getOriginalFileName());
                ftpPath = saveWorkbookWithBytes(userId, userFile.getFileName(), fileBytes);
                
                resultFileId = userFile.getId();
                downloadUrl = ftpConfig.buildDownloadUrl(resultFileId, userId);
            } else {
                // 无 fileId：创建新文件，插入 userfile 表
                // 生成显示文件名和 UUID 存储文件名
                String displayFileName = "new_" + System.currentTimeMillis() + ".xlsx";
                String storageFileName = FtpFileService.generateStorageFileName(displayFileName);
                
                // 使用 UUID 存储文件名上传到 FTP
                ftpPath = ftpFileService.uploadFileWithFileName(userId, storageFileName, new ByteArrayInputStream(fileBytes));
                
                // 插入 userfile 表
                UserFile newUserFile = new UserFile();
                newUserFile.setUserId(userId);
                newUserFile.setOriginalFileName(displayFileName); // 显示文件名
                newUserFile.setFileName(storageFileName); // UUID 存储文件名
                newUserFile.setFileType("xlsx");
                newUserFile.setFileSize(fileSize);
                newUserFile.setFtpPath(ftpPath);
                newUserFile.setSourceFileId(null); // 新文件，不是临时文件
                newUserFile.setIsToolGenerated(1); // tool 新建文件，查重/列表排除
                newUserFile.setConversationId(FileToolConversationContext.getConversationId());
                newUserFile.setUploadTime(LocalDateTime.now()); // 设置上传时间
                userFileMapper.insert(newUserFile);
                
                resultFileId = newUserFile.getId();
                downloadUrl = ftpConfig.buildDownloadUrl(resultFileId, userId);
                // 回写 downloadUrl 到数据库
                newUserFile.setDownloadUrl(downloadUrl);
                userFileMapper.updateById(newUserFile);
                fileName = displayFileName;
                
                log.info("Created new file without fileId: userId={}, displayFileName={}, storageFileName={}, fileId={}, fileSize={}, ftpPath={}", 
                        userId, displayFileName, storageFileName, resultFileId, fileSize, ftpPath);
            }

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Excel file written successfully");
            result.put("fileName", fileName);
            result.put("fileId", resultFileId);
            result.put("downloadUrl", downloadUrl);
            result.put("filePath", ftpPath);
            result.put("totalRows", rows != null ? rows.size() : 0);
            result.put("totalCols", headers.size());

            return FileToolResponse.ok(result, fileName);
        } catch (Exception e) {
            log.error("excel_write failed", e);
            return FileToolResponse.error("excel_write failed: " + e.getMessage(), 
                    userFile != null ? userFile.getOriginalFileName() : "new.xlsx");
        }
    }

    /**
     * 使用字节数组保存工作簿到 FTP（覆盖写入）。
     */
    private String saveWorkbookWithBytes(String userId, String fileName, byte[] fileBytes) throws IOException {
        return ftpFileService.uploadFileWithFileName(userId, fileName, new ByteArrayInputStream(fileBytes));
    }

    /**
     * 安全解析 String List 参数，支持 List 或 JSON String 类型。
     */
    @SuppressWarnings("unchecked")
    private List<String> parseStringList(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String) {
            try {
                ObjectMapper mapper = new ObjectMapper();
                return mapper.readValue((String) value, new TypeReference<List<String>>() {});
            } catch (Exception e) {
                log.warn("Failed to parse JSON string list: {}", value, e);
                return null;
            }
        }
        if (value instanceof List) {
            return (List<String>) value;
        }
        return null;
    }

    /**
     * 安全解析 rows 参数（二维数组），支持 List 或 JSON String 类型。
     */
    @SuppressWarnings("unchecked")
    private List<List<Object>> parseRowsList(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String) {
            try {
                ObjectMapper mapper = new ObjectMapper();
                return mapper.readValue((String) value, mapper.getTypeFactory()
                        .constructCollectionType(List.class, 
                                mapper.getTypeFactory().constructCollectionType(List.class, Object.class)));
            } catch (Exception e) {
                log.warn("Failed to parse JSON rows list: {}", value, e);
                return null;
            }
        }
        if (value instanceof List) {
            return (List<List<Object>>) value;
        }
        return null;
    }

    /**
     * 安全解析 Map List 参数（二维数组），支持 List 或 JSON String 类型。
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseMapList(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String) {
            try {
                ObjectMapper mapper = new ObjectMapper();
                return mapper.readValue((String) value, new TypeReference<List<Map<String, Object>>>() {});
            } catch (Exception e) {
                log.warn("Failed to parse JSON map list: {}", value, e);
                return null;
            }
        }
        if (value instanceof List) {
            return (List<Map<String, Object>>) value;
        }
        return null;
    }

    // ================================================================
    // excel_filter — 数据筛选（修改文件，需要保存）
    // ================================================================

    /**
     * 根据条件筛选数据行。
     *
     * @param userFile 文件实体
     * @param params   参数：column（列名）、operator（操作符：equals, contains, gt, lt, etc.）、value（筛选值）
     * @param userId   用户 ID
     * @return 筛选结果，包含临时文件地址
     */
    public FileToolResponse excelFilter(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String column = readStringParam(params, "column", null);
        String operator = readStringParam(params, "operator", "equals");
        String value = readStringParam(params, "value", null);
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (column == null || value == null) {
            return FileToolResponse.error("params.column and params.value are required", userFile.getOriginalFileName());
        }

        try {
            // 读取文件：优先读取临时文件，不存在则读取原文件
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 执行筛选
            List<String> headers = new ArrayList<String>();
            List<List<Object>> filteredRows = new ArrayList<List<Object>>();
            int columnIndex = -1;

            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 0; i < rowCount; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                List<Object> rowData = new ArrayList<Object>();
                int cellCount = row.getPhysicalNumberOfCells();
                
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = row.getCell(j);
                    if (i == 0) {
                        String header = getCellStringValue(cell);
                        headers.add(header);
                        if (header.equals(column)) {
                            columnIndex = j;
                        }
                    } else {
                        rowData.add(getCellValue(cell));
                    }
                }
                
                if (i > 0) {
                    if (columnIndex >= 0 && columnIndex < rowData.size()) {
                        Object cellValue = rowData.get(columnIndex);
                        if (matchesFilter(cellValue, operator, value)) {
                            filteredRows.add(rowData);
                        }
                    }
                }
            }

            // 清空选中的工作表，写入筛选后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, headers, filteredRows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Filter completed");
            result.putAll(saveResult);
            result.put("headers", headers);
            result.put("rows", filteredRows);
            result.put("totalRows", filteredRows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_filter failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_filter failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_sort — 数据排序（修改文件，需要保存）
    // ================================================================

    /**
     * 根据指定列排序数据。
     *
     * @param userFile 文件实体
     * @param params   参数：column（列名）、order（排序方向：asc/desc，默认asc）
     * @param userId   用户 ID
     * @return 排序结果，包含临时文件地址
     */
    public FileToolResponse excelSort(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String column = readStringParam(params, "column", null);
        String order = readStringParam(params, "order", "asc");
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (column == null) {
            return FileToolResponse.error("params.column is required", userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 读取数据
            List<String> headers = new ArrayList<String>();
            List<List<Object>> rows = new ArrayList<List<Object>>();
            int columnIndex = -1;

            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 0; i < rowCount; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                List<Object> rowData = new ArrayList<Object>();
                int cellCount = row.getPhysicalNumberOfCells();
                
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = row.getCell(j);
                    if (i == 0) {
                        String header = getCellStringValue(cell);
                        headers.add(header);
                        if (header.equals(column)) {
                            columnIndex = j;
                        }
                    } else {
                        rowData.add(getCellValue(cell));
                    }
                }
                
                if (i > 0) {
                    rows.add(rowData);
                }
            }

            // 执行排序
            if (columnIndex >= 0) {
                final int colIdx = columnIndex;
                rows.sort(new Comparator<List<Object>>() {
                    @Override
                    public int compare(List<Object> r1, List<Object> r2) {
                        Object v1 = colIdx < r1.size() ? r1.get(colIdx) : null;
                        Object v2 = colIdx < r2.size() ? r2.get(colIdx) : null;
                        int result = compareValues(v1, v2);
                        return "desc".equalsIgnoreCase(order) ? -result : result;
                    }
                });
            }

            // 清空选中的工作表，写入排序后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, headers, rows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Sort completed");
            result.putAll(saveResult);
            result.put("headers", headers);
            result.put("rows", rows);
            result.put("totalRows", rows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_sort failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_sort failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_aggregate — 聚合统计（修改文件，需要保存）
    // ================================================================

    /**
     * 按指定列分组并进行聚合统计。
     *
     * @param userFile 文件实体
     * @param params   参数：groupBy（分组列名）、aggColumn（聚合列名）、aggType（聚合类型：sum, avg, count, min, max）
     * @param userId   用户 ID
     * @return 聚合结果，包含临时文件地址
     */
    public FileToolResponse excelAggregate(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String groupBy = readStringParam(params, "groupBy", null);
        String aggColumn = readStringParam(params, "aggColumn", null);
        String aggType = readStringParam(params, "aggType", "sum");
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (groupBy == null || aggColumn == null) {
            return FileToolResponse.error("params.groupBy and params.aggColumn are required", userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 执行聚合
            List<String> headers = new ArrayList<String>();
            Map<String, Double> aggregates = new LinkedHashMap<String, Double>();
            Map<String, Long> counts = new LinkedHashMap<String, Long>();
            Map<String, Double> mins = new LinkedHashMap<String, Double>();
            Map<String, Double> maxs = new LinkedHashMap<String, Double>();
            
            int groupByIndex = -1;
            int aggIndex = -1;

            int rowCount = sheet.getPhysicalNumberOfRows();

            // 第一行：解析表头，建立 groupBy / aggColumn 列索引
            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                int cellCount = headerRow.getPhysicalNumberOfCells();
                for (int j = 0; j < cellCount; j++) {
                    String header = getCellStringValue(headerRow.getCell(j));
                    headers.add(header);
                    if (header.equals(groupBy)) {
                        groupByIndex = j;
                    }
                    if (header.equals(aggColumn)) {
                        aggIndex = j;
                    }
                }
            }

            // 数据行：每行只累加一次（修复此前在内层遍历每列时重复累加、放大列数倍的 bug）
            if (groupByIndex >= 0 && aggIndex >= 0) {
                for (int i = 1; i < rowCount; i++) {
                    Row row = sheet.getRow(i);
                    if (row == null) continue;

                    Cell groupCell = row.getCell(groupByIndex);
                    if (groupCell == null) continue;

                    String groupKey = getCellStringValue(groupCell);
                    counts.put(groupKey, counts.getOrDefault(groupKey, 0L) + 1L);

                    Object aggValue = getCellValue(row.getCell(aggIndex));
                    if (aggValue instanceof Number) {
                        double numValue = ((Number) aggValue).doubleValue();
                        aggregates.put(groupKey, aggregates.getOrDefault(groupKey, 0.0) + numValue);
                        mins.put(groupKey, Math.min(mins.getOrDefault(groupKey, Double.MAX_VALUE), numValue));
                        maxs.put(groupKey, Math.max(maxs.getOrDefault(groupKey, -Double.MAX_VALUE), numValue));
                    }
                }
            }

            // 构建结果数据（按出现过的分组遍历 counts，保证 count 聚合对纯非数值组也正确）
            List<String> resultHeaders = Arrays.asList(groupBy, aggType + "_" + aggColumn);
            List<List<Object>> resultRows = new ArrayList<List<Object>>();
            for (Map.Entry<String, Long> entry : counts.entrySet()) {
                String groupKey = entry.getKey();
                List<Object> row = new ArrayList<Object>();
                row.add(groupKey);

                double value;
                if ("count".equalsIgnoreCase(aggType)) {
                    value = entry.getValue();
                } else if ("avg".equalsIgnoreCase(aggType)) {
                    value = entry.getValue() > 0 ? aggregates.getOrDefault(groupKey, 0.0) / entry.getValue() : 0.0;
                } else if ("min".equalsIgnoreCase(aggType)) {
                    value = mins.getOrDefault(groupKey, 0.0);
                } else if ("max".equalsIgnoreCase(aggType)) {
                    value = maxs.getOrDefault(groupKey, 0.0);
                } else {
                    // sum（默认）
                    value = aggregates.getOrDefault(groupKey, 0.0);
                }
                row.add(value);
                resultRows.add(row);
            }

            // 清空选中的工作表，写入聚合后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, resultHeaders, resultRows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Aggregation completed");
            result.putAll(saveResult);
            result.put("headers", resultHeaders);
            result.put("rows", resultRows);
            result.put("totalRows", resultRows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_aggregate failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_aggregate failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_pivot — 透视分析（修改文件，需要保存）
    // ================================================================

    /**
     * 透视分析：行维度、列维度、值聚合。
     *
     * @param userFile 文件实体
     * @param params   参数：rowDimension（行维度）、colDimension（列维度）、valueColumn（值列）
     * @param userId   用户 ID
     * @return 透视结果，包含临时文件地址
     */
    public FileToolResponse excelPivot(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String rowDimension = readStringParam(params, "rowDimension", null);
        String colDimension = readStringParam(params, "colDimension", null);
        String valueColumn = readStringParam(params, "valueColumn", null);
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (rowDimension == null || colDimension == null || valueColumn == null) {
            return FileToolResponse.error("params.rowDimension, params.colDimension and params.valueColumn are required", 
                    userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 执行透视
            Map<String, Map<String, Double>> pivot = new LinkedHashMap<String, Map<String, Double>>();
            Set<String> colValues = new LinkedHashSet<String>();
            
            int rowIdx = -1, colIdx = -1, valIdx = -1;

            int rowCount = sheet.getPhysicalNumberOfRows();

            // 第一行：解析表头，建立 行维度/列维度/值列 索引
            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                int cellCount = headerRow.getPhysicalNumberOfCells();
                for (int j = 0; j < cellCount; j++) {
                    String header = getCellStringValue(headerRow.getCell(j));
                    if (header.equals(rowDimension)) rowIdx = j;
                    if (header.equals(colDimension)) colIdx = j;
                    if (header.equals(valueColumn)) valIdx = j;
                }
            }

            // 数据行：每行只累加一次（修复此前在内层遍历每列时重复累加、放大列数倍的 bug）
            if (rowIdx >= 0 && colIdx >= 0 && valIdx >= 0) {
                for (int i = 1; i < rowCount; i++) {
                    Row row = sheet.getRow(i);
                    if (row == null) continue;

                    String rowVal = getCellStringValue(row.getCell(rowIdx));
                    String colVal = getCellStringValue(row.getCell(colIdx));
                    Object val = getCellValue(row.getCell(valIdx));

                    pivot.computeIfAbsent(rowVal, k -> new LinkedHashMap<String, Double>());
                    colValues.add(colVal);

                    if (val instanceof Number) {
                        double numVal = ((Number) val).doubleValue();
                        pivot.get(rowVal).merge(colVal, numVal, Double::sum);
                    }
                }
            }

            // 构建结果数据
            List<String> resultHeaders = new ArrayList<String>();
            resultHeaders.add(rowDimension);
            resultHeaders.addAll(colValues);

            List<List<Object>> resultRows = new ArrayList<List<Object>>();
            for (Map.Entry<String, Map<String, Double>> entry : pivot.entrySet()) {
                List<Object> rowData = new ArrayList<Object>();
                rowData.add(entry.getKey());
                for (String col : colValues) {
                    rowData.add(entry.getValue().getOrDefault(col, 0.0));
                }
                resultRows.add(rowData);
            }

            // 清空选中的工作表，写入透视后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, resultHeaders, resultRows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Pivot analysis completed");
            result.putAll(saveResult);
            result.put("headers", resultHeaders);
            result.put("rows", resultRows);
            result.put("totalRows", resultRows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_pivot failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_pivot failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_calculate — 列运算（修改文件，需要保存）
    // ================================================================

    /**
     * 执行列运算，新增计算列。
     *
     * @param userFile 文件实体
     * @param params   参数：newColumn（新列名）、formula（计算公式，如 {col1} + {col2}）
     * @param userId   用户 ID
     * @return 运算结果，包含临时文件地址
     */
    public FileToolResponse excelCalculate(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String newColumn = readStringParam(params, "newColumn", null);
        String formula = readStringParam(params, "formula", null);
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (newColumn == null || formula == null) {
            return FileToolResponse.error("params.newColumn and params.formula are required", userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 读取数据并计算
            List<String> headers = new ArrayList<String>();
            List<List<Object>> rows = new ArrayList<List<Object>>();
            Map<String, Integer> headerIndices = new LinkedHashMap<String, Integer>();

            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 0; i < rowCount; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                List<Object> rowData = new ArrayList<Object>();
                int cellCount = row.getPhysicalNumberOfCells();
                
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = row.getCell(j);
                    if (i == 0) {
                        String header = getCellStringValue(cell);
                        headers.add(header);
                        headerIndices.put(header, j);
                    } else {
                        rowData.add(getCellValue(cell));
                    }
                }
                
                if (i > 0) {
                    // 计算新列值
                    double result = evaluateFormula(formula, rowData, headerIndices, headers);
                    rowData.add(result);
                    rows.add(rowData);
                }
            }
            headers.add(newColumn);

            // 清空选中的工作表，写入计算后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, headers, rows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Calculation completed");
            result.putAll(saveResult);
            result.put("headers", headers);
            result.put("rows", rows);
            result.put("totalRows", rows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_calculate failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_calculate failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_select_columns — 列选择（修改文件，需要保存）
    // ================================================================

    /**
     * 选择指定列。
     *
     * @param userFile 文件实体
     * @param params   参数：columns（列名列表）
     * @param userId   用户 ID
     * @return 选择结果，包含临时文件地址
     */
    @SuppressWarnings("unchecked")
    public FileToolResponse excelSelectColumns(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        // 安全解析 columns 参数（可能是 List 或 JSON String）
        List<String> columns = parseStringList(params.get("columns"));
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (columns == null || columns.isEmpty()) {
            return FileToolResponse.error("params.columns is required", userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 执行列选择
            List<String> headers = new ArrayList<String>();
            List<List<Object>> rows = new ArrayList<List<Object>>();
            List<Integer> selectedIndices = new ArrayList<Integer>();

            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 0; i < rowCount; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                List<Object> rowData = new ArrayList<Object>();
                int cellCount = row.getPhysicalNumberOfCells();
                
                if (i == 0) {
                    for (int j = 0; j < cellCount; j++) {
                        Cell cell = row.getCell(j);
                        String header = getCellStringValue(cell);
                        if (columns.contains(header)) {
                            headers.add(header);
                            selectedIndices.add(j);
                        }
                    }
                } else {
                    for (Integer idx : selectedIndices) {
                        if (idx < cellCount) {
                            rowData.add(getCellValue(row.getCell(idx)));
                        } else {
                            rowData.add(null);
                        }
                    }
                    rows.add(rowData);
                }
            }

            // 清空选中的工作表，写入选择后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, headers, rows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Column selection completed");
            result.putAll(saveResult);
            result.put("headers", headers);
            result.put("rows", rows);
            result.put("totalRows", rows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_select_columns failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_select_columns failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_clean — 数据清洗（修改文件，需要保存）
    // ================================================================

    /**
     * 数据清洗。
     *
     * @param userFile 文件实体
     * @param params   参数：cleanType（清洗类型：trim/deduplicate/removeEmpty）
     * @param userId   用户 ID
     * @return 清洗结果，包含临时文件地址
     */
    public FileToolResponse excelClean(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String cleanType = readStringParam(params, "cleanType", null);
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (cleanType == null) {
            return FileToolResponse.error("params.cleanType is required", userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 执行数据清洗
            List<String> headers = new ArrayList<String>();
            List<List<Object>> rows = new ArrayList<List<Object>>();
            Set<String> seenRows = new HashSet<String>();

            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 0; i < rowCount; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                List<Object> rowData = new ArrayList<Object>();
                int cellCount = row.getPhysicalNumberOfCells();
                
                for (int j = 0; j < cellCount; j++) {
                    Cell cell = row.getCell(j);
                    if (i == 0) {
                        headers.add(getCellStringValue(cell));
                    } else {
                        Object value = getCellValue(cell);
                        if ("trim".equalsIgnoreCase(cleanType) && value instanceof String) {
                            value = ((String) value).trim();
                        }
                        rowData.add(value);
                    }
                }
                
                if (i > 0) {
                    String rowKey = rowData.toString();
                    
                    boolean isEmpty = true;
                    for (Object val : rowData) {
                        if (val != null && !val.toString().trim().isEmpty()) {
                            isEmpty = false;
                            break;
                        }
                    }
                    
                    boolean shouldAdd = true;
                    if ("deduplicate".equalsIgnoreCase(cleanType) && seenRows.contains(rowKey)) {
                        shouldAdd = false;
                    }
                    if ("removeEmpty".equalsIgnoreCase(cleanType) && isEmpty) {
                        shouldAdd = false;
                    }
                    
                    if (shouldAdd) {
                        seenRows.add(rowKey);
                        rows.add(rowData);
                    }
                }
            }

            // 清空选中的工作表，写入清洗后的数据（写回读取时选中的同一个 sheet，而非第一个 sheet）
            int lastRowNum = sheet.getLastRowNum();
            for (int i = lastRowNum; i >= 0; i--) {
                Row row = sheet.getRow(i);
                if (row != null) {
                    sheet.removeRow(row);
                }
            }
            writeDataToSheet(sheet, headers, rows);

            // 保存文件并生成下载 URL
            String tempFileName = getTempFileName(userFile.getOriginalFileName());
            Map<String, Object> saveResult = saveAndReturnResult(wb, userFile, userId, tempFileName);
            wb.close();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Data cleaning completed");
            result.putAll(saveResult);
            result.put("headers", headers);
            result.put("rows", rows);
            result.put("totalRows", rows.size());

            return FileToolResponse.ok(result, tempFileName);
        } catch (Exception e) {
            log.error("excel_clean failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_clean failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // excel_convert_format — 格式转换（修改文件，需要保存）
    // ================================================================

    /**
     * 格式转换。
     *
     * @param userFile 文件实体
     * @param params   参数：targetFormat（目标格式：xlsx/xls/csv）
     * @param userId   用户 ID
     * @return 转换结果，包含临时文件地址
     */
    public FileToolResponse excelConvertFormat(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        String targetFormat = readStringParam(params, "targetFormat", null);
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        if (targetFormat == null) {
            return FileToolResponse.error("params.targetFormat is required", userFile.getOriginalFileName());
        }

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());

            // 转换格式并保存到临时文件
            byte[] convertedBytes = getConvertedBytes(wb, targetFormat, sheetName, sheetIndex);
            int fileSize = convertedBytes.length;

            // 生成新的显示文件名（更改扩展名）
            String newFileName = changeFileExtension(userFile.getOriginalFileName(), targetFormat);

            // 如果是临时文件，覆盖写入；否则生成临时文件名保存
            String ftpPath;
            String newStorageFileName;
            if (userFile.getSourceFileId() != null) {
                // 临时文件：生成新存储文件名（带新扩展名），覆盖写入
                newStorageFileName = FtpFileService.generateStorageFileName(newFileName);
                ftpPath = ftpFileService.uploadFileWithFileName(userId, newStorageFileName,
                        new ByteArrayInputStream(convertedBytes));
            } else {
                // 源文件：生成临时文件名保存
                String tempFileName = getTempFileName(newFileName);
                newStorageFileName = FtpFileService.generateStorageFileName(tempFileName);
                ftpPath = ftpFileService.uploadFile(userId, tempFileName,
                        new ByteArrayInputStream(convertedBytes));
                newFileName = tempFileName;
            }
            wb.close();

            // 生成 downloadUrl（带签名 token）
            String downloadUrl = ftpConfig.buildDownloadUrl(userFile.getId(), userId);

            // 更新 user_files 表中的文件信息（含存储文件名、显示文件名和下载 URL）
            userFile.setFileName(newStorageFileName);
            userFile.setOriginalFileName(newFileName);
            userFile.setFileType(targetFormat.toLowerCase());
            userFile.setFileSize((long) fileSize);
            userFile.setFtpPath(ftpPath);
            userFile.setDownloadUrl(downloadUrl);
            userFileMapper.updateById(userFile);

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("message", "Format converted successfully");
            result.put("fileId", userFile.getId());
            result.put("fileName", newFileName);
            result.put("filePath", ftpPath);
            result.put("downloadUrl", downloadUrl);

            return FileToolResponse.ok(result, newFileName);
        } catch (Exception e) {
            log.error("excel_convert_format failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_convert_format failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    /**
     * 更改文件扩展名。
     */
    private String changeFileExtension(String fileName, String newExtension) {
        int dotIndex = fileName.lastIndexOf('.');
        String baseName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
        // 确保新扩展名以点开头
        if (!newExtension.startsWith(".")) {
            newExtension = "." + newExtension;
        }
        return baseName + newExtension.toLowerCase();
    }

    /**
     * 获取转换后的字节数组。
     */
    private byte[] getConvertedBytes(Workbook wb, String targetFormat, String sheetName, int sheetIndex) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if ("csv".equalsIgnoreCase(targetFormat)) {
            // CSV 格式需要特殊处理
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            if (sheet == null) {
                sheet = wb.getSheetAt(0);
            }
            PrintWriter writer = new PrintWriter(new OutputStreamWriter(baos, StandardCharsets.UTF_8));
            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 0; i < rowCount; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                StringBuilder line = new StringBuilder();
                int cellCount = row.getPhysicalNumberOfCells();
                for (int j = 0; j < cellCount; j++) {
                    if (j > 0) line.append(",");
                    Cell cell = row.getCell(j);
                    Object value = getCellValue(cell);
                    if (value != null) {
                        String str = value.toString();
                        // 统一处理换行符，替换 \r\n 和 \r 为 \n
                        str = str.replace("\r\n", "\n").replace("\r", "\n");
                        // CSV 中需要转义引号和换行符
                        if (str.contains(",") || str.contains("\"") || str.contains("\n")) {
                            str = "\"" + str.replace("\"", "\"\"") + "\"";
                        }
                        line.append(str);
                    }
                }
                writer.println(line.toString());
            }
            writer.flush();
        } else {
            wb.write(baos);
        }
        return baos.toByteArray();
    }

    // ================================================================
    // excel_validate — 合规校验（不修改文件，无需保存）
    // ================================================================

    /**
     * 合规校验。
     *
     * @param userFile 文件实体
     * @param params   参数：rules（校验规则列表）
     * @param userId   用户 ID
     * @return 校验结果
     */
    @SuppressWarnings("unchecked")
    public FileToolResponse excelValidate(UserFile userFile, Map<String, Object> params, String userId) {
        ensureExcelFile(userFile);
        // 安全解析 rules 参数（可能是 List 或 JSON String）
        List<Map<String, Object>> rules = parseMapList(params.get("rules"));
        String sheetName = readStringParam(params, "sheetName", null);
        int sheetIndex = readIntParam(params, "sheetIndex", 0);

        try {
            byte[] fileBytes = downloadBytes(userFile);
            Workbook wb = createWorkbook(fileBytes, userFile.getOriginalFileName());
            Sheet sheet = getSheet(wb, sheetName, sheetIndex);
            
            if (sheet == null) {
                wb.close();
                return FileToolResponse.error("Sheet not found: " + (sheetName != null ? sheetName : "index " + sheetIndex), userFile.getOriginalFileName());
            }

            // 执行校验
            List<String> headers = new ArrayList<String>();
            List<Map<String, Object>> errors = new ArrayList<Map<String, Object>>();
            
            // 第一步：解析表头，建立列名到索引的映射
            Map<String, Integer> headerIndices = new LinkedHashMap<String, Integer>();
            Row headerRow = sheet.getRow(0);
            if (headerRow != null) {
                for (int j = 0; j < headerRow.getPhysicalNumberOfCells(); j++) {
                    Cell cell = headerRow.getCell(j);
                    String header = getCellStringValue(cell);
                    headers.add(header);
                    headerIndices.put(header, j);
                }
            }

            // 第二步：遍历数据行，只检查有规则的列
            int rowCount = sheet.getPhysicalNumberOfRows();
            for (int i = 1; i < rowCount; i++) { // 从第2行开始（第1行是表头）
                Row row = sheet.getRow(i);
                if (row == null) continue;

                int cellCount = row.getPhysicalNumberOfCells();
                
                // 遍历每个规则
                if (rules != null) {
                    for (Map<String, Object> rule : rules) {
                        String column = (String) rule.get("column");
                        String ruleType = (String) rule.get("rule");
                        Object ruleValue = rule.get("value");
                        
                        Integer colIdx = headerIndices.get(column);
                        if (colIdx != null && colIdx < cellCount) {
                            Object cellValue = getCellValue(row.getCell(colIdx));
                            String error = validateCell(cellValue, ruleType, ruleValue, column, i + 1);
                            if (error != null) {
                                Map<String, Object> errorInfo = new LinkedHashMap<String, Object>();
                                errorInfo.put("row", i + 1);
                                errorInfo.put("column", column);
                                errorInfo.put("error", error);
                                errors.add(errorInfo);
                            }
                        }
                    }
                }
            }

            wb.close();

            // 生成 fileId 和 downloadUrl（返回当前文件的 ID，带签名 token）
            Long resultFileId = userFile.getId();
            String downloadUrl = ftpConfig.buildDownloadUrl(resultFileId, userId);

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("valid", errors.isEmpty());
            result.put("totalErrors", errors.size());
            result.put("errors", errors);
            result.put("fileId", resultFileId);
            result.put("fileName", userFile.getOriginalFileName());
            result.put("downloadUrl", downloadUrl);

            return FileToolResponse.ok(result, userFile.getOriginalFileName());
        } catch (Exception e) {
            log.error("excel_validate failed for {}", userFile.getOriginalFileName(), e);
            return FileToolResponse.error("excel_validate failed: " + e.getMessage(), userFile.getOriginalFileName());
        }
    }

    // ================================================================
    // 核心辅助方法
    // ================================================================

    /**
     * 生成临时文件名。
     * <p>
     * 仅在 excel_init_temp 中使用，用于生成临时文件的显示名称。
     * 后续操作通过 sourceFileId 判断是否是临时文件，不再依赖文件名后缀。
     * </p>
     * 
     * @param originalFileName 原始文件名
     * @return 临时文件名（格式：原文件名_temp.扩展名）
     */
    private String getTempFileName(String originalFileName) {
        return FtpFileService.getTempDisplayFileName(originalFileName);
    }

    /**
     * 将工作簿保存到 FTP 并返回文件路径。
     * 返回的路径格式：/userfiles/{userId}/{fileName}
     * 
     * @param wb       工作簿
     * @param userId   用户 ID
     * @param fileName 文件名
     * @return 文件路径（可用于下一步操作的 fileRef）
     * @throws IOException IO异常
     */
    private String saveWorkbook(Workbook wb, String userId, String fileName) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        wb.write(baos);
        // 使用原始文件名保存，不使用自动生成的存储文件名
        // 这样可以保持文件名的可读性，方便后续操作引用
        return ftpFileService.uploadFile(userId, fileName, new ByteArrayInputStream(baos.toByteArray()));
    }

    /**
     * 保存工作簿并生成结果信息。
     * 如果是临时文件（sourceFileId != null），使用数据库中存储的 UUID 文件名覆盖写入。
     * 如果是源文件，生成临时文件名保存。
     *
     * @param wb       工作簿
     * @param userFile 文件实体
     * @param userId   用户 ID
     * @param fileName 保存的文件名（仅用于非临时文件）
     * @return 包含 fileId、filePath、fileName 和 downloadUrl 的 Map
     */
    private Map<String, Object> saveAndReturnResult(Workbook wb, UserFile userFile, String userId, String fileName) throws IOException {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        
        // 判断是否是临时文件：通过 sourceFileId 字段判断
        Long sourceFileId = userFile.getSourceFileId();
        String ftpPath;
        String resultFileName;
        
        if (sourceFileId != null) {
            // 是临时文件：使用数据库中存储的 UUID 文件名覆盖写入
            String storageFileName = userFile.getFileName();
            ftpPath = saveWorkbookWithFileName(wb, userId, storageFileName);
            resultFileName = userFile.getOriginalFileName(); // 返回显示名称（如 "回答_temp.xlsx")
            log.info("Overwrite temp file: fileId={}, storageFileName={}, originalFileName={}", 
                    userFile.getId(), storageFileName, resultFileName);
        } else {
            // 是源文件：生成临时文件名保存（首次操作）
            ftpPath = saveWorkbook(wb, userId, fileName);
            resultFileName = fileName;
        }
        
        result.put("fileName", resultFileName);
        result.put("filePath", ftpPath);
        
        // 返回当前文件的 ID 和下载 URL（带签名 token）
        Long resultFileId = userFile.getId();
        String downloadUrl = ftpConfig.buildDownloadUrl(resultFileId, userId);
        
        result.put("fileId", resultFileId);
        result.put("downloadUrl", downloadUrl);
        
        return result;
    }

    /**
     * 将工作簿保存到 FTP，使用指定的存储文件名（覆盖写入）。
     *
     * @param wb       工作簿
     * @param userId   用户 ID
     * @param fileName 存储文件名（UUID 文件名）
     * @return 文件路径
     * @throws IOException IO异常
     */
    private String saveWorkbookWithFileName(Workbook wb, String userId, String fileName) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        wb.write(baos);
        return ftpFileService.uploadFileWithFileName(userId, fileName, new ByteArrayInputStream(baos.toByteArray()));
    }

    /**
     * 根据 sheetName 或 sheetIndex 获取工作表。
     * sheetName 优先于 sheetIndex。
     *
     * @param wb         工作簿
     * @param sheetName  工作表名称（可选）
     * @param sheetIndex 工作表索引（默认 0）
     * @return 工作表，如果不存在返回 null
     */
    private Sheet getSheet(Workbook wb, String sheetName, int sheetIndex) {
        if (sheetName != null && !sheetName.trim().isEmpty()) {
            return wb.getSheet(sheetName);
        }
        return wb.getSheetAt(sheetIndex);
    }

    /**
     * 获取工作表的实际索引。
     *
     * @param wb         工作簿
     * @param sheetName  工作表名称（可选）
     * @param sheetIndex 工作表索引（默认 0）
     * @return 实际工作表索引
     */
    private int getSheetIndex(Workbook wb, String sheetName, int sheetIndex) {
        if (sheetName != null && !sheetName.trim().isEmpty()) {
            return wb.getSheetIndex(sheetName);
        }
        return sheetIndex;
    }

    /**
     * 获取工作表的实际名称。
     *
     * @param wb         工作簿
     * @param sheetName  工作表名称（可选）
     * @param sheetIndex 工作表索引（默认 0）
     * @return 实际工作表名称
     */
    private String getSheetName(Workbook wb, String sheetName, int sheetIndex) {
        if (sheetName != null && !sheetName.trim().isEmpty()) {
            return sheetName;
        }
        return wb.getSheetName(sheetIndex);
    }

    /**
     * 将数据写入工作表。
     * 
     * @param sheet   工作表
     * @param headers 表头
     * @param rows    数据行
     */
    private void writeDataToSheet(Sheet sheet, List<String> headers, List<List<Object>> rows) {
        // 写入表头
        Row headerRow = sheet.createRow(0);
        for (int i = 0; i < headers.size(); i++) {
            headerRow.createCell(i).setCellValue(headers.get(i));
        }

        // 写入数据行
        int rowIdx = 1;
        for (List<Object> rowData : rows) {
            Row row = sheet.createRow(rowIdx++);
            for (int i = 0; i < rowData.size(); i++) {
                Cell cell = row.createCell(i);
                setCellValue(cell, rowData.get(i));
            }
        }

        // 自动调整列宽
        for (int i = 0; i < headers.size(); i++) {
            sheet.autoSizeColumn(i);
        }
    }

    // ================================================================
    // 其他辅助方法
    // ================================================================

    private void ensureExcelFile(UserFile userFile) {
        if (userFile == null) {
            throw new IllegalArgumentException("File not found");
        }
        String fileName = userFile.getOriginalFileName().toLowerCase();
        if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")
                && !fileName.endsWith(".csv") && !fileName.endsWith(".xml")) {
            throw new IllegalArgumentException("Unsupported file format. Only xlsx, xls, csv, xml are supported.");
        }
    }

    private int readIntParam(Map<String, Object> params, String key, int defaultValue) {
        Object value = params.get(key);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        } else if (value instanceof String) {
            try {
                return Integer.parseInt((String) value);
            } catch (NumberFormatException e) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private String readStringParam(Map<String, Object> params, String key, String defaultValue) {
        Object value = params.get(key);
        return value instanceof String ? (String) value : defaultValue;
    }

    private byte[] downloadBytes(UserFile userFile) throws Exception {
        ByteArrayOutputStream baos = ftpFileService.downloadFile(userFile.getUserId(), userFile.getFileName());
        return baos.toByteArray();
    }

    private Workbook createWorkbook(byte[] bytes, String fileName) throws IOException {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".csv")) {
            return createWorkbookFromCsv(bytes);
        }
        // Office 2003 XML（SpreadsheetML）：POI 不支持该纯文本 XML 格式，先按内容嗅探。
        // 放在扩展名判断之前——这类文件常被命名为 .xls / .xlsx / .xml，统一靠内容识别。
        if (looksLikeSpreadsheetMl(bytes)) {
            return createWorkbookFromSpreadsheetMl(bytes);
        }
        if (lower.endsWith(".xls")) {
            return new HSSFWorkbook(new ByteArrayInputStream(bytes));
        } else if (lower.endsWith(".xml")) {
            // .xml 但内容不是 SpreadsheetML → 给出明确错误，避免 POI 抛晦涩的 zip 解析异常
            throw new IOException("该 .xml 文件不是有效的 Office 2003 XML 表格（SpreadsheetML）");
        } else {
            return new XSSFWorkbook(new ByteArrayInputStream(bytes));
        }
    }

    /**
     * 内容嗅探：判断字节流是否为 Office 2003 XML 表格（SpreadsheetML）。
     * <p>
     * 排除二进制（xlsx 的 PK zip 魔数、xls 的 OLE2 魔数），再在开头片段中查找
     * SpreadsheetML 的命名空间或 mso-application 处理指令。兼容 UTF-8 / UTF-16 BOM。
     * </p>
     */
    private boolean looksLikeSpreadsheetMl(byte[] bytes) {
        if (bytes == null || bytes.length < 8) {
            return false;
        }
        int b0 = bytes[0] & 0xFF;
        int b1 = bytes[1] & 0xFF;
        if (b0 == 0x50 && b1 == 0x4B) {
            return false; // 'PK' → zip(xlsx)
        }
        if (b0 == 0xD0 && b1 == 0xCF) {
            return false; // OLE2 → xls
        }
        // 按 BOM 选择字符集解码开头片段
        Charset cs = StandardCharsets.UTF_8;
        if (b0 == 0xFF && b1 == 0xFE) {
            cs = StandardCharsets.UTF_16LE;
        } else if (b0 == 0xFE && b1 == 0xFF) {
            cs = StandardCharsets.UTF_16BE;
        }
        int sniffLen = Math.min(bytes.length, 4096);
        String head = new String(bytes, 0, sniffLen, cs).toLowerCase();
        if (head.indexOf("urn:schemas-microsoft-com:office:spreadsheet") >= 0) {
            return true;
        }
        return head.indexOf("mso-application") >= 0 && head.indexOf("excel.sheet") >= 0;
    }

    /**
     * 把 Office 2003 XML（SpreadsheetML）解析为 POI Workbook（内存 XSSF）。
     * <p>
     * 用 JDK 自带 DOM 解析（不新增第三方依赖），遍历 Worksheet/Table/Row/Cell/Data，
     * 处理 ss:Index 稀疏行列，按 ss:Type 转换 Number/Boolean，其余按字符串存。
     * 禁用 DTD / 外部实体，防 XXE。
     * </p>
     */
    private Workbook createWorkbookFromSpreadsheetMl(byte[] bytes) throws IOException {
        final String ssNs = "urn:schemas-microsoft-com:office:spreadsheet";
        try {
            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            dbf.setNamespaceAware(true);
            setFeatureSafe(dbf, "http://apache.org/xml/features/disallow-doctype-decl", true);
            setFeatureSafe(dbf, "http://xml.org/sax/features/external-general-entities", false);
            setFeatureSafe(dbf, "http://xml.org/sax/features/external-parameter-entities", false);
            dbf.setXIncludeAware(false);
            dbf.setExpandEntityReferences(false);
            DocumentBuilder db = dbf.newDocumentBuilder();
            Document doc = db.parse(new ByteArrayInputStream(bytes));

            Workbook wb = new XSSFWorkbook();
            List<Element> worksheets = childElementsByLocalName(doc.getDocumentElement(), "Worksheet");
            if (worksheets.isEmpty()) {
                wb.createSheet("Sheet1"); // 避免下游 getSheetAt(0) 抛错
                return wb;
            }
            for (int wi = 0; wi < worksheets.size(); wi++) {
                Element ws = worksheets.get(wi);
                String name = getNsAttr(ws, ssNs, "Name");
                if (name == null || name.isEmpty()) {
                    name = "Sheet" + (wi + 1);
                }
                Sheet sheet = wb.createSheet(WorkbookUtil.createSafeSheetName(name));

                Element table = firstChildByLocalName(ws, "Table");
                if (table == null) {
                    continue;
                }
                List<Element> xmlRows = childElementsByLocalName(table, "Row");
                int rowIdx = 0; // 0-based POI 行号
                for (int ri = 0; ri < xmlRows.size(); ri++) {
                    Element xmlRow = xmlRows.get(ri);
                    String rIdxAttr = getNsAttr(xmlRow, ssNs, "Index");
                    if (rIdxAttr != null) {
                        try {
                            rowIdx = Integer.parseInt(rIdxAttr.trim()) - 1;
                        } catch (NumberFormatException ignore) { /* 保持自增 */ }
                    }
                    Row row = sheet.createRow(rowIdx);
                    List<Element> xmlCells = childElementsByLocalName(xmlRow, "Cell");
                    int colIdx = 0; // 0-based 列号
                    for (int ci = 0; ci < xmlCells.size(); ci++) {
                        Element xmlCell = xmlCells.get(ci);
                        String cIdxAttr = getNsAttr(xmlCell, ssNs, "Index");
                        if (cIdxAttr != null) {
                            try {
                                colIdx = Integer.parseInt(cIdxAttr.trim()) - 1;
                            } catch (NumberFormatException ignore) { /* 保持自增 */ }
                        }
                        Cell cell = row.createCell(colIdx);
                        Element data = firstChildByLocalName(xmlCell, "Data");
                        if (data != null) {
                            applySpreadsheetMlCellValue(cell, getNsAttr(data, ssNs, "Type"), data.getTextContent());
                        }
                        colIdx++;
                    }
                    rowIdx++;
                }
            }
            return wb;
        } catch (IOException ioe) {
            throw ioe;
        } catch (Exception e) {
            throw new IOException("解析 Office 2003 XML（SpreadsheetML）失败: " + e.getMessage(), e);
        }
    }

    private void applySpreadsheetMlCellValue(Cell cell, String type, String text) {
        if (text == null) {
            cell.setCellValue("");
            return;
        }
        String t = type == null ? "" : type.trim();
        if ("Number".equalsIgnoreCase(t)) {
            try {
                cell.setCellValue(Double.parseDouble(text.trim()));
                return;
            } catch (NumberFormatException ignore) { /* 落到字符串 */ }
            cell.setCellValue(text);
        } else if ("Boolean".equalsIgnoreCase(t)) {
            String v = text.trim();
            cell.setCellValue("1".equals(v) || "true".equalsIgnoreCase(v));
        } else {
            // String / DateTime / 未知类型：按原文本存（DateTime 保留可读字符串）
            cell.setCellValue(text);
        }
    }

    private void setFeatureSafe(DocumentBuilderFactory dbf, String feature, boolean value) {
        try {
            dbf.setFeature(feature, value);
        } catch (Exception ignore) {
            // 部分解析器不支持该 feature，忽略（不影响主流程）
        }
    }

    private List<Element> childElementsByLocalName(Element parent, String localName) {
        List<Element> result = new ArrayList<Element>();
        if (parent == null) {
            return result;
        }
        NodeList children = parent.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node n = children.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE && localName.equals(localNameOf(n))) {
                result.add((Element) n);
            }
        }
        return result;
    }

    private Element firstChildByLocalName(Element parent, String localName) {
        List<Element> list = childElementsByLocalName(parent, localName);
        return list.isEmpty() ? null : list.get(0);
    }

    private String localNameOf(Node n) {
        String ln = n.getLocalName();
        if (ln != null) {
            return ln;
        }
        String qn = n.getNodeName();
        int idx = qn.indexOf(':');
        return idx >= 0 ? qn.substring(idx + 1) : qn;
    }

    private String getNsAttr(Element el, String ns, String localName) {
        if (el == null) {
            return null;
        }
        String v = el.getAttributeNS(ns, localName);
        if (v != null && !v.isEmpty()) {
            return v;
        }
        v = el.getAttribute("ss:" + localName);
        if (v != null && !v.isEmpty()) {
            return v;
        }
        v = el.getAttribute(localName);
        return (v == null || v.isEmpty()) ? null : v;
    }

    private Workbook createWorkbookFromCsv(byte[] bytes) {
        String content = new String(bytes, StandardCharsets.UTF_8);
        String[] lines = content.split("\n");
        
        Workbook wb = new XSSFWorkbook();
        Sheet sheet = wb.createSheet("Sheet1");
        
        int rowIdx = 0;
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            String[] cells = parseCsvLine(line);
            Row row = sheet.createRow(rowIdx++);
            for (int i = 0; i < cells.length; i++) {
                row.createCell(i).setCellValue(cells[i]);
            }
        }
        return wb;
    }

    private String[] parseCsvLine(String line) {
        List<String> cells = new ArrayList<String>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                cells.add(current.toString());
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        cells.add(current.toString());
        return cells.toArray(new String[0]);
    }

    private String getCellStringValue(Cell cell) {
        if (cell == null) return "";
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue().toString();
                }
                return String.valueOf(cell.getNumericCellValue());
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                try {
                    return cell.getStringCellValue();
                } catch (Exception e) {
                    return String.valueOf(cell.getNumericCellValue());
                }
            default:
                return "";
        }
    }

    private Object getCellValue(Cell cell) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue();
                }
                double numValue = cell.getNumericCellValue();
                if (numValue == Math.floor(numValue) && !Double.isInfinite(numValue)) {
                    return (long) numValue;
                }
                return numValue;
            case BOOLEAN:
                return cell.getBooleanCellValue();
            case FORMULA:
                try {
                    return cell.getStringCellValue();
                } catch (Exception e) {
                    return cell.getNumericCellValue();
                }
            default:
                return null;
        }
    }

    private void setCellValue(Cell cell, Object value) {
        if (value == null) {
            cell.setBlank();
        } else if (value instanceof String) {
            cell.setCellValue((String) value);
        } else if (value instanceof Number) {
            cell.setCellValue(((Number) value).doubleValue());
        } else if (value instanceof Boolean) {
            cell.setCellValue((Boolean) value);
        } else {
            cell.setCellValue(value.toString());
        }
    }

    private boolean matchesFilter(Object cellValue, String operator, String value) {
        String cellStr = cellValue != null ? cellValue.toString() : "";
        
        switch (operator) {
            case "equals":
                return cellStr.equals(value);
            case "contains":
                return cellStr.contains(value);
            case "gt":
                try {
                    double cellNum = Double.parseDouble(cellStr);
                    double valueNum = Double.parseDouble(value);
                    return cellNum > valueNum;
                } catch (NumberFormatException e) {
                    return false;
                }
            case "lt":
                try {
                    double cellNum = Double.parseDouble(cellStr);
                    double valueNum = Double.parseDouble(value);
                    return cellNum < valueNum;
                } catch (NumberFormatException e) {
                    return false;
                }
            case "gte":
                try {
                    double cellNum = Double.parseDouble(cellStr);
                    double valueNum = Double.parseDouble(value);
                    return cellNum >= valueNum;
                } catch (NumberFormatException e) {
                    return false;
                }
            case "lte":
                try {
                    double cellNum = Double.parseDouble(cellStr);
                    double valueNum = Double.parseDouble(value);
                    return cellNum <= valueNum;
                } catch (NumberFormatException e) {
                    return false;
                }
            case "notEquals":
                return !cellStr.equals(value);
            default:
                return false;
        }
    }

    private int compareValues(Object v1, Object v2) {
        if (v1 == null && v2 == null) return 0;
        if (v1 == null) return -1;
        if (v2 == null) return 1;
        
        if (v1 instanceof Comparable && v2 instanceof Comparable) {
            try {
                @SuppressWarnings("unchecked")
                Comparable<Object> c1 = (Comparable<Object>) v1;
                return c1.compareTo(v2);
            } catch (ClassCastException e) {
                return v1.toString().compareTo(v2.toString());
            }
        }
        return v1.toString().compareTo(v2.toString());
    }

    private double evaluateFormula(String formula, List<Object> rowData, 
                                   Map<String, Integer> headerIndices, List<String> headers) {
        String expr = formula;
        for (String header : headers) {
            Integer idx = headerIndices.get(header);
            if (idx != null && idx < rowData.size()) {
                Object value = rowData.get(idx);
                String valueStr = value instanceof Number ? value.toString() : "0";
                expr = expr.replace("{" + header + "}", valueStr);
            }
        }
        try {
            return evaluateSimpleExpression(expr);
        } catch (Exception e) {
            return 0.0;
        }
    }

    private double evaluateSimpleExpression(String expr) {
        expr = expr.replaceAll("\\s+", "");
        try {
            javax.script.ScriptEngine engine = new javax.script.ScriptEngineManager()
                .getEngineByName("JavaScript");
            Object result = engine.eval(expr);
            if (result instanceof Number) {
                return ((Number) result).doubleValue();
            }
        } catch (javax.script.ScriptException e) {
            log.warn("Failed to evaluate expression: {}", expr, e);
        }
        return 0.0;
    }

    private String validateCell(Object value, String ruleType, Object ruleValue, String column, int rowNum) {
        boolean isEmpty = value == null || value.toString().trim().isEmpty();
        
        // required 和 notEmpty 规则：空值时返回错误
        if (isEmpty) {
            if ("required".equalsIgnoreCase(ruleType) || "notEmpty".equalsIgnoreCase(ruleType)) {
                return "Row " + rowNum + ": " + column + " cannot be empty";
            }
            return null;
        }

        String strValue = value.toString();
        
        switch (ruleType) {
            case "min":
                try {
                    double numValue = Double.parseDouble(strValue);
                    double min = Double.parseDouble(ruleValue.toString());
                    if (numValue < min) {
                        return "Row " + rowNum + ": " + column + " value " + numValue + " is less than minimum " + min;
                    }
                } catch (NumberFormatException e) {
                    return "Row " + rowNum + ": " + column + " is not a number";
                }
                break;
            case "max":
                try {
                    double numValue = Double.parseDouble(strValue);
                    double max = Double.parseDouble(ruleValue.toString());
                    if (numValue > max) {
                        return "Row " + rowNum + ": " + column + " value " + numValue + " is greater than maximum " + max;
                    }
                } catch (NumberFormatException e) {
                    return "Row " + rowNum + ": " + column + " is not a number";
                }
                break;
            case "pattern":
                if (!strValue.matches(ruleValue.toString())) {
                    return "Row " + rowNum + ": " + column + " does not match pattern " + ruleValue;
                }
                break;
            case "length":
                int maxLength = Integer.parseInt(ruleValue.toString());
                if (strValue.length() > maxLength) {
                    return "Row " + rowNum + ": " + column + " length " + strValue.length() + " exceeds maximum " + maxLength;
                }
                break;
            case "in":
                @SuppressWarnings("unchecked")
                List<String> allowedValues = (List<String>) ruleValue;
                if (!allowedValues.contains(strValue)) {
                    return "Row " + rowNum + ": " + column + " value '" + strValue + "' is not in allowed list";
                }
                break;
        }
        return null;
    }
}