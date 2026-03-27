INSERT INTO skills (
    name,
    description,
    type,
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
    '{"kind":"time","operation":"current-time","method":"GET","endpoint":"https://vv.video.qq.com/checktime?otype=json","responseWrapper":"QZOutputJson","responseTimestampField":"t"}',
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
    configuration = '{"kind":"time","operation":"current-time","method":"GET","endpoint":"https://vv.video.qq.com/checktime?otype=json","responseWrapper":"QZOutputJson","responseTimestampField":"t"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '获取时间';

INSERT INTO skills (
    name,
    description,
    type,
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
    '{"kind":"monitor","operation":"server-resource-status","lookup":"server_lookup","executor":"ssh_executor","command":"echo \"--- Uptime & Load ---\" && uptime && echo \"\" && echo \"--- Memory Usage (MB) ---\" && free -m && echo \"\" && echo \"--- Disk Usage ---\" && df -h / | grep -v Filesystem && echo \"\" && echo \"--- Top 5 CPU Consumers ---\" && ps -eo pcpu,pmem,comm --sort=-pcpu | head -n 6","readOnly":true}',
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
    configuration = '{"kind":"monitor","operation":"server-resource-status","lookup":"server_lookup","executor":"ssh_executor","command":"echo \"--- Uptime & Load ---\" && uptime && echo \"\" && echo \"--- Memory Usage (MB) ---\" && free -m && echo \"\" && echo \"--- Disk Usage ---\" && df -h / | grep -v Filesystem && echo \"\" && echo \"--- Top 5 CPU Consumers ---\" && ps -eo pcpu,pmem,comm --sort=-pcpu | head -n 6","readOnly":true}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '服务器资源状态';

INSERT INTO skills (
    name,
    description,
    type,
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
    configuration = '{"kind":"api","operation":"juhe-joke-list","method":"GET","endpoint":"http://v.juhe.cn/joke/content/list","query":{"sort":"desc","page":1,"pagesize":1},"apiKeyField":"key","apiKey":"3ad4ae35ed2116c82598a123aef828a4","autoTimestampField":"time"}',
    enabled = TRUE,
    requires_confirmation = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name = '获取笑话列表';
