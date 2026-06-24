## Why

当前标签功能的新增和修改操作未自动记录更新时间和更新人信息，导致数据审计和追溯困难。需要修改 LabelController，实现 updateAt 和 updateBy 字段的自动赋值。

## What Changes

- 修改 LabelController 的 createLabel 方法，自动设置 updateAt 和 updateBy 字段
- 修改 LabelController 的 updateLabel 方法，自动设置 updateAt 和 updateBy 字段
- 修改 LabelService 的 createLabel 和 updateLabel 方法，支持接收 userId 参数
- 确保 updateAt 字段使用 MyBatis-Plus 自动填充机制

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `label-crud`: 标签新增和更新时自动填充 updateAt 和 updateBy 字段

## Impact

- **代码**: 修改 LabelController.java 和 LabelService.java
- **API**: POST /api/labels 和 PUT /api/labels/{id} 接口增加对 x-user-id 请求头的处理