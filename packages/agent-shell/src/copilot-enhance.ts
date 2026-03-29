import type { ProjectScanResult } from "./project-scanner.js";

interface CopilotEnhancedResult {
    additionalAllowRules: string[];
    suggestions: string[];
}

/**
 * Attempts to use the @github/copilot-sdk to enhance policy generation
 * with AI-powered project analysis. Falls back gracefully if the SDK
 * or Copilot CLI is not available.
 *
 * @returns Enhanced analysis results, or null if the SDK is unavailable
 */
export async function enhanceWithCopilot(
    scanResult: ProjectScanResult,
    repoRoot: string,
    writeStderr: (data: string) => void,
): Promise<CopilotEnhancedResult | null> {
    try {
        const { CopilotClient } = await import("@github/copilot-sdk");

        const client = new CopilotClient();
        await client.start();

        try {
            const session = await client.createSession({
                model: "gpt-4.1",
            });

            const prompt = buildAnalysisPrompt(scanResult, repoRoot);

            const response = await session.sendAndWait({ prompt });
            const content =
                typeof response?.data === "object" &&
                response.data !== null &&
                "content" in response.data
                    ? String((response.data as { content: unknown }).content)
                    : "";

            await session.destroy();

            return parseAnalysisResponse(content);
        } finally {
            await client.stop();
        }
    } catch {
        if (process.env.AGENT_SHELL_COPILOT_DEBUG) {
            writeStderr(
                "agent-shell: Copilot SDK not available — using static analysis only\n",
            );
        }
        return null;
    }
}

function buildAnalysisPrompt(
    scanResult: ProjectScanResult,
    repoRoot: string,
): string {
    const sections: string[] = [];

    sections.push(
        "Analyze this project and suggest additional terminal commands that should be allowed in an agent-shell policy.",
    );
    sections.push(`Repository root: ${repoRoot}`);

    if (scanResult.languages.length > 0) {
        sections.push(`Detected languages: ${scanResult.languages.join(", ")}`);
    }

    if (scanResult.scripts.length > 0) {
        sections.push("npm scripts found:");
        for (const s of scanResult.scripts) {
            sections.push(`  ${s.name}: ${s.command}`);
        }
    }

    if (scanResult.workflowCommands.length > 0) {
        sections.push("Workflow commands found:");
        for (const cmd of scanResult.workflowCommands) {
            sections.push(`  ${cmd}`);
        }
    }

    if (scanResult.miseTasks.length > 0) {
        sections.push("Mise tasks found:");
        for (const t of scanResult.miseTasks) {
            sections.push(`  ${t.name}: ${t.command}`);
        }
    }

    sections.push("\nRespond with a JSON object containing:");
    sections.push(
        '  "additionalAllowRules": string[] - additional allow rules in glob pattern format',
    );
    sections.push(
        '  "suggestions": string[] - human-readable suggestions for the policy',
    );
    sections.push("Respond ONLY with valid JSON, no markdown or explanation.");

    return sections.join("\n");
}

function parseAnalysisResponse(content: string): CopilotEnhancedResult | null {
    try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return null;
        }

        const parsed: unknown = JSON.parse(jsonMatch[0]);
        if (parsed === null || typeof parsed !== "object") {
            return null;
        }

        const obj = parsed as Record<string, unknown>;

        const additionalAllowRules = Array.isArray(obj.additionalAllowRules)
            ? (obj.additionalAllowRules as unknown[]).filter(
                  (r): r is string => typeof r === "string",
              )
            : [];

        const suggestions = Array.isArray(obj.suggestions)
            ? (obj.suggestions as unknown[]).filter(
                  (s): s is string => typeof s === "string",
              )
            : [];

        return { additionalAllowRules, suggestions };
    } catch {
        return null;
    }
}
