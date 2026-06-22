# Proposal: skill-parse-from-description（自然语言创建 Skill）

## 动机

当前创建 Skill 需要用户手动填写多个字段（name、description、type、configuration 等），对用户不够友好。

用户实际输入往往是**半结构化文本**，包含部分显式字段（如 URL、method、headers），但缺少完整的 Skill 配置格式。

**目标**：允许用户用自然语言描述技能，提交到大模型解析，自动生成完整的 Skill 对象。

## 目标

1. **新增 API 端点** `POST /api/skills/parse-from-description`
2. 支持用户输入**自然语言 + 半结构化文本**，自动解析生成 Skill 对象
3. **不持久化到数据库**：仅返回 Skill JSON 供前端展示/编辑
4. **显式字段优先**：用户提供的信息（如 URL、method）直接使用；LLM 补充缺失元数据

## 范围

| 功能 | 是否实现 | 说明 |
|------|---------|------|
| 新增 API 端点 | ✅ | `POST /api/skills/parse-from-description` |
| 显式字段提取 | ✅ | URL / method / headers / 接口描述 |
| LLM 补充元数据 | ✅ | name / operation / kind 等 |
| Skill type 支持 | ✅ | API / SSH / TEMPLATE |
| 持久化 | ❌ | 仅返回 Skill 对象 |
| 与现有 /api/skills 创建流程结合 | ❌ | 本期独立 |

## 输入输出示例

### 输入（用户描述）

```
新增一个skill，查询当日新闻

地址 `http://v.juhe.cn/toutiao/index?key=c990e44845181032f48cc9a556e3a006&type=top`

请求类型 get

接口描述：返回头条(推荐)、国内，娱乐，体育，军事，科技，财经，时尚等新闻信息; 数据来源网络整理;

header：Content-Type   application/x-www-form-urlencoded
```

### 输出（解析后的 Skill 对象）

```json
{
  "name": "查询当日新闻",
  "description": "返回头条(推荐)、国内，娱乐，体育，军事，科技，财经，时尚等新闻信息; 数据来源网络整理;",
  "type": "API",
  "executionMode": "CONFIG",
  "configuration": {
    "kind": "api",
    "operation": "查询新闻",
    "method": "GET",
    "endpoint": "http://v.juhe.cn/toutiao/index",
    "headers": {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    "queryParams": {
      "key": "c990e44845181032f48cc9a556e3a006",
      "type": "top"
    }
  },
  "enabled": true,
  "requiresConfirmation": false,
  "visibility": "PRIVATE"
}
```

## 技术方案概述

1. **显式字段提取**：使用正则匹配用户输入中的 URL、method、headers 等
2. **LLM 补充元数据**：使用 `LlmHttpClient` 调用用户配置的 LLM，补充 name、operation 等
3. **组装 Skill 对象**：显式字段 > LLM 推断，构造完整 Skill 并返回

## 影响范围

| 文件 | 影响 |
|------|------|
| `SkillController.java` | 新增 `/parse-from-description` 端点 |
| `SkillParseService.java`（新建） | 字段提取 + LLM 调用 + 组装逻辑 |
| 无新增第三方依赖 | 复用现有 `LlmHttpClient` |

## Non-Goals

- 不持久化 Skill 到数据库
- 不与现有 `POST /api/skills` 创建流程结合
- 不支持 OPENCLAW 类型（本期仅支持 API/SSH/TEMPLATE）

## 依赖

- 现有 `LlmHttpClient`：复用 OpenAI-compatible 调用
- 现有 `UserService.mergeLlmConfigForAgent()`：获取用户 LLM 配置
- 现有 `Skill` 实体类：作为返回对象
