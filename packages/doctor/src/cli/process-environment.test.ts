import { Writable } from "node:stream";
import Chance from "chance";
import { type ConsolaInstance, createConsola } from "consola";
import { describe, expect, it } from "vitest";
import {
    createDoctorEnvironment,
    type DoctorProcess,
    type LoggerStreams,
    processDoctorEnvironment,
} from "./process-environment.js";

const chance = new Chance();

class CapturingStream extends Writable {
    private readonly chunks: string[] = [];

    override _write(
        chunk: unknown,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        this.chunks.push(String(chunk));
        callback();
    }

    written(): string {
        return this.chunks.join("");
    }
}

function stdinOf(isTerminal?: boolean): DoctorProcess["stdin"] {
    // biome-ignore lint/style/useNamingConvention: mirrors process.stdin.isTTY
    return isTerminal === undefined ? {} : { isTTY: isTerminal };
}

function buildProcess(
    overrides: Partial<DoctorProcess<CapturingStream>> = {},
): DoctorProcess<CapturingStream> {
    return {
        cwd: () => `/${chance.word()}`,
        stdin: stdinOf(false),
        stdout: new CapturingStream(),
        stderr: new CapturingStream(),
        ...overrides,
    };
}

function recordingLoggerFactory() {
    const received: LoggerStreams<CapturingStream>[] = [];
    const logger: ConsolaInstance = createConsola({ reporters: [] });
    return {
        logger,
        received,
        createStreamLogger: (streams: LoggerStreams<CapturingStream>) => {
            received.push(streams);
            return logger;
        },
    };
}

function buildEnvironment(doctorProcess: DoctorProcess<CapturingStream>) {
    return createDoctorEnvironment(
        doctorProcess,
        recordingLoggerFactory().createStreamLogger,
    );
}

describe("createDoctorEnvironment", () => {
    describe("when the process has a working directory", () => {
        it("should expose it as the directory to scan", () => {
            const workingDirectory = `/${chance.word()}/${chance.word()}`;
            const doctorProcess = buildProcess({
                cwd: () => workingDirectory,
            });

            const environment = buildEnvironment(doctorProcess);

            expect(environment.cwd).toBe(workingDirectory);
        });
    });

    describe("when stdin is a terminal", () => {
        it("should report a terminal", () => {
            const doctorProcess = buildProcess({ stdin: stdinOf(true) });

            const environment = buildEnvironment(doctorProcess);

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
                const doctorProcess = buildProcess({ stdin });

                const environment = buildEnvironment(doctorProcess);

                expect(environment.stdinIsTty).toBe(false);
            },
        );
    });

    describe("when text is written to stdout", () => {
        it("should forward exactly that text to the process stdout and nothing to stderr", () => {
            const text = chance.sentence();
            const doctorProcess = buildProcess();
            const environment = buildEnvironment(doctorProcess);

            environment.writeStdout(text);

            expect(doctorProcess.stdout.written()).toBe(text);
            expect(doctorProcess.stderr.written()).toBe("");
        });
    });

    describe("when a json logger is requested", () => {
        it("should route both logger streams to stderr so stdout carries only the report", () => {
            const doctorProcess = buildProcess();
            const { logger, received, createStreamLogger } =
                recordingLoggerFactory();
            const environment = createDoctorEnvironment(
                doctorProcess,
                createStreamLogger,
            );

            const created = environment.createLogger("json");

            expect(created).toBe(logger);
            expect(received).toHaveLength(1);
            expect(received[0]?.stdout).toBe(doctorProcess.stderr);
            expect(received[0]?.stderr).toBe(doctorProcess.stderr);
        });
    });

    describe("when a human logger is requested", () => {
        it("should route information to stdout and warnings and errors to stderr", () => {
            const doctorProcess = buildProcess();
            const { logger, received, createStreamLogger } =
                recordingLoggerFactory();
            const environment = createDoctorEnvironment(
                doctorProcess,
                createStreamLogger,
            );

            const created = environment.createLogger("human");

            expect(created).toBe(logger);
            expect(received).toHaveLength(1);
            expect(received[0]?.stdout).toBe(doctorProcess.stdout);
            expect(received[0]?.stderr).toBe(doctorProcess.stderr);
        });
    });
});

describe("processDoctorEnvironment", () => {
    function realProcessWith(
        overrides: Partial<DoctorProcess> = {},
    ): DoctorProcess {
        return {
            cwd: () => process.cwd(),
            stdin: stdinOf(false),
            stdout: process.stdout,
            stderr: process.stderr,
            ...overrides,
        };
    }

    describe("when a json logger is requested", () => {
        it("should give consola the process stderr for every log level", () => {
            const logger = processDoctorEnvironment(
                realProcessWith(),
            ).createLogger("json");

            expect(logger.options.stdout).toBe(process.stderr);
            expect(logger.options.stderr).toBe(process.stderr);
        });
    });

    describe("when a human logger is requested", () => {
        it("should give consola the process stdout for information and stderr for warnings", () => {
            const logger = processDoctorEnvironment(
                realProcessWith(),
            ).createLogger("human");

            expect(logger.options.stdout).toBe(process.stdout);
            expect(logger.options.stderr).toBe(process.stderr);
        });
    });

    describe("when no process is given", () => {
        it("should read the working directory of the running process", () => {
            const environment = processDoctorEnvironment();

            expect(environment.cwd).toBe(process.cwd());
        });
    });
});
