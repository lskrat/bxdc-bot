// Extracted and adapted table creation SQL from src/main/sqliteStore.ts

export const MEMORY_TABLES_SQL = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar TEXT,
      created_at INTEGER NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS user_memories (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.75,
      is_explicit INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'created',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER,
      user_id TEXT
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS user_memory_sources (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      session_id TEXT,
      message_id TEXT,
      role TEXT NOT NULL DEFAULT 'system',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES user_memories(id) ON DELETE CASCADE
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_user_memories_status_updated_at
    ON user_memories(status, updated_at DESC);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_user_memories_fingerprint
    ON user_memories(fingerprint);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_user_memories_user_id
    ON user_memories(user_id);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_user_memory_sources_session_id
    ON user_memory_sources(session_id, is_active);
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_user_memory_sources_memory_id
    ON user_memory_sources(memory_id, is_active);
  `
];

// Helper to initialize tables in a given database instance
// Takes a run function that executes SQL
export function initializeMemoryTables(runSql: (sql: string) => void): void {
  for (const sql of MEMORY_TABLES_SQL) {
    try {
      runSql(sql);
    } catch (e) {
      console.error('[MemoryDB] Init Error (ignorable if partial):', e);
    }
  }
}

// Separate migration function to safely add columns to existing tables
export function migrateMemoryTables(runSql: (sql: string) => void): void {
  // Migration: Add user_id to user_memories if not exists
  // SQLite supports ADD COLUMN IF NOT EXISTS in newer versions, but standard ADD COLUMN throws if exists.
  // We'll wrap in try-catch as a simple migration strategy.
  try {
    runSql(`ALTER TABLE user_memories ADD COLUMN user_id TEXT;`);
    console.log('[MemoryDB] Migrated: user_memories.user_id added');
  } catch (e) {
    // Ignore error if column already exists
    if (!String(e).includes('duplicate column name')) {
       console.log('[MemoryDB] Migration note:', e);
    }
  }
  
  try {
    runSql(`CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);`);
  } catch (e) {
    console.error('[MemoryDB] Index Creation Error:', e);
  }
}
