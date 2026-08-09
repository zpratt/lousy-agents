import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    buildEffectiveDocument,
    DEFAULT_MAX_EMITTED_BYTES,
    DEFAULT_MAX_IMPORT_DEPTH,
    DEFAULT_MAX_UNIQUE_FILES,
} from "./instruction-import-expand.js";

const chance = new Chance();

describe("buildEffectiveDocument", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = join(
            tmpdir(),
            `instruction-import-expand-${chance.hash({ length: 8 })}`,
        );
        await mkdir(repoRoot, { recursive: true });
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    describe("given a single valid relative import", () => {
        it("should splice the imported body at the token position", async () => {
            const rootBody = "before\n@./AGENTS.md\nafter\n";
            const importedBody = "# Agents\nDo the thing.\n";
            await writeFile(join(repoRoot, "CLAUDE.md"), rootBody);
            await writeFile(join(repoRoot, "AGENTS.md"), importedBody);

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe(
                "before\n# Agents\nDo the thing.\n\nafter\n",
            );
            expect(result.root).toBe("CLAUDE.md");
            expect(result.edges).toHaveLength(1);
            expect(result.edges[0]?.status).toBe("resolved");
            expect(result.edges[0]?.target).toBe("AGENTS.md");
            expect(result.expansionDiagnostics).toHaveLength(0);
            expect(result.orderedSegments.length).toBeGreaterThanOrEqual(2);
            expect(
                result.orderedSegments.some(
                    (segment) => segment.sourcePath === "AGENTS.md",
                ),
            ).toBe(true);
        });
    });

    describe("given nested imports within the depth limit", () => {
        it("should expand four hops and reject a fifth hop", async () => {
            await writeFile(join(repoRoot, "f0.md"), "@./f1.md\n");
            await writeFile(join(repoRoot, "f1.md"), "@./f2.md\n");
            await writeFile(join(repoRoot, "f2.md"), "@./f3.md\n");
            await writeFile(join(repoRoot, "f3.md"), "@./f4.md\n");
            await writeFile(join(repoRoot, "f4.md"), "leaf-ok\n@./f5.md\n");
            await writeFile(join(repoRoot, "f5.md"), "too-deep\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "f0.md",
                limits: { maxDepth: DEFAULT_MAX_IMPORT_DEPTH },
            });

            expect(result.content).toContain("leaf-ok\n");
            expect(result.content).toContain("@./f5.md");
            expect(result.content).not.toContain("too-deep");
            expect(
                result.edges.some((edge) => edge.status === "depth-exceeded"),
            ).toBe(true);
            expect(
                result.expansionDiagnostics.some(
                    (diagnostic) =>
                        diagnostic.ruleId ===
                        "instruction/import-depth-exceeded",
                ),
            ).toBe(true);
        });
    });

    describe("given a direct import cycle", () => {
        it("should leave the cyclic edge unexpanded and emit a cycle diagnostic", async () => {
            await writeFile(join(repoRoot, "a.md"), "A\n@./b.md\n");
            await writeFile(join(repoRoot, "b.md"), "B\n@./a.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "a.md",
            });

            expect(result.content).toContain("A\n");
            expect(result.content).toContain("B\n");
            expect(result.content).toContain("@./a.md");
            expect(result.edges.some((edge) => edge.status === "cycle")).toBe(
                true,
            );
            expect(
                result.expansionDiagnostics.some(
                    (diagnostic) =>
                        diagnostic.ruleId === "instruction/import-cycle",
                ),
            ).toBe(true);
        });
    });

    describe("given an indirect import cycle", () => {
        it("should detect the cycle through an intermediate file", async () => {
            await writeFile(join(repoRoot, "a.md"), "@./b.md\n");
            await writeFile(join(repoRoot, "b.md"), "@./c.md\n");
            await writeFile(join(repoRoot, "c.md"), "@./a.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "a.md",
            });

            expect(result.edges.some((edge) => edge.status === "cycle")).toBe(
                true,
            );
            expect(
                result.expansionDiagnostics.some(
                    (diagnostic) =>
                        diagnostic.ruleId === "instruction/import-cycle",
                ),
            ).toBe(true);
        });
    });

    describe("given a missing import target", () => {
        it("should keep the token and emit an unresolved diagnostic", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./missing.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("@./missing.md\n");
            expect(result.edges[0]?.status).toBe("unresolved");
            expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                "instruction/import-unresolved",
            );
        });
    });

    describe("given a symlink import target", () => {
        it.skipIf(process.platform === "win32")(
            "should reject the symlink without reading through it",
            async () => {
                await writeFile(join(repoRoot, "real.md"), "secret\n");
                await symlink(
                    join(repoRoot, "real.md"),
                    join(repoRoot, "link.md"),
                );
                await writeFile(join(repoRoot, "CLAUDE.md"), "@./link.md\n");

                const result = await buildEffectiveDocument({
                    repoRoot,
                    rootRelativePath: "CLAUDE.md",
                });

                expect(result.content).toBe("@./link.md\n");
                expect(result.content).not.toContain("secret");
                expect(result.edges[0]?.status).toBe("symlink");
                expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                    "instruction/import-symlink",
                );
            },
        );
    });

    describe("given a path that escapes the repository root", () => {
        it("should reject the escape and leave the token unexpanded", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@../outside.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("@../outside.md\n");
            expect(result.edges[0]?.status).toBe("escape");
            expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                "instruction/import-escape",
            );
        });
    });

    describe("given @ tokens inside code spans or fenced code", () => {
        it("should not treat fenced or inline code @paths as imports", async () => {
            const rootBody = [
                "Intro",
                "",
                "```",
                "@./secret.md",
                "```",
                "",
                "Use `@./inline.md` in docs.",
                "",
                "@./real.md",
                "",
            ].join("\n");
            await writeFile(join(repoRoot, "CLAUDE.md"), rootBody);
            await writeFile(join(repoRoot, "secret.md"), "NOPE\n");
            await writeFile(join(repoRoot, "inline.md"), "NOPE\n");
            await writeFile(join(repoRoot, "real.md"), "YES\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toContain("@./secret.md");
            expect(result.content).toContain("`@./inline.md`");
            expect(result.content).toContain("YES\n");
            expect(result.content).not.toContain("NOPE");
            expect(result.edges).toHaveLength(1);
            expect(result.edges[0]?.status).toBe("resolved");
            expect(result.edges[0]?.target).toBe("real.md");
        });
    });

    describe("given the same file imported at two positions", () => {
        it("should expand both occurrences and count emitted bytes twice", async () => {
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "one\n@./shared.md\ntwo\n@./shared.md\n",
            );
            await writeFile(join(repoRoot, "shared.md"), "SHARED\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("one\nSHARED\n\ntwo\nSHARED\n\n");
            expect(
                result.edges.filter((edge) => edge.status === "resolved"),
            ).toHaveLength(2);
            const sharedSegments = result.orderedSegments.filter(
                (segment) => segment.sourcePath === "shared.md",
            );
            expect(sharedSegments.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("given absolute and home-prefixed import targets", () => {
        it("should reject absolute paths", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@/etc/passwd\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("@/etc/passwd\n");
            expect(result.edges[0]?.status).toBe("absolute");
            expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                "instruction/import-escape",
            );
        });

        it("should reject home-prefixed paths", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@~/secrets.md\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("@~/secrets.md\n");
            expect(result.edges[0]?.status).toBe("home");
            expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                "instruction/import-escape",
            );
        });
    });

    describe("given one bad import and one good import in the same file", () => {
        it("should expand the valid edge and leave the failed edge unexpanded", async () => {
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "start\n@./missing.md\nmiddle\n@./good.md\nend\n",
            );
            await writeFile(join(repoRoot, "good.md"), "GOOD\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe(
                "start\n@./missing.md\nmiddle\nGOOD\n\nend\n",
            );
            expect(result.edges).toHaveLength(2);
            expect(result.edges[0]?.status).toBe("unresolved");
            expect(result.edges[1]?.status).toBe("resolved");
            expect(result.expansionDiagnostics).toHaveLength(1);
            expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                "instruction/import-unresolved",
            );
        });
    });

    describe("given an import resolved from a nested importer directory", () => {
        it("should resolve the target relative to the importer directory", async () => {
            await mkdir(join(repoRoot, "docs"), { recursive: true });
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./docs/index.md\n");
            await writeFile(join(repoRoot, "docs/index.md"), "@./note.md\n");
            await writeFile(join(repoRoot, "docs/note.md"), "NOTE\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("NOTE\n\n\n");
            expect(
                result.edges.every((edge) => edge.status === "resolved"),
            ).toBe(true);
        });
    });

    describe("given exported default limits", () => {
        it("should expose conservative named defaults", () => {
            expect(DEFAULT_MAX_IMPORT_DEPTH).toBe(4);
            expect(DEFAULT_MAX_UNIQUE_FILES).toBe(64);
            expect(DEFAULT_MAX_EMITTED_BYTES).toBe(512_000);
        });
    });

    describe("given a Markdown link that is not a hard import", () => {
        it("should not expand ordinary markdown links", async () => {
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "See [agents](./AGENTS.md)\n",
            );
            await writeFile(join(repoRoot, "AGENTS.md"), "SHOULD-NOT-APPEAR\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
            });

            expect(result.content).toBe("See [agents](./AGENTS.md)\n");
            expect(result.edges).toHaveLength(0);
            expect(result.content).not.toContain("SHOULD-NOT-APPEAR");
        });
    });

    describe("given expansion graph and emit limits", () => {
        it("should reject the edge at the exact maxEdges limit", async () => {
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./a.md\n@./b.md\n");
            await writeFile(join(repoRoot, "a.md"), "A\n");
            await writeFile(join(repoRoot, "b.md"), "B\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEdges: 1 },
            });

            expect(
                result.edges.filter((edge) => edge.status === "resolved"),
            ).toHaveLength(1);
            expect(
                result.edges.some((edge) => edge.status === "size-exceeded"),
            ).toBe(true);
            expect(result.content).toContain("A\n");
            expect(result.content).toContain("@./b.md");
            expect(result.content).not.toContain("B\n");
            expect(
                result.expansionDiagnostics.some(
                    (diagnostic) =>
                        diagnostic.ruleId ===
                        "instruction/import-size-exceeded",
                ),
            ).toBe(true);
        });

        it("should reject a new unique file at the exact maxUniqueFiles limit", async () => {
            // Root counts as the first unique file; maxUniqueFiles=1 blocks any import target.
            await writeFile(join(repoRoot, "CLAUDE.md"), "@./extra.md\n");
            await writeFile(join(repoRoot, "extra.md"), "EXTRA\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxUniqueFiles: 1 },
            });

            expect(result.edges[0]?.status).toBe("size-exceeded");
            expect(result.content).toBe("@./extra.md\n");
            expect(result.content).not.toContain("EXTRA");
            expect(result.expansionDiagnostics[0]?.ruleId).toBe(
                "instruction/import-size-exceeded",
            );
        });

        it("should stop expansion when a later literal would exceed the emit budget", async () => {
            // Root emits "X\n" (2) then expands body (4) then trailing "TAIL\n" (5).
            // Budget 6 allows "X\n" + "ABCD" exactly; trailing literal is clipped.
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "X\n@./body.md\nTAIL\n",
            );
            await writeFile(join(repoRoot, "body.md"), "ABCD");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEmittedBytes: 6 },
            });

            expect(result.content).toBe("X\nABCD");
            expect(result.content).not.toContain("TAIL");
            expect(result.edges[0]?.status).toBe("resolved");
        });

        it("should leave a token unexpanded when the emit budget is already exhausted", async () => {
            // Prefix alone consumes the entire budget before the import token.
            // Correct full-fit (`text.length <= room`) still enters expandToken,
            // which records the resolved target path on the failed edge after read.
            // Weakening full-fit to `<` aborts before expandToken and omits target.
            await writeFile(
                join(repoRoot, "CLAUDE.md"),
                "PREFIX\n@./body.md\n",
            );
            await writeFile(join(repoRoot, "body.md"), "BODY\n");

            const result = await buildEffectiveDocument({
                repoRoot,
                rootRelativePath: "CLAUDE.md",
                limits: { maxEmittedBytes: "PREFIX\n".length },
            });

            expect(result.content.startsWith("PREFIX\n")).toBe(true);
            expect(result.content).not.toContain("BODY");
            const exceeded = result.edges.find(
                (edge) => edge.status === "size-exceeded",
            );
            expect(exceeded).toBeDefined();
            expect(exceeded?.target).toBe("body.md");
            expect(exceeded?.rawTarget).toBe("./body.md");
        });
    });
});
