// Extracted from src/main/coworkStore.ts

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  extractTurnMemoryChanges,
  isQuestionLikeMemoryText,
  type CoworkMemoryGuardLevel,
} from './coworkMemoryExtractor';
import { judgeMemoryCandidate } from './coworkMemoryJudge';

// Placeholder types and interfaces
// You will need to replace these with your actual database types or ORM entities
export interface Database {
  exec(sql: string, params?: (string | number | null)[]): any[];
  run(sql: string, params?: (string | number | null)[]): void;
  getRowsModified?(): number;
  export(): Uint8Array;
}

export type CoworkUserMemoryStatus = 'created' | 'stale' | 'deleted';

export interface CoworkUserMemory {
  id: string;
  text: string;
  confidence: number;
  isExplicit: boolean;
  status: CoworkUserMemoryStatus;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  userId: string | null;
}

export interface CoworkUserMemoryRow {
  id: string;
  text: string;
  fingerprint: string;
  confidence: number;
  is_explicit: number;
  status: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
  user_id: string | null;
}

export interface CoworkUserMemorySourceInput {
  sessionId?: string;
  messageId?: string;
  role?: 'user' | 'assistant' | 'tool' | 'system';
}

export interface CoworkUserMemoryStats {
  total: number;
  created: number;
  stale: number;
  deleted: number;
  explicit: number;
  implicit: number;
}

export interface ApplyTurnMemoryUpdatesOptions {
  sessionId: string;
  userId?: string;
  userText: string;
  assistantText: string;
  implicitEnabled: boolean;
  memoryLlmJudgeEnabled: boolean;
  guardLevel: CoworkMemoryGuardLevel;
  userMessageId?: string;
  assistantMessageId?: string;
}

export interface ApplyTurnMemoryUpdatesResult {
  totalChanges: number;
  created: number;
  updated: number;
  deleted: number;
  judgeRejected: number;
  llmReviewed: number;
  skipped: number;
}

const DEFAULT_MEMORY_GUARD_LEVEL: CoworkMemoryGuardLevel = 'strict';
const DEFAULT_MEMORY_USER_MEMORIES_MAX_ITEMS = 12;
const MIN_MEMORY_USER_MEMORIES_MAX_ITEMS = 1;
const MAX_MEMORY_USER_MEMORIES_MAX_ITEMS = 60;
const MEMORY_NEAR_DUPLICATE_MIN_SCORE = 0.82;
const MEMORY_PROCEDURAL_TEXT_RE = /(执行以下命令|run\s+(?:the\s+)?following\s+command|\b(?:cd|npm|pnpm|yarn|node|python|bash|sh|git|curl|wget)\b|\$[A-Z_][A-Z0-9_]*|&&|--[a-z0-9-]+|\/tmp\/|\.sh\b|\.bat\b|\.ps1\b)/i;
const MEMORY_ASSISTANT_STYLE_TEXT_RE = /^(?:使用|use)\s+[A-Za-z0-9._-]+\s*(?:技能|skill)/i;

function normalizeMemoryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMemoryMatchKey(value: string): string {
  return normalizeMemoryText(value)
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMemorySemanticKey(value: string): string {
  const key = normalizeMemoryMatchKey(value);
  if (!key) return '';
  return key
    .replace(/^(?:the user|user|i am|i m|i|my|me)\s+/i, '')
    .replace(/^(?:该用户|这个用户|用户|本人|我的|我们|咱们|咱|我|你的|你)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTokenFrequencyMap(value: string): Map<string, number> {
  const tokens = value
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

function scoreTokenOverlap(left: string, right: string): number {
  const leftMap = buildTokenFrequencyMap(left);
  const rightMap = buildTokenFrequencyMap(right);
  if (leftMap.size === 0 || rightMap.size === 0) return 0;

  let leftCount = 0;
  let rightCount = 0;
  let intersection = 0;
  for (const count of leftMap.values()) leftCount += count;
  for (const count of rightMap.values()) rightCount += count;
  for (const [token, leftValue] of leftMap.entries()) {
    intersection += Math.min(leftValue, rightMap.get(token) || 0);
  }

  const denominator = Math.min(leftCount, rightCount);
  if (denominator <= 0) return 0;
  return intersection / denominator;
}

function buildCharacterBigramMap(value: string): Map<string, number> {
  const compact = value.replace(/\s+/g, '').trim();
  if (!compact) return new Map<string, number>();
  if (compact.length <= 1) return new Map<string, number>([[compact, 1]]);

  const map = new Map<string, number>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    map.set(gram, (map.get(gram) || 0) + 1);
  }
  return map;
}

function scoreCharacterBigramDice(left: string, right: string): number {
  const leftMap = buildCharacterBigramMap(left);
  const rightMap = buildCharacterBigramMap(right);
  if (leftMap.size === 0 || rightMap.size === 0) return 0;

  let leftCount = 0;
  let rightCount = 0;
  let intersection = 0;
  for (const count of leftMap.values()) leftCount += count;
  for (const count of rightMap.values()) rightCount += count;
  for (const [gram, leftValue] of leftMap.entries()) {
    intersection += Math.min(leftValue, rightMap.get(gram) || 0);
  }

  const denominator = leftCount + rightCount;
  if (denominator <= 0) return 0;
  return (2 * intersection) / denominator;
}

function scoreMemorySimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const compactLeft = left.replace(/\s+/g, '');
  const compactRight = right.replace(/\s+/g, '');
  if (compactLeft && compactLeft === compactRight) {
    return 1;
  }

  let phraseScore = 0;
  if (compactLeft && compactRight && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) {
    phraseScore = Math.min(compactLeft.length, compactRight.length) / Math.max(compactLeft.length, compactRight.length);
  }

  return Math.max(
    phraseScore,
    scoreTokenOverlap(left, right),
    scoreCharacterBigramDice(left, right)
  );
}

function scoreMemoryTextQuality(value: string): number {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return 0;
  let score = normalized.length;
  if (/^(?:该用户|这个用户|用户)\s*/u.test(normalized)) {
    score -= 12;
  }
  if (/^(?:the user|user)\b/i.test(normalized)) {
    score -= 12;
  }
  if (/^(?:我|我的|我是|我有|我会|我喜欢|我偏好)/u.test(normalized)) {
    score += 4;
  }
  if (/^(?:i|i am|i'm|my)\b/i.test(normalized)) {
    score += 4;
  }
  return score;
}

function choosePreferredMemoryText(currentText: string, incomingText: string): string {
  const normalizedCurrent = truncate(normalizeMemoryText(currentText), 360);
  const normalizedIncoming = truncate(normalizeMemoryText(incomingText), 360);
  if (!normalizedCurrent) return normalizedIncoming;
  if (!normalizedIncoming) return normalizedCurrent;

  const currentScore = scoreMemoryTextQuality(normalizedCurrent);
  const incomingScore = scoreMemoryTextQuality(normalizedIncoming);
  if (incomingScore > currentScore + 1) return normalizedIncoming;
  if (currentScore > incomingScore + 1) return normalizedCurrent;
  return normalizedIncoming.length >= normalizedCurrent.length ? normalizedIncoming : normalizedCurrent;
}

function isMeaningfulDeleteFragment(value: string): boolean {
  if (!value) return false;
  const tokens = value.split(/\s+/g).filter(Boolean);
  if (tokens.length >= 2) return true;
  if (/[\u3400-\u9fff]/u.test(value)) return value.length >= 4;
  return value.length >= 6;
}

function includesAsBoundedPhrase(target: string, fragment: string): boolean {
  if (!target || !fragment) return false;
  const paddedTarget = ` ${target} `;
  const paddedFragment = ` ${fragment} `;
  if (paddedTarget.includes(paddedFragment)) {
    return true;
  }
  // CJK phrases are often unsegmented, so token boundaries are unreliable.
  if (/[\u3400-\u9fff]/u.test(fragment) && !fragment.includes(' ')) {
    return target.includes(fragment);
  }
  return false;
}

function scoreDeleteMatch(targetKey: string, queryKey: string): number {
  if (!targetKey || !queryKey) return 0;
  if (targetKey === queryKey) {
    return 1000 + queryKey.length;
  }
  if (!isMeaningfulDeleteFragment(queryKey)) {
    return 0;
  }
  if (!includesAsBoundedPhrase(targetKey, queryKey)) {
    return 0;
  }
  return 100 + Math.min(targetKey.length, queryKey.length);
}

function buildMemoryFingerprint(text: string): string {
  const key = normalizeMemoryMatchKey(text);
  return crypto.createHash('sha1').update(key).digest('hex');
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

function shouldAutoDeleteMemoryText(text: string): boolean {
  const normalized = normalizeMemoryText(text);
  if (!normalized) return false;
  return MEMORY_ASSISTANT_STYLE_TEXT_RE.test(normalized)
    || MEMORY_PROCEDURAL_TEXT_RE.test(normalized)
    || isQuestionLikeMemoryText(normalized);
}

export class MemoryManager {
  private db: Database;
  private saveDb: () => void;

  constructor(db: Database, saveDb: () => void) {
    this.db = db;
    this.saveDb = saveDb;
  }

  private getOne<T>(sql: string, params: (string | number | null)[] = []): T | undefined {
    const result = this.db.exec(sql, params);
    if (!result[0]?.values[0]) return undefined;
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row as T;
  }

  private getAll<T>(sql: string, params: (string | number | null)[] = []): T[] {
    const result = this.db.exec(sql, params);
    if (!result[0]?.values) return [];
    const columns = result[0].columns;
    return result[0].values.map((values) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row as T;
    });
  }

  private mapMemoryRow(row: CoworkUserMemoryRow): CoworkUserMemory {
    return {
      id: row.id,
      text: row.text,
      confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.7,
      isExplicit: Boolean(row.is_explicit),
      status: (row.status === 'stale' || row.status === 'deleted' ? row.status : 'created') as CoworkUserMemoryStatus,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
      userId: row.user_id,
    };
  }

  private addMemorySource(memoryId: string, source?: CoworkUserMemorySourceInput): void {
    const now = Date.now();
    this.db.run(`
      INSERT INTO user_memory_sources (id, memory_id, session_id, message_id, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `, [
      uuidv4(),
      memoryId,
      source?.sessionId || null,
      source?.messageId || null,
      source?.role || 'system',
      now,
      now,
    ]);
  }

  private createOrReviveUserMemory(input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
    source?: CoworkUserMemorySourceInput;
    userId?: string;
  }): { memory: CoworkUserMemory; created: boolean; updated: boolean } {
    const normalizedText = truncate(normalizeMemoryText(input.text), 360);
    if (!normalizedText) {
      throw new Error('Memory text is required');
    }

    const now = Date.now();
    const fingerprint = buildMemoryFingerprint(normalizedText);
    const confidence = Math.max(0, Math.min(1, Number.isFinite(input.confidence) ? Number(input.confidence) : 0.75));
    const explicitFlag = input.isExplicit ? 1 : 0;
    const userId = input.userId || null;

    let existing: CoworkUserMemoryRow | undefined;
    
    // Check for existing memory with same fingerprint and userId
    if (userId) {
      existing = this.getOne<CoworkUserMemoryRow>(`
        SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
        FROM user_memories
        WHERE fingerprint = ? AND (user_id = ? OR user_id IS NULL) AND status != 'deleted'
        ORDER BY user_id DESC, updated_at DESC
        LIMIT 1
      `, [fingerprint, userId]);
    } else {
      // Legacy behavior or global memories
      existing = this.getOne<CoworkUserMemoryRow>(`
        SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
        FROM user_memories
        WHERE fingerprint = ? AND user_id IS NULL AND status != 'deleted'
        ORDER BY updated_at DESC
        LIMIT 1
      `, [fingerprint]);
    }

    if (!existing) {
      const incomingSemanticKey = normalizeMemorySemanticKey(normalizedText);
      if (incomingSemanticKey) {
        let query = `
          SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
          FROM user_memories
          WHERE status != 'deleted'
        `;
        const params: any[] = [];
        
        if (userId) {
          query += ` AND (user_id = ? OR user_id IS NULL)`;
          params.push(userId);
        } else {
          query += ` AND user_id IS NULL`;
        }
        
        query += ` ORDER BY updated_at DESC LIMIT 200`;
        
        const candidates = this.getAll<CoworkUserMemoryRow>(query, params);
        let bestCandidate: CoworkUserMemoryRow | null = null;
        let bestScore = 0;
        for (const candidate of candidates) {
          const candidateSemanticKey = normalizeMemorySemanticKey(candidate.text);
          if (!candidateSemanticKey) continue;
          const score = scoreMemorySimilarity(candidateSemanticKey, incomingSemanticKey);
          if (score <= bestScore) continue;
          bestScore = score;
          bestCandidate = candidate;
        }
        if (bestCandidate && bestScore >= MEMORY_NEAR_DUPLICATE_MIN_SCORE) {
          existing = bestCandidate;
        }
      }
    }

    if (existing) {
      const mergedText = choosePreferredMemoryText(existing.text, normalizedText);
      const mergedExplicit = existing.is_explicit ? 1 : explicitFlag;
      const mergedConfidence = Math.max(Number(existing.confidence) || 0, confidence);
      
      // If we are reviving a memory, and we have a userId, ensure it's assigned to the user
      const targetUserId = existing.user_id || userId;
      
      this.db.run(`
        UPDATE user_memories
        SET text = ?, fingerprint = ?, confidence = ?, is_explicit = ?, status = 'created', updated_at = ?, user_id = ?
        WHERE id = ?
      `, [mergedText, buildMemoryFingerprint(mergedText), mergedConfidence, mergedExplicit, now, targetUserId, existing.id]);
      this.addMemorySource(existing.id, input.source);
      const memory = this.getOne<CoworkUserMemoryRow>(`
        SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
        FROM user_memories
        WHERE id = ?
      `, [existing.id]);
      if (!memory) {
        throw new Error('Failed to reload updated memory');
      }
      return { memory: this.mapMemoryRow(memory), created: false, updated: true };
    }

    const id = uuidv4();
    this.db.run(`
      INSERT INTO user_memories (
        id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
      ) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, NULL, ?)
    `, [id, normalizedText, fingerprint, confidence, explicitFlag, now, now, userId]);
    this.addMemorySource(id, input.source);

    const memory = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
      FROM user_memories
      WHERE id = ?
    `, [id]);
    if (!memory) {
      throw new Error('Failed to load created memory');
    }

    return { memory: this.mapMemoryRow(memory), created: true, updated: false };
  }

  listUserMemories(options: {
    query?: string;
    userId?: string;
    status?: CoworkUserMemoryStatus | 'all';
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
  } = {}): CoworkUserMemory[] {
    const query = normalizeMemoryText(options.query || '');
    const includeDeleted = Boolean(options.includeDeleted);
    const status = options.status || 'all';
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 200)));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const userId = options.userId || null;

    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (!includeDeleted && status === 'all') {
      clauses.push(`status != 'deleted'`);
    }
    if (status !== 'all') {
      clauses.push('status = ?');
      params.push(status);
    }
    if (query) {
      clauses.push('LOWER(text) LIKE ?');
      params.push(`%${query.toLowerCase()}%`);
    }
    
    // Filter by userId. If userId is provided, include memories for that user OR null (global/legacy)
    if (userId) {
      clauses.push('(user_id = ? OR user_id IS NULL)');
      params.push(userId);
    } else {
      // If no userId provided, maybe return only global memories? 
      // Or maybe all memories if we treat no-user as admin/system? 
      // For safety, let's just return global memories (user_id IS NULL)
      clauses.push('user_id IS NULL');
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = this.getAll<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
      FROM user_memories
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return rows.map((row) => this.mapMemoryRow(row));
  }

  createUserMemory(input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
    source?: CoworkUserMemorySourceInput;
    userId?: string;
  }): CoworkUserMemory {
    const result = this.createOrReviveUserMemory(input);
    this.saveDb();
    return result.memory;
  }

  updateUserMemory(input: {
    id: string;
    text?: string;
    confidence?: number;
    status?: CoworkUserMemoryStatus;
    isExplicit?: boolean;
  }): CoworkUserMemory | null {
    const current = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
      FROM user_memories
      WHERE id = ?
    `, [input.id]);
    if (!current) return null;

    const now = Date.now();
    const nextText = input.text !== undefined ? truncate(normalizeMemoryText(input.text), 360) : current.text;
    if (!nextText) {
      throw new Error('Memory text is required');
    }
    const nextConfidence = input.confidence !== undefined
      ? Math.max(0, Math.min(1, Number(input.confidence)))
      : Number(current.confidence);
    const nextStatus = input.status && (input.status === 'created' || input.status === 'stale' || input.status === 'deleted')
      ? input.status
      : current.status;
    const nextExplicit = input.isExplicit !== undefined ? (input.isExplicit ? 1 : 0) : current.is_explicit;

    this.db.run(`
      UPDATE user_memories
      SET text = ?, fingerprint = ?, confidence = ?, is_explicit = ?, status = ?, updated_at = ?
      WHERE id = ?
    `, [nextText, buildMemoryFingerprint(nextText), nextConfidence, nextExplicit, nextStatus, now, input.id]);

    const updated = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, user_id
      FROM user_memories
      WHERE id = ?
    `, [input.id]);

    this.saveDb();
    return updated ? this.mapMemoryRow(updated) : null;
  }

  deleteUserMemory(id: string): boolean {
    const now = Date.now();
    this.db.run(`
      UPDATE user_memories
      SET status = 'deleted', updated_at = ?
      WHERE id = ?
    `, [now, id]);
    this.db.run(`
      UPDATE user_memory_sources
      SET is_active = 0
      WHERE memory_id = ?
    `, [id]);
    this.saveDb();
    return (this.db.getRowsModified?.() || 0) > 0;
  }

  getUserMemoryStats(): CoworkUserMemoryStats {
    const rows = this.getAll<{
      status: string;
      is_explicit: number;
      count: number;
    }>(`
      SELECT status, is_explicit, COUNT(*) AS count
      FROM user_memories
      GROUP BY status, is_explicit
    `);

    const stats: CoworkUserMemoryStats = {
      total: 0,
      created: 0,
      stale: 0,
      deleted: 0,
      explicit: 0,
      implicit: 0,
    };

    for (const row of rows) {
      const count = Number(row.count) || 0;
      stats.total += count;
      if (row.status === 'created') stats.created += count;
      if (row.status === 'stale') stats.stale += count;
      if (row.status === 'deleted') stats.deleted += count;
      if (row.is_explicit) stats.explicit += count;
      else stats.implicit += count;
    }

    return stats;
  }

  autoDeleteNonPersonalMemories(): number {
    const rows = this.getAll<Pick<CoworkUserMemoryRow, 'id' | 'text'>>(
      `SELECT id, text FROM user_memories WHERE status = 'created'`
    );
    if (rows.length === 0) return 0;

    const now = Date.now();
    let deleted = 0;
    for (const row of rows) {
      if (!shouldAutoDeleteMemoryText(row.text)) {
        continue;
      }
      this.db.run(`
        UPDATE user_memories
        SET status = 'deleted', updated_at = ?
        WHERE id = ?
      `, [now, row.id]);
      this.db.run(`
        UPDATE user_memory_sources
        SET is_active = 0
        WHERE memory_id = ?
      `, [row.id]);
      deleted += 1;
    }

    if (deleted > 0) {
      this.saveDb();
    }
    return deleted;
  }

  markMemorySourcesInactiveBySession(sessionId: string): void {
    this.db.run(`
      UPDATE user_memory_sources
      SET is_active = 0
      WHERE session_id = ? AND is_active = 1
    `, [sessionId]);
  }

  markOrphanImplicitMemoriesStale(): void {
    const now = Date.now();
    this.db.run(`
      UPDATE user_memories
      SET status = 'stale', updated_at = ?
      WHERE is_explicit = 0
        AND status = 'created'
        AND NOT EXISTS (
          SELECT 1
          FROM user_memory_sources s
          WHERE s.memory_id = user_memories.id AND s.is_active = 1
        )
    `, [now]);
  }

  async applyTurnMemoryUpdates(options: ApplyTurnMemoryUpdatesOptions): Promise<ApplyTurnMemoryUpdatesResult> {
    const result: ApplyTurnMemoryUpdatesResult = {
      totalChanges: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      judgeRejected: 0,
      llmReviewed: 0,
      skipped: 0,
    };

    const extracted = extractTurnMemoryChanges({
      userText: options.userText,
      assistantText: options.assistantText,
      guardLevel: options.guardLevel,
      maxImplicitAdds: options.implicitEnabled ? 2 : 0,
    });
    result.totalChanges = extracted.length;

    for (const change of extracted) {
      if (change.action === 'add') {
        if (!options.implicitEnabled && !change.isExplicit) {
          result.skipped += 1;
          continue;
        }
        const judge = await judgeMemoryCandidate({
          text: change.text,
          isExplicit: change.isExplicit,
          guardLevel: options.guardLevel,
          llmEnabled: options.memoryLlmJudgeEnabled,
        });
        if (judge.source === 'llm') {
          result.llmReviewed += 1;
        }
        if (!judge.accepted) {
          result.judgeRejected += 1;
          result.skipped += 1;
          continue;
        }

        const write = this.createOrReviveUserMemory({
          text: change.text,
          confidence: change.confidence,
          isExplicit: change.isExplicit,
          source: {
            role: 'user',
            sessionId: options.sessionId,
            messageId: options.userMessageId,
          },
          userId: options.userId, // Pass userId down
        });

        if (!change.isExplicit && options.assistantMessageId) {
          this.addMemorySource(write.memory.id, {
            role: 'assistant',
            sessionId: options.sessionId,
            messageId: options.assistantMessageId,
          });
        }

        if (write.created) result.created += 1;
        else if (write.updated) result.updated += 1;
        else result.skipped += 1;
        continue;
      }

      const key = normalizeMemoryMatchKey(change.text);
      if (!key) {
        result.skipped += 1;
        continue;
      }

      // For delete, we list candidates considering userId
      const candidates = this.listUserMemories({ 
        status: 'all', 
        includeDeleted: false, 
        limit: 100,
        userId: options.userId // Only look at this user's memories or globals
      });
      
      let target: CoworkUserMemory | null = null;
      let bestScore = 0;
      for (const entry of candidates) {
        const currentKey = normalizeMemoryMatchKey(entry.text);
        if (!currentKey) continue;
        const score = scoreDeleteMatch(currentKey, key);
        if (score <= bestScore) continue;
        bestScore = score;
        target = entry;
      }

      if (!target) {
        result.skipped += 1;
        continue;
      }

      const deleted = this.deleteUserMemory(target.id);
      if (deleted) result.deleted += 1;
      else result.skipped += 1;
    }

    this.markOrphanImplicitMemoriesStale();
    this.saveDb();
    return result;
  }
}
