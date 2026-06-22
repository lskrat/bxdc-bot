# Design: Skill Intro MD Update API

## Overview
本设计文档描述了修改 Skill intro_md 更新接口的技术实现细节。

## API Specification

### Endpoint

**POST /api/skills/updateIntroMd**

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| X-User-Id | Yes | 用户 ID |
| Content-Type | Yes | application/json |

### Request Body

```json
{
  "id": 1,
  "introMd": "# Skill Introduction\\n\\n## Description\\n..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | Long | Yes | Skill 的唯一标识符 |
| introMd | String | Yes | 要更新的 Markdown 内容 |

### Response

**Success (200 OK)**

```json
{
  "id": 1,
  "name": "skill_name",
  "description": "...",
  "introMd": "# Skill Introduction\\n...",
  ...
}
```

**Bad Request (400)**

```json
{
  "error": "X-User-Id header is required"
}
```

or

```json
{
  "error": "Skill id is required"
}
```

**Not Found (404)**

当指定 id 的 Skill 不存在或用户无权限访问时返回 404。

### Error Handling

| Error Condition | HTTP Status | Error Message |
|----------------|-------------|---------------|
| 缺少 X-User-Id | 400 | X-User-Id header is required |
| 请求体中缺少 id | 400 | Skill id is required |
| Skill 不存在 | 404 | Skill not found for this id :: {id} |
| 用户无权限 | 404 | Skill not found for this id :: {id} |
| 服务器内部错误 | 500 | Failed to update skill intro: {message} |

## Implementation Details

### Controller Layer

修改 `SkillController.java` 中的 `updateSkillIntroMd` 方法：

- 修改注解从 `@PostMapping("/{id}/intro-md")` 为 `@PostMapping("/updateIntroMd")`
- 移除 `@PathVariable Long id` 参数
- 从 `@RequestBody Skill skill` 中获取 `skill.getId()`

### Route Ordering

确保 `/updateIntroMd` 路由在通用 `@PostMapping` 之前定义，避免被通用路由覆盖。

### Service Layer

`SkillService.updateSkillIntroMd()` 方法保持不变：

1. 验证 userId 和 skill id
2. 查询 Skill 并验证权限
3. 更新 intro_md 字段
4. 返回更新后的 Skill 对象

### Data Access Layer

使用 `skillMapper.updateById(skill)` 或 `skillMapper.updateIntroMdById(id, introMd)` 更新数据库。

## Security Considerations

- 用户必须提供有效的 X-User-Id
- 用户必须具有该 Skill 的写入权限（通过 `canWriteSkill()` 验证）
- 敏感数据（如用户凭证）不应记录到日志中

## Testing

### Unit Tests

- 测试接口路径变更后的路由匹配
- 测试从请求体获取 id 的正确性
- 测试权限验证逻辑

### Integration Tests

- 测试完整的请求-响应流程
- 测试各种错误场景的正确处理
