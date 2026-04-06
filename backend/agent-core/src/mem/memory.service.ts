import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { LoggerService } from '../utils/logger.service';

@Injectable()
export class MemoryService implements OnModuleInit {
  private mem0Url: string;
  private readonly mem0Enabled: boolean;

  constructor(private readonly logger: LoggerService) {
    this.mem0Enabled = this.readMem0EnabledFlag();
  }

  onModuleInit() {
    this.mem0Url = process.env.MEM0_URL || 'http://39.104.81.41:8001';
    if (!this.mem0Enabled) {
      console.log('[MemoryService] mem0 is disabled (MEM0_ENABLED=false); search/store skipped');
      return;
    }
    console.log(`[MemoryService] Initialized with mem0 service at: ${this.mem0Url}`);
  }

  private readMem0EnabledFlag(): boolean {
    const v = process.env.MEM0_ENABLED?.trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'off' || v === 'no' || v === 'disabled') {
      return false;
    }
    return true;
  }

  /**
   * Search for relevant memories based on user query using mem0 service
   */
  async searchMemories(query: string, userId?: string, limit = 10): Promise<string[]> {
    if (!this.mem0Enabled) {
      return [];
    }
    if (!userId) {
      console.warn('[MemoryService] searchMemories skipped: userId is missing');
      return [];
    }

    try {
      const requestData = {
        sentence: query,
        userid: userId,
        topk: limit
      };
      
      const response = await axios.post(`${this.mem0Url}/msearch`, requestData);

      if (response.data && response.data.code === 200) {
        // 根据文档和用户反馈，尝试多种可能的字段名
        // 1. 尝试 results, data, memories (常见规范)
        // 2. 尝试 details (文档中提到的字段)
        const rawResults = response.data.results || 
                           response.data.data || 
                           response.data.memories || 
                           response.data.details || 
                           [];
        
        let results: string[] = [];
        if (Array.isArray(rawResults)) {
          results = rawResults.map(item => typeof item === 'string' ? item : JSON.stringify(item));
        } else if (typeof rawResults === 'string' && rawResults.length > 0) {
          // 如果 details 是以逗号或换行分隔的字符串，进行拆分
          results = rawResults.split(/[\n,，]/).filter(s => s.trim().length > 0);
        }

        this.logger.logMemory('retrieve', {
          request: requestData,
          response: response.data,
          parsedResults: results
        });

        console.log(`[MemoryService] Found ${results.length} memories for query: "${query}"`);
        return results;
      }
      
      this.logger.logMemory('retrieve', {
        request: requestData,
        error: 'Invalid response code',
        response: response.data
      });
      return [];
    } catch (e) {
      console.error('[MemoryService] msearch error:', e.message);
      this.logger.logMemory('retrieve', {
        query,
        userId,
        error: e.message
      });
      return [];
    }
  }

  /**
   * Get all memories (fallback to search with empty query)
   */
  async getAllMemories(userId?: string, limit = 50): Promise<string[]> {
    return this.searchMemories('', userId, limit);
  }

  /**
   * Process a turn and store memory using mem0 service
   */
  async processTurn(options: {
    sessionId: string;
    userId?: string;
    userText: string;
    assistantText: string;
  }) {
    if (!this.mem0Enabled) {
      return;
    }
    if (!options.userId) {
      console.warn('[MemoryService] processTurn skipped: userId is missing');
      return;
    }

    try {
      const requestData = {
        sentencein: options.userText,
        sentenceout: options.assistantText,
        userid: options.userId
      };

      const response = await axios.post(`${this.mem0Url}/madd`, requestData);

      if (response.data && response.data.code === 200) {
        console.log('[MemoryService] Memory stored in mem0:', response.data.message);
        this.logger.logMemory('store', {
          request: requestData,
          response: response.data
        });
      } else {
        console.warn('[MemoryService] mem0 madd failed:', response.data);
        this.logger.logMemory('store', {
          request: requestData,
          error: 'Failed to store',
          response: response.data
        });
      }
    } catch (e) {
      console.error('[MemoryService] madd error:', e.message);
      this.logger.logMemory('store', {
        options,
        error: e.message
      });
    }
  }

  /**
   * Add explicit memory
   */
  async addMemory(userId: string, text: string, role: 'user' | 'assistant' | 'system' = 'system') {
    return this.processTurn({
      sessionId: 'explicit-add',
      userId,
      userText: text,
      assistantText: '好的，我已经记住了。'
    });
  }
}
