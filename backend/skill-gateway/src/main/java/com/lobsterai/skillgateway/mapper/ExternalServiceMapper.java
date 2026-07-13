package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.ExternalService;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * ExternalService 主表 Mapper。
 *
 * XML 自定义 SQL 在 src/main/resources/mapper/xml/ExternalServiceMapper.xml
 */
@Mapper
public interface ExternalServiceMapper extends BaseMapper<ExternalService> {

    /**
     * 按 display_order ASC, id ASC 列出所有 enabled=1 的服务（用于 Skill 创建页 dropdown + schema 列表）。
     */
    @Select("SELECT * FROM external_service WHERE enabled = 1 ORDER BY display_order ASC, id ASC")
    List<ExternalService> listEnabled();

    /**
     * 按 name 查单个服务（FK 校验用）。
     */
    @Select("SELECT * FROM external_service WHERE name = #{name} LIMIT 1")
    ExternalService findByName(String name);
}