import fs from "node:fs";
import { existsSync, readFileSync } from "node:fs";

// ruleid: avoid-exists-sync
fs.existsSync("/tmp/config.json");

// ruleid: avoid-exists-sync
existsSync("/tmp/config.json");

// ruleid: toctou-exists-sync-read, avoid-exists-sync
if (fs.existsSync("/tmp/config.json")) {
    const data = fs.readFileSync("/tmp/config.json", "utf-8");
    console.log(data);
}

// ruleid: toctou-exists-sync-read, avoid-exists-sync
if (existsSync("/tmp/config.json")) {
    const data = readFileSync("/tmp/config.json", "utf-8");
    console.log(data);
}

const filePath = "/tmp/config.json";

// ruleid: toctou-exists-sync-read, avoid-exists-sync
while (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, "utf-8");
    console.log(data);
    break;
}

// ruleid: toctou-exists-sync-read, avoid-exists-sync
while (existsSync(filePath)) {
    const data = readFileSync(filePath, "utf-8");
    console.log(data);
    break;
}

// ok: toctou-exists-sync-read
// ruleid: avoid-exists-sync
if (fs.existsSync("/tmp/config.json")) {
    const data = readFileSync("/tmp/config.json", "utf-8");
    console.log(data);
}

// ok: toctou-exists-sync-read
// ruleid: avoid-exists-sync
if (existsSync("/tmp/config.json")) {
    const data = fs.readFileSync("/tmp/config.json", "utf-8");
    console.log(data);
}

const paths = ["/tmp/a.json", "/tmp/b.json"];
// ok: toctou-exists-sync-read
// ruleid: avoid-exists-sync
for (let i = 0; fs.existsSync(paths[i]); i++) {
    const data = fs.readFileSync(paths[i], "utf-8");
    console.log(data);
    break;
}

// ok: toctou-exists-sync-read
// ok: avoid-exists-sync
function safeRead(path: string): string | null {
    try {
        return readFileSync(path, "utf-8");
    } catch {
        return null;
    }
}
