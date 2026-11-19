import { describe, expect, it } from "vitest";
import { mcpConfigFindings } from "./mcp-config-finding.js";

describe("mcpConfigFindings", () => {
    it("should emit one high defect whose target is the whole config path", () => {
        const findings = mcpConfigFindings([
            { path: ".mcp.json" },
            { path: ".vscode/mcp.json" },
        ]);

        expect(findings).toEqual([
            {
                id: "malformed-mcp-config:.mcp.json",
                criterionId: "malformed-mcp-config",
                targetId: ".mcp.json",
                severity: "high",
                category: "malformed-reference",
                classification: "defect",
                intentGated: false,
                assumedIntent: false,
                description:
                    "The MCP config at .mcp.json is not valid JSON, does not match the MCP config schema, or uses a reserved server name.",
            },
            {
                id: "malformed-mcp-config:.vscode/mcp.json",
                criterionId: "malformed-mcp-config",
                targetId: ".vscode/mcp.json",
                severity: "high",
                category: "malformed-reference",
                classification: "defect",
                intentGated: false,
                assumedIntent: false,
                description:
                    "The MCP config at .vscode/mcp.json is not valid JSON, does not match the MCP config schema, or uses a reserved server name.",
            },
        ]);
    });
});
