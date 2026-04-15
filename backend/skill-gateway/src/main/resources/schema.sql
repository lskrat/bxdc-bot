-- Requires spring.jpa.defer-datasource-initialization=true when using spring.sql.init.mode=always,
-- so Hibernate creates tables before this script (see application.properties / application-prod.example.properties).
-- Compatible with MySQL 5.7+ and early 8.0.x (e.g. 8.0.15): `ADD COLUMN IF NOT EXISTS` is not available there;
-- use INFORMATION_SCHEMA + prepared statements instead.

SET @db = DATABASE();

-- skills.requires_confirmation
SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = @db AND table_name = 'skills' AND column_name = 'requires_confirmation') > 0,
    'SELECT 1',
    'ALTER TABLE skills ADD COLUMN requires_confirmation BOOLEAN DEFAULT FALSE'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE skills
SET requires_confirmation = FALSE
WHERE requires_confirmation IS NULL;

ALTER TABLE skills
MODIFY COLUMN requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE;

-- server_ledgers.name
SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = @db AND table_name = 'server_ledgers' AND column_name = 'name') > 0,
    'SELECT 1',
    'ALTER TABLE server_ledgers ADD COLUMN name VARCHAR(255)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE server_ledgers
SET name = ip
WHERE name IS NULL OR TRIM(name) = '';

ALTER TABLE server_ledgers
MODIFY COLUMN name VARCHAR(255) NOT NULL;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'server_ledgers'
    AND index_name = 'uq_server_ledgers_user_name'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE UNIQUE INDEX uq_server_ledgers_user_name ON server_ledgers (user_id, name)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- llm_http_audit_logs (agent-core LLM 原始 HTTP 审计经本网关落库)
SET @tbl = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = @db AND table_name = 'llm_http_audit_logs'
);
SET @sql = IF(@tbl = 0,
  'CREATE TABLE llm_http_audit_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(128) NULL,
    session_id VARCHAR(128) NULL,
    correlation_id VARCHAR(64) NOT NULL,
    direction VARCHAR(32) NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    payload_json LONGTEXT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_llm_http_audit_user_recorded (user_id, recorded_at)
  )',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
