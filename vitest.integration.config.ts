import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./vitest.setup.ts"],
        include: ["packages/**/*.integration.test.ts"],
        testTimeout: 120000,
        hookTimeout: 120000,
        pool: "forks",
        forkOptions: {
            singleFork: true,
        },
    },
    resolve: {
        alias: {
            "@lousy-agents/core": resolve(__dirname, "./packages/core/src"),
            "@lousy-agents/lint": resolve(__dirname, "./packages/lint/src"),
        },
    },
});
