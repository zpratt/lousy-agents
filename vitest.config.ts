import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [],
    test: {
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
