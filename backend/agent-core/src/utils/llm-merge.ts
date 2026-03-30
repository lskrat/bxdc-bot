/**
 * Merge optional per-user overrides (from gateway context) with OPENAI_* env defaults.
 * User non-empty string wins per field.
 */
export type LlmOverrides = {
  llmApiBase?: string;
  llmModelName?: string;
  llmApiKey?: string;
};

export function pickMergedLlm(overrides: LlmOverrides | undefined | null): {
  apiKey: string | undefined;
  modelName: string;
  baseUrl: string | undefined;
} {
  const pick = (u: string | undefined, e: string | undefined) =>
    u != null && String(u).trim() !== '' ? String(u).trim() : e;

  const apiKey = pick(overrides?.llmApiKey, process.env.OPENAI_API_KEY);
  const modelName = pick(overrides?.llmModelName, process.env.OPENAI_MODEL_NAME || 'gpt-4');
  const baseUrl = pick(overrides?.llmApiBase, process.env.OPENAI_API_BASE);

  return { apiKey, modelName, baseUrl };
}
