import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LintDiagnostic } from "@lousy-agents/lint";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishRunLevelDiagnostics } from "./annotations.js";

const HOSTILE_MESSAGE = "[x](https://e) <img src=x> www.e.com #1";
const ESCAPED_HOSTILE_MESSAGE =
    "\\[x\\]\\(https\\://e\\) \\<img src=x\\> www\\.e.com \\#1";

const LIMIT_MESSAGE =
    "Discovery stopped after 10000 directories.\nSecond line.";

function limitDiagnostic(): LintDiagnostic {
    return {
        filePath: "/repo",
        line: 1,
        severity: "warning",
        message: LIMIT_MESSAGE,
        ruleId: "instruction/discovery-limit-reached",
        target: "instruction",
    };
}

describe("publishRunLevelDiagnostics", () => {
    let temp: string;

    beforeEach(async () => {
        temp = await mkdtemp(join(tmpdir(), "annotations-"));
    });

    afterEach(async () => {
        await rm(temp, { recursive: true, force: true });
    });

    describe("when an annotations file is configured", () => {
        it("should write one escaped workflow command per diagnostic and nothing to stderr", async () => {
            const file = join(temp, "lousy-agents-annotations");
            const stderr: string[] = [];

            await publishRunLevelDiagnostics([limitDiagnostic()], {
                annotationsFile: file,
                writeStderr: (text) => stderr.push(text),
            });

            expect(await readFile(file, "utf8")).toBe(
                "::warning title=instruction/discovery-limit-reached::Discovery stopped after 10000 directories.%0ASecond line.\n",
            );
            expect(stderr).toEqual([]);
        });

        it("should replace what an earlier run left in the file", async () => {
            const file = join(temp, "lousy-agents-annotations");
            await writeFile(file, "::warning::stale\n");

            await publishRunLevelDiagnostics([limitDiagnostic()], {
                annotationsFile: file,
                writeStderr: () => undefined,
            });

            expect(await readFile(file, "utf8")).not.toContain("stale");
        });

        it.skipIf(process.platform === "win32")(
            "should refuse to write through a symlink at the path",
            async () => {
                const target = join(temp, "elsewhere");
                await writeFile(target, "keep");
                const file = join(temp, "lousy-agents-annotations");
                await symlink(target, file);

                await expect(
                    publishRunLevelDiagnostics([limitDiagnostic()], {
                        annotationsFile: file,
                        writeStderr: () => undefined,
                    }),
                ).rejects.toThrow();
                expect(await readFile(target, "utf8")).toBe("keep");
            },
        );
    });

    describe("when a step summary is configured", () => {
        it("should append a readable section without removing what is already there", async () => {
            const summary = join(temp, "summary.md");
            await writeFile(summary, "# Earlier\n");

            await publishRunLevelDiagnostics([limitDiagnostic()], {
                stepSummaryFile: summary,
                writeStderr: () => undefined,
            });

            const content = await readFile(summary, "utf8");
            expect(content.startsWith("# Earlier\n")).toBe(true);
            expect(content).toContain("instruction/discovery-limit-reached");
            expect(content).toContain(
                "Discovery stopped after 10000 directories.",
            );
        });
    });

    describe("when a step summary is configured and a message holds markup", () => {
        it("should write the message into the summary file as literal text", async () => {
            const summary = join(temp, "hostile-summary.md");
            await writeFile(summary, "");

            await publishRunLevelDiagnostics(
                [{ ...limitDiagnostic(), message: HOSTILE_MESSAGE }],
                { stepSummaryFile: summary, writeStderr: () => undefined },
            );

            const content = await readFile(summary, "utf8");
            expect(content).toContain(`: ${ESCAPED_HOSTILE_MESSAGE}\n`);
            expect(content).not.toContain("](");
            expect(content).not.toMatch(/(?<!\\)<img/);
            expect(content).not.toMatch(/(?<!\\)www\./);
        });
    });

    describe("when no annotations file is configured", () => {
        it("should fall back to workflow commands on stderr, so a truncated scan is never silent", async () => {
            const stderr: string[] = [];

            await publishRunLevelDiagnostics([limitDiagnostic()], {
                writeStderr: (text) => stderr.push(text),
            });

            expect(stderr.join("")).toContain(
                "::warning title=instruction/discovery-limit-reached::",
            );
        });
    });

    describe("when there is nothing to publish", () => {
        it("should write no file, no summary and no stderr", async () => {
            const file = join(temp, "annotations");
            const summary = join(temp, "summary.md");
            const stderr: string[] = [];
            await mkdir(join(temp, "unused"));

            await publishRunLevelDiagnostics([], {
                annotationsFile: file,
                stepSummaryFile: summary,
                writeStderr: (text) => stderr.push(text),
            });

            await expect(readFile(file, "utf8")).rejects.toThrow();
            await expect(readFile(summary, "utf8")).rejects.toThrow();
            expect(stderr).toEqual([]);
        });
    });
});
