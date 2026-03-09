import { Controller, Post, Body } from '@nestjs/common';
import { MemoryService } from '../mem/memory.service';

@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post('add')
  addMemory(@Body() body: { userId: string; text: string; role?: 'user' | 'assistant' | 'system' }) {
    console.log('[MemoryController] Adding memory:', body);
    return this.memoryService.addMemory(body.userId, body.text, body.role);
  }
}
