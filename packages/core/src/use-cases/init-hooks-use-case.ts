import type { InitHooksConfigGatewayPort } from "./init-hooks-gateway-port.js";

export interface InitHooksInput {
    rootDir: string;
    addSessionStart: boolean;
    force: boolean;
}

export interface InitHooksOutput {
    written: readonly string[];
    skipped: readonly string[];
}

export class InitHooksUseCase {
    constructor(private readonly gateway: InitHooksConfigGatewayPort) {}

    async execute(input: InitHooksInput): Promise<InitHooksOutput> {
        if (!input.rootDir || input.rootDir.trim() === "") {
            throw new Error("rootDir is required and must not be empty");
        }
        const result = await this.gateway.initHooks(input.rootDir, {
            addSessionStart: input.addSessionStart,
            force: input.force,
        });

        return {
            written: result.written,
            skipped: result.skipped,
        };
    }
}
