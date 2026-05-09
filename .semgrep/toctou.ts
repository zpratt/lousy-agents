import fs from "node:fs";
import { existsSync, readFileSync } from "node:fs";

// ── TRUE POSITIVES (avoid-exists-sync) ──────────────────────────────────────

// ruleid: avoid-exists-sync
fs.existsSync("/tmp/config.json");

// ruleid: avoid-exists-sync
existsSync("/tmp/config.json");

// ── TRUE POSITIVES (toctou-exists-sync-read — if form) ──────────────────────

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

// ── TRUE POSITIVES (toctou-exists-sync-read — while form) ───────────────────

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

// ── KNOWN LIMITATION: mixed import styles not detected by toctou rule ────────
// The $FS metavariable must resolve identically in both calls.
// avoid-exists-sync still fires on the existsSync call.

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

// ── TRUE NEGATIVES (safe try/catch pattern — no TOCTOU) ─────────────────────

// ok: toctou-exists-sync-read
// ok: avoid-exists-sync
function safeRead(path: string): string | null {
    try {
        return readFileSync(path, "utf-8");
    } catch {
        return null;
    }
}
