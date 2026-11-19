import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { enumerateMcpServers, inspectMcpConfigs } from "./mcp-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../tests/fixtures");

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

describe("enumerateMcpServers", () => {
    describe("when a JSON source declares multiple servers", () => {
        it("should yield one record per declared server", async () => {
            const records = await enumerateMcpServers(
                fixture("mcp-multi-server"),
            );

            expect(records).toHaveLength(2);
        });

        it("should attribute .mcp.json records to the shared harness since both Claude and Copilot read it", async () => {
            const records = await enumerateMcpServers(
                fixture("mcp-multi-server"),
            );

            for (const record of records) {
                expect(record.harness).toBe("shared");
                expect(record.path).toBe(".mcp.json");
            }
        });

        it("should record the transport from the entry's 'type' field", async () => {
            const records = await enumerateMcpServers(
                fixture("mcp-multi-server"),
            );

            const filesystem = records.find(
                (r) => r.serverName === "filesystem",
            );
            const search = records.find((r) => r.serverName === "search");
            expect(filesystem?.transport).toBe("stdio");
            expect(search?.transport).toBe("http");
        });
    });

    describe("when a source declares zero servers", () => {
        it("should yield no records and not error", async () => {
            await expect(
                enumerateMcpServers(fixture("mcp-empty-servers")),
            ).resolves.toEqual([]);
        });
    });

    describe("when a source fails schema validation", () => {
        it("should skip the source and not throw", async () => {
            await expect(
                enumerateMcpServers(fixture("mcp-malformed")),
            ).resolves.toEqual([]);
        });
    });

    describe("when no recognized MCP config source is present", () => {
        it("should yield no records", async () => {
            const records = await enumerateMcpServers(fixture("empty-repo"));

            expect(records).toEqual([]);
        });
    });

    describe("when a source declares a server named '__proto__'", () => {
        it("should skip the source instead of silently dropping the reserved-name server", async () => {
            // Arrange — zod's record() reconstructs parsed output via plain
            // assignment, so a "__proto__" key is silently swallowed by the
            // JS magic setter unless the raw config is rejected up front.
            const records = await enumerateMcpServers(
                fixture("mcp-reserved-server-name"),
            );

            // Assert — the whole file is treated as invalid (consistent
            // with how a schema-validation failure is handled), not
            // partially inventoried with the reserved-name server missing.
            expect(records).toEqual([]);
        });
    });

    describe("when a config file is present but cannot be read as servers", () => {
        it("should report invalid JSON and keep no server record", async () => {
            const root = await mkdtemp(join(tmpdir(), "mcp-json-"));
            await writeFile(join(root, ".mcp.json"), "{not json", "utf8");

            const inspected = await inspectMcpConfigs(root);

            expect(inspected.records).toEqual([]);
            expect(inspected.defects).toEqual([
                { path: ".mcp.json", reason: "invalid-json" },
            ]);
        });

        it("should report a schema failure for an array of servers and keep no server record", async () => {
            const root = await mkdtemp(join(tmpdir(), "mcp-schema-"));
            await writeFile(
                join(root, ".mcp.json"),
                JSON.stringify({ mcpServers: [] }),
                "utf8",
            );

            const inspected = await inspectMcpConfigs(root);

            expect(inspected.records).toEqual([]);
            expect(inspected.defects).toEqual([
                { path: ".mcp.json", reason: "invalid-schema" },
            ]);
        });

        it("should report a reserved server name and keep no server record", async () => {
            const root = await mkdtemp(join(tmpdir(), "mcp-reserved-"));
            await mkdir(join(root, ".vscode"));
            await writeFile(
                join(root, ".vscode", "mcp.json"),
                '{"mcpServers":{"__proto__":{"command":"x"}}}\n',
                "utf8",
            );

            const inspected = await inspectMcpConfigs(root);

            expect(inspected.records).toEqual([]);
            expect(inspected.defects).toEqual([
                { path: ".vscode/mcp.json", reason: "reserved-name" },
            ]);
        });

        it("should not report a defect when the config file is absent", async () => {
            const inspected = await inspectMcpConfigs(fixture("empty-repo"));

            expect(inspected.defects).toEqual([]);
        });
    });

    describe("when the source is .vscode/mcp.json", () => {
        it("should attribute records to the copilot harness", async () => {
            const records = await enumerateMcpServers(
                fixture("mcp-vscode-source"),
            );

            expect(records).toHaveLength(1);
            expect(records[0].harness).toBe("copilot");
            expect(records[0].path).toBe(".vscode/mcp.json");
            expect(records[0].serverName).toBe("lousy-agents");
        });
    });
});
