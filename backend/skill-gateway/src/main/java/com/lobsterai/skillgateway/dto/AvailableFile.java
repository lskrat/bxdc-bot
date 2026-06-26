package com.lobsterai.skillgateway.dto;

/**
 * 权限拒绝时返回给 LLM 的可用文件信息（file-isolation-v2）。
 *
 * 字段最小化：id + fileName 已足够 LLM 决定下一步。
 */
public class AvailableFile {

    private Long id;
    private String fileName;

    public AvailableFile() {}

    public AvailableFile(Long id, String fileName) {
        this.id = id;
        this.fileName = fileName;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
}