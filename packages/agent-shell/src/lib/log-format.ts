import type { ScriptEvent } from "../entities/types.js";
import type { SessionSummary } from "../gateways/log-query.js";
import { sanitizeOutput } from "./sanitize.js";

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "");
}

function truncateCommand(command: string, maxLen: number): string {
    if (command.length <= maxLen) return command;
    return `${command.slice(0, maxLen - 3)}...`;
}

function padRight(str: string, width: number): string {
    if (str.length >= width) return str;
    return str + " ".repeat(width - str.length);
}

const COL_TIMESTAMP = 21;
const COL_SCRIPT = 9;
const COL_ACTOR = 13;
const COL_EXIT = 6;
const COL_DURATION = 10;
const MAX_COMMAND_LEN = 50;

export function formatEventsTable(events: ScriptEvent[]): string {
    const header =
        padRight("TIMESTAMP", COL_TIMESTAMP) +
        padRight("SCRIPT", COL_SCRIPT) +
        padRight("ACTOR", COL_ACTOR) +
        padRight("EXIT", COL_EXIT) +
        padRight("DURATION", COL_DURATION) +
        "COMMAND";

    const rows = events.map((event) => {
        const timestamp = formatTimestamp(event.timestamp);
        const script =
            event.event === "script_end"
                ? (event.script ?? "-")
                : event.event === "tool_use"
                  ? sanitizeOutput(event.tool_name)
                  : "-";
        const actor = event.actor;
        const exitCode =
            event.event === "script_end" ? String(event.exit_code) : "-";
        const duration =
            event.event === "script_end"
                ? formatDuration(event.duration_ms)
                : "-";
        const command = truncateCommand(event.command, MAX_COMMAND_LEN);

        return (
            padRight(timestamp, COL_TIMESTAMP) +
            padRight(script, COL_SCRIPT) +
            padRight(actor, COL_ACTOR) +
            padRight(exitCode, COL_EXIT) +
            padRight(duration, COL_DURATION) +
            command
        );
    });

    return [header, ...rows].join("\n");
}

export function formatSessionsTable(sessions: SessionSummary[]): string {
    const colSession = 11;
    const colFirstEvent = 21;
    const colLastEvent = 21;
    const colEvents = 9;

    const header =
        padRight("SESSION", colSession) +
        padRight("FIRST EVENT", colFirstEvent) +
        padRight("LAST EVENT", colLastEvent) +
        padRight("EVENTS", colEvents) +
        "ACTORS";

    const rows = sessions.map((s) => {
        const sessionTrunc = s.sessionId.slice(0, 8);
        const firstEvent = formatTimestamp(s.firstEvent);
        const lastEvent = formatTimestamp(s.lastEvent);
        const eventCount = String(s.eventCount);
        const actors = s.actors.join(", ");

        return (
            padRight(sessionTrunc, colSession) +
            padRight(firstEvent, colFirstEvent) +
            padRight(lastEvent, colLastEvent) +
            padRight(eventCount, colEvents) +
            actors
        );
    });

    return [header, ...rows].join("\n");
}

export function formatEventsJson(events: ScriptEvent[]): string {
    return JSON.stringify(events, null, 2);
}
