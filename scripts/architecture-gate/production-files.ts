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

const SOURCE_FOLDER = /^packages\/[^/]+\/src\//;
// tsc and Biome take any letter case for a script extension, and coach reads
// only the lowercase `.ts` and `.tsx`, so the match is case-insensitive and
// the exception is not.
const SCRIPT_EXTENSION = /\.[cm]?[jt]sx?$/i;
const READ_BY_COACH = /\.tsx?$/;

/**
 * Whether a tracked path is a script under a workspace package's `src` folder
 * that coach 0.12.0 does not analyze: `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`
 * or `.jsx`, or any of them in another letter case (`.TS`, `.mJs`). Neither
 * the layer rules nor the policy tests ever see such a file, while tsc and
 * Biome accept it, so it would hide its imports. Only script extensions
 * count: a JSON or markdown asset under `src` is no script, and a declaration
 * file (`.d.ts`) ends in `.ts`.
 */
export function isScriptCoachDoesNotRead(path: string): boolean {
    return (
        SOURCE_FOLDER.test(path) &&
        SCRIPT_EXTENSION.test(path) &&
        !READ_BY_COACH.test(path)
    );
}
