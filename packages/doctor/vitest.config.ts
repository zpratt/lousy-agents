import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/*.integration.test.ts",
        ],
    },
    resolve: {
        alias: {
            "@lousy-agents/core": resolve(__dirname, "../core/src"),
            "@lousy-agents/agentic-doctor": resolve(__dirname, "./src"),
        },
    },
});
