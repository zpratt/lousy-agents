import { createConsola } from "consola";
import type { DoctorFormat } from "../lib/doctor-options.js";
import type { DoctorCommandEnvironment } from "./run-doctor-command.js";

export interface DoctorProcess {
    cwd(): string;
    // biome-ignore lint/style/useNamingConvention: mirrors process.stdin.isTTY
    stdin: { isTTY?: boolean };
    stdout: NodeJS.WriteStream;
    stderr: NodeJS.WriteStream;
}

export function processDoctorEnvironment(
    doctorProcess: DoctorProcess = process,
): DoctorCommandEnvironment {
    return {
        cwd: doctorProcess.cwd(),
        stdinIsTty: doctorProcess.stdin.isTTY === true,
        createLogger: (format: DoctorFormat) =>
            createConsola({
                stdout:
                    format === "json"
                        ? doctorProcess.stderr
                        : doctorProcess.stdout,
                stderr: doctorProcess.stderr,
            }),
        writeStdout: (text) => {
            doctorProcess.stdout.write(text);
        },
    };
}
