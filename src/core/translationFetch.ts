import type { TranslateBatchResponse, TranslateRequest, TranslateResponse } from "./types";
import { logTranslation } from "./observability";

function getDesktop(): Window["translatorDesktop"] {
  if (typeof window === "undefined" || !window.translatorDesktop) {
    throw new Error("translatorDesktop API missing — run inside the Electron app");
  }
  return window.translatorDesktop;
}

/** Desktop-only: IPC to main process (no HTTP server). */
export async function translateOne(
  _baseUrlIgnored: string,
  body: TranslateRequest,
  _signal?: AbortSignal,
): Promise<TranslateResponse> {
  const started = performance.now();
  try {
    const json = await getDesktop().translate(body);
    logTranslation("info", {
      event: "translate_ok",
      blockId: json.blockId,
      sourceHash: json.sourceHash,
      cacheHit: json.cacheHit,
      latencyMs: Math.round(performance.now() - started),
    });
    return json;
  } catch (e) {
    logTranslation("error", {
      event: "translate_ipc_error",
      blockId: body.blockId,
      sourceHash: body.sourceHash,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function translateBatch(
  _baseUrlIgnored: string,
  requests: TranslateRequest[],
  _signal?: AbortSignal,
): Promise<TranslateResponse[]> {
  if (requests.length === 0) return [];
  if (requests.length === 1) {
    return [await translateOne("", requests[0]!, _signal)];
  }
  const started = performance.now();
  const json = (await getDesktop().translateBatch(requests)) as TranslateBatchResponse;
  logTranslation("info", {
    event: "translate_batch_ok",
    latencyMs: Math.round(performance.now() - started),
  });
  return json.results;
}
