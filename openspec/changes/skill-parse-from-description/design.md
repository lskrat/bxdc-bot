# Design: skill-parse-from-description

## 1. 整体流程

```
┌─────────────────────────────────────────────────────────────┐
│                   用户输入（半结构化文本）                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            1. 显式字段提取（正则 + 关键词匹配）                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 字段           匹配模式                                 │  │
│  │ ─────────────────────────────────────────────────────│  │
│  │ URL           地址[：:]\s*([^\s`]+) 或 反引号包裹     │  │
│  │ method        请求类型[：:]\s*(\w+)                    │  │
│  │ headers       header[：:]\s*([^\n]+)                   │  │
│  │ description   接口描述[：:]\s*(.+)$                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│        2. LLM 补充元数据（使用用户 LLM 配置）                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ System Prompt:                                        │  │
│  │ 你是一个技能配置助手...                                 │  │
│  │                                                        │  │
│  │ User: 用户输入的显式字段 + 原始文本                    │  │
│  │                                                        │  │
│  │ 返回: { name, description, operation, kind }           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         3. 组装 Skill 对象（显式字段 > LLM 推断）             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 显式字段（用户提供）     → 直接使用                     │  │
│  │ LLM 推断字段             → 补充缺失项                   │  │
│  │ 默认值                   → visibility=PRIVATE 等        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      返回 Skill JSON                         │
└─────────────────────────────────────────────────────────────┘
```

## 2. API 设计

### 端点

```
POST /api/skills/parse-from-description
Headers: X-User-Id: {userId}
Content-Type: application/json
```

### 请求体

```json
{
  "description": "新增一个skill，查询当日新闻\n\n地址 `http://v.juhe.cn/toutiao/index?...`\n\n请求类型 GET\n\n..."
}
```

### 响应

```json
{
  "skill": {
    "name": "查询当日新闻",
    "description": "...",
    "type": "API",
    "executionMode": "CONFIG",
    "configuration": {
      "kind": "api",
      "operation": "查询新闻",
      "method": "GET",
      "endpoint": "http://v.juhe.cn/toutiao/index",
      "headers": {...},
      "queryParams": {...}
    },
    "enabled": true,
    "requiresConfirmation": false,
    "visibility": "PRIVATE"
  },
  "warnings": [],
  "extractedFields": {
    "url": true,
    "method": true,
    "headers": true,
    "description": true
  }
}
```

### 错误响应

```json
{
  "error": "LLM API key not configured",
  "code": "LLM_NOT_CONFIGURED"
}
```

```
400 - 请求体为空
400 - LLM API key 未配置
500 - LLM 调用失败
500 - LLM 返回格式错误
```

## 3. 显式字段提取

### 正则匹配规则

| 字段 | 正则 | 说明 |
|------|------|------|
| URL | `(?:地址[：:]\s*)?([^\s`]+)` 或 `` `([^`]+)` `` | 优先匹配反引号包裹 |
| method | `请求类型[：:]\s*(\w+)` | 捕获 GET/POST/PUT/DELETE |
| headers | `header[：:]\s*([^\n]+)` | 捕获 Content-Type 等 |
| description | `接口描述[：:]\s*(.+)$` | 捕获到行尾 |

### URL 参数解析

从 URL 中提取 query parameters：
```
http://example.com/api?key=xxx&type=top
→ queryParams: { key: "xxx", type: "top" }
```

## 4. LLM Prompt 设计

### System Prompt

```
你是一个技能配置助手。用户提供了一个技能的自然语言描述和部分配置信息。

请根据以下规则生成 Skill 配置：

1. name: 从描述中提取或生成一个简短的中文技能名称（不超过50字符）
2. description: 使用用户提供的接口描述，如果没有则根据描述推断
3. operation: 从描述中提取或生成一个操作名称（如"查询新闻"、"执行命令"等）
4. kind: 根据描述推断类型：
   - 包含 URL/API → "api"
   - 包含 SSH/服务器/命令 → "ssh"
   - 包含模板/提示词 → "template"
   - 无法判断 → 使用用户提供信息中的最强暗示

只返回以下 JSON 格式，不要添加任何解释：
{
  "name": "...",
  "description": "...",
  "operation": "...",
  "kind": "api|ssh|template"
}
```

### User Message

```
用户提供的配置信息：
- URL: {extractedUrl}
- Method: {extractedMethod}
- Headers: {extractedHeaders}
- Description: {extractedDescription}

用户原始描述：
{originalText}
```

## 5. Skill 组装规则

```
┌─────────────────────────────────────────────────────────────┐
│                    字段来源优先级                             │
├─────────────────────────────────────────────────────────────┤
│ 显式字段（用户输入）  >  LLM 推断  >  默认值                 │
└─────────────────────────────────────────────────────────────┘
```

| Skill 字段 | 来源 | 默认值 |
|------------|------|--------|
| name | LLM 推断 | 从 description 截取 |
| description | 显式 / LLM 推断 | description 字段 |
| type | LLM 推断 | "API" |
| executionMode | - | "CONFIG" |
| configuration.kind | LLM 推断 | "api" |
| configuration.operation | LLM 推断 | "execute" |
| configuration.method | 显式 | "GET" |
| configuration.endpoint | 显式 | "" |
| configuration.headers | 显式 | {} |
| configuration.queryParams | 从 URL 解析 | {} |
| enabled | - | true |
| requiresConfirmation | - | false |
| visibility | - | PRIVATE |

## 6. Skill type 支持矩阵

| kind | 必需字段 | 可选字段 |
|------|---------|---------|
| api | operation, method, endpoint | headers, queryParams, bodyParams |
| ssh | operation, lookup, executor, command | preset, readOnly |
| template | prompt | - |

### 6.1 API 类型 configuration 示例

```json
{
  "kind": "api",
  "operation": "查询新闻",
  "method": "GET",
  "endpoint": "http://v.juhe.cn/toutiao/index",
  "headers": {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  "queryParams": {
    "key": "xxx",
    "type": "top"
  }
}
```

### 6.2 SSH 类型 configuration 示例

```
用户输入：
"在服务器上执行 df -h 查看磁盘使用情况"
```

```json
{
  "kind": "ssh",
  "operation": "查看磁盘使用",
  "lookup": "服务器名称",
  "executor": "df -h {{params}}",
  "preset": "server-resource-status"
}
```

### 6.3 TEMPLATE 类型 configuration 示例

```
用户输入：
"调用 LLM 生成一段营销文案"
```

```json
{
  "kind": "template",
  "prompt": "请为{{product}}生成一段{{style}}风格的营销文案"
}
```

## 7. 错误处理

| 错误场景 | HTTP 状态码 | error code | 说明 |
|---------|------------|------------|------|
| 请求体为空 | 400 | INVALID_REQUEST | - |
| LLM API key 未配置 | 400 | LLM_NOT_CONFIGURED | 需要用户先去设置 LLM |
| LLM 调用超时 | 500 | LLM_TIMEOUT | - |
| LLM 返回格式错误 | 500 | LLM_INVALID_RESPONSE | 返回的不是有效 JSON |
| LLM 返回字段缺失 | 200 | - | 用默认值填充，继续返回 |

### warnings 字段

当 LLM 返回部分缺失字段时，在 warnings 中提示：
```json
{
  "skill": {...},
  "warnings": [
    "LLM 未返回 operation，使用默认值 'execute'"
  ]
}
```

## 8. 文件结构

```
skill-gateway/src/main/java/com/lobsterai/skillgateway/
├── controller/
│   └── SkillController.java          # 新增端点
└── service/
    └── SkillParseService.java       # 新建：解析服务
```

## 9. 风险

| 风险 | 缓解措施 |
|------|----------|
| LLM 返回格式不稳定 | 解析失败时返回部分结果 + warning |
| 用户输入格式不规范 | 正则宽松匹配 + LLM 兜底推断 |
| LLM token 消耗 | 控制 prompt 长度 < 1000 tokens |
