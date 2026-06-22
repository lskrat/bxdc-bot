# Tasks: Skill Intro MD Update API

## Task List

### 1. 修改 SkillController.java

- **Description**: 修改 `updateSkillIntroMd` 方法的路由注解
- **Status**: Completed
- **Files**: 
  - `backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/SkillController.java`
- **Changes**:
  - 将 `@PostMapping("/{id}/intro-md")` 修改为 `@PostMapping("/updateIntroMd")`
  - 移除 `@PathVariable Long id` 参数
  - 从 `@RequestBody Skill skill` 中获取 id
  - 将路由移到通用 `@PostMapping` 之前

### 2. 验证路由顺序

- **Description**: 确保 `/updateIntroMd` 路由在通用路由之前
- **Status**: Completed
- **Files**:
  - `backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/SkillController.java`

### 3. 编译验证

- **Description**: 编译项目确保代码正确
- **Status**: Completed

### 4. 重启服务

- **Description**: 重启 skill-gateway 服务
- **Status**: Completed

### 5. 测试接口

- **Description**: 测试更新接口是否正常工作
- **Status**: Pending
- **Steps**:
  1. 发送 POST 请求到 `/api/skills/updateIntroMd`
  2. 验证响应状态码为 200
  3. 验证返回的 Skill 对象包含更新后的 introMd
  4. 验证数据库中的数据已更新

### 6. 创建 OpenSpec 文档

- **Description**: 创建本次改动的 OpenSpec 文档
- **Status**: In Progress
- **Files**:
  - `.openspec.yaml`
  - `proposal.md`
  - `design.md`
  - `tasks.md`

## Task Status Summary

| Task | Status |
|------|--------|
| 修改 SkillController.java | ✅ Completed |
| 验证路由顺序 | ✅ Completed |
| 编译验证 | ✅ Completed |
| 重启服务 | ✅ Completed |
| 测试接口 | ⏳ Pending |
| 创建 OpenSpec 文档 | 🔄 In Progress |
