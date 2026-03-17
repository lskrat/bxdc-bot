ALTER TABLE IF EXISTS skills
ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN DEFAULT FALSE;

UPDATE skills
SET requires_confirmation = FALSE
WHERE requires_confirmation IS NULL;

ALTER TABLE IF EXISTS skills
ALTER COLUMN requires_confirmation SET DEFAULT FALSE;

ALTER TABLE IF EXISTS skills
ALTER COLUMN requires_confirmation SET NOT NULL;

ALTER TABLE IF EXISTS server_ledgers
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

UPDATE server_ledgers
SET name = ip
WHERE name IS NULL OR TRIM(name) = '';

ALTER TABLE IF EXISTS server_ledgers
ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_server_ledgers_user_name
ON server_ledgers (user_id, name);
