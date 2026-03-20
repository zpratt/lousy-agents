import { isAbsolute, relative, sep } from "node:path";

export function isWithinProjectRoot(
    resolvedPath: string,
    projectRoot: string,
): boolean {
    if (resolvedPath === projectRoot) return true;
    const rel = relative(projectRoot, resolvedPath);
    // Outside the root if: empty, exact "..", starts with "../" (or "..\"), or is absolute (different drive on Windows)
    return (
        rel !== "" &&
        rel !== ".." &&
        !rel.startsWith(`..${sep}`) &&
        !isAbsolute(rel)
    );
}
