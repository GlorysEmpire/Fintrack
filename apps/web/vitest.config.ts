import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // On a real database every test file shares one set of tables, and the
    // recurring job looks at every user's rules, so files must take turns.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
