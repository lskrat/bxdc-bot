import { EmailConnectivityTestResult, LocalizedText, MarketplaceSkill, MarketTag, Skill } from '../shared/types';
export declare function resolveLocalizedText(text: string | LocalizedText): string;
declare class SkillService {
    private skills;
    private initialized;
    private localSkillDescriptions;
    private marketplaceSkillDescriptions;
    init(): Promise<void>;
    loadSkills(): Promise<Skill[]>;
    setSkillEnabled(id: string, enabled: boolean): Promise<Skill[]>;
    deleteSkill(id: string): Promise<{
        success: boolean;
        skills?: Skill[];
        error?: string;
    }>;
    downloadSkill(source: string): Promise<{
        success: boolean;
        skills?: Skill[];
        error?: string;
    }>;
    getSkillsRoot(): Promise<string | null>;
    onSkillsChanged(callback: () => void): () => void;
    getSkills(): Skill[];
    getEnabledSkills(): Skill[];
    getSkillById(id: string): Skill | undefined;
    getSkillConfig(skillId: string): Promise<Record<string, string>>;
    setSkillConfig(skillId: string, config: Record<string, string>): Promise<boolean>;
    testEmailConnectivity(skillId: string, config: Record<string, string>): Promise<EmailConnectivityTestResult | null>;
    getAutoRoutingPrompt(): Promise<string | null>;
    fetchMarketplaceSkills(): Promise<{
        skills: MarketplaceSkill[];
        tags: MarketTag[];
    }>;
    getLocalizedSkillDescription(skillId: string, skillName: string, fallback: string): string;
}
export declare const skillService: SkillService;
export {};
