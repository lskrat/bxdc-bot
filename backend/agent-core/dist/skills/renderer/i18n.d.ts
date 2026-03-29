type SkillLocale = 'en' | 'zh';
type SkillI18nAdapter = {
    t: (key: string) => string;
    getLanguage: () => SkillLocale;
};
export declare function configureSkillI18n(nextAdapter: SkillI18nAdapter): void;
export declare const skillI18n: {
    getLanguage(): SkillLocale;
    t(key: string): string;
};
export {};
