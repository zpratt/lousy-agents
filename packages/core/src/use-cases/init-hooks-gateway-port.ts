export interface InitHooksConfig {
    readonly addSessionStart: boolean;
    readonly force: boolean;
}

export interface InitHooksResult {
    readonly written: readonly string[];
    readonly skipped: readonly string[];
}

export interface InitHooksConfigGatewayPort {
    initHooks(
        rootDir: string,
        config: InitHooksConfig,
    ): Promise<InitHooksResult>;
}
