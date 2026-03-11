export function isWithinProjectRoot(
    resolvedPath: string,
    projectRoot: string,
): boolean {
    const normalizedPath = resolvedPath.endsWith("/")
        ? resolvedPath
        : `${resolvedPath}/`;
    const normalizedRoot = projectRoot.endsWith("/")
        ? projectRoot
        : `${projectRoot}/`;
    return (
        normalizedPath.startsWith(normalizedRoot) ||
        resolvedPath === projectRoot
    );
}
