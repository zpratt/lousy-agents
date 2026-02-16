/**
 * End-to-end integration tests for feedback loop discovery and validation.
 *
 * These tests create a realistic project structure and verify that:
 * 1. Scripts are discovered from package.json
 * 2. Tools are discovered from GitHub Actions workflows
 * 3. SDLC phases are correctly identified
 * 4. Instruction coverage is validated
 * 5. Suggestions are helpful and accurate
 *
 * NOTE: These tests can also be run manually to inspect output by setting
 * the INSPECT_OUTPUT environment variable.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEnvironmentGateway } from "../gateways/environment-gateway.js";
import { createInstructionAnalysisGateway } from "../gateways/instruction-analysis-gateway.js";
import { createScriptDiscoveryGateway } from "../gateways/script-discovery-gateway.js";
import { createToolDiscoveryGateway } from "../gateways/tool-discovery-gateway.js";
import type { PackageManagerGateway } from "./discover-feedback-loops.js";
import { DiscoverFeedbackLoopsUseCase } from "./discover-feedback-loops.js";
import { ValidateInstructionCoverageUseCase } from "./validate-instruction-coverage.js";

const chance = new Chance();

/**
 * Helper to log test output for manual inspection
 */
function inspectOutput(label: string, data: unknown): void {
    if (process.env.INSPECT_OUTPUT) {
        // biome-ignore lint/suspicious/noConsole: intentional for manual inspection
        console.log(`\n=== ${label} ===`);
        // biome-ignore lint/suspicious/noConsole: intentional for manual inspection
        console.log(JSON.stringify(data, null, 2));
        // biome-ignore lint/suspicious/noConsole: intentional for manual inspection
        console.log("=".repeat(label.length + 8));
    }
}

describe("Feedback Loop Discovery - End-to-End", () => {
    let testDir: string;
    let workflowsDir: string;
    let instructionsDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `feedback-loop-e2e-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        instructionsDir = join(testDir, ".github", "instructions");
        await mkdir(workflowsDir, { recursive: true });
        await mkdir(instructionsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("Complete JavaScript/TypeScript Project", () => {
        it("should discover scripts, tools, and validate coverage for a typical project", async () => {
            // Arrange - Create a realistic project structure
            const packageJson = {
                name: "example-app",
                version: "1.0.0",
                scripts: {
                    // Mandatory feedback loops
                    test: "vitest run",
                    "test:watch": "vitest --watch",
                    "test:integration":
                        "vitest run --config vitest.integration.config.ts",
                    build: "rspack build --config rspack.config.ts",
                    lint: "biome check .",
                    "lint:fix": "biome check --write .",
                    format: "biome format --write .",
                    "format:check": "biome format .",
                    // Non-mandatory
                    dev: "tsx src/index.ts",
                    start: "node dist/index.js",
                    "audit:deps": "npm audit",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson, null, 2),
            );

            // Create GitHub Actions workflow with CI commands
            const ciWorkflow = `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run linting
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build project
        run: npm run build

      - name: Run integration tests
        run: npm run test:integration
`;

            await writeFile(join(workflowsDir, "ci.yml"), ciWorkflow);

            // Create partial instruction coverage (missing some mandatory items)
            const instructions = `# Development Instructions

## Testing

Run tests using:
\`\`\`bash
npm test
npm run test:watch
\`\`\`

## Building

Build the project:
\`\`\`bash
npm run build
\`\`\`

## Development

Start development server:
\`\`\`bash
npm run dev
\`\`\`
`;

            await writeFile(join(instructionsDir, "dev.md"), instructions);

            // Act - Discover feedback loops
            const scriptGateway = createScriptDiscoveryGateway();
            const toolGateway = createToolDiscoveryGateway();
            const environmentGateway = createEnvironmentGateway();

            const packageManagerGateway: PackageManagerGateway = {
                async detectPackageManagers(targetDir: string) {
                    const env =
                        await environmentGateway.detectEnvironment(targetDir);
                    return env.packageManagers;
                },
            };

            const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
                scriptGateway,
                toolGateway,
                packageManagerGateway,
            );

            const discoveryResult = await discoverUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("Discovery Result", discoveryResult.feedbackLoops);

            // Assert - Verify discovery
            expect(discoveryResult.feedbackLoops.scripts).toHaveLength(11);
            // Verify tools from workflows
            expect(discoveryResult.feedbackLoops.tools.length).toBeGreaterThan(
                0,
            );
            expect(discoveryResult.feedbackLoops.packageManager).toBe("npm");

            // Verify mandatory scripts are identified
            const mandatoryScripts =
                discoveryResult.feedbackLoops.scripts.filter(
                    (s) => s.isMandatory,
                );
            expect(mandatoryScripts.length).toBeGreaterThan(0);

            const mandatoryNames = mandatoryScripts.map((s) => s.name);
            expect(mandatoryNames).toContain("test");
            expect(mandatoryNames).toContain("build");
            expect(mandatoryNames).toContain("lint");
            expect(mandatoryNames).toContain("format");

            // Verify phase mapping
            const testPhaseScripts =
                discoveryResult.feedbackLoops.scripts.filter(
                    (s) => s.phase === "test",
                );
            expect(testPhaseScripts.length).toBe(3); // test, test:watch, test:integration

            // Act - Validate instruction coverage
            const instructionGateway = createInstructionAnalysisGateway();
            const validateUseCase = new ValidateInstructionCoverageUseCase(
                discoverUseCase,
                instructionGateway,
            );

            const coverageResult = await validateUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("Coverage Result", {
                hasFullCoverage: coverageResult.hasFullCoverage,
                summary: coverageResult.coverage.summary,
                missing: coverageResult.coverage.missingInInstructions.map(
                    (item) => ({
                        name: "name" in item ? item.name : item.fullCommand,
                        phase: item.phase,
                    }),
                ),
                suggestions: coverageResult.suggestions,
            });

            // Assert - Verify coverage validation
            expect(coverageResult.hasFullCoverage).toBe(false);
            expect(
                coverageResult.coverage.summary.totalMandatory,
            ).toBeGreaterThan(0);
            expect(
                coverageResult.coverage.summary.coveragePercentage,
            ).toBeGreaterThan(0);
            expect(
                coverageResult.coverage.summary.coveragePercentage,
            ).toBeLessThan(100);

            // Verify missing items are identified
            expect(
                coverageResult.coverage.missingInInstructions.length,
            ).toBeGreaterThan(0);

            // Verify suggestions are generated
            expect(coverageResult.suggestions.length).toBeGreaterThan(0);
            const suggestionsText = coverageResult.suggestions.join("\n");
            expect(suggestionsText).toContain("mandatory feedback loop");
            expect(suggestionsText).toContain("npm run"); // Uses detected package manager
            expect(suggestionsText).toContain(
                ".github/copilot-instructions.md",
            );

            // Verify documented items are correctly identified
            expect(
                coverageResult.coverage.documentedInInstructions.length,
            ).toBeGreaterThan(0);
            const documentedNames =
                coverageResult.coverage.documentedInInstructions.map((item) =>
                    "name" in item ? item.name : item.fullCommand,
                );
            expect(documentedNames).toContain("test");
            expect(documentedNames).toContain("build");
        });

        it("should report 100% coverage when all mandatory items are documented", async () => {
            // Arrange - Create project with complete documentation
            const packageJson = {
                name: "well-documented-app",
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                    lint: "biome check .",
                    format: "biome format .",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson, null, 2),
            );

            // Create comprehensive instructions
            const instructions = `# Development Instructions

## Feedback Loops

### Testing
\`\`\`bash
npm test
\`\`\`

### Building
\`\`\`bash
npm run build
\`\`\`

### Linting
\`\`\`bash
npm run lint
\`\`\`

### Formatting
\`\`\`bash
npm run format
\`\`\`
`;

            await writeFile(
                join(testDir, ".github", "copilot-instructions.md"),
                instructions,
            );

            // Act
            const scriptGateway = createScriptDiscoveryGateway();
            const toolGateway = createToolDiscoveryGateway();
            const environmentGateway = createEnvironmentGateway();

            const packageManagerGateway: PackageManagerGateway = {
                async detectPackageManagers(targetDir: string) {
                    const env =
                        await environmentGateway.detectEnvironment(targetDir);
                    return env.packageManagers;
                },
            };

            const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
                scriptGateway,
                toolGateway,
                packageManagerGateway,
            );

            const instructionGateway = createInstructionAnalysisGateway();
            const validateUseCase = new ValidateInstructionCoverageUseCase(
                discoverUseCase,
                instructionGateway,
            );

            const result = await validateUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("Full Coverage Result", {
                hasFullCoverage: result.hasFullCoverage,
                summary: result.coverage.summary,
                suggestions: result.suggestions,
            });

            // Assert
            expect(result.hasFullCoverage).toBe(true);
            expect(result.coverage.summary.coveragePercentage).toBe(100);
            expect(result.suggestions).toContain(
                "✅ All mandatory feedback loops are documented in instructions",
            );
            expect(result.coverage.missingInInstructions).toHaveLength(0);
        });
    });

    describe("Package Manager Detection", () => {
        it("should use detected package manager in suggestions (yarn)", async () => {
            // Arrange - Create project with yarn
            const packageJson = {
                name: "yarn-project",
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson, null, 2),
            );

            // Create yarn.lock to indicate yarn usage
            await writeFile(join(testDir, "yarn.lock"), "");

            // Act
            const scriptGateway = createScriptDiscoveryGateway();
            const toolGateway = createToolDiscoveryGateway();
            const environmentGateway = createEnvironmentGateway();

            const packageManagerGateway: PackageManagerGateway = {
                async detectPackageManagers(targetDir: string) {
                    const env =
                        await environmentGateway.detectEnvironment(targetDir);
                    return env.packageManagers;
                },
            };

            const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
                scriptGateway,
                toolGateway,
                packageManagerGateway,
            );

            const instructionGateway = createInstructionAnalysisGateway();
            const validateUseCase = new ValidateInstructionCoverageUseCase(
                discoverUseCase,
                instructionGateway,
            );

            const result = await validateUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("Yarn Suggestions", result.suggestions);

            // Assert - Suggestions should use "yarn run" not "npm run"
            const suggestionsText = result.suggestions.join("\n");
            expect(suggestionsText).toContain("yarn run");
            expect(suggestionsText).not.toContain("npm run");
        });

        it("should use detected package manager in suggestions (pnpm)", async () => {
            // Arrange - Create project with pnpm
            const packageJson = {
                name: "pnpm-project",
                scripts: {
                    test: "vitest run",
                    lint: "biome check",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson, null, 2),
            );

            // Create pnpm-lock.yaml to indicate pnpm usage
            await writeFile(join(testDir, "pnpm-lock.yaml"), "");

            // Act
            const scriptGateway = createScriptDiscoveryGateway();
            const toolGateway = createToolDiscoveryGateway();
            const environmentGateway = createEnvironmentGateway();

            const packageManagerGateway: PackageManagerGateway = {
                async detectPackageManagers(targetDir: string) {
                    const env =
                        await environmentGateway.detectEnvironment(targetDir);
                    return env.packageManagers;
                },
            };

            const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
                scriptGateway,
                toolGateway,
                packageManagerGateway,
            );

            const instructionGateway = createInstructionAnalysisGateway();
            const validateUseCase = new ValidateInstructionCoverageUseCase(
                discoverUseCase,
                instructionGateway,
            );

            const result = await validateUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("PNPM Suggestions", result.suggestions);

            // Assert - Suggestions should use "pnpm run" not "npm run"
            const suggestionsText = result.suggestions.join("\n");
            expect(suggestionsText).toContain("pnpm run");
            // Should suggest pnpm for test script
            expect(suggestionsText).toMatch(/"pnpm run test"/);
            // Should not suggest npm
            expect(suggestionsText).not.toMatch(/"npm run/);
        });
    });

    describe("Edge Cases", () => {
        it("should handle utility scripts without false positives", async () => {
            // Arrange - Create scripts with names that might cause false matches
            const packageJson = {
                name: "edge-case-project",
                scripts: {
                    test: "vitest run",
                    "test-utils": "node scripts/utils.js", // Should NOT match test phase
                    "build-tools": "node scripts/tools.js", // Should NOT match build phase
                    lint: "biome check",
                    "lint-staged": "lint-staged", // Should match lint phase (has colon variant)
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson, null, 2),
            );

            // Act
            const scriptGateway = createScriptDiscoveryGateway();
            const toolGateway = createToolDiscoveryGateway();
            const environmentGateway = createEnvironmentGateway();

            const packageManagerGateway: PackageManagerGateway = {
                async detectPackageManagers(targetDir: string) {
                    const env =
                        await environmentGateway.detectEnvironment(targetDir);
                    return env.packageManagers;
                },
            };

            const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
                scriptGateway,
                toolGateway,
                packageManagerGateway,
            );

            const result = await discoverUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("Edge Case Scripts", result.feedbackLoops.scripts);

            // Assert - Verify phase mapping
            const testUtilsScript = result.feedbackLoops.scripts.find(
                (s) => s.name === "test-utils",
            );
            expect(testUtilsScript?.phase).toBe("unknown"); // Should NOT be "test"

            const buildToolsScript = result.feedbackLoops.scripts.find(
                (s) => s.name === "build-tools",
            );
            expect(buildToolsScript?.phase).toBe("unknown"); // Should NOT be "build"

            const testScript = result.feedbackLoops.scripts.find(
                (s) => s.name === "test",
            );
            expect(testScript?.phase).toBe("test"); // Should be "test"

            const lintScript = result.feedbackLoops.scripts.find(
                (s) => s.name === "lint",
            );
            expect(lintScript?.phase).toBe("lint"); // Should be "lint"
        });

        it("should handle empty project gracefully", async () => {
            // Arrange - No package.json, no workflows, no instructions

            // Act
            const scriptGateway = createScriptDiscoveryGateway();
            const toolGateway = createToolDiscoveryGateway();
            const environmentGateway = createEnvironmentGateway();

            const packageManagerGateway: PackageManagerGateway = {
                async detectPackageManagers(targetDir: string) {
                    const env =
                        await environmentGateway.detectEnvironment(targetDir);
                    return env.packageManagers;
                },
            };

            const discoverUseCase = new DiscoverFeedbackLoopsUseCase(
                scriptGateway,
                toolGateway,
                packageManagerGateway,
            );

            const result = await discoverUseCase.execute({
                targetDir: testDir,
            });

            inspectOutput("Empty Project Result", result.feedbackLoops);

            // Assert
            expect(result.feedbackLoops.scripts).toHaveLength(0);
            expect(result.feedbackLoops.tools).toHaveLength(0);
            expect(result.feedbackLoops.packageManager).toBeUndefined();
        });
    });
});
