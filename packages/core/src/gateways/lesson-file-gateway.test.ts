import { randomBytes } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LessonFileGateway } from "./lesson-file-gateway.js";

function makeTmpDir(): string {
    return join(tmpdir(), `lesson-gw-test-${randomBytes(6).toString("hex")}`);
}

async function createLessonsDir(root: string): Promise<string> {
    const dir = join(root, ".lousy-agents", "lessons");
    await mkdir(dir, { recursive: true });
    return dir;
}

function validFrontmatter(overrides: Record<string, unknown> = {}): string {
    const slug = overrides.slug ?? "valid-slug";
    const type = overrides.type ?? "invariant";
    const title = overrides.title ?? "A valid lesson";
    const created = overrides.created ?? "2026-05-01";
    const revised = overrides.revised ?? "2026-05-01";
    return `---\nslug: ${slug}\ntitle: ${title}\ntype: ${type}\ncreated: ${created}\nrevised: ${revised}\nprovenance: []\ntriggers:\n  paths: []\n  tags: []\n  patterns: []\n---\n\nBody text.`;
}

describe("LessonFileGateway", () => {
    let root: string;
    let gateway: LessonFileGateway;

    beforeEach(async () => {
        root = makeTmpDir();
        await mkdir(root, { recursive: true });
        gateway = new LessonFileGateway();
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    describe("when the lessons directory does not exist", () => {
        it("should return empty lessons and errors", async () => {
            const result = await gateway.readLessons(root);
            expect(result.lessons).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("when all lesson files are valid", () => {
        it("should return parsed lessons with no errors", async () => {
            const lessonsDir = await createLessonsDir(root);
            await writeFile(
                join(lessonsDir, "valid-slug.md"),
                validFrontmatter(),
            );

            const result = await gateway.readLessons(root);

            expect(result.lessons).toHaveLength(1);
            expect(result.errors).toHaveLength(0);
            expect(result.lessons[0]?.lesson.slug).toBe("valid-slug");
        });
    });

    describe("when a lesson file has invalid type in frontmatter", () => {
        it("should add the file to errors with a reason", async () => {
            const lessonsDir = await createLessonsDir(root);
            const content = validFrontmatter({ type: "unknown-type" });
            await writeFile(join(lessonsDir, "bad-type.md"), content);

            const result = await gateway.readLessons(root);

            expect(result.lessons).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.filePath).toContain("bad-type.md");
            expect(result.errors[0]?.reason).toBeTruthy();
        });
    });

    describe("when a lesson file has missing frontmatter", () => {
        it("should add the file to errors", async () => {
            const lessonsDir = await createLessonsDir(root);
            await writeFile(join(lessonsDir, "no-fm.md"), "# Just a heading\n");

            const result = await gateway.readLessons(root);

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.reason).toContain("Missing");
        });
    });

    describe("when a lesson file has invalid YAML", () => {
        it("should add the file to errors with a YAML detail", async () => {
            const lessonsDir = await createLessonsDir(root);
            await writeFile(
                join(lessonsDir, "bad-yaml.md"),
                "---\n: invalid:\n  - :\n---\n",
            );

            const result = await gateway.readLessons(root);

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.reason).toContain(
                "Invalid YAML frontmatter",
            );
        });
    });

    describe("when a lesson file exceeds 1MB", () => {
        it("should add the file to errors", async () => {
            const lessonsDir = await createLessonsDir(root);
            const bigContent = "x".repeat(1_048_577);
            await writeFile(join(lessonsDir, "big.md"), bigContent);

            const result = await gateway.readLessons(root);

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.filePath).toContain("big.md");
        });
    });

    describe("when more than 500 lesson files exist", () => {
        it("should throw with a cap exceeded error", async () => {
            const lessonsDir = await createLessonsDir(root);
            // Create 501 files
            const writes = Array.from({ length: 501 }, (_, i) =>
                writeFile(
                    join(lessonsDir, `lesson-${String(i).padStart(3, "0")}.md`),
                    validFrontmatter({
                        slug: `lesson-${String(i).padStart(3, "0")}`,
                    }),
                ),
            );
            await Promise.all(writes);

            await expect(gateway.readLessons(root)).rejects.toThrow(
                /file count exceeds limit/i,
            );
        });
    });

    describe("when the lessons directory is a symlink", () => {
        it("should throw a symlink error", async () => {
            await mkdir(join(root, ".lousy-agents"), { recursive: true });
            const realDir = join(root, "real-lessons");
            await mkdir(realDir);
            await symlink(realDir, join(root, ".lousy-agents", "lessons"));

            await expect(gateway.readLessons(root)).rejects.toThrow(
                /symbolic link/i,
            );
        });
    });

    describe("when the lessons path exists but is not a directory", () => {
        it("should throw a descriptive error", async () => {
            await mkdir(join(root, ".lousy-agents"), { recursive: true });
            await writeFile(
                join(root, ".lousy-agents", "lessons"),
                "not-a-dir",
            );

            await expect(gateway.readLessons(root)).rejects.toThrow(
                /not a directory/i,
            );
        });
    });

    describe("when lessons include both invariant and pattern types", () => {
        it("should correctly parse each type", async () => {
            const lessonsDir = await createLessonsDir(root);
            await writeFile(
                join(lessonsDir, "inv.md"),
                validFrontmatter({ slug: "inv", type: "invariant" }),
            );
            await writeFile(
                join(lessonsDir, "pat.md"),
                validFrontmatter({ slug: "pat", type: "pattern" }),
            );

            const result = await gateway.readLessons(root);
            expect(result.lessons).toHaveLength(2);
            const types = result.lessons.map((l) => l.lesson.type).sort();
            expect(types).toEqual(["invariant", "pattern"]);
        });
    });
});
