## 1. 数据库表设计

- [x] 1.1 在 schema-mysql.sql 中添加 sys_label 表的 CREATE TABLE 语句

## 2. 实体类创建

- [x] 2.1 创建 SysLabel 实体类，位于 entity 包下
- [x] 2.2 添加 MyBatis-Plus 注解和字段定义

## 3. Mapper 接口创建

- [x] 3.1 创建 SysLabelMapper 接口，继承 BaseMapper
- [x] 3.2 添加自定义查询方法（如有需要）

## 4. Service 层实现

- [x] 4.1 创建 LabelService 服务类
- [x] 4.2 实现 createLabel 方法（新增标签）
- [x] 4.3 实现 getLabelById 方法（查询单个标签）
- [x] 4.4 实现 listLabels 方法（分页查询）
- [x] 4.5 实现 updateLabel 方法（更新标签）
- [x] 4.6 实现 deleteLabel 方法（逻辑删除）

## 5. Controller 层实现

- [x] 5.1 创建 LabelController 控制器类
- [x] 5.2 实现 POST /api/labels 接口（新增）
- [x] 5.3 实现 GET /api/labels 接口（分页查询）
- [x] 5.4 实现 GET /api/labels/{id} 接口（查询单个）
- [x] 5.5 实现 PUT /api/labels/{id} 接口（更新）
- [x] 5.6 实现 DELETE /api/labels/{id} 接口（删除）

## 6. 测试验证

- [ ] 6.1 启动应用验证表创建成功
- [ ] 6.2 测试新增标签接口
- [ ] 6.3 测试查询标签列表接口
- [ ] 6.4 测试查询单个标签接口
- [ ] 6.5 测试更新标签接口
- [ ] 6.6 测试删除标签接口