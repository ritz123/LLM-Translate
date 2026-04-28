export type AppInfo = {
  name: string;
  version: string;
};

/** Version baked into the renderer bundle (matches package.json at web build time). */
export function getBundledAppVersion(): string {
  return __APP_VERSION__;
}

export function getBundledProductName(): string {
  return __APP_PRODUCT_NAME__;
}

/** Prefer Electron IPC in desktop; fall back to Vite defines in browser-only dev. */
export async function getAppInfo(): Promise<AppInfo> {
  const api = window.translatorDesktop?.getAppInfo;
  if (api) return api();
  return { name: getBundledProductName(), version: getBundledAppVersion() };
}
