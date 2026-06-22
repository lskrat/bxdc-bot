# Team Feature Tasks

## Implementation Tasks

- [x] 1. 创建 UserTeam.java 实体类
  - 定义团队ID（自增Long）、团队名称、团队成员、创建人ID、创建时间、更新人ID、更新时间、是否删除字段
  - 使用 MyBatis Plus 注解
  - 表名：user_team

- [x] 2. 创建 UserTeamMapper.java 数据访问层
  - 继承 BaseMapper<UserTeam>
  - 定义分页查询方法（仅查询创建人ID匹配且未删除的记录）
  - 定义根据ID查询方法（仅查询未删除记录）

- [x] 3. 创建 UserTeamService.java 业务逻辑层
  - 实现新增团队功能
  - 实现更新团队功能
  - 实现逻辑删除功能
  - 实现分页查询功能（仅查询自己创建的团队）

- [x] 4. 创建 UserTeamController.java REST API控制器
  - POST /api/user-teams - 新增团队
  - GET /api/user-teams - 分页查询团队列表
  - GET /api/user-teams/{id} - 查询单个团队
  - PUT /api/user-teams/{id} - 更新团队
  - DELETE /api/user-teams/{id} - 逻辑删除团队
  - 所有接口需要 X-User-Id 请求头

- [x] 5. 在 schema-mysql.sql 中添加 user_team 表定义

- [x] 6. 功能测试
  - 所有 API 测试通过

- [x] 7. 创建 OpenSpec Delta Spec
  - 创建 delta spec 文档记录 UserTeam 功能规范

## Completed

- [x] Implementation complete
- [x] API tests passed
- [x] Delta spec created
