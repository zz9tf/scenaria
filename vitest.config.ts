import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/setup/db.ts"],
    // Runtime tests share one SQLite file, so they must not run concurrently.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      SCENARIA_LLM_PROVIDER: "stub",
    },
  },
});
