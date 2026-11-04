import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      TREZO_DB_PATH: ":memory:",
      TREZO_SESSION_SECRET: "test-secret-0123456789",
      NEXT_PUBLIC_TREZO_CONTRACT_ID: "trezo-game.testnet",
      // Deterministic TEST-ONLY oracle seed (32 bytes of 0x07). Never use outside tests.
      TREZO_ORACLE_SECRET_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    },
    pool: "forks",
  },
});
