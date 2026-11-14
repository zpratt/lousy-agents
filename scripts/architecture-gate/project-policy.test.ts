import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    findAmbiguouslyMappedFiles,
    findNestedPrefixes,
    findStalePrefixes,
    findUnmappedFiles,
} from "./layer-coverage.js";
import { parseLayerPolicy } from "./layer-policy.js";
import { POLICY_PATH } from "./policy-path.js";
import {
    isProductionSourceFile,
    isScriptCoachDoesNotRead,
} from "./production-files.js";

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
);

function committedPolicy() {
    const text = readFileSync(resolve(repositoryRoot, POLICY_PATH), "utf8");
    return parseLayerPolicy(JSON.parse(text));
}

function trackedFiles(): string[] {
    const listing = execFileSync("git", ["ls-files", "-z"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    return listing.split("\0");
}

function trackedProductionFiles(): string[] {
    return trackedFiles().filter(isProductionSourceFile);
}

const TYPESCRIPT_SOURCE = /\.tsx?$/;
const TEST_SOURCE = /\.(?:test|spec)\.tsx?$/;

/**
 * Every tracked TypeScript file that is not a test, the set a non-production
 * layer (tooling, scaffold templates) and a declaration-file prefix draw from.
 */
function trackedTypeScriptFiles(): string[] {
    return trackedFiles().filter(
        (path) => TYPESCRIPT_SOURCE.test(path) && !TEST_SOURCE.test(path),
    );
}

// Coach says nothing about an import to or from a file that no layer claims,
// so these checks read the file list and the policy directly instead of
// trusting coach's report to reveal a hole in its own coverage.
describe(`the committed layering policy (${POLICY_PATH})`, () => {
    const policy = committedPolicy();
    const files = trackedProductionFiles();

    it("should have production files to check", () => {
        // Assert
        expect(files.length).toBeGreaterThan(0);
    });

    it("should assign each prefix to exactly this layer", () => {
        // Arrange
        const prefixesByLayer = Object.fromEntries(
            policy.layers.map((layer) => [
                layer.name,
                [...layer.prefixes].sort(),
            ]),
        );

        // Act / Assert
        expect(prefixesByLayer).toEqual({
            entities: [
                "packages/agent-shell/src/entities",
                "packages/core/src/entities",
                "packages/doctor/src/entities",
            ],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            use_cases: [
                "packages/agent-shell/src/use-cases",
                "packages/core/src/use-cases",
                "packages/doctor/src/use-cases",
            ],
            adapters: [
                "packages/action/src/annotations.ts",
                "packages/action/src/run-level-diagnostics.ts",
                "packages/action/src/run-lint.ts",
                "packages/action/src/runner-temp-path.ts",
                "packages/action/src/validate-inputs.ts",
                "packages/agent-shell/src/gateways",
                "packages/agent-shell/src/lib",
                "packages/agent-shell/src/types/copilot-sdk.d.ts",
                "packages/cli/src/commands",
                "packages/cli/src/lib",
                "packages/core/src/gateways",
                "packages/core/src/lib",
                "packages/doctor/src/gateways",
                "packages/doctor/src/lib",
                "packages/mcp/src/lib",
                "packages/mcp/src/package-version.ts",
                "packages/mcp/src/tools",
            ],
            formatters: [
                "packages/action/src/summary-markdown.ts",
                "packages/action/src/workflow-commands.ts",
                "packages/core/src/formatters",
                "packages/doctor/src/formatters",
            ],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            composition_root: [
                "packages/action/src/index.ts",
                "packages/agent-shell/src/index.ts",
                "packages/cli/src/index.ts",
                "packages/doctor/src/cli",
                "packages/lint/src/lint.ts",
                "packages/mcp/src/mcp-server.ts",
                "packages/mcp/src/server.ts",
            ],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            core_barrel: ["packages/core/src/index.ts"],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            package_api: [
                "packages/doctor/src/index.ts",
                "packages/mcp/src/index.ts",
            ],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            lint_api: ["packages/lint/src/index.ts"],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            lint_validate_directory: [
                "packages/lint/src/validate-directory.ts",
            ],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            lint_errors: ["packages/lint/src/lint-errors.ts"],
            // biome-ignore lint/style/useNamingConvention: layer name in the policy
            scaffold_templates: [
                "packages/cli/api",
                "packages/cli/cli",
                "packages/cli/ui",
            ],
            tooling: [
                ".semgrep",
                "packages/action/rspack.config.ts",
                "packages/agent-shell/rspack.config.ts",
                "packages/cli/rspack.config.ts",
                "packages/doctor/rspack.config.ts",
                "packages/doctor/vitest.config.ts",
                "packages/lint/rspack.config.ts",
                "packages/mcp/rspack.config.ts",
                "scripts",
                "vitest.config.ts",
                "vitest.integration.config.ts",
                "vitest.setup.ts",
            ],
        });
    });

    it("should map every production source file to a layer", () => {
        // Act
        const unmapped = findUnmappedFiles(files, policy);

        // Assert
        expect(unmapped).toEqual([]);
    });

    it("should map no production source file to more than one layer", () => {
        // Act
        const ambiguous = findAmbiguouslyMappedFiles(files, policy);

        // Assert
        expect(ambiguous).toEqual([]);
    });

    it("should have no layer prefix that is, or sits inside, another prefix", () => {
        // Act
        const nested = findNestedPrefixes(policy);

        // Assert
        expect(nested).toEqual([]);
    });

    it("should have no layer prefix that matches no tracked TypeScript file", () => {
        // Act
        const stale = findStalePrefixes(trackedTypeScriptFiles(), policy);

        // Assert
        expect(stale).toEqual([]);
    });
});

// Coach 0.12.0 analyzes `.ts` and `.tsx` and nothing else, so a script in
// another format under src would sit outside every check here while tsc and
// Biome accept it.
describe("the tracked files under packages/*/src", () => {
    it("should include no script that coach does not analyze", () => {
        // Arrange
        const unread = trackedFiles()
            .filter(isScriptCoachDoesNotRead)
            .map(
                (path) =>
                    `${path} is a script that coach 0.12.0 does not analyze: write it as .ts or .tsx`,
            );

        // Assert
        expect(unread).toEqual([]);
    });
});
