package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.ExternalService;
import com.lobsterai.skillgateway.entity.ExternalServiceInput;
import com.lobsterai.skillgateway.mapper.ExternalServiceInputMapper;
import com.lobsterai.skillgateway.mapper.ExternalServiceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 外部服务注册表（直查 DB，无本地缓存）。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md 决策 9 / 决策 10
 *
 * 强约束（决策 10 空数据兜底）：
 * - 所有 DB 调用包 try/catch，失败仅 log.warn，**不抛异常给调用方**
 * - listEnabled() / listInputs() 永不返回 null
 * - 子表为空 → 返回 Collections.emptyList()
 * - 主表为空 → listEnabled() 返回 Collections.emptyList()
 *
 * 注意：表数据量小（设计上 < 100 行），无需本地缓存；每次直查 DB 保证改动即时生效。
 */
@Service
public class ExternalServiceRegistry {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceRegistry.class);

    private final ExternalServiceMapper serviceMapper;
    private final ExternalServiceInputMapper inputMapper;

    public ExternalServiceRegistry(ExternalServiceMapper serviceMapper, ExternalServiceInputMapper inputMapper) {
        this.serviceMapper = serviceMapper;
        this.inputMapper = inputMapper;
    }

    // ===== 查询方法（直查 DB） =====

    public ExternalService getByIdOrThrow(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("service id is null");
        }
        ExternalService svc = serviceMapper.selectById(id);
        if (svc == null) {
            throw new IllegalArgumentException("External service not found: id=" + id);
        }
        return svc;
    }

    public ExternalService getByNameOrThrow(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("serviceName is required");
        }
        ExternalService svc = serviceMapper.findByName(name);
        if (svc == null) {
            throw new IllegalArgumentException("External service not found: " + name);
        }
        return svc;
    }

    /**
     * 列出所有 enabled=1 的服务（按 display_order ASC, id ASC）。
     * 永不返回 null，永不抛异常。
     */
    public List<ExternalService> listEnabled() {
        try {
            List<ExternalService> services = serviceMapper.selectList(null);
            if (services == null) {
                return Collections.emptyList();
            }
            List<ExternalService> result = new ArrayList<ExternalService>();
            for (ExternalService svc : services) {
                if (svc.getEnabled() != null && svc.getEnabled() == 1) {
                    result.add(svc);
                }
            }
            Collections.sort(result, new Comparator<ExternalService>() {
                @Override
                public int compare(ExternalService a, ExternalService b) {
                    int cmp = Integer.compare(
                            a.getDisplayOrder() == null ? 0 : a.getDisplayOrder(),
                            b.getDisplayOrder() == null ? 0 : b.getDisplayOrder());
                    if (cmp != 0) return cmp;
                    return Long.compare(
                            a.getId() == null ? 0L : a.getId(),
                            b.getId() == null ? 0L : b.getId());
                }
            });
            return result;
        } catch (Exception e) {
            log.warn("[ExternalServiceRegistry] listEnabled failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 列出某 service 的所有子表行（按 display_order ASC, id ASC）。
     * 永不返回 null，永不抛异常。
     */
    public List<ExternalServiceInput> listInputs(Long serviceId) {
        if (serviceId == null) {
            return Collections.emptyList();
        }
        try {
            List<ExternalServiceInput> inputs = inputMapper.listByServiceId(serviceId);
            return inputs != null ? inputs : Collections.<ExternalServiceInput>emptyList();
        } catch (Exception e) {
            log.warn("[ExternalServiceRegistry] listInputs({}) failed: {}", serviceId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * FK 校验：服务不存在或禁用时抛 IllegalArgumentException。
     * 用于 SkillService.createOrUpdate() 中 kind=external 的 skill 校验。
     */
    public void assertExists(String serviceName) {
        ExternalService svc = getByNameOrThrow(serviceName);
        if (svc.getEnabled() == null || svc.getEnabled() == 0) {
            throw new IllegalArgumentException("External service disabled: " + serviceName);
        }
    }
}