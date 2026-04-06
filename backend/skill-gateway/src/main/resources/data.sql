-- skill-gateway: schema is created by Hibernate (ddl-auto=update), then this script runs (defer-datasource-initialization).
-- Full skill seed: INSERT when missing, UPDATE to match repo (idempotent). Regenerate from DB: export skills to skills-export.csv, run node scripts/csv-to-merge.cjs

-- Migration: legacy rows missing execution_mode
UPDATE skills
SET execution_mode = 'CONFIG',
    updated_at = CURRENT_TIMESTAMP
WHERE (execution_mode IS NULL OR TRIM(execution_mode) = '')
  AND UPPER(type) = 'EXTENSION';

-- Clean up legacy API skills whose configuration is incompatible with the structured editor
DELETE FROM skills WHERE name IN ('获取时间', '获取笑话列表', 'API时间验证技能', '查询当日新闻');

INSERT INTO skills (
    name,
    description,
    type,
    execution_mode,
    configuration,
    enabled,
    requires_confirmation,
    created_at,
    updated_at
)
SELECT
    '服务器资源状态',
    '查看远程服务器的资源状态（CPU、内存、磁盘、负载等）。',
    'EXTENSION',
    'CONFIG',
    '{"kind":"ssh","preset":"server-resource-status","operation":"server-resource-status","lookup":"server_lookup","executor":"ssh_executor","command":"echo \"--- Uptime & Load ---\" && uptime && echo \"\" && echo \"--- Memory Usage (MB) ---\" && free -m && echo \"\" && echo \"--- Disk Usage ---\" && df -h / | grep -v Filesystem && echo \"\" && echo \"--- Top 5 CPU Consumers ---\" && ps -eo pcpu,pmem,comm --sort=-pcpu | head -n 6","readOnly":true}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '服务器资源状态'
);

UPDATE skills
SET description = '查看远程服务器的资源状态（CPU、内存、磁盘、负载等）。',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"ssh","preset":"server-resource-status","operation":"server-resource-status","lookup":"server_lookup","executor":"ssh_executor","command":"echo \"--- Uptime & Load ---\" && uptime && echo \"\" && echo \"--- Memory Usage (MB) ---\" && free -m && echo \"\" && echo \"--- Disk Usage ---\" && df -h / | grep -v Filesystem && echo \"\" && echo \"--- Top 5 CPU Consumers ---\" && ps -eo pcpu,pmem,comm --sort=-pcpu | head -n 6","readOnly":true}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '服务器资源状态';

INSERT INTO skills (
    name,
    description,
    type,
    execution_mode,
    configuration,
    enabled,
    requires_confirmation,
    created_at,
    updated_at
)
SELECT
    '查询距离生日还有几天',
    '通过自主规划串行调用日期查询与计算工具，返回距离下一次生日还有多少天。',
    'EXTENSION',
    'OPENCLAW',
    '{"kind":"openclaw","systemPrompt":"你是一个生日倒计时助手。你必须先调用“获取时间”取得当前日期，再调用 compute 工具使用 date_diff_days 计算天数差。用户生日输入不限制格式，但如果你无法可靠解析，就必须明确要求用户补充或澄清生日日期，绝不能猜测。若今年生日已过，请改为计算下一次生日。","allowedTools":["获取时间","compute"],"orchestration":{"mode":"serial"}}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '查询距离生日还有几天'
);

UPDATE skills
SET description = '通过自主规划串行调用日期查询与计算工具，返回距离下一次生日还有多少天。',
    type = 'EXTENSION',
    execution_mode = 'OPENCLAW',
    configuration = '{"kind":"openclaw","systemPrompt":"你是一个生日倒计时助手。你必须先调用“获取时间”取得当前日期，再调用 compute 工具使用 date_diff_days 计算天数差。用户生日输入不限制格式，但如果你无法可靠解析，就必须明确要求用户补充或澄清生日日期，绝不能猜测。若今年生日已过，请改为计算下一次生日。","allowedTools":["获取时间","compute"],"orchestration":{"mode":"serial"}}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '查询距离生日还有几天';

INSERT INTO skills (
    name,
    description,
    type,
    execution_mode,
    configuration,
    enabled,
    requires_confirmation,
    created_at,
    updated_at
)
SELECT
    '夸夸团',
    '生成夸人的文案',
    'EXTENSION',
    'OPENCLAW',
    '{"kind":"openclaw","systemPrompt":"你是一位高情商、善于发现美的夸夸大师。\n\n# 任务\n请根据以下【对象】和【特质】，生成一段真诚、具体、不浮夸的夸赞文案。\n\n## 输入信息\n- **夸赞对象**：[填写对方身份，如：同事、朋友、伴侣、长辈]\n- **核心特质**：[填写你想夸的具体点，如：细心、穿搭好看、逻辑清晰、做饭好吃]\n- **关系亲密度**：[填写：陌生/熟悉/亲密]\n- **风格偏好**：[填写：幽默/真诚/文艺/简洁]\n- **附加细节**：[可选，填写具体事例，如：今天汇报时数据很准确]\n\n## 输出要求\n1. 避免空洞的形容词（如“你真棒”），要用细节或感受支撑。\n2. 符合身份与亲密度，不越界。\n3. 语言自然，像真人说出来的话。","allowedTools":[],"orchestration":{"mode":"serial"}}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '夸夸团'
);

UPDATE skills
SET description = '生成夸人的文案',
    type = 'EXTENSION',
    execution_mode = 'OPENCLAW',
    configuration = '{"kind":"openclaw","systemPrompt":"你是一位高情商、善于发现美的夸夸大师。\n\n# 任务\n请根据以下【对象】和【特质】，生成一段真诚、具体、不浮夸的夸赞文案。\n\n## 输入信息\n- **夸赞对象**：[填写对方身份，如：同事、朋友、伴侣、长辈]\n- **核心特质**：[填写你想夸的具体点，如：细心、穿搭好看、逻辑清晰、做饭好吃]\n- **关系亲密度**：[填写：陌生/熟悉/亲密]\n- **风格偏好**：[填写：幽默/真诚/文艺/简洁]\n- **附加细节**：[可选，填写具体事例，如：今天汇报时数据很准确]\n\n## 输出要求\n1. 避免空洞的形容词（如“你真棒”），要用细节或感受支撑。\n2. 符合身份与亲密度，不越界。\n3. 语言自然，像真人说出来的话。","allowedTools":[],"orchestration":{"mode":"serial"}}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '夸夸团';

INSERT INTO skills (
    name,
    description,
    type,
    execution_mode,
    configuration,
    enabled,
    requires_confirmation,
    created_at,
    updated_at
)
SELECT
    'check-server-ports',
    '通过SSH连接服务器并查看当前监听的端口占用情况',
    'EXTENSION',
    'CONFIG',
    '{"kind":"ssh","preset":"server-resource-status","operation":"server-resource-status","lookup":"server_lookup","executor":"ssh_executor","command":"ss -tulpn | grep LISTEN"}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = 'check-server-ports'
);

UPDATE skills
SET description = '通过SSH连接服务器并查看当前监听的端口占用情况',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"ssh","preset":"server-resource-status","operation":"server-resource-status","lookup":"server_lookup","executor":"ssh_executor","command":"ss -tulpn | grep LISTEN"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'check-server-ports';

INSERT INTO skills (
    name,
    description,
    type,
    execution_mode,
    configuration,
    enabled,
    requires_confirmation,
    created_at,
    updated_at
)
SELECT
    '翻译助手',
    '将用户输入的文本翻译为英文的可复用提示词模板',
    'EXTENSION',
    'CONFIG',
    '{"kind":"template","prompt":"你是一位专业的翻译助手。请将用户提供的中文文本准确、流畅地翻译为英文。保持原文的语气和风格，确保译文自然地道。如果原文有专业术语，请使用对应的英文术语。"}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '翻译助手'
);

UPDATE skills
SET description = '将用户输入的文本翻译为英文的可复用提示词模板',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"template","prompt":"你是一位专业的翻译助手。请将用户提供的中文文本准确、流畅地翻译为英文。保持原文的语气和风格，确保译文自然地道。如果原文有专业术语，请使用对应的英文术语。"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '翻译助手';

