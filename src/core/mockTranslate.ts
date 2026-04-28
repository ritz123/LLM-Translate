/**
 * Deterministic mock translations for tests and demos (no API key).
 * Section 7 — replace with LLMAdapter.translate (OpenAI, local, etc.).
 */
export function mockTranslate(text: string, sourceLang: string, targetLang: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (sourceLang === "en" && targetLang === "hi") {
    return `[मॉक हिंदी] ${trimmed.replace(/\s+/g, " । ")} ।`;
  }
  if (sourceLang === "hi" && targetLang === "en") {
    return `[mock EN] ${trimmed.replace(/\s+/g, " ")}`;
  }
  return `[mock:${sourceLang}→${targetLang}] ${trimmed}`;
}
