package com.lobsterai.skillgateway.dto;

import com.lobsterai.skillgateway.entity.ToolCallLog;

import java.util.List;

public class SkillUsageDetailPageDTO {

    private long total;
    private int page;
    private int size;
    private List<ToolCallLog> records;

    public SkillUsageDetailPageDTO() {}

    public SkillUsageDetailPageDTO(long total, int page, int size, List<ToolCallLog> records) {
        this.total = total;
        this.page = page;
        this.size = size;
        this.records = records;
    }

    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }

    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }

    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }

    public List<ToolCallLog> getRecords() { return records; }
    public void setRecords(List<ToolCallLog> records) { this.records = records; }
}
