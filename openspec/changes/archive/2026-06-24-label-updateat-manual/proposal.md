## Why

当前标签功能的 `updateAt` 字段没有自动填充当前时间，导致新增和更新操作时该字段为 null。由于项目约束要求不修改 `MybatisPlusConfig`，需要通过手动方式在业务层设置时间字段。

## What Changes

- 修改 `LabelService.java`：在新增和更新方法中手动设置 `updateAt` 字段为当前时间
- 修改 `SysLabel.java`：移除 `@TableField(fill = FieldFill.INSERT_UPDATE)` 注解，改为手动赋值

## Capabilities

### New Capabilities
- `label-updateat-manual`: 标签 updateAt 字段手动赋值功能

### Modified Capabilities
- `label-crud`: 修改标签新增和更新逻辑，手动设置 updateAt 字段

## Impact

- `service/LabelService.java`: 修改 createLabel 和 updateLabel 方法
- `entity/SysLabel.java`: 修改 updateAt 字段注解配置

