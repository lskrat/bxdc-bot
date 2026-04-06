import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MemoryService } from '../mem/memory.service';
import { SkillManager } from '../skills/skill.manager';
import { LoggerService } from '../utils/logger.service';
export declare class AgentController {
    private readonly memoryService;
    private readonly skillManager;
    private readonly logger;
    constructor(memoryService: MemoryService, skillManager: SkillManager, logger: LoggerService);
    private emitToolEvents;
    private emitToolEvent;
    runTask(body: {
        instruction: string;
        context: any;
        history?: any[];
    }): Observable<MessageEvent>;
}
