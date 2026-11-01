import { Writable } from "node:stream";
import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    type DoctorProcess,
    processDoctorEnvironment,
} from "./process-environment.js";

const chance = new Chance();
const DEBUG_LEVEL = 4;

function buildStream() {
    const chunks: string[] = [];
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(String(chunk));
            callback();
        },
    });
    return {
        stream: stream as unknown as NodeJS.WriteStream,
        written: () => chunks.join(""),
    };
}

function stdinOf(isTerminal?: boolean): DoctorProcess["stdin"] {
    // biome-ignore lint/style/useNamingConvention: mirrors process.stdin.isTTY
    return isTerminal === undefined ? {} : { isTTY: isTerminal };
}

function buildProcess(overrides: Partial<DoctorProcess> = {}) {
    const out = buildStream();
    const err = buildStream();
    const doctorProcess: DoctorProcess = {
        cwd: () => `/${chance.word()}`,
        stdin: stdinOf(false),
        stdout: out.stream,
        stderr: err.stream,
        ...overrides,
    };
    return { doctorProcess, stdout: out.written, stderr: err.written };
}

describe("processDoctorEnvironment", () => {
    describe("when the process has a working directory", () => {
        it("should expose it as the directory to scan", () => {
            const workingDirectory = `/${chance.word()}/${chance.word()}`;
            const { doctorProcess } = buildProcess({
                cwd: () => workingDirectory,
            });

            const environment = processDoctorEnvironment(doctorProcess);

            expect(environment.cwd).toBe(workingDirectory);
        });
    });

    describe("when stdin is a terminal", () => {
        it("should report a terminal", () => {
            const { doctorProcess } = buildProcess({ stdin: stdinOf(true) });

            const environment = processDoctorEnvironment(doctorProcess);

            expect(environment.stdinIsTty).toBe(true);
        });
    });

    describe("when stdin is not a terminal", () => {
        it.each([
            { name: "false", stdin: stdinOf(false) },
            { name: "absent", stdin: stdinOf() },
        ])(
            "should not report a terminal when the terminal flag is $name",
            ({ stdin }) => {
                const { doctorProcess } = buildProcess({ stdin });

                const environment = processDoctorEnvironment(doctorProcess);

                expect(environment.stdinIsTty).toBe(false);
            },
        );
    });

    describe("when text is written to stdout", () => {
        it("should forward exactly that text to the process stdout and nothing to stderr", () => {
            const text = chance.sentence();
            const { doctorProcess, stdout, stderr } = buildProcess();
            const environment = processDoctorEnvironment(doctorProcess);

            environment.writeStdout(text);

            expect(stdout()).toBe(text);
            expect(stderr()).toBe("");
        });
    });

    describe("when a json logger is requested", () => {
        it("should send every log level to stderr and nothing to stdout", () => {
            const { doctorProcess, stdout, stderr } = buildProcess();
            const logger =
                processDoctorEnvironment(doctorProcess).createLogger("json");
            logger.level = DEBUG_LEVEL;
            const debugMessage = chance.sentence();
            const infoMessage = chance.sentence();
            const warnMessage = chance.sentence();
            const errorMessage = chance.sentence();

            logger.debug(debugMessage);
            logger.info(infoMessage);
            logger.warn(warnMessage);
            logger.error(errorMessage);

            expect(stdout()).toBe("");
            expect(stderr()).toContain(debugMessage);
            expect(stderr()).toContain(infoMessage);
            expect(stderr()).toContain(warnMessage);
            expect(stderr()).toContain(errorMessage);
        });
    });

    describe("when a human logger is requested", () => {
        it("should send information to stdout and warnings and errors to stderr", () => {
            const { doctorProcess, stdout, stderr } = buildProcess();
            const logger =
                processDoctorEnvironment(doctorProcess).createLogger("human");
            logger.level = DEBUG_LEVEL;
            const infoMessage = chance.sentence();
            const warnMessage = chance.sentence();
            const errorMessage = chance.sentence();

            logger.info(infoMessage);
            logger.warn(warnMessage);
            logger.error(errorMessage);

            expect(stdout()).toContain(infoMessage);
            expect(stdout()).not.toContain(warnMessage);
            expect(stdout()).not.toContain(errorMessage);
            expect(stderr()).toContain(warnMessage);
            expect(stderr()).toContain(errorMessage);
            expect(stderr()).not.toContain(infoMessage);
        });
    });
});
