import type { TranslateRequest } from "../../src/core/types.ts";
import type { ServerLLMAdapter } from "./types.ts";

function firstNonEmptyString(...parts: (string | undefined | null)[]): string {
  for (const p of parts) {
    const t = String(p ?? "").trim();
    if (t.length > 0) return t;
  }
  return "";
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export type OllamaAdapterOverrides = {
  baseUrl?: string;
  model?: string;
};

/**
 * Local [Ollama](https://ollama.com/) HTTP API (`/api/chat`, non-streaming).
 *
 * Env (overridden by non-empty `overrides`):
 * - `OLLAMA_BASE_URL` — default `http://127.0.0.1:11434`
 * - `OLLAMA_MODEL` — default `llama3.2`
 * - `OLLAMA_TIMEOUT_MS` — request timeout in ms (default `180000`)
 */
export function createOllamaAdapter(overrides?: OllamaAdapterOverrides | null): ServerLLMAdapter {
  const defaultBase = "http://127.0.0.1:11434";
  const base = trimBase(firstNonEmptyString(overrides?.baseUrl, process.env.OLLAMA_BASE_URL) || defaultBase);
  const model = firstNonEmptyString(overrides?.model, process.env.OLLAMA_MODEL) || "llama3.2";
  const timeoutRaw = Number(process.env.OLLAMA_TIMEOUT_MS ?? "180000");
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.min(600_000, Math.max(5_000, timeoutRaw)) : 180_000;

  return {
    modelVersion: `ollama:${model}`,
    async translate(req: TranslateRequest) {
      const started = performance.now();
      const userContent = `Translate the following text from ${req.sourceLang} to ${req.targetLang}. Reply with only the translated text, no quotes or commentary.\n\n${req.text}`;
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: userContent }],
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`Ollama ${res.status}: ${raw.slice(0, 800)}`);
      }
      const data = JSON.parse(raw) as {
        message?: { content?: string };
        error?: string;
      };
      if (typeof data.error === "string" && data.error.length > 0) {
        throw new Error(`Ollama: ${data.error}`);
      }
      const translation = (data.message?.content ?? "").trim();
      return { translation, latencyMs: Math.round(performance.now() - started) };
    },
  };
}
