type SkillStoreUrlResolver = () => string;

const DEFAULT_PROD_SKILL_STORE_URL = 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/prod/skill-store';
const DEFAULT_TEST_SKILL_STORE_URL = 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/test/skill-store';

let resolver: SkillStoreUrlResolver = () => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  return isLocalDev ? DEFAULT_TEST_SKILL_STORE_URL : DEFAULT_PROD_SKILL_STORE_URL;
};

export function configureSkillStoreUrlResolver(nextResolver: SkillStoreUrlResolver): void {
  resolver = nextResolver;
}

export function getSkillStoreUrl(): string {
  return resolver();
}
