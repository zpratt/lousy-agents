import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliBin = resolve(__dirname, "..", "..", "dist", "index.js");
const fixturesDir = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "doctor",
    "tests",
    "fixtures",
);

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

async function runDoctor(args: string[], cwd: string): Promise<ExecResult> {
    try {
        const result = await execFileAsync(
            process.execPath,
            [cliBin, "doctor", ...args],
            {
                cwd,
                // biome-ignore lint/style/useNamingConvention: env var
                env: { ...process.env, NO_COLOR: "1" },
            },
        );
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (err: unknown) {
        const e = err as { code?: number; stdout?: string; stderr?: string };
        return {
            exitCode: e.code ?? 1,
            stdout: e.stdout ?? "",
            stderr: e.stderr ?? "",
        };
    }
}

describe("doctor command", () => {
    describe("when invoked with --help", () => {
        it("should display usage and exit 0", async () => {
            // Arrange
            const cwd = process.cwd();

            // Act
            const { exitCode, stdout } = await runDoctor(["--help"], cwd);

            // Assert
            expect(exitCode).toBe(0);
            expect(stdout).toMatch(/doctor/i);
            expect(stdout).toMatch(/--summary/);
            expect(stdout).toMatch(/--format/);
        });
    });

    describe("when run with --summary --format json on an empty repo", () => {
        it("should output a valid JSON summary and exit 0", async () => {
            // Arrange
            const cwd = fixture("empty-repo");

            // Act
            const { exitCode, stdout } = await runDoctor(
                ["--summary", "--format", "json"],
                cwd,
            );

            // Assert
            expect(exitCode).toBe(0);
            const report = JSON.parse(stdout) as Record<string, unknown>;
            expect(report).toHaveProperty("archetype", "none");
            expect(report).toHaveProperty("totalRecords", 0);
            expect(report).not.toHaveProperty("findings");
        });
    });

    describe("when run with --format json on an empty repo", () => {
        it("should output valid JSON with no findings and exit 0", async () => {
            // Arrange
            const cwd = fixture("empty-repo");

            // Act
            const { exitCode, stdout } = await runDoctor(
                ["--format", "json"],
                cwd,
            );

            // Assert
            expect(exitCode).toBe(0);
            const report = JSON.parse(stdout) as {
                archetype: string;
                findings: unknown[];
            };
            expect(report.archetype).toBe("none");
            expect(report.findings).toHaveLength(0);
        });
    });

    describe("when run with --format json on the integration-scenario fixture", () => {
        it("should produce a critical missing-copilot-instructions finding and exit 1", async () => {
            // Arrange
            const cwd = fixture("integration-scenario");

            // Act
            const { exitCode, stdout } = await runDoctor(
                ["--format", "json"],
                cwd,
            );

            // Assert
            expect(exitCode).toBe(1);
            const report = JSON.parse(stdout) as {
                findings: Array<{ criterionId: string; severity: string }>;
            };
            const critical = report.findings.find(
                (f) => f.criterionId === "missing-copilot-instructions",
            );
            expect(critical).toBeDefined();
            expect(critical?.severity).toBe("critical");
        });
    });

    describe("when run with --summary on the integration-scenario fixture", () => {
        it("should exit 0 because --summary skips evaluation", async () => {
            // Arrange
            const cwd = fixture("integration-scenario");

            // Act
            const { exitCode } = await runDoctor(["--summary"], cwd);

            // Assert
            expect(exitCode).toBe(0);
        });
    });
});
