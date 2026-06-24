## Why

当前系统缺乏标签管理功能，无法对数据进行分类和标记。为了满足业务需求，需要在 skill-gateway 项目中新增标签 CRUD 功能，支持标签的创建、查询、更新和逻辑删除操作。

## What Changes

- 新增 `sys_label` 数据库表，用于存储标签信息
- 新增 `SysLabel` 实体类，映射数据库表
- 新增 `SysLabelMapper` 接口，提供数据访问能力
- 新增 `LabelService` 服务类，处理标签业务逻辑
- 新增 `LabelController` 控制器，暴露 REST API 接口
- 支持标签的增删改查操作，包含分页查询和逻辑删除

## Capabilities

### New Capabilities

- `label-crud`: 标签管理功能，包含标签的新增、查询（分页）、更新和逻辑删除

### Modified Capabilities

- 无

## Impact

- **数据库**: 新增 `sys_label` 表
- **代码**: 在 `com.lobsterai.skillgateway` 包下新增 entity、mapper、service、controller 四个类
- **API**: 新增 `/api/labels` 相关 REST 接口
