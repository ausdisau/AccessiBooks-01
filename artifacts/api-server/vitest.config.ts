import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    // Route tests mutate module-private concurrency state and process.env.PORT,
    // and rely on vi.resetModules(); run serially in a single fork to avoid
    // cross-file interference.
    fileParallelism: false,
  },
});
