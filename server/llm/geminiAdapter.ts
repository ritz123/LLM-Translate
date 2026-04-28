import type { TranslateRequest } from "../../src/core/types.ts";
import type { ServerLLMAdapter } from "./types.ts";

/**
 * Google Gemini (Generative Language API).
 * Set GEMINI_API_KEY or GOOGLE_API_KEY. Model via GEMINI_MODEL (default gemini-2.0-flash).
 * @see https://ai.google.dev/api/rest/v1beta/models.generateContent
 */
export function createGeminiAdapter(): ServerLLMAdapter | null {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const base =
    process.env.GEMINI_API_BASE?.replace(/\/$/, "") ??
    "https://generativelanguage.googleapis.com/v1beta";

  return {
    modelVersion: `gemini:${model}`,
    async translate(req: TranslateRequest) {
      const started = performance.now();
      const prompt = `Translate the following text from ${req.sourceLang} to ${req.targetLang}. Reply with only the translated text, no quotes or commentary.\n\n${req.text}`;
      const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`Gemini ${res.status}: ${raw}`);
      }
      const data = JSON.parse(raw) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        error?: { message?: string };
      };
      if (data.error?.message) {
        throw new Error(`Gemini: ${data.error.message}`);
      }
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const translation = parts
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      return { translation, latencyMs: Math.round(performance.now() - started) };
    },
  };
}
