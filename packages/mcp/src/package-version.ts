/**
 * Reads the version of the installed @lousy-agents/mcp package.
 *
 * The release process writes the published version into package.json after
 * the build, so the version is read at runtime instead of being bundled.
 * Both src/ (tests) and dist/ (published bundle) sit one level below the
 * package root.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

const PackageManifestSchema = z.object({ version: z.string().min(1) });

const UNKNOWN_VERSION = "0.0.0-unknown";

export function readPackageVersion(): string {
    try {
        const manifestUrl = new URL("../package.json", import.meta.url);
        const manifest: unknown = JSON.parse(
            readFileSync(manifestUrl, "utf-8"),
        );
        return PackageManifestSchema.parse(manifest).version;
    } catch {
        return UNKNOWN_VERSION;
    }
}
