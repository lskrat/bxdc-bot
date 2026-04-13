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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillProxyController = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let SkillProxyController = class SkillProxyController {
    gatewayUrl = process.env.JAVA_GATEWAY_URL || 'http://localhost:18080';
    apiToken = process.env.JAVA_GATEWAY_TOKEN || 'your-secure-token-here';
    async createSkill(payload, userId) {
        return this.forwardRequest(() => axios_1.default.post(`${this.gatewayUrl}/api/skills`, payload, {
            headers: this.gatewayHeaders(userId),
        }));
    }
    async updateSkill(id, payload, userId) {
        return this.forwardRequest(() => axios_1.default.put(`${this.gatewayUrl}/api/skills/${id}`, payload, {
            headers: this.gatewayHeaders(userId),
        }));
    }
    async deleteSkill(id, userId) {
        await this.forwardRequest(() => axios_1.default.delete(`${this.gatewayUrl}/api/skills/${id}`, {
            headers: this.gatewayHeaders(userId),
        }));
        return { ok: true };
    }
    gatewayHeaders(userId) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Agent-Token': this.apiToken,
        };
        if (userId && String(userId).trim()) {
            headers['X-User-Id'] = String(userId).trim();
        }
        return headers;
    }
    async forwardRequest(request) {
        try {
            const response = await request();
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new common_1.HttpException(error.response?.data ?? { error: 'Skill gateway request failed' }, error.response?.status ?? 500);
            }
            throw error;
        }
    }
};
exports.SkillProxyController = SkillProxyController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-user-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SkillProxyController.prototype, "createSkill", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-user-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], SkillProxyController.prototype, "updateSkill", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Headers)('x-user-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SkillProxyController.prototype, "deleteSkill", null);
exports.SkillProxyController = SkillProxyController = __decorate([
    (0, common_1.Controller)('features/skills')
], SkillProxyController);
//# sourceMappingURL=skill-proxy.controller.js.map