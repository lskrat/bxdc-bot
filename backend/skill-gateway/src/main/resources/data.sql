-- skill-gateway: schema is created by Hibernate (ddl-auto=update), then this script runs (defer-datasource-initialization).
-- Full skill seed: INSERT when missing, UPDATE to match repo (idempotent). Regenerate from DB: export skills to skills-export.csv, run node scripts/csv-to-merge.cjs

-- Migration: legacy rows missing execution_mode
UPDATE skills
SET execution_mode = 'CONFIG',
    updated_at = CURRENT_TIMESTAMP
WHERE (execution_mode IS NULL OR TRIM(execution_mode) = '')
  AND UPPER(type) = 'EXTENSION';

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
    '获取时间',
    '获取当前系统时间，便于 Agent 在回答时间相关问题时使用。',
    'EXTENSION',
    'CONFIG',
    '{"kind":"api","preset":"current-time","operation":"current-time","method":"GET","endpoint":"https://vv.video.qq.com/checktime?otype=json","responseWrapper":"QZOutputJson","responseTimestampField":"t"}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '获取时间'
);

UPDATE skills
SET description = '获取当前系统时间，便于 Agent 在回答时间相关问题时使用。',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"api","preset":"current-time","operation":"current-time","method":"GET","endpoint":"https://vv.video.qq.com/checktime?otype=json","responseWrapper":"QZOutputJson","responseTimestampField":"t"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '获取时间';

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
    '获取笑话列表',
    '调用聚合数据笑话接口，按时间返回笑话内容列表。',
    'EXTENSION',
    'CONFIG',
    '{"kind":"api","operation":"juhe-joke-list","method":"GET","endpoint":"http://v.juhe.cn/joke/content/list","query":{"sort":"desc","page":1,"pagesize":1},"apiKeyField":"key","apiKey":"3ad4ae35ed2116c82598a123aef828a4","autoTimestampField":"time"}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '获取笑话列表'
);

UPDATE skills
SET description = '调用聚合数据笑话接口，按时间返回笑话内容列表。',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"api","operation":"juhe-joke-list","method":"GET","endpoint":"http://v.juhe.cn/joke/content/list","query":{"sort":"desc","page":1,"pagesize":1},"apiKeyField":"key","apiKey":"3ad4ae35ed2116c82598a123aef828a4","autoTimestampField":"time"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '获取笑话列表';

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
    'API时间验证技能',
    '调用腾讯 checktime 接口获取当前时间戳，适用于时间校验场景。',
    'EXTENSION',
    'CONFIG',
    '{"kind":"api","operation":"api","method":"GET","endpoint":"https://vv.video.qq.com/checktime?otype=json","headers":{},"query":{}}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = 'API时间验证技能'
);

UPDATE skills
SET description = '调用腾讯 checktime 接口获取当前时间戳，适用于时间校验场景。',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"api","operation":"api","method":"GET","endpoint":"https://vv.video.qq.com/checktime?otype=json","headers":{},"query":{}}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'API时间验证技能';

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
    '查询当日新闻',
    '获取头条、国内、娱乐、体育、军事、科技、财经等各类新闻信息',
    'EXTENSION',
    'CONFIG',
    '{"kind":"api","operation":"api_request","method":"GET","endpoint":"http://v.juhe.cn/toutiao/index","headers":{"Content-Type":"application/x-www-form-urlencoded"},"query":{"key":"c990e44845181032f48cc9a556e3a006","type":"top","page":1,"page_size":30,"s_filter":0},"apiKeyField":"key","apiKey":"c990e44845181032f48cc9a556e3a006"}',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM skills WHERE name = '查询当日新闻'
);

UPDATE skills
SET description = '获取头条、国内、娱乐、体育、军事、科技、财经等各类新闻信息',
    type = 'EXTENSION',
    execution_mode = 'CONFIG',
    configuration = '{"kind":"api","operation":"api_request","method":"GET","endpoint":"http://v.juhe.cn/toutiao/index","headers":{"Content-Type":"application/x-www-form-urlencoded"},"query":{"key":"c990e44845181032f48cc9a556e3a006","type":"top","page":1,"page_size":30,"s_filter":0},"apiKeyField":"key","apiKey":"c990e44845181032f48cc9a556e3a006"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '查询当日新闻';

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
    '{"kind":"openclaw","systemPrompt":"你是一位高情商、善于发现美的夸夸大师。\n\n# 任务\n请根据以下【对象】和【特质】，生成一段真诚、具体、不浮夸的夸赞文案。\n\n## 输入信息\n- **夸赞对象**：[填写对方身份，如：同事、朋友、伴侣、长辈]\n- **核心特质**：[填写你想夸的具体点，如：细心、穿搭好看、逻辑清晰、做饭好吃]\n- **关系亲密度**：[填写：陌生/熟悉/亲密]\n- **风格偏好**：[填写：幽默/真诚/文艺/简洁]\n- **附加细节**：[可选，填写具体事例，如：今天汇报时数据很准确]\n\n## 输出要求\n1. 避免空洞的形容词（如“你真棒”），要用细节或感受支撑。\n2. 符合身份与亲密度，不越界。\n3. 语言自然，像真人说出来的话。","allowedTools":["查询当日新闻"],"orchestration":{"mode":"serial"}}',
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
    configuration = '{"kind":"openclaw","systemPrompt":"你是一位高情商、善于发现美的夸夸大师。\n\n# 任务\n请根据以下【对象】和【特质】，生成一段真诚、具体、不浮夸的夸赞文案。\n\n## 输入信息\n- **夸赞对象**：[填写对方身份，如：同事、朋友、伴侣、长辈]\n- **核心特质**：[填写你想夸的具体点，如：细心、穿搭好看、逻辑清晰、做饭好吃]\n- **关系亲密度**：[填写：陌生/熟悉/亲密]\n- **风格偏好**：[填写：幽默/真诚/文艺/简洁]\n- **附加细节**：[可选，填写具体事例，如：今天汇报时数据很准确]\n\n## 输出要求\n1. 避免空洞的形容词（如“你真棒”），要用细节或感受支撑。\n2. 符合身份与亲密度，不越界。\n3. 语言自然，像真人说出来的话。","allowedTools":["查询当日新闻"],"orchestration":{"mode":"serial"}}',
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

