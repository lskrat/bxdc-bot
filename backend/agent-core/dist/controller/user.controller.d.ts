export declare class UserController {
    generateAvatar(body: {
        nickname: string;
    }): Promise<{
        avatar: string;
    }>;
}
