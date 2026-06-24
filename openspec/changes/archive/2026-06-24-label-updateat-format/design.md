## Context

当前 `SysLabel` 实体类的 `updateAt` 字段使用 `@JsonFormat` 注解配置日期格式为 ISO-8601 标准格式 `yyyy-MM-dd'T'HH:mm:ss`，返回结果如 `2026-06-24T10:02:05`。用户希望将其改为更易读的格式 `yyyy-MM-dd HH:mm:ss`，返回结果如 `2026-06-24 10:02:05`。

## Goals / Non-Goals

**Goals:**
- 将 `updateAt` 字段的返回格式从 `2026-06-24T10:02:05` 改为 `2026-06-24 10:02:05`
- 保持时区设置不变（Asia/Shanghai）

**Non-Goals:**
- 不修改数据库存储格式
- 不影响其他字段的格式
- 不修改其他实体类

## Decisions

1. **直接修改实体类注解**
   - **方案**: 修改 `SysLabel.java` 中 `updateAt` 字段的 `@JsonFormat` 注解的 pattern 属性
   - **理由**: 最简单直接的方式，只影响 JSON 序列化输出，不影响数据库存储

2. **保持时区配置**
   - **方案**: 保留 `timezone = "Asia/Shanghai"` 配置
   - **理由**: 确保时间显示的正确性，与系统其他时间处理保持一致

## Risks / Trade-offs

- **风险**: 如果前端依赖 ISO-8601 格式解析时间，可能需要调整
- **缓解**: 这是一个格式美化修改，`yyyy-MM-dd HH:mm:ss` 格式也可以被大多数前端框架正确解析

