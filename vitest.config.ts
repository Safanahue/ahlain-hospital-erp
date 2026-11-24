import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Service modules import "server-only"; tests run in plain Node.
      "server-only": path.resolve(__dirname, "tests/server-only-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Every suite shares one Postgres database, and tests/wave0/seed reseeds
    // it — run test files one at a time so fixtures are never wiped mid-test.
    fileParallelism: false,
  },
});
