export declare class AvatarService {
    private llm;
    private greetingCache;
    private readonly CACHE_TTL;
    constructor(apiKey: string, modelName?: string, baseUrl?: string);
    generateAvatar(nickname: string): Promise<string>;
    generateGreeting(nickname: string, avatar: string): Promise<string>;
}
