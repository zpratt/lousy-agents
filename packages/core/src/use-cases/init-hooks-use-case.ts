import type { InitHooksConfigGatewayPort } from "../gateways/init-hooks-config-gateway.js";

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
