import {
    link,
    mkdir,
    mkdtemp,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    buildEffectiveDocument,
    DEFAULT_MAX_FILE_BYTES,
} from "@lousy-agents/core/lib/instruction-import-expand.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "../entities/edge-types.js";
import { hasBlockingFindings } from "../formatters/human-renderer.js";
import { classifyArchetype } from "../use-cases/classify-archetype.js";
import { CRITERIA } from "../use-cases/criteria.js";
import { evaluate } from "../use-cases/evaluate-engine.js";
import { scanRepository } from "./scanner.js";

const CLAUDE_MD = "CLAUDE.md";

describe("doctor edges for @ import targets that lint refuses", () => {
    let workDir: string;
    let repoRoot: string;
    let outsideRoot: string;

    beforeEach(async () => {
        workDir = await realpath(
            await mkdtemp(join(tmpdir(), "doctor-import-targets-")),
        );
        repoRoot = join(workDir, "repo");
        outsideRoot = join(workDir, "outside");
        await mkdir(repoRoot);
        await mkdir(outsideRoot);
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function importEdge(importLine: string): Promise<Edge | undefined> {
        await writeFile(join(repoRoot, CLAUDE_MD), `${importLine}\n`);
        const records = await scanRepository(repoRoot);
        return records.find((r) => r.path === CLAUDE_MD)?.edges[0];
    }

    describe("when the target is a symlink to a file outside the repository", () => {
        it("should be a malformed edge with the symlink-outside reason, not a missing target", async () => {
            await writeFile(join(outsideRoot, "secret.md"), "secret\n");
            await symlink(
                join(outsideRoot, "secret.md"),
                join(repoRoot, "link.md"),
            );

            const edge = await importEdge("@./link.md");

            expect(edge).toMatchObject({
                type: "hard-import",
                malformed: true,
                reason: "symlink-outside",
                target: "link.md",
            });
        });
    });

    describe("when the target has more than one hard link", () => {
        it("should be a malformed edge with the hard-link reason", async () => {
            await writeFile(join(repoRoot, "one.md"), "one\n");
            await link(join(repoRoot, "one.md"), join(repoRoot, "two.md"));

            const edge = await importEdge("@./one.md");

            expect(edge).toMatchObject({
                malformed: true,
                reason: "hard-link",
            });
        });

        it("should refuse a file the scan itself read, since being scanned does not make it importable", async () => {
            await writeFile(join(repoRoot, "AGENTS.md"), "agents\n");
            await link(join(repoRoot, "AGENTS.md"), join(repoRoot, "copy.md"));

            const edge = await importEdge("@./AGENTS.md");

            expect(edge).toMatchObject({
                malformed: true,
                reason: "hard-link",
            });
        });
    });

    describe("when the target is a directory", () => {
        it("should be a malformed edge with the not-regular reason", async () => {
            await mkdir(join(repoRoot, "docs"));
            await writeFile(join(repoRoot, "docs", "guide.md"), "guide\n");

            const edge = await importEdge("@./docs");

            expect(edge).toMatchObject({
                malformed: true,
                reason: "not-regular",
            });
        });

        it("should refuse a token that is not clearly a path when a directory of that name exists", async () => {
            await mkdir(join(repoRoot, "types", "node"), { recursive: true });

            const edge = await importEdge("@types/node");

            expect(edge).toMatchObject({
                malformed: true,
                reason: "not-regular",
            });
        });

        it("should still ignore a token that is not clearly a path and names nothing", async () => {
            const edge = await importEdge("@types/missing");

            expect(edge).toBeUndefined();
        });
    });

    describe("when the target is larger than the file size cap", () => {
        it("should be a malformed edge with the too-large reason", async () => {
            await writeFile(
                join(repoRoot, "big.md"),
                "a".repeat(DEFAULT_MAX_FILE_BYTES + 1),
            );

            const edge = await importEdge("@./big.md");

            expect(edge).toMatchObject({
                malformed: true,
                reason: "too-large",
            });
        });

        it("should accept a target exactly at the cap", async () => {
            await writeFile(
                join(repoRoot, "edge.md"),
                "a".repeat(DEFAULT_MAX_FILE_BYTES),
            );

            const edge = await importEdge("@./edge.md");

            expect(edge).toMatchObject({ malformed: false });
        });
    });

    describe("when the target is a symlink that stays inside the repository", () => {
        it("should be a well-formed edge", async () => {
            await mkdir(join(repoRoot, "docs"));
            await writeFile(join(repoRoot, "docs", "real.md"), "real\n");
            await symlink("docs/real.md", join(repoRoot, "alias.md"));

            const edge = await importEdge("@./alias.md");

            expect(edge).toMatchObject({ malformed: false });
        });
    });

    describe("when the target does not exist in the repository", () => {
        it("should still be a missing target", async () => {
            const edge = await importEdge("@./gone.md");

            expect(edge).toMatchObject({
                malformed: true,
                reason: "missing-target",
            });
        });
    });

    describe("agreement with lint's import expansion on the same target", () => {
        it.each([
            ["a symlink outside the repository", "symlink", "symlink-outside"],
            ["a hard-linked file", "hard-linked", "hard-link"],
            ["a directory", "not-regular", "not-regular"],
            ["a file over the cap", "size-exceeded", "too-large"],
        ] as const)(
            "should map %s from lint's %s to doctor's %s",
            async (kind, lintStatus, doctorReason) => {
                if (kind === "a symlink outside the repository") {
                    await writeFile(join(outsideRoot, "t.md"), "t\n");
                    await symlink(
                        join(outsideRoot, "t.md"),
                        join(repoRoot, "t.md"),
                    );
                } else if (kind === "a hard-linked file") {
                    await writeFile(join(repoRoot, "t.md"), "t\n");
                    await link(join(repoRoot, "t.md"), join(repoRoot, "u.md"));
                } else if (kind === "a directory") {
                    await mkdir(join(repoRoot, "t.md"));
                } else {
                    await writeFile(
                        join(repoRoot, "t.md"),
                        "a".repeat(DEFAULT_MAX_FILE_BYTES + 1),
                    );
                }
                await writeFile(join(repoRoot, CLAUDE_MD), "@./t.md\n");

                const lint = await buildEffectiveDocument({
                    repoRoot,
                    rootRelativePath: CLAUDE_MD,
                });
                const doctor = (await scanRepository(repoRoot)).find(
                    (r) => r.path === CLAUDE_MD,
                )?.edges[0];

                expect(lint.edges[0]?.status).toBe(lintStatus);
                expect(doctor?.reason).toBe(doctorReason);
            },
        );
    });

    describe("findings", () => {
        async function findingsFor(importLine: string) {
            await writeFile(join(repoRoot, CLAUDE_MD), `${importLine}\n`);
            const records = await scanRepository(repoRoot);
            return evaluate(CRITERIA, {
                records,
                classification: classifyArchetype(records),
                intent: null,
            });
        }

        it("should report an out-of-repository symlink as an advisory external import, and never block", async () => {
            await writeFile(join(outsideRoot, "secret.md"), "secret\n");
            await symlink(
                join(outsideRoot, "secret.md"),
                join(repoRoot, "link.md"),
            );

            const findings = await findingsFor("@./link.md");

            expect(findings.map((f) => f.criterionId)).toContain(
                "external-claude-import",
            );
            expect(findings.map((f) => f.criterionId)).not.toContain(
                "malformed-claude-import",
            );
            expect(hasBlockingFindings(findings)).toBe(false);
        });

        it.each([
            ["a hard-linked file", "hard"],
            ["a directory", "dir"],
            ["a file over the cap", "big"],
        ])(
            "should report %s as an advisory unread import, and never block",
            async (_name, kind) => {
                if (kind === "hard") {
                    await writeFile(join(repoRoot, "t.md"), "t\n");
                    await link(join(repoRoot, "t.md"), join(repoRoot, "u.md"));
                } else if (kind === "dir") {
                    await mkdir(join(repoRoot, "t.md"));
                } else {
                    await writeFile(
                        join(repoRoot, "t.md"),
                        "a".repeat(DEFAULT_MAX_FILE_BYTES + 1),
                    );
                }

                const findings = await findingsFor("@./t.md");

                const unread = findings.find(
                    (f) => f.criterionId === "unread-claude-import",
                );
                expect(unread).toMatchObject({
                    classification: "advisory",
                    severity: "medium",
                });
                expect(findings.map((f) => f.criterionId)).not.toContain(
                    "malformed-claude-import",
                );
                expect(hasBlockingFindings(findings)).toBe(false);
            },
        );

        it("should still block on a missing in-repository target", async () => {
            const findings = await findingsFor("@./gone.md");

            expect(hasBlockingFindings(findings)).toBe(true);
            expect(findings.map((f) => f.criterionId)).toContain(
                "malformed-claude-import",
            );
        });
    });
});
