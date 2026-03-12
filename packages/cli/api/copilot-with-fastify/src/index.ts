import { buildApp } from "./app.js";
import { parsePort } from "./parse-port.js";

const app = buildApp();
const port = parsePort(process.env.PORT);

try {
    await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
