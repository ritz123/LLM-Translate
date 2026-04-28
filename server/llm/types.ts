import type { TranslateRequest, TranslateResponse } from "../../src/core/types.ts";

export interface ServerLLMAdapter {
  readonly modelVersion: string;
  translate(req: TranslateRequest): Promise<{ translation: string; latencyMs: number }>;
}
