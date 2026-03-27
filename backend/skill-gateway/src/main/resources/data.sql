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
