import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { readPackageVersion } from "./package-version.js";

const chance = new Chance();

const UNKNOWN_VERSION = "0.0.0-unknown";

describe("readPackageVersion", () => {
    let workDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "mcp-package-version-"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function manifestWith(content: string): Promise<URL> {
        const path = join(workDir, "package.json");
        await writeFile(path, content);
        return pathToFileURL(path);
    }

    describe("when no manifest is given", () => {
        it("should read the version of the package it ships in", () => {
            expect(readPackageVersion()).toBe(packageJson.version);
        });
    });

    describe("when the manifest has a version", () => {
        it("should return it", async () => {
            const version = `${chance.natural()}.${chance.natural()}.${chance.natural()}`;
            const manifest = await manifestWith(JSON.stringify({ version }));

            expect(readPackageVersion(manifest)).toBe(version);
        });
    });

    describe("when the version is a single character", () => {
        it("should return it", async () => {
            const manifest = await manifestWith(
                JSON.stringify({ version: "1" }),
            );

            expect(readPackageVersion(manifest)).toBe("1");
        });
    });

    describe("when the version cannot be read", () => {
        it("should fall back to the unknown version when the manifest does not exist", () => {
            const missing = pathToFileURL(join(workDir, "missing.json"));

            expect(readPackageVersion(missing)).toBe(UNKNOWN_VERSION);
        });

        it.each([
            ["is not valid JSON", "{ not json"],
            ["has no version", JSON.stringify({ name: chance.word() })],
            ["has an empty version", JSON.stringify({ version: "" })],
            [
                "has a version that is not a string",
                JSON.stringify({ version: 1 }),
            ],
            ["is not an object", JSON.stringify("1.2.3")],
        ])(
            "should fall back to the unknown version when the manifest %s",
            async (_name, content) => {
                const manifest = await manifestWith(content);

                expect(readPackageVersion(manifest)).toBe(UNKNOWN_VERSION);
            },
        );
    });
});
