/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/bat-an-meo/" : "/",
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    exclude: ["manifold-3d"],
  },
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
