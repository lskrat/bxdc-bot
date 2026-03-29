"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvatarController = void 0;
const common_1 = require("@nestjs/common");
const service_1 = require("./service");
const crypto_1 = require("crypto");
const logger_service_1 = require("../../utils/logger.service");
let AvatarController = class AvatarController {
    logger;
    avatarService;
    constructor(logger) {
        this.logger = logger;
    }
    getService() {
        if (!this.avatarService) {
            this.avatarService = new service_1.AvatarService(process.env.OPENAI_API_KEY || '', process.env.OPENAI_MODEL_NAME || 'gpt-4', process.env.OPENAI_API_BASE);
        }
        return this.avatarService;
    }
    async generateAvatar(body) {
        if (!body.nickname) {
            return { avatar: '👤' };
        }
        const emoji = await this.getService().generateAvatar(body.nickname);
        return { avatar: emoji };
    }
    async generateGreeting(body) {
        const start = Date.now();
        const content = !body.nickname
            ? '欢迎回来！'
            : await this.getService().generateGreeting(body.nickname, body.avatar || '👤');
        const duration = Date.now() - start;
        this.logger.logLlm('output', {
            feature: 'greeting',
            nickname: body.nickname,
            duration: `${duration}ms`,
            response: content
        });
        const messageId = (0, crypto_1.randomUUID)();
        return {
            agent: {
                messages: [
                    {
                        lc: 1,
                        type: 'constructor',
                        id: ['langchain_core', 'messages', 'AIMessage'],
                        kwargs: {
                            id: messageId,
                            content,
                            additional_kwargs: {},
                            response_metadata: {},
                            type: 'ai',
                            tool_calls: [],
                            invalid_tool_calls: [],
                            usage_metadata: {},
                        },
                    },
                ],
            },
        };
    }
};
exports.AvatarController = AvatarController;
__decorate([
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AvatarController.prototype, "generateAvatar", null);
__decorate([
    (0, common_1.Post)('greeting'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AvatarController.prototype, "generateGreeting", null);
exports.AvatarController = AvatarController = __decorate([
    (0, common_1.Controller)('features/avatar'),
    __metadata("design:paramtypes", [logger_service_1.LoggerService])
], AvatarController);
//# sourceMappingURL=avatar.controller.js.map