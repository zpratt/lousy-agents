import { describe, expect, it } from "vitest";
import { isProductionSourceFile } from "./production-files.js";

describe("isProductionSourceFile", () => {
    it.each([
        "packages/core/src/entities/lint-rules.ts",
        "packages/lint/src/index.ts",
        "packages/doctor/src/cli/index.ts",
        "packages/cli/src/commands/init.ts",
        "packages/web/src/components/button.tsx",
    ])("should treat %s as production source", (path) => {
        // Act / Assert
        expect(isProductionSourceFile(path)).toBe(true);
    });

    it.each([
        "packages/core/src/lib/a.test-utils.ts",
        "packages/core/src/lib/test-utils.ts",
        "packages/core/src/lib/a.spec-helpers.ts",
        "packages/core/src/lib/data.d.ts.ts",
    ])(
        "should treat %s, whose name only contains test, spec or d, as production source",
        (path) => {
            // Act / Assert
            expect(isProductionSourceFile(path)).toBe(true);
        },
    );

    it.each([
        ["a unit test", "packages/core/src/lib/thing.test.ts"],
        [
            "an integration test",
            "packages/cli/src/commands/init.integration.test.ts",
        ],
        ["a spec file", "packages/core/src/lib/thing.spec.ts"],
        ["a React unit test", "packages/web/src/components/button.test.tsx"],
        ["a React spec file", "packages/web/src/components/button.spec.tsx"],
        ["a declaration file", "packages/lint/src/index.d.ts"],
        [
            "a source file outside src",
            "packages/cli/api/copilot-with-fastify/src/app.ts",
        ],
        [
            "a file in the scripts folder",
            "scripts/architecture-gate/run-gate.ts",
        ],
        ["a build output", "packages/action/dist/index.js"],
        ["a markdown file", "packages/core/src/README.md"],
        ["a source file at the repository root", "vitest.config.ts"],
    ])("should not treat %s as production source", (_label, path) => {
        // Act / Assert
        expect(isProductionSourceFile(path)).toBe(false);
    });
});
