import { FifoQueue } from "./fifo-queue.js";

/**
 * Returns a function that runs asynchronous tasks, at most `limit` at a time.
 * A task over the limit waits for a running one to finish, and gets its slot
 * at once when it does, so a burst of tasks cannot start more work than the
 * limit however many were queued.
 */
export function limitConcurrency(
    limit: number,
): <T>(task: () => Promise<T>) => Promise<T> {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError(
            `The concurrency limit must be a whole number of at least 1, got ${limit}`,
        );
    }

    let running = 0;
    const waiting = new FifoQueue<() => void>();

    function release(): void {
        const next = waiting.shift();
        if (next === undefined) {
            running -= 1;
            return;
        }
        next();
    }

    return async (task) => {
        if (running < limit) {
            running += 1;
        } else {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }
        try {
            return await task();
        } finally {
            release();
        }
    };
}
