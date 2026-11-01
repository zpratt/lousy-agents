import type { ConsolaInstance } from "consola";
import type { Finding } from "../entities/finding.js";
import type { DoctorFormat } from "../lib/doctor-options.js";
import type { DoctorRun } from "../use-cases/run-doctor.js";
import {
    hasBlockingFindings,
    renderHuman,
    renderHumanSummary,
    warnAboutFindings,
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

function reportedFindings(
    run: Extract<DoctorRun, { kind: "evaluated" }>,
): Finding[] {
    return [...run.findings, ...run.scanWarnings];
}

function presentJson(run: DoctorRun, output: DoctorOutput): void {
    const summary = formatSummary(run.records, run.classification);
    switch (run.kind) {
        case "summary":
            writeJson(output, toSummaryJson(summary, run.records));
            warnAboutFindings(output.logger, run.scanWarnings);
            return;
        case "no-constructs":
            writeJson(
                output,
                toJson(
                    summary,
                    run.scanWarnings,
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
                    reportedFindings(run),
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
            warnAboutFindings(output.logger, run.scanWarnings);
            return;
        case "no-constructs":
            output.logger.info(
                "No agentic constructs found in the repository.",
            );
            warnAboutFindings(output.logger, run.scanWarnings);
            return;
        case "evaluated":
            renderHuman(
                summary,
                reportedFindings(run),
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
