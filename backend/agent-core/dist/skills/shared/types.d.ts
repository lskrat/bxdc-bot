export interface Skill {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    isOfficial: boolean;
    isBuiltIn: boolean;
    updatedAt: number;
    prompt: string;
    skillPath: string;
    version?: string;
}
export type LocalizedText = {
    en: string;
    zh: string;
};
export interface MarketTag {
    id: string;
    en: string;
    zh: string;
}
export interface LocalSkillInfo {
    id: string;
    name: string;
    description: string | LocalizedText;
    version: string;
}
export interface MarketplaceSkill {
    id: string;
    name: string;
    description: string | LocalizedText;
    tags?: string[];
    url: string;
    version: string;
    source: {
        from: string;
        url: string;
        author?: string;
    };
}
export type EmailConnectivityCheck = {
    code: 'imap_connection' | 'smtp_connection';
    level: 'pass' | 'fail';
    message: string;
    durationMs: number;
};
export type EmailConnectivityTestResult = {
    testedAt: number;
    verdict: 'pass' | 'fail';
    checks: EmailConnectivityCheck[];
};
