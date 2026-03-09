import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

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
            "@lousy-agents/core": resolve(
                import.meta.dirname,
                "./packages/core/src",
            ),
        },
    },
});
