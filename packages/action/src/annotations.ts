/**
 * Publishes the diagnostics that describe the whole run.
 *
 * reviewdog's diff filter drops findings that are not on a changed line, and
 * the action's stdout is piped into reviewdog, so these cannot go through
 * either. They are written to a file the composite step replays on its own
 * stdout (where the runner reads workflow commands) and, when available,
 * appended to the job summary. With no file configured they fall back to
 * stderr so a run outside the action still shows them.
 */

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { LintDiagnostic } from "@lousy-agents/lint";
import { formatWorkflowCommand } from "./workflow-commands.js";

export interface AnnotationTargets {
    readonly annotationsFile?: string;
    readonly stepSummaryFile?: string;
    readonly writeStderr: (text: string) => unknown;
}

const OPEN_FOR_WRITE =
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW;

/** Writes text to a path without following a symlink at it. */
async function writeWithoutFollowing(
    path: string,
    text: string,
    mode: "replace" | "append",
): Promise<void> {
    const flags =
        OPEN_FOR_WRITE |
        (mode === "replace" ? constants.O_TRUNC : constants.O_APPEND);
    const handle = await open(path, flags, 0o600);
    try {
        await handle.writeFile(text, "utf8");
    } finally {
        await handle.close();
    }
}

/** Any line break a Markdown renderer would honor, so a bullet stays one line. */
const LINE_BREAK = /\r\n|\r|\n/g;

function summarySection(diagnostics: readonly LintDiagnostic[]): string {
    const items = diagnostics.map(
        (d) =>
            `- \u26A0\uFE0F \`${d.ruleId ?? "lousy-agents"}\`: ${d.message.replace(LINE_BREAK, " ")}`,
    );
    return `\n### lousy-agents lint: run-level warnings\n\n${items.join("\n")}\n`;
}

export async function publishRunLevelDiagnostics(
    diagnostics: readonly LintDiagnostic[],
    targets: AnnotationTargets,
): Promise<void> {
    if (diagnostics.length === 0) {
        return;
    }

    const commands = `${diagnostics.map(formatWorkflowCommand).join("\n")}\n`;
    if (targets.annotationsFile === undefined) {
        targets.writeStderr(commands);
    } else {
        await writeWithoutFollowing(
            targets.annotationsFile,
            commands,
            "replace",
        );
    }

    if (targets.stepSummaryFile !== undefined) {
        await writeWithoutFollowing(
            targets.stepSummaryFile,
            summarySection(diagnostics),
            "append",
        );
    }
}
