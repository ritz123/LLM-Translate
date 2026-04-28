import type { TranslateRequest } from "../../src/core/types.ts";
import type { ServerLLMAdapter } from "./types.ts";

/** First trimmed non-empty string (skips empty env vars so `GEMINI_API_KEY=` does not block `GOOGLE_API_KEY`). */
function firstNonEmptyString(...parts: (string | undefined | null)[]): string {
  for (const p of parts) {
    const t = String(p ?? "").trim();
    if (t.length > 0) return t;
  }
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header.trim());
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.min(sec * 1000, 120_000);
}

function parseGeminiErrorMessage(raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string } };
    if (j.error?.message) return j.error.message;
  } catch {
    /* ignore */
  }
  return raw.slice(0, 800);
}

function formatGeminiHttpError(status: number, raw: string): string {
  const detail = parseGeminiErrorMessage(raw);
  if (status === 429) {
    return (
      `Gemini API rate limit (429): ${detail}\n\n` +
      `chat.google.com and this app use different products and quotas. This editor calls the Google AI Gemini API with your API key (RPM/TPM/RPD limits in AI Studio), not the same pool as the consumer web chat. Wait a minute, try a smaller model (e.g. Flash), avoid rapid batch translates, or check usage in Google AI Studio.`
    );
  }
  if (status === 503) {
    return `Gemini temporarily unavailable (503): ${detail}`;
  }
  return `Gemini ${status}: ${raw.slice(0, 1200)}`;
}

export type GeminiAdapterOverrides = {
  /** When set and non-empty, used before env vars. */
  apiKey?: string;
  model?: string;
  /** When set and non-empty, overrides GEMINI_API_BASE. */
  apiBase?: string;
};

/**
 * Google Gemini (Generative Language API).
 * Key: overrides.apiKey, then first non-empty of GEMINI_API_KEY, GOOGLE_API_KEY.
 * Model: overrides.model, then GEMINI_MODEL, then gemini-2.0-flash.
 * API base: overrides.apiBase, then GEMINI_API_BASE, then Google default.
 * Auth: `key` query parameter plus x-goog-api-key header.
 * Retries: 429 / 503 with exponential backoff and optional Retry-After (GEMINI_MAX_RETRIES, default 4).
 * @see https://ai.google.dev/api/rest/v1beta/models.generateContent
 */
export function createGeminiAdapter(overrides?: GeminiAdapterOverrides | null): ServerLLMAdapter | null {
  const key = firstNonEmptyString(overrides?.apiKey, process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
  if (!key) return null;
  const model = firstNonEmptyString(overrides?.model, process.env.GEMINI_MODEL) || "gemini-2.0-flash";
  const defaultGeminiBase = "https://generativelanguage.googleapis.com/v1beta";
  const base = (
    firstNonEmptyString(overrides?.apiBase, process.env.GEMINI_API_BASE) || defaultGeminiBase
  ).replace(/\/$/, "");

  const maxAttemptsRaw = Number(process.env.GEMINI_MAX_RETRIES ?? "4");
  const maxAttempts = Number.isFinite(maxAttemptsRaw)
    ? Math.min(10, Math.max(1, Math.floor(maxAttemptsRaw)))
    : 4;

  return {
    modelVersion: `gemini:${model}`,
    async translate(req: TranslateRequest) {
      const started = performance.now();
      const prompt = `Translate the following text from ${req.sourceLang} to ${req.targetLang}. Reply with only the translated text, no quotes or commentary.\n\n${req.text}`;
      const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      });

      let lastStatus = 0;
      let lastRaw = "";
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body,
        });
        lastRaw = await res.text();
        if (res.ok) {
          const data = JSON.parse(lastRaw) as {
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
        }
        lastStatus = res.status;
        const retryable = res.status === 429 || res.status === 503;
        if (!retryable || attempt === maxAttempts - 1) {
          break;
        }
        const fromHeader = parseRetryAfterMs(res.headers.get("retry-after"));
        const backoff = Math.min(32_000, 1000 * 2 ** attempt);
        const jitter = Math.floor(Math.random() * 400);
        await sleep((fromHeader ?? backoff) + jitter);
      }
      throw new Error(formatGeminiHttpError(lastStatus, lastRaw));
    },
  };
}
