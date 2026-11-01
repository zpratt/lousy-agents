const WORKSPACE_SOURCE = /^packages\/[^/]+\/src\/.+\.tsx?$/;
const NOT_PRODUCTION = /\.(?:d|test|spec)\.tsx?$/;

/**
 * Whether a tracked path is TypeScript that ships from a workspace package's
 * `src` folder: the files the layering policy has to account for. Tests and
 * declaration files are not production code, and scaffold templates live
 * outside `src`.
 */
export function isProductionSourceFile(path: string): boolean {
    return WORKSPACE_SOURCE.test(path) && !NOT_PRODUCTION.test(path);
}
