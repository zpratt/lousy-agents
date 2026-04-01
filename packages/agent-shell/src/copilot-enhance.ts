import { readFile, realpath } from "node:fs/promises";
import { normalize, resolve } from "node:path";
import { z } from "zod/v4";
import { buildAnalysisPrompt, buildSystemMessage } from "./copilot-prompt.js";
import type { ProjectScanResult } from "./project-scanner.js";
import { isSafeCommand, sanitizeForStderr } from "./sanitize.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const MAX_FILE_READ_BYTES = 102_400;

const AnalysisResponseSchema = z.object({
    additionalAllowRules: z.array(z.string().max(512)).max(100),
    suggestions: z.array(z.string().max(1024)).max(100),
});

/**
 * Result of Copilot-enhanced project analysis.
 */
export type CopilotEnhancedResult = z.infer<typeof AnalysisResponseSchema>;

/**
 * Resolves a relative path against a root directory and verifies it
 * does not escape the root via traversal (e.g. `../../etc/passwd`).
 *
 * @returns The resolved absolute path, or null if it escapes the root
 */
export function resolveSafePath(
    repoRoot: string,
    relativePath: string,
): string | null {
    const root = repoRoot.replace(/\/+$/, "") || "/";
    const resolved = resolve(root, normalize(relativePath));
    const prefix = root === "/" ? "/" : `${root}/`;
    if (!resolved.startsWith(prefix) && resolved !== root) {
        return null;
    }
    return resolved;
}

/**
 * Reads a project file safely, enforcing path traversal protection
 * and byte-level truncation. Extracted for testability.
 */
export async function readProjectFileSafe(
    repoRoot: string,
    pathArg: string,
): Promise<{ content: string; truncated: boolean } | { error: string }> {
    if (pathArg.length === 0) {
        return { error: "Path is required" };
    }
    const safePath = resolveSafePath(repoRoot, pathArg);
    if (safePath === null) {
        return { error: "Path is outside the repository" };
    }
    try {
        const root = repoRoot.replace(/\/+$/, "") || "/";
        const [realRoot, realPath] = await Promise.all([
            realpath(root),
            realpath(safePath),
        ]);
        const realPrefix = realRoot === "/" ? "/" : `${realRoot}/`;
        if (!realPath.startsWith(realPrefix) && realPath !== realRoot) {
            return { error: "Path is outside the repository" };
        }
        const fileBuffer = await readFile(realPath);
        const isTruncated = fileBuffer.length > MAX_FILE_READ_BYTES;
        const limitedBuffer = isTruncated
            ? fileBuffer.subarray(0, MAX_FILE_READ_BYTES)
            : fileBuffer;
        return {
            content: limitedBuffer.toString("utf-8"),
            truncated: isTruncated,
        };
    } catch {
        return { error: "File not found or unreadable" };
    }
}

/**
 * Creates custom tools that allow the Copilot model to read files
 * and validate proposed allow rules. Structured project discovery
 * is handled by the lousy-agents MCP server (connected via mcpServers).
 */
function createCustomTools(
    repoRoot: string,
    defineTool: (
        name: string,
        config: {
            description: string;
            parameters: Record<string, unknown>;
            handler: (args: Record<string, string>) => Promise<unknown>;
            skipPermission?: boolean;
        },
    ) => unknown,
): unknown[] {
    const readProjectFile = defineTool("read_project_file", {
        description:
            "Read a file from the project repository. Returns file content (truncated at 100KB). Use to inspect build configs, Dockerfiles, Makefiles, etc.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Relative path from repository root",
                },
            },
            required: ["path"],
        },
        skipPermission: true,
        handler: (args: Record<string, string>) =>
            readProjectFileSafe(repoRoot, args.path ?? ""),
    });

    const validateAllowRule = defineTool("validate_allow_rule", {
        description:
            "Check whether a proposed allow rule is safe (does not contain shell metacharacters like ;, |, &, `, $, etc.).",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "The command to validate as a policy rule",
                },
            },
            required: ["command"],
        },
        skipPermission: true,
        handler: async (args: Record<string, string>) => {
            const command = args.command ?? "";
            if (isSafeCommand(command)) {
                return {
                    safe: true,
                    reason: "No shell metacharacters detected",
                };
            }
            const normalized = command.trim();
            if (normalized.length === 0) {
                return {
                    safe: false,
                    reason: "Empty or whitespace-only commands are not allowed in policy rules",
                };
            }
            return {
                safe: false,
                reason: "Contains shell metacharacters — compound commands are not allowed in policy rules",
            };
        },
    });

    return [readProjectFile, validateAllowRule];
}

/**
 * Attempts to use the @github/copilot-sdk to enhance policy generation
 * with AI-powered project analysis. Connects to the lousy-agents MCP
 * server for structured project discovery (feedback loops, environment)
 * and provides custom tools for file reading and rule validation.
 * Falls back gracefully if the SDK or Copilot CLI is not available.
 *
 * @returns Enhanced analysis results, or null if the SDK is unavailable
 */
export async function enhanceWithCopilot(
    scanResult: ProjectScanResult,
    repoRoot: string,
    writeStderr: (data: string) => void,
    model = DEFAULT_MODEL,
): Promise<CopilotEnhancedResult | null> {
    let importSucceeded = false;
    try {
        const { CopilotClient, defineTool, approveAll } = await import(
            "@github/copilot-sdk"
        );
        importSucceeded = true;

        const client = new CopilotClient();
        const tools = createCustomTools(repoRoot, defineTool);

        try {
            await client.start();
            const session = await client.createSession({
                model,
                tools,
                onPermissionRequest: approveAll,
                systemMessage: {
                    content: buildSystemMessage(),
                },
                mcpServers: {
                    "lousy-agents": {
                        type: "local",
                        command: "npx",
                        args: ["-y", "@lousy-agents/mcp"],
                        cwd: repoRoot,
                        tools: [
                            "discover_feedback_loops",
                            "discover_environment",
                        ],
                    },
                },
            });

            try {
                const prompt = buildAnalysisPrompt(scanResult, repoRoot);

                const response = await session.sendAndWait({ prompt });
                const data =
                    typeof response?.data === "object" && response.data !== null
                        ? (response.data as Record<string, unknown>)
                        : undefined;
                const content =
                    data !== undefined &&
                    "content" in data &&
                    typeof data.content === "string"
                        ? data.content
                        : "";

                return parseAnalysisResponse(content);
            } finally {
                await session.disconnect();
            }
        } finally {
            await client.stop();
        }
    } catch (err) {
        if (process.env.AGENT_SHELL_COPILOT_DEBUG) {
            if (importSucceeded) {
                writeStderr(
                    `agent-shell: Copilot analysis failed — ${sanitizeForStderr(err)}\n`,
                );
            } else {
                writeStderr(
                    "agent-shell: Copilot SDK not available — using static analysis only\n",
                );
            }
        }
        return null;
    }
}

/**
 * Finds the first well-formed JSON object in `content` using brace-balancing,
 * rather than a greedy regex that could capture extra trailing braces and
 * fail JSON.parse on valid responses that include preamble or postamble text.
 */
function extractFirstJsonObject(content: string): string | null {
    const start = content.indexOf("{");
    if (start === -1) {
        return null;
    }

    let inString = false;
    let escaping = false;
    let depth = 0;

    for (let i = start; i < content.length; i += 1) {
        const ch = content[i];

        if (escaping) {
            escaping = false;
            continue;
        }

        if (ch === "\\") {
            if (inString) {
                escaping = true;
            }
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (ch === "{") {
                depth += 1;
            } else if (ch === "}") {
                depth -= 1;
                if (depth === 0) {
                    return content.slice(start, i + 1);
                }
            }
        }
    }

    return null;
}

function parseAnalysisResponse(content: string): CopilotEnhancedResult | null {
    const jsonText = extractFirstJsonObject(content);
    if (!jsonText) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(jsonText);
        return AnalysisResponseSchema.parse(parsed);
    } catch {
        return null;
    }
}
