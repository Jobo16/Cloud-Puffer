import { defineConfig } from "vitest/config";
import { testEnvironment } from "./tests/environment.ts";
export default defineConfig({
  cacheDir: ".local/vite",
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    // Turbopack watches imported dependency directories. Keep generated test modules elsewhere.
    fsModuleCachePath: ".local/vitest-modules",
    include: ["tests/**/*.test.ts"],
    env: testEnvironment,
    fileParallelism: false,
    testTimeout: 10000,
  },
});
