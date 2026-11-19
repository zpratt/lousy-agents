import { describe, expect, it } from "vitest";
import type { McpConfigDefectReason } from "../entities/mcp-config-defect.js";
import { mcpConfigFindings } from "./mcp-config-finding.js";

const REASON_CASES: ReadonlyArray<readonly [McpConfigDefectReason, string]> = [
    ["invalid-json", "is not valid JSON"],
    ["invalid-schema", "does not match the MCP config schema"],
    [
        "reserved-name",
        "declares a reserved server name (__proto__, constructor, or prototype)",
    ],
    ["too-large", "is larger than the 1 MiB size limit"],
    ["symlink", "is a symbolic link, which doctor does not follow"],
    ["unreadable", "exists but could not be read as a regular file"],
];

describe("mcpConfigFindings", () => {
    it("should emit one high defect whose target is the whole config path", () => {
        const findings = mcpConfigFindings([
            { path: ".mcp.json", reason: "invalid-json" },
            { path: ".vscode/mcp.json", reason: "invalid-schema" },
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
                    "The MCP config at .mcp.json is malformed: it is not valid JSON.",
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
                    "The MCP config at .vscode/mcp.json is malformed: it does not match the MCP config schema.",
            },
        ]);
    });

    describe("when the cause differs", () => {
        it.each(REASON_CASES)(
            "should name the %s cause in the description",
            (reason, text) => {
                const [finding] = mcpConfigFindings([
                    { path: ".mcp.json", reason },
                ]);

                expect(finding?.description).toBe(
                    `The MCP config at .mcp.json is malformed: it ${text}.`,
                );
            },
        );
    });

    describe("when there is no defect", () => {
        it("should emit no finding", () => {
            expect(mcpConfigFindings([])).toEqual([]);
        });
    });
});
