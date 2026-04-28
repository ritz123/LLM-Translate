import type { TranslateRequest } from "../../src/core/types.ts";
import type { ServerLLMAdapter } from "./types.ts";

/**
 * Hosted OpenAI chat completion (Section 7).
 * Requires OPENAI_API_KEY; otherwise factory returns null and server falls back to mock.
 */
export function createOpenAIAdapter(): ServerLLMAdapter | null {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) return null;
  const model = (process.env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";
  return {
    modelVersion: model,
    async translate(req: TranslateRequest) {
      const started = performance.now();
      const prompt = `Translate the following text from ${req.sourceLang} to ${req.targetLang}. Reply with only the translated text, no quotes or commentary.\n\n${req.text}`;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`OpenAI ${res.status}: ${t}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const translation = data.choices?.[0]?.message?.content?.trim() ?? "";
      return { translation, latencyMs: Math.round(performance.now() - started) };
    },
  };
}
