import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts"]
    }
  }
});
