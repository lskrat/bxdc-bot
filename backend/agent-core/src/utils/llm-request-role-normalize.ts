import { getLoggingFetchOrUndefined } from './llm-raw-http-log';

/**
 * Fetch for OpenAI-compatible clients: optional raw HTTP logging (env-controlled).
 * Does not modify request bodies; roles follow OpenAI Chat Completions conventions from LangChain.
 */
export function composeOpenAiCompatibleFetch(): typeof fetch {
  const inner = globalThis.fetch.bind(globalThis);
  return getLoggingFetchOrUndefined() ?? inner;
}
