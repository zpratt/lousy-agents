import { exec, execFile, execFileSync, execSync, fork, spawn, spawnSync } from "node:child_process";
import { execSync as execSyncBare } from "child_process";
import { exec as execBare } from "child_process";
import * as cp from "node:child_process";
import * as cpBareNS from "child_process";
// @ts-expect-error — default import for semgrep pattern coverage only
import cpDefault from "child_process";
// @ts-expect-error — default import for semgrep pattern coverage only
import cpDefaultNode from "node:child_process";

const cpCJS = require("node:child_process");
const cpCJSBare = require("child_process");

function runExecSync(cmd: string): void {
    // ruleid: detect-child-process
    execSync(cmd);
}

function runSpawn(cmd: string): void {
    // ruleid: detect-child-process
    spawn(cmd, []);
}

function runSpawnSync(cmd: string): void {
    // ruleid: detect-child-process
    spawnSync(cmd, []);
}

function runExec(cmd: string): void {
    // ruleid: detect-child-process
    exec(cmd);
}

function runViaNamespace(cmd: string): void {
    // ruleid: detect-child-process
    cp.execSync(cmd);
}

function runForkViaNamespace(cmd: string): void {
    // ruleid: detect-child-process
    cp.fork(cmd);
}

function runViaCJSNodePrefix(cmd: string): void {
    // ruleid: detect-child-process
    cpCJS.execSync(cmd);
}

function runViaCJSBare(cmd: string): void {
    // ruleid: detect-child-process
    cpCJSBare.exec(cmd);
}

function safeCJSExec(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    cpCJS.execSync("git status");
}
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

function runViaBareNS(cmd: string): void {
    // ruleid: detect-child-process
    cpBareNS.execSync(cmd);
}

function runViaDefaultBare(cmd: string): void {
    // ruleid: detect-child-process
    cpDefault.execSync(cmd);
}

function runViaDefaultNode(cmd: string): void {
    // ruleid: detect-child-process
    cpDefaultNode.exec(cmd);
}

function runExecBare(cmd: string): void {
    // ruleid: detect-child-process
    execBare(cmd);
}

function runExecSyncBare(cmd: string): void {
    // ruleid: detect-child-process
    execSyncBare(cmd);
}

const runArrowExecSync = (cmd: string): void => {
    // ruleid: detect-child-process
    execSync(cmd);
};

const runArrowSpawn = (cmd: string): void => {
    // ruleid: detect-child-process
    spawn(cmd, []);
};

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

declare function getRepoUrl(): string;
const repoUrl = getRepoUrl();

// ruleid: spawn-git-clone
spawn("git", ["clone", repoUrl]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", repoUrl]);

// ruleid: spawn-git-clone
spawn("git", ["clone", "--depth", "1", repoUrl]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", "--depth", "1", repoUrl]);

// ruleid: spawn-git-clone
spawn("git", ["clone", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
spawn("git", ["clone", "--depth", "1", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
spawnSync("git", ["clone", "--depth", "1", repoUrl, "./dest"]);

function runExecFile(cmd: string): void {
    // ruleid: detect-child-process
    execFile(cmd, []);
}

function runExecFileSync(cmd: string): void {
    // ruleid: detect-child-process
    execFileSync(cmd, []);
}

function runFork(modulePath: string): void {
    // ruleid: detect-child-process
    fork(modulePath);
}

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

// ruleid: detect-child-process
execSync(process.env.BUILD_CMD as string);

// ruleid: detect-child-process
spawn(process.env.DEPLOY_SCRIPT as string, []);
// ruleid: detect-child-process
cp.execSync(process.env.BUILD_CMD as string);
// ruleid: detect-child-process
cpCJS.exec(process.argv[2]);

// ruleid: detect-child-process
execSync(process.env["BUILD_CMD"] as string);

// ruleid: detect-child-process
execSync(process.argv[2]);
const argvSlice = process.argv.slice(2);
// todoruleid: detect-child-process
execSync(argvSlice[0]);
const env = process.env;
// todoruleid: detect-child-process
execSync(env.BUILD_CMD as string);

function safeExecWithLiteral(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    execSync("git status");
}
// todoruleid: detect-child-process
spawn("/bin/sh", ["-c", process.argv[2]]);

function safeSpawnWithLiteralArray(userInput: string): void {
    const _ = userInput;
    // ok: detect-child-process
    spawn("/bin/sh", ["-c", "echo hello"]);
}

// ok: spawn-git-clone
spawn("git", ["clone", "https://github.com/org/repo.git"]);

// ok: spawn-git-clone
spawnSync("git", ["clone", "https://github.com/org/repo.git"]);

// ok: spawn-git-clone
spawn("git", ["clone", "https://github.com/org/repo.git", "./dest"]);

// ok: spawn-git-clone
spawnSync("git", ["clone", "https://github.com/org/repo.git", "./dest"]);
declare function getDestDir(): string;
const destDir = getDestDir();

// todook: spawn-git-clone
spawn("git", ["clone", "https://github.com/org/repo.git", destDir]);

// todook: spawn-git-clone
spawnSync("git", ["clone", "https://github.com/org/repo.git", destDir]);

// ruleid: spawn-git-clone
cp.spawn("git", ["clone", repoUrl]);

// ruleid: spawn-git-clone
cp.spawnSync("git", ["clone", repoUrl]);

// ruleid: spawn-git-clone
cp.spawn("git", ["clone", repoUrl, "./dest"]);

// ruleid: spawn-git-clone
cp.spawnSync("git", ["clone", repoUrl, "./dest"]);

// ok: spawn-git-clone
cp.spawn("git", ["clone", "https://github.com/org/repo.git"]);

// ok: spawn-git-clone
cp.spawnSync("git", ["clone", "https://github.com/org/repo.git", "./dest"]);
declare function getArgs(): string[];
const dynamicArgs = getArgs();

// ok: spawn-git-clone
spawn("git", dynamicArgs);

// ok: spawn-git-clone
spawnSync("git", dynamicArgs);
