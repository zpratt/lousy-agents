export interface LogOptions {
    last?: string;
    actor?: string;
    failures: boolean;
    script?: string;
    listSessions: boolean;
    json: boolean;
    errors?: string[];
}

export function parseLogArgs(args: string[]): LogOptions {
    const options: LogOptions = {
        failures: false,
        listSessions: false,
        json: false,
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        switch (arg) {
            case "--last":
                if (i + 1 < args.length) {
                    options.last = args[++i];
                } else {
                    options.errors = options.errors ?? [];
                    options.errors.push(
                        "--last requires a value (e.g., 30m, 1h, 1d)",
                    );
                }
                break;
            case "--actor":
                if (i + 1 < args.length) {
                    options.actor = args[++i];
                } else {
                    options.errors = options.errors ?? [];
                    options.errors.push("--actor requires a value");
                }
                break;
            case "--failures":
                options.failures = true;
                break;
            case "--script":
                if (i + 1 < args.length) {
                    options.script = args[++i];
                } else {
                    options.errors = options.errors ?? [];
                    options.errors.push("--script requires a value");
                }
                break;
            case "--list-sessions":
                options.listSessions = true;
                break;
            case "--json":
                options.json = true;
                break;
        }

        i++;
    }

    return options;
}
