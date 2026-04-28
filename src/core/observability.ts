/** Section 8 — structured job logs (console; swap for OpenTelemetry later). */

export type TranslationLogLevel = "info" | "warn" | "error";

export interface TranslationLogFields {
  event: string;
  blockId?: string;
  sourceHash?: string | null;
  decision?: string;
  gate?: string;
  cacheHit?: boolean;
  latencyMs?: number;
  error?: string;
  direction?: "forward" | "reverse";
}

export function logTranslation(level: TranslationLogLevel, fields: TranslationLogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
