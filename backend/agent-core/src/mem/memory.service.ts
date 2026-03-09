import Database = require('better-sqlite3');
import { Injectable, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MemoryManager, Database as MemoryDatabase } from './coworkMemoryManager';
import { initializeMemoryTables, migrateMemoryTables } from './coworkMemoryTables';

class BetterSqliteAdapter implements MemoryDatabase {
  private db: Database.Database;
  private lastInfo: Database.RunResult | null = null;

  constructor(db: Database.Database) {
    this.db = db;
  }

  exec(sql: string, params: any[] = []): any[] {
    try {
      const stmt = this.db.prepare(sql);
      // better-sqlite3 'all' returns an array of objects
      const rows = stmt.all(...params);
      
      if (!rows || rows.length === 0) {
        return [{ columns: [], values: [] }];
      }

      // Extract columns from the first row
      const columns = Object.keys(rows[0]);
      // Extract values from all rows, ensuring order matches columns
      const values = rows.map((row: any) => columns.map(col => row[col]));

      return [{ columns, values }];
    } catch (e) {
      console.error('[MemoryDB] Exec Error:', e);
      return [];
    }
  }

  run(sql: string, params: any[] = []): void {
    try {
      const stmt = this.db.prepare(sql);
      this.lastInfo = stmt.run(...params);
    } catch (e) {
      console.error('[MemoryDB] Run Error:', e);
    }
  }

  getRowsModified(): number {
    return this.lastInfo ? this.lastInfo.changes : 0;
  }

  export(): Uint8Array {
    return new Uint8Array(0);
  }
}

@Injectable()
export class MemoryService implements OnModuleInit {
  private db: Database.Database;
  private manager: MemoryManager;

  onModuleInit() {
    this.db = new Database('memories.db');
    console.log(`[MemoryDB] Database initialized at: ${process.cwd()}/memories.db`);
    
    // Initialize Tables using the new schema
    const adapter = new BetterSqliteAdapter(this.db);
    
    // Run initialization SQL directly via adapter or db
    // initializeMemoryTables expects a runSql function
    initializeMemoryTables((sql) => {
      this.db.exec(sql);
    });

    // Run migrations (e.g. adding columns to existing tables)
    migrateMemoryTables((sql) => {
      this.db.exec(sql);
    });

    this.manager = new MemoryManager(adapter, () => {
        // saveDb callback - for file-based sqlite, writes are immediate usually, 
        // but better-sqlite3 might imply we don't need explicit save unless WAL handling?
        // We can leave this empty or log.
        // console.log('[MemoryDB] DB Saved');
    });
  }

  /**
   * Search for relevant memories based on user query
   */
  searchMemories(query: string, userId?: string, limit = 10): string[] {
    // The listUserMemories method supports a 'query' parameter for LIKE matching
    // For implicit RAG, we might need a more sophisticated search later, 
    // but strict keyword matching is a good start.
    // If query is very long, keyword match might fail. 
    // We can try to extract keywords or just list recent ones if query is too long.
    
    const memories = this.manager.listUserMemories({
      query: query.length < 20 ? query : undefined, // Only use query if it's short enough to likely be a keyword
      userId: userId,
      limit: limit,
      status: 'created'
    });

    // If no matches with query, fallback to recent memories?
    // User requirement: "Only show when relevant". So if no match, maybe show nothing?
    // But "I am X" context is always relevant.
    
    // Strategy:
    // 1. Always include "Profile" type memories (name, role, etc) if we can distinguish them.
    //    CoworkMemoryManager doesn't categorize them explicitly in DB, but extracting code does.
    // 2. Search matches.
    
    // For now, let's just return what listUserMemories returns.
    // If query is empty, it returns recent ones.
    
    return memories.map(m => m.text);
  }

  getAllMemories(userId?: string, limit = 50): string[] {
      return this.manager.listUserMemories({ limit, status: 'created', userId }).map(m => m.text);
  }

  async processTurn(options: {
    sessionId: string;
    userId?: string;
    userText: string;
    assistantText: string;
  }) {
    const result = await this.manager.applyTurnMemoryUpdates({
      sessionId: options.sessionId,
      userId: options.userId,
      userText: options.userText,
      assistantText: options.assistantText,
      implicitEnabled: true, // Enable implicit extraction
      memoryLlmJudgeEnabled: false, // Disable LLM judge for now (requires config)
      guardLevel: 'standard',
    });
    
    if (result.totalChanges > 0) {
        console.log('[MemoryManager] Update Result:', result);
    }
  }

  addMemory(userId: string, text: string, role: 'user' | 'assistant' | 'system' = 'system') {
      return this.manager.createUserMemory({
          text,
          userId,
          source: { role, sessionId: 'system-event' },
          isExplicit: true,
          confidence: 1.0
      });
  }
}
