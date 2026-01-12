/**
 * MCP tool handler for discovering environment configuration files.
 */

import { createEnvironmentGateway, fileExists } from "../../gateways/index.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Discovers environment configuration files (mise.toml, version files) in a directory.
 */
export const discoverEnvironmentHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const environmentGateway = createEnvironmentGateway();
    const environment = await environmentGateway.detectEnvironment(dir);

    return successResponse({
        hasMise: environment.hasMise,
        versionFiles: environment.versionFiles.map((vf) => ({
            type: vf.type,
            filename: vf.filename,
            version: vf.version,
        })),
        message: environment.hasMise
            ? "Found mise.toml - mise will manage all tool versions"
            : environment.versionFiles.length > 0
              ? `Found ${environment.versionFiles.length} version file(s)`
              : "No environment configuration files found",
    });
};
