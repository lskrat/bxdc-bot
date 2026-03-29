export declare class SkillProxyController {
    private readonly gatewayUrl;
    private readonly apiToken;
    createSkill(payload: unknown): Promise<unknown>;
    updateSkill(id: string, payload: unknown): Promise<unknown>;
    deleteSkill(id: string): Promise<{
        ok: boolean;
    }>;
    private get gatewayHeaders();
    private forwardRequest;
}
