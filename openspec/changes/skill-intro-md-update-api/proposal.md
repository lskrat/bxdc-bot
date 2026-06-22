# Proposal: Skill Intro MD Update API

## Background
当前 SkillController 中存在一个用于更新 Skill 的 intro_md 字段的接口，路径为 `POST /api/skills/{id}/intro-md`。该接口通过 URL 路径参数传递 skill id。

## Problem
按照 RESTful API 设计规范，更新操作通常使用请求体传递数据，而不是将标识符分散在路径和请求体中。当前设计不够一致和直观。

## Solution
将接口路径从 `POST /api/skills/{id}/intro-md` 修改为 `POST /api/skills/updateIntroMd`，Skill 的 id 从请求体中的 Skill 对象获取。

### Changes Required

#### 1. SkillController.java
- 修改 `@PostMapping("/{id}/intro-md")` 为 `@PostMapping("/updateIntroMd")`
- 移除 `@PathVariable Long id` 参数
- 从 `@RequestBody Skill skill` 中获取 id

#### 2. Route Ordering
- 将 `/updateIntroMd` 路由移到通用 `@PostMapping` 之前，避免被通用路由覆盖

## Benefits
- 更符合 RESTful API 设计规范
- 请求参数更加集中和一致
- 避免路径参数和请求体参数混用

## Backward Compatibility
- 此改动为破坏性变更，调用方需要更新接口调用方式

## Implementation Tasks
1. 修改 SkillController.java 中的接口定义
2. 调整路由顺序，确保正确匹配
3. 更新相关测试用例（如需要）
