import type { TranslateRequest, TranslateResponse } from "./types";

export interface TranslatorDesktopAPI {
  getConfig(): Promise<{ modelVersion: string }>;
  translate(body: TranslateRequest): Promise<TranslateResponse>;
  translateBatch(requests: TranslateRequest[]): Promise<{ results: TranslateResponse[] }>;
}

declare global {
  interface Window {
    translatorDesktop: TranslatorDesktopAPI;
  }
}

export {};
