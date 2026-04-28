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

export type OllamaModelOption = {
  id: string;
  displayName: string;
};

const defaultBase = "http://127.0.0.1:11434";

/**
 * GET /api/tags — local models Ollama has metadata for.
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md#list-local-models
 */
export async function listOllamaModels(baseUrlOverride?: string | null): Promise<OllamaModelOption[]> {
  const base =
    trimBase(firstNonEmptyString(baseUrlOverride, process.env.OLLAMA_BASE_URL) || defaultBase) || defaultBase;
  const res = await fetch(`${base}/api/tags`, {
    method: "GET",
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${raw.slice(0, 400)}`);
  }
  let data: { models?: Array<{ name?: string }>; error?: string };
  try {
    data = JSON.parse(raw) as { models?: Array<{ name?: string }>; error?: string };
  } catch {
    throw new Error("Ollama: invalid JSON from /api/tags");
  }
  if (typeof data.error === "string" && data.error.length > 0) {
    throw new Error(`Ollama: ${data.error}`);
  }
  const rows = data.models ?? [];
  const out: OllamaModelOption[] = [];
  for (const m of rows) {
    const name = typeof m.name === "string" ? m.name.trim() : "";
    if (name.length > 0) out.push({ id: name, displayName: name });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
