-- skill-gateway: schema is created by Hibernate (ddl-auto=update), then this script runs (defer-datasource-initialization).
--
-- Persisted `skills` rows are user-created extended skills (type=EXTENSION) and any legacy primitive rows.
-- Platform "built-in" capabilities (API / Compute / SSH / skill generator) are exposed in the frontend as virtual
-- entries (BUILTIN), not as rows here.
--
-- Do NOT run UPDATE on visibility/created_by at the top of this file: on first boot those columns may not exist yet
-- when this script is parsed, or Hibernate may not have applied ddl-auto.

-- Legacy cleanup: API skills whose configuration is incompatible with the structured editor
DELETE FROM skills WHERE name IN ('获取时间', '获取笑话列表', 'API时间验证技能', '查询当日新闻');
