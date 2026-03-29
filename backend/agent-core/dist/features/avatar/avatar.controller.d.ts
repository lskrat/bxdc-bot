import { LoggerService } from '../../utils/logger.service';
export declare class AvatarController {
    private readonly logger;
    private avatarService;
    constructor(logger: LoggerService);
    private getService;
    generateAvatar(body: {
        nickname: string;
    }): Promise<{
        avatar: string;
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
