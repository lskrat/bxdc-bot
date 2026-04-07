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
exports.UserController = void 0;
const common_1 = require("@nestjs/common");
const openai_1 = require("@langchain/openai");
const llm_request_role_normalize_1 = require("../utils/llm-request-role-normalize");
const messages_1 = require("@langchain/core/messages");
let UserController = class UserController {
    async generateAvatar(body) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return { avatar: '👤' };
        }
        try {
            const chat = new openai_1.ChatOpenAI({
                apiKey,
                modelName: 'gpt-4o-mini',
                temperature: 0.7,
                configuration: { fetch: (0, llm_request_role_normalize_1.composeOpenAiCompatibleFetch)() },
            });
            const response = await chat.invoke([
                new messages_1.SystemMessage("You are an emoji generator. User gives a nickname, you return a SINGLE emoji that best represents it. No text, just the emoji."),
                new messages_1.HumanMessage(body.nickname)
            ]);
            const text = response.content.toString().trim();
            const emoji = text.match(/\p{Emoji_Presentation}/u)?.[0] || text.substring(0, 2);
            return { avatar: emoji };
        }
        catch (e) {
            console.error('Avatar generation failed', e);
            return { avatar: '👤' };
        }
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Post)('avatar'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "generateAvatar", null);
exports.UserController = UserController = __decorate([
    (0, common_1.Controller)('user')
], UserController);
//# sourceMappingURL=user.controller.js.map