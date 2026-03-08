import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.integration.ts"],
        testTimeout: 60000,
        hookTimeout: 60000,
        pool: "forks",
        forkOptions: {
            singleFork: true,
        },
    },
});
