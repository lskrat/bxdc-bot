package com.lobsterai.skillgateway.audit;

import com.lobsterai.skillgateway.entity.ExternalServiceInput;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

/**
 * 外部服务出站审计脱敏器。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md 决策 7 + 任务 §7
 *
 * 规则：
 * - 子表行 is_sensitive=1 → 值替换为 "***MASKED***"
 * - 子表行 is_sensitive=0 → 保留原值
 * - LLM 额外传的 key（不在子表） → 保留原值（落审计时标注 "LLM 误传"）
 * - 返回 Map 顺序：先子表行（按 input list 顺序），再 LLM 额外 key
 *
 * 空数据兜底（决策 10）：
 * - inputs 为 null/空 → 不抛异常，原样返回 llmParams
 * - llmParams 为 null → 返回空 Map
 */
public class ExternalOutboundPayloadMasker {

    public static final String MASKED_VALUE = "***MASKED***";

    /**
     * 脱敏 + 按顺序重组。
     */
    public Map<String, Object> mask(Map<String, Object> llmParams, List<ExternalServiceInput> inputs) {
        if (llmParams == null) {
            llmParams = Collections.emptyMap();
        }
        if (inputs == null) {
            inputs = Collections.emptyList();
        }

        Map<String, Object> result = new LinkedHashMap<String, Object>();
        Set<String> sensitiveKeys = new HashSet<String>();
        Set<String> subTableKeys = new HashSet<String>();

        // 1) 处理子表行（按 inputs 列表顺序）
        for (ExternalServiceInput inp : inputs) {
            String name = inp.getExternalParamName();
            if (name == null || name.isEmpty()) {
                continue;
            }
            subTableKeys.add(name);
            if (inp.getIsSensitive() != null && inp.getIsSensitive() == 1) {
                sensitiveKeys.add(name);
            }
            if (llmParams.containsKey(name)) {
                Object value = sensitiveKeys.contains(name) ? MASKED_VALUE : llmParams.get(name);
                result.put(name, value);
            }
        }

        // 2) 处理 LLM 额外传的 key（不在子表） — 保留原值
        for (Map.Entry<String, Object> e : llmParams.entrySet()) {
            if (!subTableKeys.contains(e.getKey())) {
                result.putIfAbsent(e.getKey(), e.getValue());
            }
        }

        return result;
    }
}