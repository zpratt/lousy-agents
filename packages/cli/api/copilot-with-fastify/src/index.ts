import { buildApp } from "./app.js";

const defaultPort = 3000;
const minUnprivilegedPort = 1024;
const maxPort = 65535;

function parsePort(value: string | undefined): number {
    if (value === undefined || value === "") {
        return defaultPort;
    }
    const parsed = Number(value);
    if (
        !Number.isInteger(parsed) ||
        parsed < minUnprivilegedPort ||
        parsed > maxPort
    ) {
        return defaultPort;
    }
    return parsed;
}

const app = buildApp();
const port = parsePort(process.env.PORT);

try {
    await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
