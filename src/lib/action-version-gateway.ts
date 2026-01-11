/**
 * Action version gateway module.
 *
 * @deprecated This module is deprecated. Use src/gateways/action-version-gateway.ts instead.
 */

// Re-export everything from the new location for backward compatibility
export {
    type ActionVersionGateway,
    createActionVersionGateway,
    KNOWN_ACTIONS,
    LocalActionVersionGateway,
} from "../gateways/action-version-gateway.js";
