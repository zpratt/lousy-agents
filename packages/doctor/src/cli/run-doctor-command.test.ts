import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";
import { createConsola } from "consola";
import { describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "./run-doctor-command.js";

const chance = new Chance();
const __dirname = dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
    return resolve(__dirname, "..", "..", "tests", "fixtures", name);
}

const sprawlFixture = fixture("accidental-sprawl");

function buildEnvironment(stdinIsTty: boolean, cwd = sprawlFixture) {
    const logged: string[] = [];
    let stdout = "";
    const logger = createConsola({
        level: 3,
        reporters: [{ log: (entry) => logged.push(entry.args.join(" ")) }],
    });
    const prompt = vi.fn().mockResolvedValue(false);
    logger.prompt = prompt as unknown as typeof logger.prompt;
    return {
        environment: {
            cwd,
            stdinIsTty,
            logger,
            writeStdout: (text: string) => {
                stdout += text;
            },
        },
        prompt,
        logged,
        stdout: () => stdout,
    };
}

describe("runDoctorCommand", () => {
    describe("when --format is not supported", () => {
        it("should report a usage error, write nothing to stdout, and exit 2", async () => {
            // Arrange
            const unsupportedFormat = `jsno-${chance.word()}`;
            const env = buildEnvironment(false);

            // Act
            const exitCode = await runDoctorCommand(
                { format: unsupportedFormat, summary: false, ci: true },
                env.environment,
            );

            // Assert
            expect(exitCode).toBe(2);
            expect(env.stdout()).toBe("");
            expect(env.logged.join("\n")).toContain(unsupportedFormat);
        });
    });

    describe("when JSON is requested from a terminal without --ci", () => {
        it("should not prompt and should write exactly one JSON document", async () => {
            // Arrange
            const env = buildEnvironment(true);

            // Act
            await runDoctorCommand(
                { format: "json", summary: false, ci: false },
                env.environment,
            );

            // Assert
            expect(env.prompt).not.toHaveBeenCalled();
            expect(env.logged).toEqual([]);
            expect(JSON.parse(env.stdout()).archetype).toBe(
                "accidental-sprawl",
            );
        });
    });

    describe("when human output is requested from a terminal without --ci", () => {
        it("should ask the ambiguity questions", async () => {
            // Arrange
            const env = buildEnvironment(true);

            // Act
            await runDoctorCommand(
                { format: "human", summary: false, ci: false },
                env.environment,
            );

            // Assert
            expect(env.prompt).toHaveBeenCalled();
        });
    });

    for (const format of ["human", "json"] as const) {
        describe(`when a ${format} evaluation finds a critical defect`, () => {
            it("should return exit code 1", async () => {
                // Arrange
                const env = buildEnvironment(
                    false,
                    fixture("integration-scenario"),
                );

                // Act
                const exitCode = await runDoctorCommand(
                    { format, summary: false, ci: true },
                    env.environment,
                );

                // Assert
                expect(exitCode).toBe(1);
            });
        });

        describe(`when a ${format} evaluation finds only advisories and medium defects`, () => {
            it("should return exit code 0", async () => {
                // Arrange
                const env = buildEnvironment(false);

                // Act
                const exitCode = await runDoctorCommand(
                    { format, summary: false, ci: true },
                    env.environment,
                );

                // Assert
                expect(exitCode).toBe(0);
            });
        });
    }
});
