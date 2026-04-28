import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const pkgPath = fileURLToPath(new URL("./package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  version: string;
  license?: string;
  build?: { productName?: string };
};
const productName = pkg.build?.productName ?? "Translator";

export default defineConfig({
  plugins: [react()],
  logLevel: "warn",
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_PRODUCT_NAME__: JSON.stringify(productName),
    __APP_LICENSE_SPDX__: JSON.stringify(pkg.license ?? "UNLICENSED"),
  },
  resolve: {
    alias: { "@core": path.resolve(__dirname, "src/core") },
  },
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    reportCompressedSize: false,
  },
});
