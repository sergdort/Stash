import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/cli/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    setupFiles: ["./test/vitest.setup.ts"],
    testTimeout: 20_000,
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
  },
})
