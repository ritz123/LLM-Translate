import http from "node:http";

const VITE_URL = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

export function getViteDevServerUrl(): string {
  return VITE_URL;
}

function probeUrl(urlString: string): Promise<boolean> {
  return new Promise((resolve) => {
    const u = new URL(urlString);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search || "/",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export async function waitForVite(timeoutMs = 120000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await probeUrl(`${VITE_URL}/`)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for Vite at ${VITE_URL}`);
}
