export declare class SkillProxyController {
    private readonly gatewayUrl;
    private readonly apiToken;
    createSkill(payload: unknown, userId?: string): Promise<unknown>;
    updateSkill(id: string, payload: unknown, userId?: string): Promise<unknown>;
    deleteSkill(id: string, userId?: string): Promise<{
        ok: boolean;
    }>;
    private gatewayHeaders;
    private forwardRequest;
}
