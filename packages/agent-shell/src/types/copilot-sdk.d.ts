/**
 * Ambient module declaration for the optional `@github/copilot-sdk` peer
 * dependency (see packages/agent-shell/package.json `peerDependencies` /
 * `peerDependenciesMeta`). The package is intentionally NOT installed —
 * it is loaded dynamically at runtime and its absence is handled
 * gracefully (see enhanceWithCopilot in use-cases/copilot-enhance.ts).
 *
 * This declaration exists only so the static-literal
 * `import("@github/copilot-sdk")` fallback path typechecks under
 * strict mode without resorting to `as any`. Keep the shape limited to
 * what enhanceWithCopilot actually uses.
 */
declare module "@github/copilot-sdk" {
    interface CopilotSession {
        sendAndWait(input: {
            prompt: string;
        }): Promise<{ data?: unknown } | undefined>;
        disconnect(): Promise<void>;
    }

    export class CopilotClient {
        start(): Promise<void>;
        stop(): Promise<void>;
        createSession(
            options: Record<string, unknown>,
        ): Promise<CopilotSession>;
    }

    export function defineTool(
        name: string,
        config: {
            description: string;
            parameters: Record<string, unknown>;
            handler: (args: Record<string, string>) => Promise<unknown>;
            skipPermission?: boolean;
        },
    ): unknown;

    export function approveAll(...args: unknown[]): unknown;
}
