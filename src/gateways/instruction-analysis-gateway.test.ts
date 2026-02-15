import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
    DiscoveredScript,
    DiscoveredTool,
} from "../entities/feedback-loop.js";
import { FileSystemInstructionAnalysisGateway } from "./instruction-analysis-gateway.js";

const chance = new Chance();

describe("FileSystemInstructionAnalysisGateway", () => {
    let gateway: FileSystemInstructionAnalysisGateway;
    let testDir: string;
    let instructionsDir: string;

    beforeEach(async () => {
        gateway = new FileSystemInstructionAnalysisGateway();
        testDir = join("/tmp", `test-instruction-analysis-${chance.guid()}`);
        instructionsDir = join(testDir, ".github", "instructions");
        await mkdir(instructionsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when no instruction files exist", () => {
        it("should return zero coverage for mandatory items", async () => {
            await rm(instructionsDir, { recursive: true, force: true });

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, scripts, []);

            expect(result.summary.totalMandatory).toBe(1);
            expect(result.summary.totalDocumented).toBe(0);
            expect(result.summary.coveragePercentage).toBe(0);
            expect(result.missingInInstructions).toHaveLength(1);
        });
    });

    describe("when instructions document all mandatory items", () => {
        it("should return 100% coverage", async () => {
            const instructionContent = `
# Testing Instructions

Run tests using:
\`\`\`bash
npm test
\`\`\`

Build the project:
\`\`\`bash
npm run build
\`\`\`
`;

            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructionContent,
            );

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
                {
                    name: "build",
                    command: "rspack build",
                    phase: "build",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, scripts, []);

            expect(result.summary.totalMandatory).toBe(2);
            expect(result.summary.totalDocumented).toBe(2);
            expect(result.summary.coveragePercentage).toBe(100);
            expect(result.missingInInstructions).toHaveLength(0);
            expect(result.documentedInInstructions).toHaveLength(2);
        });
    });

    describe("when instructions document some mandatory items", () => {
        it("should return partial coverage", async () => {
            const instructionContent = `
# Testing Instructions

Run tests using:
\`\`\`bash
npm test
\`\`\`
`;

            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructionContent,
            );

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
                {
                    name: "build",
                    command: "rspack build",
                    phase: "build",
                    isMandatory: true,
                },
                {
                    name: "lint",
                    command: "biome check",
                    phase: "lint",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, scripts, []);

            expect(result.summary.totalMandatory).toBe(3);
            expect(result.summary.totalDocumented).toBe(1);
            expect(result.summary.coveragePercentage).toBe(33.33);
            expect(result.missingInInstructions).toHaveLength(2);
            expect(result.missingInInstructions.map((s) => s.name)).toEqual([
                "build",
                "lint",
            ]);
        });
    });

    describe("when checking .github/copilot-instructions.md", () => {
        it("should find references in copilot instructions file", async () => {
            const copilotInstructions = `
# Commands

\`\`\`bash
mise run test            # Run tests (vitest)
npm run build            # Production build
mise run lint            # Lint check
\`\`\`
`;

            await writeFile(
                join(testDir, ".github", "copilot-instructions.md"),
                copilotInstructions,
            );

            const tools: DiscoveredTool[] = [
                {
                    name: "mise run test",
                    fullCommand: "mise run test",
                    phase: "test",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, [], tools);

            expect(result.summary.totalDocumented).toBe(1);
            expect(result.documentedInInstructions).toHaveLength(1);
        });
    });

    describe("when finding references", () => {
        it("should capture line numbers and context", async () => {
            const instructionContent = `Line 1: Introduction
Line 2: Run tests with npm test
Line 3: More details`;

            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructionContent,
            );

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, scripts, []);

            expect(result.references).toHaveLength(1);
            expect(result.references[0]).toMatchObject({
                target: "test",
                line: 2,
                file: expect.stringContaining("test.instructions.md"),
            });
            expect(result.references[0].context).toContain("npm test");
        });

        it("should be case-insensitive when finding references", async () => {
            const instructionContent = `
Run tests using: NPM TEST
`;

            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructionContent,
            );

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, scripts, []);

            expect(result.summary.totalDocumented).toBe(1);
        });
    });

    describe("when analyzing mixed scripts and tools", () => {
        it("should check coverage for both scripts and tools", async () => {
            const instructionContent = `
# Commands

\`\`\`bash
npm test
mise run lint
\`\`\`
`;

            await writeFile(
                join(instructionsDir, "commands.md"),
                instructionContent,
            );

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
                {
                    name: "build",
                    command: "rspack build",
                    phase: "build",
                    isMandatory: true,
                },
            ];

            const tools: DiscoveredTool[] = [
                {
                    name: "mise run lint",
                    fullCommand: "mise run lint",
                    phase: "lint",
                    isMandatory: true,
                },
            ];

            const result = await gateway.analyzeCoverage(
                testDir,
                scripts,
                tools,
            );

            expect(result.summary.totalMandatory).toBe(3);
            expect(result.summary.totalDocumented).toBe(2);
            expect(result.missingInInstructions.map((i) => i.name)).toEqual([
                "build",
            ]);
        });
    });

    describe("when non-mandatory items are not documented", () => {
        it("should not affect coverage percentage", async () => {
            const instructionContent = `
# Commands

\`\`\`bash
npm test
\`\`\`
`;

            await writeFile(
                join(instructionsDir, "test.instructions.md"),
                instructionContent,
            );

            const scripts: DiscoveredScript[] = [
                {
                    name: "test",
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
                {
                    name: "dev",
                    command: "tsx src/index.ts",
                    phase: "dev",
                    isMandatory: false,
                },
            ];

            const result = await gateway.analyzeCoverage(testDir, scripts, []);

            // dev is not mandatory, so it shouldn't affect coverage
            expect(result.summary.totalMandatory).toBe(1);
            expect(result.summary.totalDocumented).toBe(1);
            expect(result.summary.coveragePercentage).toBe(100);
        });
    });
});
