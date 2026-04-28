import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: { "@core": path.resolve(__dirname, "src/core") },
  },
  server: {
    port: 5173,
  },
});
