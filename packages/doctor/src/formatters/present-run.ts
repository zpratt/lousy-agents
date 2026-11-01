import type { ConsolaInstance } from "consola";
import type { DoctorFormat } from "../lib/doctor-options.js";
import type { DoctorRun } from "../use-cases/run-doctor.js";
import {
    hasBlockingFindings,
    renderHuman,
    renderHumanSummary,
} from "./human-renderer.js";
import { toJson, toSummaryJson } from "./json-formatter.js";
import { formatSummary } from "./summary-formatter.js";

const BLOCKING_FINDINGS_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;

export interface DoctorOutput {
    logger: ConsolaInstance;
    writeStdout(text: string): void;
}

function writeJson(output: DoctorOutput, value: unknown): void {
    output.writeStdout(`${JSON.stringify(value, null, 2)}\n`);
}

function presentJson(run: DoctorRun, output: DoctorOutput): void {
    const summary = formatSummary(run.records, run.classification);
    switch (run.kind) {
        case "summary":
            writeJson(output, toSummaryJson(summary, run.records));
            return;
        case "no-constructs":
            writeJson(
                output,
                toJson(
                    summary,
                    [],
                    run.records,
                    run.snapshotRef,
                    undefined,
                    "not-applicable",
                ),
            );
            return;
        case "evaluated":
            writeJson(
                output,
                toJson(
                    summary,
                    run.findings,
                    run.records,
                    run.snapshotRef,
                    run.intentLoad,
                ),
            );
            return;
    }
}

function presentHuman(run: DoctorRun, output: DoctorOutput): void {
    const summary = formatSummary(run.records, run.classification);
    switch (run.kind) {
        case "summary":
            renderHumanSummary(summary, output.logger, run.snapshotRef);
            return;
        case "no-constructs":
            output.logger.info(
                "No agentic constructs found in the repository.",
            );
            return;
        case "evaluated":
            renderHuman(
                summary,
                run.findings,
                output.logger,
                run.snapshotRef,
                run.intentLoad,
            );
            return;
    }
}

export function presentDoctorRun(
    run: DoctorRun,
    format: DoctorFormat,
    output: DoctorOutput,
): number {
    if (format === "json") {
        presentJson(run, output);
    } else {
        presentHuman(run, output);
    }
    return run.kind === "evaluated" && hasBlockingFindings(run.findings)
        ? BLOCKING_FINDINGS_EXIT_CODE
        : SUCCESS_EXIT_CODE;
}
