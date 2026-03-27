import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './controller/agent.controller';
import { HealthController } from './controller/health.controller';
import { MemoryController } from './controller/memory.controller';
import { UserController } from './controller/user.controller';
import { AvatarController } from './features/avatar/avatar.controller';
import { SkillProxyController } from './features/skills/skill-proxy.controller';
import { MemoryService } from './mem/memory.service';
import { SkillManager } from './skills/skill.manager';
import { LoggerService } from './utils/logger.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AgentController, HealthController, MemoryController, UserController, AvatarController, SkillProxyController],
  providers: [MemoryService, SkillManager, LoggerService],
})
export class AppModule {}
