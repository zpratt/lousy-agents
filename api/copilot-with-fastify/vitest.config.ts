import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.test.ts"],
        exclude: ["**/*.integration.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.integration.ts"],
        },
    },
});
