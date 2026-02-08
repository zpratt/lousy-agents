import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.integration.test.ts"],
        testTimeout: 120000,
        hookTimeout: 120000,
        pool: "forks",
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
