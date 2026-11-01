import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUncommittedPaths } from "./uncommitted-changes.js";

const execFileAsync = promisify(execFile);

const MAX_STATUS_BYTES = 16 * 1024 * 1024;

/**
 * Paths under packages/ that git reports as modified, staged, deleted or
 * untracked. The notice built from this is informational, so a failure to ask
 * git yields no paths: coach needs git as well and fails the gate on its own
 * if git is unusable.
 */
export async function listUncommittedPackageChanges(
    cwd: string = process.cwd(),
): Promise<string[]> {
    try {
        const { stdout } = await execFileAsync(
            "git",
            [
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
                "--",
                "packages",
            ],
            { cwd, maxBuffer: MAX_STATUS_BYTES },
        );
        return parseUncommittedPaths(stdout);
    } catch {
        return [];
    }
}
