#!/usr/bin/env node

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SHEBANG = "#!/usr/bin/env node\n";
const DIST_DIR = join(import.meta.dirname, "..", "dist");

const files = ["index.js", "mcp-server.js"];

for (const file of files) {
    const filePath = join(DIST_DIR, file);
    const content = readFileSync(filePath, "utf-8");

    if (!content.startsWith("#!")) {
        writeFileSync(filePath, SHEBANG + content);
    }

    chmodSync(filePath, 0o755);
}

console.log("Shebang added to bundle files successfully.");
