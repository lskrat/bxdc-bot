## Context

当前 skill-gateway 项目使用 Spring Boot 2.7 + MyBatis-Plus 框架，采用标准的分层架构（Controller -> Service -> Mapper -> Entity）。项目中已有多个类似的 CRUD 模块（如 Skill、User、ServerLedger 等），本设计将遵循现有代码风格和模式。

## Goals / Non-Goals

**Goals:**
- 实现标签的增删改查功能
- 支持分页查询，每页默认20条
- 实现逻辑删除（设置 del=1）
- 遵循项目现有代码风格和架构模式
- 数据库表自动创建（使用 schema-mysql.sql）

**Non-Goals:**
- 不添加用户权限校验（当前系统无统一权限框架）
- 不添加缓存机制
- 不支持批量操作
- 不添加复杂的查询条件（如按类型筛选）

## Decisions

### Decision 1: 数据模型设计

**选择:** 使用 MyBatis-Plus 注解定义实体类，映射数据库表 sys_label

**理由:** 
- 项目中所有实体类均采用此模式（如 Skill.java）
- MyBatis-Plus 提供自动 CRUD 功能，减少样板代码
- 支持自动填充更新时间（FieldFill.INSERT_UPDATE）

**字段设计:**
- id: Long, 自增主键
- name: String, 标签名称（非空）
- type: String, 标签类型
- intro: String, 标签简介（可选）
- updateAt: LocalDateTime, 更新时间（自动填充）
- updateBy: String, 更新人ID
- del: Integer, 逻辑删除标识（0=未删除，1=已删除）

### Decision 2: 逻辑删除实现

**选择:** 在 Service 层手动处理逻辑删除，查询时添加 del=0 条件

**理由:**
- 项目中已有类似实现（如 user_team 表的 is_deleted 字段）
- 避免使用 MyBatis-Plus 全局逻辑删除配置，保持灵活性
- 查询时显式过滤已删除数据，逻辑清晰

### Decision 3: 分页查询实现

**选择:** 使用 MyBatis-Plus 的 IPage 和 Page 实现分页

**理由:**
- 项目中已有分页实现范例（如 SkillService）
- MyBatis-Plus 分页插件已配置（MybatisPlusConfig）
- 默认每页20条，符合需求

### Decision 4: API 接口设计

**选择:** 遵循 RESTful 风格设计接口

| HTTP方法 | 路径 | 功能 |
|----------|------|------|
| POST | /api/labels | 新增标签 |
| GET | /api/labels | 分页查询 |
| GET | /api/labels/{id} | 查询单个 |
| PUT | /api/labels/{id} | 更新标签 |
| DELETE | /api/labels/{id} | 逻辑删除 |

**理由:** 与项目中其他 CRUD 接口风格一致（如 SkillController）

## Risks / Trade-offs

### Risk 1: 数据库表不存在

**风险:** 应用启动时 sys_label 表不存在导致运行时错误

**缓解:** 在 schema-mysql.sql 中添加 CREATE TABLE 语句，Spring Boot 启动时自动执行（spring.sql.init.mode=always）

### Risk 2: 并发操作冲突

**风险:** 多个请求同时修改同一标签可能导致数据不一致

**缓解:** 当前为简单 CRUD 操作，无并发更新场景，暂不添加乐观锁；如需后续扩展，可添加 version 字段实现乐观锁

### Risk 3: 缺少事务管理

**风险:** 复杂操作可能导致数据不一致

**缓解:** 当前仅涉及单表操作，MyBatis-Plus 默认使用事务；如需跨表操作，可添加 @Transactional 注解

### Trade-off: 逻辑删除 vs 物理删除

**选择:** 逻辑删除

**理由:** 保留历史数据便于审计和恢复，但会增加表空间占用。根据需求明确要求逻辑删除，故采用此方案。