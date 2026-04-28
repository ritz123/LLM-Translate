/**
 * List models from Generative Language API (same base as generateContent).
 * @see https://ai.google.dev/api/rest/v1beta/models/list
 */

export interface GeminiModelOption {
  id: string;
  displayName: string;
}

export const FALLBACK_GEMINI_MODEL_IDS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
] as const;

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function firstNonEmptyString(...parts: (string | undefined | null)[]): string {
  for (const p of parts) {
    const t = String(p ?? "").trim();
    if (t.length > 0) return t;
  }
  return "";
}

/** Resolved REST root for `v1beta` (no trailing slash). */
export function resolveGeminiApiBase(apiBaseOverride?: string | null): string {
  const fromOverride = (apiBaseOverride ?? "").trim();
  if (fromOverride.length > 0) return fromOverride.replace(/\/+$/, "");
  return (
    firstNonEmptyString(process.env.GEMINI_API_BASE) || DEFAULT_GEMINI_BASE
  ).replace(/\/+$/, "");
}

export async function listGeminiModels(
  apiKey: string,
  apiBaseOverride?: string | null,
): Promise<GeminiModelOption[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key required");
  const base = resolveGeminiApiBase(apiBaseOverride);
  const url = `${base}/models?key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`List models ${res.status}: ${raw.slice(0, 800)}`);
  }
  const data = JSON.parse(raw) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  const out: GeminiModelOption[] = [];
  for (const m of data.models ?? []) {
    const full = m.name ?? "";
    const id = full.replace(/^models\//, "");
    if (!id) continue;
    const methods = m.supportedGenerationMethods ?? [];
    if (!methods.includes("generateContent")) continue;
    out.push({ id, displayName: m.displayName?.trim() || id });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}
