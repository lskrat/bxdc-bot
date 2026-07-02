package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.ExternalServiceInput;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * ExternalServiceInput 子表 Mapper。
 */
@Mapper
public interface ExternalServiceInputMapper extends BaseMapper<ExternalServiceInput> {

    /**
     * 按 serviceId 查所有子表行（顺序 display_order ASC, id ASC）。
     */
    @Select("SELECT * FROM external_service_input WHERE service_id = #{serviceId} ORDER BY display_order ASC, id ASC")
    List<ExternalServiceInput> listByServiceId(@Param("serviceId") Long serviceId);

    /**
     * 删除某 service 的所有子表行（事务内 UPDATE 替换时用）。
     */
    @Delete("DELETE FROM external_service_input WHERE service_id = #{serviceId}")
    int deleteByServiceId(@Param("serviceId") Long serviceId);
}