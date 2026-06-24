## Context

当前标签功能的 `updateAt` 字段依赖 MyBatis-Plus 的自动填充机制，但由于字段名与配置不匹配（实体类为 `updateAt`，配置为 `updatedAt`），导致自动填充失败。根据项目约束，不允许修改 `MybatisPlusConfig`，因此需要通过手动方式在业务层设置时间字段。

## Goals / Non-Goals

**Goals:**
- 在不修改 `MybatisPlusConfig` 的前提下，实现 `updateAt` 字段的自动赋值
- 确保新增标签时 `updateAt` 被设置为当前时间
- 确保更新标签时 `updateAt` 被更新为当前时间

**Non-Goals:**
- 不修改 `MybatisPlusConfig.java`
- 不修改其他实体类或配置文件
- 不影响其他功能模块

## Decisions

1. **在 Service 层手动设置时间**
   - **方案**: 在 `LabelService.createLabel()` 和 `LabelService.updateLabel()` 方法中，手动调用 `LocalDateTime.now()` 设置 `updateAt` 字段
   - **理由**: 简单直接，不依赖框架自动填充机制，符合项目约束

2. **保持实体类注解不变**
   - **方案**: 保留 `@TableField(value = "update_at", fill = FieldFill.INSERT_UPDATE)` 注解
   - **理由**: 虽然自动填充不生效，但注解可以作为文档说明字段的预期行为，未来如果配置修复，自动填充可以恢复正常工作

3. **使用 `LocalDateTime.now()` 获取当前时间**
   - **方案**: 使用 Java 8 的 `LocalDateTime.now()` 获取当前时间
   - **理由**: 标准方式，与项目中其他时间处理保持一致

## Risks / Trade-offs

- **风险**: 如果未来修改了 `MybatisPlusConfig` 添加了 `updateAt` 的自动填充，可能导致重复赋值
- **缓解**: 由于 `strictInsertFill` 和 `strictUpdateFill` 只在字段为 null 时生效，手动赋值后自动填充不会覆盖，因此不会产生冲突

