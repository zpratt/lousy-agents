import { exec, execFile, execFileSync, execSync, spawn, spawnSync } from "node:child_process";
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

// ── TRUE POSITIVES (detect-child-process — arrow function) ───────────────────
// Semgrep taint normalizes arrow functions to function declarations internally.

const runArrowExecSync = (cmd: string): void => {
    // ruleid: detect-child-process
    execSync(cmd);
};

const runArrowSpawn = (cmd: string): void => {
    // ruleid: detect-child-process
    spawn(cmd, []);
};

// ── TRUE POSITIVES (detect-child-process — class method) ─────────────────────
// Semgrep taint normalizes class/object methods to function declarations.

class ShellRunner {
    run(cmd: string): void {
        // ruleid: detect-child-process
        execSync(cmd);
    }
}

const shellObj = {
    run(cmd: string): void {
        // ruleid: detect-child-process
        execSync(cmd);
    },
};

// ── TRUE POSITIVES (spawn-git-clone — spawn with variable URL, no dir) ───────

declare function getRepoUrl(): string;
const repoUrl = getRepoUrl();

// ruleid: spawn-git-clone
spawn("git", ["clone", repoUrl]);

// ── TRUE POSITIVES (spawn-git-clone — spawnSync with variable URL, no dir) ───

// ruleid: spawn-git-clone
spawnSync("git", ["clone", repoUrl]);

// ── TRUE POSITIVES (spawn-git-clone — options before variable URL) ────────────

// ruleid: spawn-git-clone
spawn("git", ["clone", "--depth", "1", repoUrl]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", "--depth", "1", repoUrl]);

// ── TRUE POSITIVES (spawn-git-clone — variable URL, literal dest dir) ────────

// ruleid: spawn-git-clone
spawn("git", ["clone", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", repoUrl, "./dest"]);

// ── TRUE POSITIVES (spawn-git-clone — options, variable URL, literal dest dir)

// ruleid: spawn-git-clone
spawn("git", ["clone", "--depth", "1", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", "--depth", "1", repoUrl, "./dest"]);

// ── TRUE POSITIVES (detect-child-process — named import execFile) ────────────

function runExecFile(cmd: string): void {
    // ruleid: detect-child-process
    execFile(cmd, []);
}

// ── TRUE POSITIVES (detect-child-process — named import execFileSync) ────────

function runExecFileSync(cmd: string): void {
    // ruleid: detect-child-process
    execFileSync(cmd, []);
}

// ── TRUE POSITIVES (detect-child-process — reassignment bypass regression) ───
// pattern-not-inside filters were removed so taint correctly tracks reassignment.

function runReassigned(userInput: string): void {
    let cmd = "safe";
    cmd = userInput;
    // ruleid: detect-child-process
    execSync(cmd);
}

function runConditionalReassign(userInput: string, flag: boolean): void {
    let cmd = "safe";
    if (flag) cmd = userInput;
    // ruleid: detect-child-process
    execSync(cmd);
}

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

// ok: spawn-git-clone
spawn("git", ["clone", "https://github.com/org/repo.git", "./dest"]);

// ok: spawn-git-clone
spawnSync("git", ["clone", "https://github.com/org/repo.git", "./dest"]);
