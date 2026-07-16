import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/platform/**", "src/ui/**", "tests/**"],
      include: [
        "src/application/**/*.ts",
        "src/domain/**/*.ts",
        "src/storage/**/*.ts",
      ],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    exclude: ["dist/**", "node_modules/**", "tests/e2e/**"],
    globals: true,
    restoreMocks: true,
  },
});
