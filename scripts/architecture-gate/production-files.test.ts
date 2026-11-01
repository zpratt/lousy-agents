import { describe, expect, it } from "vitest";
import {
    isProductionSourceFile,
    isScriptCoachDoesNotRead,
} from "./production-files.js";

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

describe("isScriptCoachDoesNotRead", () => {
    it.each([
        ["a .mts module", "packages/core/src/entities/thing.mts"],
        ["a .cts module", "packages/core/src/entities/thing.cts"],
        ["a .js file", "packages/core/src/lib/thing.js"],
        ["an .mjs file", "packages/cli/src/commands/thing.mjs"],
        ["a .cjs file", "packages/mcp/src/tools/thing.cjs"],
        ["a .jsx file", "packages/web/src/components/button.jsx"],
        ["a .d.mts declaration file", "packages/core/src/lib/thing.d.mts"],
        ["a .test.js file", "packages/core/src/lib/thing.test.js"],
        ["an .mJs file in mixed case", "packages/core/src/entities/thing.mJs"],
        ["a .tS file in mixed case", "packages/core/src/entities/thing.tS"],
        ["a .TS file in capitals", "packages/core/src/entities/thing.TS"],
        ["a .Tsx file in mixed case", "packages/web/src/components/button.Tsx"],
        ["an .MTS file in capitals", "packages/core/src/entities/thing.MTS"],
        [
            "a .D.TS file, which tsc does not take for a declaration",
            "packages/core/src/lib/thing.D.TS",
        ],
        [
            "a name that holds .ts and ends in .js",
            "packages/core/src/lib/x.ts.js",
        ],
    ])(
        "should flag %s under a package's src, which coach 0.11.0 does not analyze",
        (_label, path) => {
            // Act / Assert
            expect(isScriptCoachDoesNotRead(path)).toBe(true);
        },
    );

    it.each([
        ["a .ts file", "packages/core/src/entities/thing.ts"],
        ["a .tsx file", "packages/web/src/components/button.tsx"],
        ["a .d.ts declaration file", "packages/lint/src/index.d.ts"],
        ["a test file", "packages/core/src/lib/thing.test.ts"],
        ["a JSON asset", "packages/core/src/lib/data.json"],
        ["a markdown file", "packages/core/src/README.md"],
        ["a script outside src", "packages/cli/templates/app/index.js"],
        [
            "a script in the src folder of a package inside a scaffold template",
            "packages/cli/templates/monorepo/packages/app/src/main.js",
        ],
        ["a build output", "packages/action/dist/index.js"],
        ["a script in the scripts folder", "scripts/release.mjs"],
        ["a script at the repository root", "eslint.config.js"],
        [
            "a name that only ends like a script",
            "packages/core/src/lib/thing.mts.md",
        ],
    ])("should not flag %s", (_label, path) => {
        // Act / Assert
        expect(isScriptCoachDoesNotRead(path)).toBe(false);
    });
});
