import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService {
  private readonly logsDir = path.join(process.cwd(), 'logs');
  private readonly memoryLogPath = path.join(this.logsDir, 'memory.log');
  private readonly llmLogPath = path.join(this.logsDir, 'llm.log');

  constructor() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private writeLog(filePath: string, message: string) {
    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] ${message}\n---\n`;
    fs.appendFileSync(filePath, logEntry, 'utf8');
  }

  logMemory(action: 'store' | 'retrieve', data: any) {
    const message = `Action: ${action.toUpperCase()}\nData: ${JSON.stringify(data, null, 2)}`;
    this.writeLog(this.memoryLogPath, message);
  }

  logLlm(type: 'input' | 'output' | 'agent_thought' | 'tool_result', data: any) {
    const header = `\n>>>>>> LLM INTERACTION: ${type.toUpperCase()} <<<<<<\n`;
    const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const message = `${header}${body}\n<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n`;
    this.writeLog(this.llmLogPath, message);
  }
}
