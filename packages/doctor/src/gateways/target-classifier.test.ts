import {
    lstat,
    mkdir,
    mkdtemp,
    open,
    realpath,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
    NoFollowFileHandle,
    NoFollowFsPort,
} from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTargetClassifier } from "./target-classifier.js";

const DISTINCT_TARGETS = 200;
const REPEATED_CHECKS = 5;
const DESCRIPTOR_SAFE_LIMIT = 64;

interface Tally {
    readonly opens: Map<string, number>;
    openHandles: number;
    peakOpenHandles: number;
}

function countingFs(tally: Tally): NoFollowFsPort {
    return {
        open: async (path, flags) => {
            tally.opens.set(path, (tally.opens.get(path) ?? 0) + 1);
            tally.openHandles += 1;
            tally.peakOpenHandles = Math.max(
                tally.peakOpenHandles,
                tally.openHandles,
            );
            await new Promise((resolve) => setTimeout(resolve, 1));
            const handle = await open(path, flags);
            const counted: NoFollowFileHandle = {
                stat: () => handle.stat(),
                read: (buffer, offset, length, position) =>
                    handle.read(buffer, offset, length, position),
                close: async () => {
                    tally.openHandles -= 1;
                    await handle.close();
                },
            };
            return counted;
        },
        lstat: (path) => lstat(path),
    };
}

function newTally(): Tally {
    return { opens: new Map(), openHandles: 0, peakOpenHandles: 0 };
}

describe("createTargetClassifier", () => {
    let rootReal: string;

    beforeEach(async () => {
        rootReal = await realpath(
            await mkdtemp(join(tmpdir(), "target-classifier-")),
        );
    });

    afterEach(async () => {
        await rm(rootReal, { recursive: true, force: true });
    });

    describe("when the same target is checked again", () => {
        it("should open it once and give every caller the same verdict", async () => {
            const target = join(rootReal, "shared.md");
            await writeFile(target, "shared\n");
            const tally = newTally();
            const classify = createTargetClassifier(rootReal, {
                fs: countingFs(tally),
            });

            const verdicts = await Promise.all(
                Array.from({ length: REPEATED_CHECKS }, () => classify(target)),
            );

            expect(tally.opens.get(target)).toBe(1);
            expect(verdicts).toEqual(
                Array.from({ length: REPEATED_CHECKS }, () => ({
                    ok: true,
                    real: "shared.md",
                })),
            );
        });

        it("should remember a target that was refused as well", async () => {
            const target = join(rootReal, "directory.md");
            await mkdir(target);
            const classify = createTargetClassifier(rootReal);

            const first = await classify(target);
            const second = await classify(target);

            expect(first).toEqual({ ok: false, status: "not-regular" });
            expect(second).toBe(first);
        });
    });

    describe("when many distinct targets are checked at once", () => {
        it("should keep no more files open at a time than the limit, so the process does not run out of descriptors", async () => {
            const targets = await Promise.all(
                Array.from({ length: DISTINCT_TARGETS }, async (_, index) => {
                    const target = join(rootReal, `t${index}.md`);
                    await writeFile(target, `${index}\n`);
                    return target;
                }),
            );
            const tally = newTally();
            const classify = createTargetClassifier(rootReal, {
                fs: countingFs(tally),
            });

            const verdicts = await Promise.all(targets.map(classify));

            expect(tally.peakOpenHandles).toBeLessThanOrEqual(
                DESCRIPTOR_SAFE_LIMIT,
            );
            expect(tally.peakOpenHandles).toBeGreaterThan(1);
            expect(verdicts.every((verdict) => verdict.ok)).toBe(true);
        });

        it("should honor a smaller limit given to it", async () => {
            const targets = await Promise.all(
                Array.from({ length: 20 }, async (_, index) => {
                    const target = join(rootReal, `s${index}.md`);
                    await writeFile(target, `${index}\n`);
                    return target;
                }),
            );
            const tally = newTally();
            const classify = createTargetClassifier(rootReal, {
                fs: countingFs(tally),
                maxConcurrent: 2,
            });

            await Promise.all(targets.map(classify));

            expect(tally.peakOpenHandles).toBe(2);
        });
    });
});
