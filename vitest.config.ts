import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [],
    test: {
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/*.integration.test.ts",
        ],
    },
    resolve: {
        alias: {
            "@lousy-agents/core": resolve(__dirname, "./packages/core/src"),
        },
    },
});
