import { isAbsolute, relative, resolve, sep } from "node:path";

export function isWithinProjectRoot(
    resolvedPath: string,
    projectRoot: string,
): boolean {
    const normalizedPath = resolve(resolvedPath);
    const normalizedRoot = resolve(projectRoot);
    if (normalizedPath === normalizedRoot) return true;
    const rel = relative(normalizedRoot, normalizedPath);
    // Outside the root if: empty, exact "..", starts with "../" (or "..\"), or is absolute (different drive on Windows)
    return (
        rel !== "" &&
        rel !== ".." &&
        !rel.startsWith(`..${sep}`) &&
        !isAbsolute(rel)
    );
}
