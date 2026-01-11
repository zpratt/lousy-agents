/**
 * Environment detection module.
 *
 * @deprecated This module is deprecated. Use the CLEAN architecture modules instead:
 * - Entities: src/entities/copilot-setup.ts
 * - Gateways: src/gateways/environment-gateway.ts
 */

// Re-export types from entities for backward compatibility
export type {
    DetectedEnvironment,
    VersionFile,
    VersionFileType,
} from "../entities/copilot-setup.js";

// Re-export from gateway for backward compatibility
export {
    createEnvironmentGateway,
    SUPPORTED_VERSION_FILES,
} from "../gateways/environment-gateway.js";

import { createEnvironmentGateway } from "../gateways/environment-gateway.js";

/**
 * @deprecated Use createEnvironmentGateway().detectEnvironment() instead
 */
export async function detectEnvironment(targetDir: string) {
    const gateway = createEnvironmentGateway();
    return gateway.detectEnvironment(targetDir);
}
