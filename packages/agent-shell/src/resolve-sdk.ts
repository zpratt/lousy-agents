import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolves an npm package's ESM entry point from the user's project directory.
 *
 * Bundled CLIs resolve bare specifiers relative to the bundle location, not
 * the user's working directory. This uses `createRequire` anchored at the
 * project root to locate the package, then reads its `package.json` exports
 * map to select the ESM entry that `import()` would use.
 *
 * @returns A file:// URL to the package ESM entry point, or null if not found
 */
export function resolveSdkPath(
    repoRoot: string,
    packageName: string,
): string | null {
    if (!repoRoot) return null;
    try {
        const projectRequire = createRequire(resolve(repoRoot, "package.json"));
        const cjsResolved = projectRequire.resolve(packageName);
        const esmUrl = findEsmEntry(cjsResolved, packageName);
        return esmUrl ?? pathToFileURL(cjsResolved).href;
    } catch {
        return null;
    }
}

/**
 * Walks up from a resolved module path to find the package root directory,
 * then extracts the ESM entry point from its exports map.
 */
function findEsmEntry(
    resolvedPath: string,
    packageName: string,
): string | null {
    let dir = dirname(resolvedPath);
    while (true) {
        try {
            const raw = readFileSync(join(dir, "package.json"), "utf-8");
            const pkg: unknown = JSON.parse(raw);
            if (
                typeof pkg === "object" &&
                pkg !== null &&
                (pkg as Record<string, unknown>).name === packageName
            ) {
                const esmEntry = extractEsmEntry(pkg);
                const full = resolve(dir, esmEntry);
                try {
                    return pathToFileURL(realpathSync(full)).href;
                } catch {
                    return null;
                }
            }
        } catch {
            /* no package.json at this level */
        }
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * Extracts the ESM entry point from a parsed package.json object.
 */
function extractEsmEntry(pkgJson: unknown): string {
    if (typeof pkgJson === "object" && pkgJson !== null) {
        const pkg = pkgJson as Record<string, unknown>;
        const esmPath = resolveExportsImportEntry(pkg.exports);
        if (esmPath) return esmPath;

        if (typeof pkg.main === "string" && pkg.main.length > 0)
            return pkg.main;
    }
    return "index.js";
}

/**
 * Navigates the exports map to find the ESM entry. Supports string-shaped
 * exports, string-valued `exports["."]`, `exports["."].import` (string),
 * `exports["."].import.default`, and the sugar form where condition keys
 * (`import`/`require`) appear directly on the exports object.
 */
function resolveExportsImportEntry(exports: unknown): string | null {
    if (typeof exports === "string") return exports;
    if (typeof exports !== "object" || exports === null) return null;
    const exportsMap = exports as Record<string, unknown>;

    const dotEntry = exportsMap["."];
    if (typeof dotEntry === "string") return dotEntry;

    const conditionSource =
        typeof dotEntry === "object" &&
        dotEntry !== null &&
        !Array.isArray(dotEntry)
            ? (dotEntry as Record<string, unknown>)
            : exportsMap;

    const importEntry = conditionSource.import;
    if (typeof importEntry === "string") return importEntry;
    if (typeof importEntry === "object" && importEntry !== null) {
        const importMap = importEntry as Record<string, unknown>;
        if (typeof importMap.default === "string") return importMap.default;
    }
    return null;
}
