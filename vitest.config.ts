import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/cli/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
  },
})
