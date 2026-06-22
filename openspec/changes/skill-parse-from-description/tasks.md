# Tasks: skill-parse-from-description

## 1. 需求确认

- [x] 1.1 与产品确认 API 输入输出格式
- [x] 1.2 与产品确认支持的 Skill type 范围（API/SSH/TEMPLATE）

## 2. 后端实现

### 2.1 SkillParseService 新建

- [x] 2.1.1 创建 `SkillParseService.java`
- [x] 2.1.2 注入 `LlmHttpClient`、`UserService`、`ObjectMapper`
- [x] 2.1.3 实现 `parseFromDescription(String userId, String description)` 方法

### 2.2 显式字段提取

- [x] 2.2.1 实现 `extractUrl(String text)` - 提取 URL
- [x] 2.2.2 实现 `extractMethod(String text)` - 提取 HTTP method
- [x] 2.2.3 实现 `extractHeaders(String text)` - 提取 headers
- [x] 2.2.4 实现 `extractDescription(String text)` - 提取接口描述
- [x] 2.2.5 实现 `parseQueryParams(String url)` - 从 URL 解析 query params

### 2.3 LLM 调用

- [x] 2.3.1 实现 `callLlmForMetadata(...)` - 调用 LLM 补充元数据
- [x] 2.3.2 构造 System Prompt（skill-parse prompt）
- [x] 2.3.3 构造 User Message（显式字段 + 原始文本）
- [x] 2.3.4 解析 LLM 返回 JSON
- [x] 2.3.5 处理 LLM 解析异常

### 2.4 Skill 组装

- [x] 2.4.1 实现 `assembleSkill(...)` - 组装完整 Skill 对象
- [x] 2.4.2 实现 `buildApiConfiguration(...)` - API 类型 configuration
- [x] 2.4.3 实现 `buildSshConfiguration(...)` - SSH 类型 configuration
- [x] 2.4.4 实现 `buildTemplateConfiguration(...)` - TEMPLATE 类型 configuration
- [x] 2.4.5 填充默认值（visibility=PRIVATE 等）

### 2.5 SkillController 端点

- [x] 2.5.1 新增 `POST /api/skills/parse-from-description` 端点
- [x] 2.5.2 接收 `ParseFromDescriptionRequest` 请求体
- [x] 2.5.3 调用 `SkillParseService.parseFromDescription()`
- [x] 2.5.4 异常处理（LLM 未配置 / 调用失败 / 解析错误）

### 2.6 DTO 定义

- [x] 2.6.1 创建 `ParseFromDescriptionRequest` 请求 DTO
- [x] 2.6.2 创建 `SkillParseResponse` 响应 DTO（包含 skill + warnings）
- [x] 2.6.3 创建 `ExtractedFields` 内部类（记录哪些字段被显式提取）

## 3. 单元测试

### 3.1 显式字段提取测试

- [x] 3.1.1 测试 URL 提取（反引号包裹）
- [x] 3.1.2 测试 URL 提取（"地址：" 前缀）
- [x] 3.1.3 测试 method 提取（GET/POST/PUT/DELETE）
- [x] 3.1.4 测试 headers 提取
- [x] 3.1.5 测试 query params 解析
- [x] 3.1.6 测试空输入 / 格式不规范输入

### 3.2 LLM 元数据推断测试

- [x] 3.2.1 测试 API 类型推断
- [x] 3.2.2 测试 SSH 类型推断
- [x] 3.2.3 测试 TEMPLATE 类型推断
- [x] 3.2.4 测试 LLM 返回格式错误处理

### 3.3 Skill 组装测试

- [x] 3.3.1 测试显式字段优先
- [x] 3.3.2 测试默认值填充
- [x] 3.3.3 测试 API/SH/TEMPLATE 三种 configuration

### 3.4 集成测试

- [x] 3.4.1 测试完整流程（用户提供半结构化文本 → 返回 Skill）
- [x] 3.4.2 测试 LLM 未配置场景
- [x] 3.4.3 测试错误处理

## 4. 文档

- [ ] 4.1 更新 API 文档（如有）
- [ ] 4.2 更新 AGENTS.md（如有必要）

## 5. 编译与测试

### 5.1 编译验证

- [x] 5.1.1 `mvn compile` 通过
- [ ] 5.1.2 `mvn test` 通过

### 5.2 手动测试

- [ ] 5.2.1 调用端点，验证 API 类型解析
- [ ] 5.2.2 调用端点，验证 SSH 类型解析
- [ ] 5.2.3 调用端点，验证 TEMPLATE 类型解析
- [ ] 5.2.4 测试 LLM 未配置场景
- [ ] 5.2.5 测试格式不规范输入
