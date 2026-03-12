const defaultPort = 3000;
const minUnprivilegedPort = 1024;
const maxPort = 65535;

export function parsePort(value: string | undefined): number {
    if (value === undefined || value === "") {
        return defaultPort;
    }
    const parsed = Number(value);
    if (
        !Number.isInteger(parsed) ||
        parsed < minUnprivilegedPort ||
        parsed > maxPort
    ) {
        process.stderr.write(
            `Invalid PORT "${value}", using default ${defaultPort}\n`,
        );
        return defaultPort;
    }
    return parsed;
}
