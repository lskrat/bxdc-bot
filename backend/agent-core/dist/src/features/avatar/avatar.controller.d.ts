import { LoggerService } from '../../utils/logger.service';
export declare class AvatarController {
    private readonly logger;
    constructor(logger: LoggerService);
    private serviceForRequest;
    generateAvatar(body: {
        nickname: string;
        llmApiBase?: string;
        llmModelName?: string;
        llmApiKey?: string;
    }): Promise<{
        avatar: string;
        error?: undefined;
    } | {
        avatar: string;
        error: string;
    }>;
    generateGreeting(body: {
        nickname: string;
        avatar: string;
    }): Promise<{
        agent: {
            messages: {
                lc: number;
                type: string;
                id: string[];
                kwargs: {
                    id: `${string}-${string}-${string}-${string}-${string}`;
                    content: string;
                    additional_kwargs: {};
                    response_metadata: {};
                    type: string;
                    tool_calls: any[];
                    invalid_tool_calls: any[];
                    usage_metadata: {};
                };
            }[];
        };
    }>;
}
