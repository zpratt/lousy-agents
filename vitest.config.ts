import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

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
            "@lousy-agents/core": resolve(
                import.meta.dirname,
                "./packages/core/src",
            ),
        },
    },
});
