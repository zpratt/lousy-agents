/**
 * Directories lint and doctor both leave out of discovery.
 * Pure path rules. No filesystem I/O.
 */

export const BUILD_OUTPUT_DIRECTORY_NAMES = ["dist"] as const;

const NAMED_SKIP_DIRECTORIES = new Set<string>([
    "node_modules",
    ".git",
    ...BUILD_OUTPUT_DIRECTORY_NAMES,
]);

/**
 * True when `relativePath` is a fixture directory met below the scan root.
 * The root itself is not passed here. When the relative path has no parent
 * segment, `rootDirectoryName` is that parent, so a scan started in a
 * directory named `tests` still skips its `fixtures` child.
 *
 * `tests/fixtures` is the parent and child, not every directory named
 * `fixtures`, so `src/fixtures` stays in the scan. `__fixtures__` and
 * `testdata` are names at any depth.
 */
export function isFixtureDirectory(
    relativePath: string,
    rootDirectoryName: string,
): boolean {
    const segments = relativePath.split("/");
    const name = segments[segments.length - 1] ?? "";
    if (name === "__fixtures__" || name === "testdata") {
        return true;
    }
    const parent =
        segments.length >= 2
            ? segments[segments.length - 2]
            : rootDirectoryName;
    return parent === "tests" && name === "fixtures";
}

/**
 * True when a discovered directory should not be entered. Callers that use
 * `walkRepository` pass `isFixtureDirectory` as `skipDirectory` and add
 * `BUILD_OUTPUT_DIRECTORY_NAMES` to `skipDirectoryNames` instead.
 */
export function isSkippedDiscoveryDirectory(
    relativePath: string,
    rootDirectoryName: string,
): boolean {
    const segments = relativePath.split("/");
    const name = segments[segments.length - 1] ?? "";
    return (
        NAMED_SKIP_DIRECTORIES.has(name) ||
        isFixtureDirectory(relativePath, rootDirectoryName)
    );
}
