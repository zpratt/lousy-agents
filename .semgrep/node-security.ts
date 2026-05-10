import { exec, execSync, spawn, spawnSync } from "node:child_process";
import * as cp from "node:child_process";

// ── TRUE POSITIVES (detect-child-process — named import execSync) ─────────────

function runExecSync(cmd: string): void {
    // ruleid: detect-child-process
    execSync(cmd);
}

// ── TRUE POSITIVES (detect-child-process — named import spawn) ───────────────

function runSpawn(cmd: string): void {
    // ruleid: detect-child-process
    spawn(cmd, []);
}

// ── TRUE POSITIVES (detect-child-process — named import spawnSync) ───────────

function runSpawnSync(cmd: string): void {
    // ruleid: detect-child-process
    spawnSync(cmd, []);
}

// ── TRUE POSITIVES (detect-child-process — named import exec) ────────────────

function runExec(cmd: string): void {
    // ruleid: detect-child-process
    exec(cmd);
}

// ── TRUE POSITIVES (detect-child-process — namespace import node:child_process)

function runViaNamespace(cmd: string): void {
    // ruleid: detect-child-process
    cp.execSync(cmd);
}

// ── TRUE POSITIVES (spawn-git-clone — spawn with variable URL) ───────────────

declare function getRepoUrl(): string;
const repoUrl = getRepoUrl();

// ruleid: spawn-git-clone
spawn("git", ["clone", repoUrl]);

// ── TRUE POSITIVES (spawn-git-clone — spawnSync with variable URL) ───────────

// ruleid: spawn-git-clone
spawnSync("git", ["clone", repoUrl]);

// ── TRUE NEGATIVES (detect-child-process — safe literal string argument) ─────

function safeExecWithLiteral(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    execSync("git status");
}

function safeSpawnWithLiteralArray(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    spawn("/bin/sh", ["-c", "echo hello"]);
}

// ── TRUE NEGATIVES (spawn-git-clone — safe literal clone URL) ────────────────

// ok: spawn-git-clone
spawn("git", ["clone", "https://github.com/org/repo.git"]);

// ok: spawn-git-clone
spawnSync("git", ["clone", "https://github.com/org/repo.git"]);
