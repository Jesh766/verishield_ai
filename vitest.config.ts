import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/lib/engine/**/*.test.ts"],
    globals: true,
  },
});
