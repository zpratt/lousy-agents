import { type ConsolaInstance, createConsola } from "consola";
import type { DoctorFormat } from "../lib/doctor-options.js";
import type { DoctorCommandEnvironment } from "./run-doctor-command.js";

/** The only thing the environment itself does with an output stream. */
export interface TextOutput {
    write(text: string): unknown;
}

export interface DoctorProcess<Stream extends TextOutput = NodeJS.WriteStream> {
    cwd(): string;
    // biome-ignore lint/style/useNamingConvention: mirrors process.stdin.isTTY
    stdin: { isTTY?: boolean };
    stdout: Stream;
    stderr: Stream;
}

export interface LoggerStreams<Stream extends TextOutput> {
    stdout: Stream;
    stderr: Stream;
}

export type StreamLoggerFactory<Stream extends TextOutput> = (
    streams: LoggerStreams<Stream>,
) => ConsolaInstance;

function loggerStreamsFor<Stream extends TextOutput>(
    format: DoctorFormat,
    doctorProcess: DoctorProcess<Stream>,
): LoggerStreams<Stream> {
    return {
        stdout: format === "json" ? doctorProcess.stderr : doctorProcess.stdout,
        stderr: doctorProcess.stderr,
    };
}

export function createDoctorEnvironment<Stream extends TextOutput>(
    doctorProcess: DoctorProcess<Stream>,
    createStreamLogger: StreamLoggerFactory<Stream>,
): DoctorCommandEnvironment {
    return {
        cwd: doctorProcess.cwd(),
        stdinIsTty: doctorProcess.stdin.isTTY === true,
        createLogger: (format: DoctorFormat) =>
            createStreamLogger(loggerStreamsFor(format, doctorProcess)),
        writeStdout: (text) => {
            doctorProcess.stdout.write(text);
        },
    };
}

export function processDoctorEnvironment(
    doctorProcess: DoctorProcess = process,
): DoctorCommandEnvironment {
    return createDoctorEnvironment(doctorProcess, (streams) =>
        createConsola(streams),
    );
}
