## Why

当前标签接口返回的 `updateAt` 字段格式为 ISO-8601 标准格式 `2026-06-24T10:02:05`，用户希望将其改为更易读的格式 `2026-06-24 10:02:05`，即将日期和时间之间的 `T` 分隔符改为空格。

## What Changes

- 修改 `SysLabel.java` 实体类中 `updateAt` 字段的 `@JsonFormat` 注解，将 pattern 从 `yyyy-MM-dd'T'HH:mm:ss` 改为 `yyyy-MM-dd HH:mm:ss`

## Capabilities

### New Capabilities
- `label-updateat-format`: 标签 updateAt 字段格式调整

### Modified Capabilities
- `label-crud`: 修改标签接口返回的时间格式

## Impact

- `entity/SysLabel.java`: 修改 updateAt 字段的日期格式化注解

