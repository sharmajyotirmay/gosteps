import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**", ".gosteps-workspace/**", ".gosteps-data/**"], environment: "node" },
});
