package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.ExternalApiTenant;
import org.apache.ibatis.annotations.Mapper;

/**
 * 外部 API 接入租户映射 Mapper。
 */
@Mapper
public interface ExternalApiTenantMapper extends BaseMapper<ExternalApiTenant> {

    /**
     * 按模板对话 ID 和调用方 ID 查找已有租户映射。
     *
     * @param templateConvId 模板对话主键 ID
     * @param callerId 外部系统传入的用户标识
     * @return 匹配的租户记录，未找到返回 null
     */
    default ExternalApiTenant selectByTemplateAndCaller(Long templateConvId, String callerId) {
        return selectOne(new LambdaQueryWrapper<ExternalApiTenant>()
                .eq(ExternalApiTenant::getTemplateConvId, templateConvId)
                .eq(ExternalApiTenant::getCallerId, callerId));
    }
}
