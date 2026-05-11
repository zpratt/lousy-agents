import { exec, execFile, execFileSync, execSync, fork, spawn, spawnSync } from "node:child_process";
import { execSync as execSyncBare } from "child_process"; // aliased — Semgrep tracks aliases; still detected
import { exec as execBare } from "child_process";
import * as cp from "node:child_process";
import * as cpBareNS from "child_process";
// Default-form imports are uncommon but valid in semgrep patterns; child_process
// is a CJS module so esModuleInterop must be enabled for this to compile, but
// semgrep parses the AST regardless of compilation outcome.
// @ts-expect-error — default import for semgrep pattern coverage only
import cpDefault from "child_process";
// @ts-expect-error — default import for semgrep pattern coverage only
import cpDefaultNode from "node:child_process";

// CJS-style namespace require — Semgrep matches $CP = require(...) against
// const/let/var declarations too (AST normalization). Fixture cases below
// prove this and prevent regressions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cpCJS = require("node:child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cpCJSBare = require("child_process");

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

function runForkViaNamespace(cmd: string): void {
    // ruleid: detect-child-process
    cp.fork(cmd);
}

// ── TRUE POSITIVES (detect-child-process — CJS require, node:child_process) ──
// Semgrep normalizes `const $CP = require(...)` to the same AST node as
// assignment, so $CP = require(...) pattern-inside matches both forms.

function runViaCJSNodePrefix(cmd: string): void {
    // ruleid: detect-child-process
    cpCJS.execSync(cmd);
}

function runViaCJSBare(cmd: string): void {
    // ruleid: detect-child-process
    cpCJSBare.exec(cmd);
}

// ── TRUE NEGATIVES (detect-child-process — CJS require with literal command) ──

function safeCJSExec(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    cpCJS.execSync("git status");
}

// ── TRUE POSITIVES (detect-child-process — global child_process variable) ─────
// The rule matches child_process.$fn(...) regardless of how the variable was bound.
// Semgrep matches on the literal identifier name 'child_process'.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const child_process = require("child_process");

function runViaGlobalChildProcess(cmd: string): void {
    // ruleid: detect-child-process
    child_process.execSync(cmd);
}

function safeGlobalChildProcess(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    child_process.execSync("git status");
}

// ── TRUE POSITIVES (detect-child-process — namespace import bare child_process)

function runViaBareNS(cmd: string): void {
    // ruleid: detect-child-process
    cpBareNS.execSync(cmd);
}

// ── TRUE POSITIVES (detect-child-process — default import child_process) ──────

function runViaDefaultBare(cmd: string): void {
    // ruleid: detect-child-process
    cpDefault.execSync(cmd);
}

function runViaDefaultNode(cmd: string): void {
    // ruleid: detect-child-process
    cpDefaultNode.exec(cmd);
}

// ── TRUE POSITIVES (detect-child-process — named import from bare child_process)

function runExecBare(cmd: string): void {
    // ruleid: detect-child-process
    execBare(cmd);
}

// Note: Semgrep tracks aliased named imports (e.g. execSync as execSyncBare)
// and will still match the aliased call. Annotated below as ruleid accordingly.

function runExecSyncBare(cmd: string): void {
    // ruleid: detect-child-process
    execSyncBare(cmd);
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

// ── TRUE POSITIVES (detect-child-process — named import fork) ────────────────
// fork() loads a module by path; a tainted path enables module injection (CWE-78).

function runFork(modulePath: string): void {
    // ruleid: detect-child-process
    fork(modulePath);
}

// ── TRUE POSITIVES (detect-child-process — reassignment taint tracking) ──────
// Ensures taint propagates correctly through reassignment (e.g. let cmd = "safe"; cmd = userInput).

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

// ── TRUE POSITIVES (detect-child-process — process.env source) ───────────────
// process.env is a primary external input surface in CLI tools.

// ruleid: detect-child-process
execSync(process.env.BUILD_CMD as string);

// ruleid: detect-child-process
spawn(process.env.DEPLOY_SCRIPT as string, []);

// Cross-source × namespace-import sink: env + cp.*
// ruleid: detect-child-process
cp.execSync(process.env.BUILD_CMD as string);

// Cross-source × CJS-require sink: argv + cpCJS.*
// ruleid: detect-child-process
cpCJS.exec(process.argv[2]);

// ── TRUE POSITIVES (detect-child-process — process.env bracket notation) ─────
// process.env[$KEY] is the bracket form; both dot and bracket access are sources.

// ruleid: detect-child-process
execSync(process.env["BUILD_CMD"] as string);

// ── TRUE POSITIVES (detect-child-process — process.argv source) ──────────────
// process.argv is the CLI argument vector; argv[2] and beyond are user-controlled.

// ruleid: detect-child-process
execSync(process.argv[2]);

// ── KNOWN GAP (detect-child-process — process.argv.slice() not tracked) ──────
// process.argv[$INDEX] is a taint source but process.argv.slice(...) is not.
// The common idiom `const args = process.argv.slice(2); execSync(args[0])` will
// NOT fire. Review such patterns manually. Documented in known-limitation.
// todoruleid: detect-child-process
const argvSlice = process.argv.slice(2);
// todoruleid: detect-child-process
execSync(argvSlice[0]);

// ── TRUE NEGATIVES (detect-child-process — safe literal string argument) ─────

function safeExecWithLiteral(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    execSync("git status");
}

// ── KNOWN GAP (detect-child-process — tainted args array, not first arg) ─────
// The rule only tracks taint in position 0 (command/path). spawn('/bin/sh', ['-c', userInput])
// will NOT fire because the first arg '/bin/sh' is a literal string. This is a
// documented limitation — review such patterns manually.
// todoruleid: detect-child-process
spawn("/bin/sh", ["-c", process.argv[2]]);

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

// ── TRUE POSITIVES (spawn-git-clone — known FP: literal URL, variable destDir) ─
// Pattern 1 ($URL as last element) binds to destDir when it is the trailing arg.
// This is a known false positive; the URL injection risk is absent, but a CWE-22
// path-traversal risk remains on destDir. The rule message and known-limitation
// field both document this. This annotation locks in current behavior so a future
// rule change that silently eliminates this detection is caught.
declare function getDestDir(): string;
const destDir = getDestDir();

// ruleid: spawn-git-clone
spawn("git", ["clone", "https://github.com/org/repo.git", destDir]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", "https://github.com/org/repo.git", destDir]);

// ── TRUE POSITIVES (spawn-git-clone — namespace-import cp.spawn forms) ────────

// ruleid: spawn-git-clone
cp.spawn("git", ["clone", repoUrl]);

// ruleid: spawn-git-clone
cp.spawnSync("git", ["clone", repoUrl]);

// ruleid: spawn-git-clone
cp.spawn("git", ["clone", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
cp.spawnSync("git", ["clone", repoUrl, "./dest"]);

// ── TRUE NEGATIVES (spawn-git-clone — namespace-import cp.spawn, literal URL) ─

// ok: spawn-git-clone
cp.spawn("git", ["clone", "https://github.com/org/repo.git"]);

// ok: spawn-git-clone
cp.spawnSync("git", ["clone", "https://github.com/org/repo.git", "./dest"]);

// ── TRUE NEGATIVES (spawn-git-clone — dynamic args array, known limitation) ───
// spawn('git', dynamicArgsArray) is NOT matched because the rule requires the
// literal 'clone' string to appear inside the array. This gap is documented in
// the known-limitation field. Review such calls manually.
declare function getArgs(): string[];
const dynamicArgs = getArgs();

// ok: spawn-git-clone
spawn("git", dynamicArgs);

// ok: spawn-git-clone
spawnSync("git", dynamicArgs);
