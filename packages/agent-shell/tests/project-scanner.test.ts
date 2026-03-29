import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanProject } from "../src/project-scanner.js";

const chance = new Chance();

describe("scanProject", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(
            tmpdir(),
            `agent-shell-scanner-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("given a directory with no recognizable files", () => {
        it("should return an empty scan result", async () => {
            // Arrange - empty directory

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.scripts).toEqual([]);
            expect(result.workflowCommands).toEqual([]);
            expect(result.miseTasks).toEqual([]);
            expect(result.languages).toEqual([]);
        });
    });

    describe("given a package.json with scripts", () => {
        it("should discover npm scripts", async () => {
            // Arrange
            const scriptName = chance.word();
            const scriptCommand = `vitest ${chance.word()}`;
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify({
                    name: chance.word(),
                    scripts: {
                        [scriptName]: scriptCommand,
                        test: "vitest run",
                        build: "rspack build",
                    },
                }),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.scripts).toContainEqual({
                name: scriptName,
                command: scriptCommand,
            });
            expect(result.scripts).toContainEqual({
                name: "test",
                command: "vitest run",
            });
            expect(result.scripts).toContainEqual({
                name: "build",
                command: "rspack build",
            });
        });
    });

    describe("given a package.json without scripts", () => {
        it("should return empty scripts array", async () => {
            // Arrange
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify({ name: chance.word() }),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.scripts).toEqual([]);
        });
    });

    describe("given a malformed package.json", () => {
        it("should return empty scripts array", async () => {
            // Arrange
            await writeFile(join(testDir, "package.json"), "not json{{{");

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.scripts).toEqual([]);
        });
    });

    describe("given a GitHub Actions workflow with run commands", () => {
        it("should discover workflow commands", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "ci.yml"),
                [
                    "name: CI",
                    "on: push",
                    "jobs:",
                    "  test:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: npm test",
                    "      - run: npm run build",
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.workflowCommands).toContainEqual("npm test");
            expect(result.workflowCommands).toContainEqual("npm run build");
        });
    });

    describe("given multiple workflow files", () => {
        it("should deduplicate commands across files", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "ci.yml"),
                [
                    "name: CI",
                    "on: push",
                    "jobs:",
                    "  test:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: npm test",
                ].join("\n"),
            );
            await writeFile(
                join(workflowsDir, "release.yml"),
                [
                    "name: Release",
                    "on: push",
                    "jobs:",
                    "  build:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: npm test",
                    "      - run: npm run build",
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            const npmTestCount = result.workflowCommands.filter(
                (c) => c === "npm test",
            ).length;
            expect(npmTestCount).toBe(1);
        });
    });

    describe("given a workflows directory with no YAML files", () => {
        it("should return empty workflow commands", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(join(workflowsDir, "README.md"), "# Workflows");

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.workflowCommands).toEqual([]);
        });
    });

    describe("given a mise.toml with tasks", () => {
        it("should discover mise tasks", async () => {
            // Arrange
            await writeFile(
                join(testDir, "mise.toml"),
                [
                    "[tools]",
                    'node = "lts"',
                    "",
                    "[tasks.test]",
                    'run = "vitest run"',
                    "",
                    "[tasks.lint]",
                    'run = "biome check ."',
                    "",
                    "[tasks.ci]",
                    "depends = ['lint', 'test']",
                    'run = "echo done"',
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.miseTasks).toContainEqual({
                name: "test",
                command: "vitest run",
            });
            expect(result.miseTasks).toContainEqual({
                name: "lint",
                command: "biome check .",
            });
        });
    });

    describe("given a mise.toml without tasks", () => {
        it("should return empty mise tasks", async () => {
            // Arrange
            await writeFile(
                join(testDir, "mise.toml"),
                ["[tools]", 'node = "lts"'].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.miseTasks).toEqual([]);
        });
    });

    describe("given a directory with language markers", () => {
        it("should detect Node.js from package.json", async () => {
            // Arrange
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify({ name: "test" }),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.languages).toContain("node");
        });

        it("should detect Python from requirements.txt", async () => {
            // Arrange
            await writeFile(join(testDir, "requirements.txt"), "flask\n");

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.languages).toContain("python");
        });

        it("should detect Go from go.mod", async () => {
            // Arrange
            await writeFile(
                join(testDir, "go.mod"),
                "module example.com/foo\n",
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.languages).toContain("go");
        });

        it("should detect Rust from Cargo.toml", async () => {
            // Arrange
            await writeFile(
                join(testDir, "Cargo.toml"),
                '[package]\nname = "foo"\n',
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.languages).toContain("rust");
        });

        it("should detect Ruby from Gemfile", async () => {
            // Arrange
            await writeFile(
                join(testDir, "Gemfile"),
                'source "https://rubygems.org"\n',
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.languages).toContain("ruby");
        });

        it("should detect Java from pom.xml", async () => {
            // Arrange
            await writeFile(join(testDir, "pom.xml"), "<project></project>\n");

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.languages).toContain("java");
        });
    });

    describe("given workflow YAML with multi-line run commands", () => {
        it("should extract individual commands from multi-line runs", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "ci.yml"),
                [
                    "name: CI",
                    "on: push",
                    "jobs:",
                    "  test:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: |",
                    "          npm ci",
                    "          npm test",
                    "          npm run build",
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.workflowCommands).toContainEqual("npm ci");
            expect(result.workflowCommands).toContainEqual("npm test");
            expect(result.workflowCommands).toContainEqual("npm run build");
        });
    });

    describe("given workflow YAML with block scalar modifiers", () => {
        it("should extract commands from |- (strip) blocks", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "deploy.yml"),
                [
                    "name: Deploy",
                    "on: push",
                    "jobs:",
                    "  deploy:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: |-",
                    "          npm ci",
                    "          npm run deploy",
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.workflowCommands).toContainEqual("npm ci");
            expect(result.workflowCommands).toContainEqual("npm run deploy");
        });

        it("should extract commands from >- (folded strip) blocks", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "lint.yml"),
                [
                    "name: Lint",
                    "on: push",
                    "jobs:",
                    "  lint:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: >-",
                    "          npx biome check .",
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.workflowCommands).toContainEqual("npx biome check .");
        });

        it("should join multi-line folded (>) blocks into a single command", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "deploy.yml"),
                [
                    "name: Deploy",
                    "on: push",
                    "jobs:",
                    "  deploy:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: >",
                    "          docker build",
                    "          --tag my-image",
                    "          --file Dockerfile",
                    "          .",
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert — folded blocks join lines with spaces, producing one command
            expect(result.workflowCommands).toContainEqual(
                "docker build --tag my-image --file Dockerfile .",
            );
            // Should NOT have individual lines as separate commands
            expect(result.workflowCommands).not.toContainEqual("docker build");
            expect(result.workflowCommands).not.toContainEqual(
                "--tag my-image",
            );
        });
    });

    describe("given workflow YAML with inline comments on run commands", () => {
        it("should strip inline comments from single-line run commands", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "ci.yml"),
                [
                    "name: CI",
                    "on: push",
                    "jobs:",
                    "  test:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    "      - run: npm ci # install deps",
                    '      - run: "npm test" # run tests',
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.workflowCommands).toContainEqual("npm ci");
            expect(result.workflowCommands).toContainEqual("npm test");
            expect(
                result.workflowCommands.some((cmd) => cmd.includes("#")),
            ).toBe(false);
        });

        it("should preserve hash symbols inside quoted command strings", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "ci.yml"),
                [
                    "name: CI",
                    "on: push",
                    "jobs:",
                    "  test:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    `      - run: 'npm run build -- --tag=#latest'`,
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert — hash inside quotes is part of the command, not a comment
            expect(result.workflowCommands).toContainEqual(
                "npm run build -- --tag=#latest",
            );
        });
    });

    describe("given a mise.toml with multi-line task run commands", () => {
        it("should extract the first line as the command", async () => {
            // Arrange
            await writeFile(
                join(testDir, "mise.toml"),
                [
                    "[tasks.ci]",
                    'run = """',
                    "npm run lint",
                    "npm test",
                    '"""',
                ].join("\n"),
            );

            // Act
            const result = await scanProject(testDir);

            // Assert
            expect(result.miseTasks.length).toBeGreaterThanOrEqual(1);
            expect(result.miseTasks[0]?.name).toBe("ci");
        });
    });
});
