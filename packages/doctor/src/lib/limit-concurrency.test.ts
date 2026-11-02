import { describe, expect, it } from "vitest";
import { limitConcurrency } from "./limit-concurrency.js";

const TASK_COUNT = 12;
const LIMIT = 3;
const QUEUED_TASK_COUNT = 200_000;
const BUDGET_MS = 3_000;
const BUDGET_RUNS = 3;
const TEST_TIMEOUT_MS = 180_000;

async function fastestDrainMs(): Promise<number> {
    const durations: number[] = [];
    for (let attempt = 0; attempt < BUDGET_RUNS; attempt += 1) {
        const run = limitConcurrency(1);
        const start = performance.now();
        await Promise.all(
            Array.from({ length: QUEUED_TASK_COUNT }, () =>
                run(async () => undefined),
            ),
        );
        durations.push(performance.now() - start);
    }
    return Math.min(...durations);
}

function trackedTask(
    tracker: { active: number; peak: number },
    value: number,
): () => Promise<number> {
    return async () => {
        tracker.active += 1;
        tracker.peak = Math.max(tracker.peak, tracker.active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        tracker.active -= 1;
        return value;
    };
}

describe("limitConcurrency", () => {
    it("should never run more tasks at once than the limit", async () => {
        const tracker = { active: 0, peak: 0 };
        const run = limitConcurrency(LIMIT);

        await Promise.all(
            Array.from({ length: TASK_COUNT }, (_, index) =>
                run(trackedTask(tracker, index)),
            ),
        );

        expect(tracker.peak).toBe(LIMIT);
    });

    it("should give each caller the result of its own task", async () => {
        const tracker = { active: 0, peak: 0 };
        const run = limitConcurrency(LIMIT);

        const results = await Promise.all(
            Array.from({ length: TASK_COUNT }, (_, index) =>
                run(trackedTask(tracker, index)),
            ),
        );

        expect(results).toEqual(
            Array.from({ length: TASK_COUNT }, (_, i) => i),
        );
    });

    it("should free the slot of a task that fails, so later tasks still run", async () => {
        const run = limitConcurrency(1);
        const failing = run(async () => {
            throw new Error("failed");
        });
        const later = run(async () => "ran");

        await expect(failing).rejects.toThrow("failed");
        await expect(later).resolves.toBe("ran");
    });

    it("should run tasks one at a time when the limit is one", async () => {
        const tracker = { active: 0, peak: 0 };
        const run = limitConcurrency(1);

        await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                run(trackedTask(tracker, index)),
            ),
        );

        expect(tracker.peak).toBe(1);
    });

    it("should not let a task started as another finishes run beside the one that was waiting", async () => {
        const tracker = { active: 0, peak: 0 };
        const run = limitConcurrency(1);

        const first = run(trackedTask(tracker, 1));
        const waiting = run(trackedTask(tracker, 2));
        const startedAfterFirst = first.then(() =>
            run(trackedTask(tracker, 3)),
        );
        await Promise.all([first, waiting, startedAfterFirst]);

        expect(tracker.peak).toBe(1);
    });

    it.each([0, -1, Number.NaN, 1.5])(
        "should refuse a limit of %s, which could never run a task",
        (limit) => {
            expect(() => limitConcurrency(limit)).toThrow(RangeError);
        },
    );

    describe("when a great many tasks are waiting for a slot", () => {
        it(
            "should hand every slot over in time proportional to the number of tasks, not its square",
            async () => {
                expect(await fastestDrainMs()).toBeLessThan(BUDGET_MS);
            },
            TEST_TIMEOUT_MS,
        );
    });
});
