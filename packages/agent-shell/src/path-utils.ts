import { isAbsolute, relative } from "node:path";

export function isWithinProjectRoot(
    resolvedPath: string,
    projectRoot: string,
): boolean {
    if (resolvedPath === projectRoot) return true;
    const rel = relative(projectRoot, resolvedPath);
    // Outside the root if: empty, starts with "..", or is absolute (different drive on Windows)
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
