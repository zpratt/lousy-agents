import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readIntentArtifact } from "./intent-artifact.js";

const chance = new Chance();

const INTENT_DIR = ".agentic-doctor";
const INTENT_REL_PATH = `${INTENT_DIR}/intent.json`;

function buildValidIntent() {
    return {
        targetHarnesses: ["claude", "copilot"],
        desiredCapabilities: [chance.word(), chance.word()],
        confirmedAnswers: { rationale: chance.sentence() },
        intentSource: "pre-committed",
    };
}

describe("readIntentArtifact", () => {
    let repoRoot: string;
    let checkedPath: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "intent-artifact-"));
        checkedPath = join(repoRoot, INTENT_REL_PATH);
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    async function writeIntent(content: string): Promise<void> {
        await mkdir(join(repoRoot, INTENT_DIR), { recursive: true });
        await writeFile(checkedPath, content, "utf-8");
    }

    describe("when the intent file is valid", () => {
        it("should load the artifact and report a loaded status at the checked path", async () => {
            // Arrange
            const intent = buildValidIntent();
            await writeIntent(JSON.stringify(intent));

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.found).toBe(true);
            expect(result.report).toEqual({
                status: "loaded",
                checkedPath,
            });
            if (result.found) {
                expect(result.artifact.desiredCapabilities).toEqual(
                    intent.desiredCapabilities,
                );
            }
        });
    });

    describe("when no intent file exists", () => {
        it("should report an absent status with the checked path and a reason", async () => {
            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.found).toBe(false);
            expect(result.report.status).toBe("absent");
            expect(result.report.checkedPath).toBe(checkedPath);
            expect(result.report.reason).toEqual(expect.any(String));
        });
    });

    describe("when the intent file is not valid JSON", () => {
        it("should report invalid-json without echoing the file contents", async () => {
            // Arrange
            const secretContent = `{ ${chance.guid()}`;
            await writeIntent(secretContent);

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.found).toBe(false);
            expect(result.report.status).toBe("invalid-json");
            expect(result.report.checkedPath).toBe(checkedPath);
            expect(result.report.reason).toEqual(expect.any(String));
            expect(JSON.stringify(result.report)).not.toContain(
                secretContent.slice(2),
            );
        });
    });

    describe("when the intent file does not match the schema", () => {
        it("should report invalid-schema with a field path for each missing field", async () => {
            // Arrange
            await writeIntent("{}");

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.found).toBe(false);
            expect(result.report.status).toBe("invalid-schema");
            expect(result.report.reason).toEqual(expect.any(String));
            const issuePaths = result.report.issues?.map((i) => i.path);
            expect(issuePaths).toEqual(
                expect.arrayContaining([
                    "targetHarnesses",
                    "desiredCapabilities",
                    "confirmedAnswers",
                    "intentSource",
                ]),
            );
        });

        it("should identify a nested field with the wrong type without echoing its value", async () => {
            // Arrange
            const invalidHarness = `harness-${chance.guid()}`;
            const intent = {
                ...buildValidIntent(),
                targetHarnesses: ["claude", invalidHarness],
            };
            await writeIntent(JSON.stringify(intent));

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.report.status).toBe("invalid-schema");
            expect(result.report.issues).toEqual([
                { path: "targetHarnesses.1", message: expect.any(String) },
            ]);
            expect(JSON.stringify(result.report)).not.toContain(invalidHarness);
        });
    });

    describe("when the intent file is a symbolic link inside the repository", () => {
        it("should report symlink-rejected instead of following the link", async () => {
            // Arrange
            const realFile = join(repoRoot, "real-intent.json");
            await writeFile(realFile, JSON.stringify(buildValidIntent()));
            await mkdir(join(repoRoot, INTENT_DIR), { recursive: true });
            await symlink(realFile, checkedPath);

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.found).toBe(false);
            expect(result.report.status).toBe("symlink-rejected");
            expect(result.report.checkedPath).toBe(checkedPath);
            expect(result.report.reason).toEqual(expect.any(String));
        });
    });

    describe("when the intent directory is a symbolic link", () => {
        it("should report symlink-rejected", async () => {
            // Arrange
            const realDir = join(repoRoot, "real-dir");
            await mkdir(realDir);
            await writeFile(
                join(realDir, "intent.json"),
                JSON.stringify(buildValidIntent()),
            );
            await symlink(realDir, join(repoRoot, INTENT_DIR));

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.report.status).toBe("symlink-rejected");
        });
    });

    describe("when the checked path is a directory", () => {
        it("should report read-failed with a cause", async () => {
            // Arrange
            await mkdir(checkedPath, { recursive: true });

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.found).toBe(false);
            expect(result.report.status).toBe("read-failed");
            expect(result.report.reason).toMatch(/regular file/i);
        });
    });

    describe("when the intent file exceeds the size limit", () => {
        it("should report read-failed with a size-limit cause", async () => {
            // Arrange
            const oversizedContent = " ".repeat(70_000);
            await writeIntent(oversizedContent);

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.report.status).toBe("read-failed");
            expect(result.report.reason).toMatch(/size limit/i);
        });
    });

    describe("when the intent directory name is taken by a regular file", () => {
        it("should report absent because no intent file can exist there", async () => {
            // Arrange
            await writeFile(join(repoRoot, INTENT_DIR), chance.sentence());

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.report.status).toBe("absent");
            expect(result.report.checkedPath).toBe(checkedPath);
        });
    });

    describe("when the intent file is a hard link", () => {
        it("should report read-failed with a hard-link cause", async () => {
            // Arrange
            const original = join(repoRoot, "original-intent.json");
            await writeFile(original, JSON.stringify(buildValidIntent()));
            await mkdir(join(repoRoot, INTENT_DIR));
            await link(original, checkedPath);

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.report.status).toBe("read-failed");
            expect(result.report.reason).toMatch(/hard link/i);
        });
    });

    describe("when the schema reports more issues than are listed", () => {
        it("should report how many issues were omitted", async () => {
            // Arrange
            const unknownHarnessCount = 30;
            const intent = {
                ...buildValidIntent(),
                targetHarnesses: Array.from(
                    { length: unknownHarnessCount },
                    (_, index) => `unknown-${index}`,
                ),
            };
            await writeIntent(JSON.stringify(intent));

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            const listed = result.report.issues?.length ?? 0;
            expect(listed).toBeGreaterThan(0);
            expect(listed + (result.report.omittedIssueCount ?? 0)).toBe(
                unknownHarnessCount,
            );
            expect(result.report.omittedIssueCount).toBeGreaterThan(0);
        });

        it("should omit the count when every issue is listed", async () => {
            // Arrange
            await writeIntent("{}");

            // Act
            const result = await readIntentArtifact(repoRoot);

            // Assert
            expect(result.report).not.toHaveProperty("omittedIssueCount");
        });
    });
});
