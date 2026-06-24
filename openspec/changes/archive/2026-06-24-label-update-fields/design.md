## Context

当前标签功能已实现基本的 CRUD 操作，但新增和修改时未自动记录更新时间（updateAt）和更新人（updateBy）信息。用户需求是在新增和修改标签时，自动填充这两个字段。

## Goals / Non-Goals

**Goals:**
- 新增标签时自动设置 updateAt 为当前时间，updateBy 为请求头中的 x-user-id
- 修改标签时自动更新 updateAt 为当前时间，updateBy 为请求头中的 x-user-id
- 使用 MyBatis-Plus 的 MetaObjectHandler 自动填充 updateAt 字段

**Non-Goals:**
- 不修改数据库表结构
- 不添加新的接口
- 不改变现有接口的返回格式

## Decisions

### Decision 1: updateAt 字段自动填充

**选择:** 使用 MyBatis-Plus 的 MetaObjectHandler 自动填充

**理由:**
- 项目中已有 MetaObjectHandler 配置（MybatisPlusConfig.java）
- 可实现全局统一的时间戳管理
- 减少重复代码

**实现方式:**
- 确保实体类 SysLabel 的 updateAt 字段使用 `@TableField(value = "update_at", fill = FieldFill.INSERT_UPDATE)` 注解
- 确保 MetaObjectHandler 配置正确处理 updateAt 字段

### Decision 2: updateBy 字段赋值

**选择:** 在 Controller 层获取请求头 x-user-id，传递给 Service 层设置

**理由:**
- Controller 层负责处理 HTTP 请求，方便获取请求头
- Service 层负责业务逻辑，设置字段值
- 保持代码分层清晰

**实现方式:**
- 在 LabelController 的 createLabel 和 updateLabel 方法中添加 `@RequestHeader(value = "x-user-id", required = false)` 参数
- 将 userId 传递给 LabelService 的对应方法
- 在 Service 层设置实体的 updateBy 字段

### Decision 3: x-user-id 请求头处理

**选择:** 将 x-user-id 设置为可选参数

**理由:**
- 考虑到某些场景可能没有用户信息
- 不强制要求可提高接口的灵活性
- updateBy 字段在数据库中允许为空

## Risks / Trade-offs

### Risk 1: x-user-id 请求头缺失

**风险:** 请求中缺少 x-user-id 时 updateBy 字段为空

**缓解:** 将 x-user-id 设置为可选参数，空值时 updateBy 字段为 null，不影响业务功能

### Risk 2: MetaObjectHandler 字段名不一致

**风险:** 实体字段名与 MetaObjectHandler 配置的字段名不一致导致自动填充失败

**缓解:** 确保实体字段名为 updateAt，并检查 MetaObjectHandler 配置