import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { enumerateMcpServers } from "./mcp-config.js";

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
