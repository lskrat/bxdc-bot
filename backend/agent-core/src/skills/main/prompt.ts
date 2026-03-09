const AVAILABLE_SKILLS_SECTION_RE = /## Skills \(mandatory\)[\s\S]*?<\/available_skills>/;

export function stripAutoRoutingPromptForFollowUp(systemPrompt?: string | null): string | undefined {
  if (!systemPrompt || !systemPrompt.includes('<available_skills>')) {
    return systemPrompt ?? undefined;
  }

  return systemPrompt.replace(
    AVAILABLE_SKILLS_SECTION_RE,
    '## Skills\nSkill already loaded for this session. Continue following its instructions.'
  );
}
