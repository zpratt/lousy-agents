import Chance from "chance";
import { describe, expect, it } from "vitest";
import { FifoQueue } from "./fifo-queue.js";

const chance = new Chance();

const ITEM_COUNTS = [5_000, 10_000];
const MAX_STEPS_PER_ITEM = 4;

function stepsToPassThrough(itemCount: number): number {
    let steps = 0;
    const queue = new FifoQueue<number>((counted) => {
        steps += counted;
    });
    for (let item = 0; item < itemCount; item += 1) {
        queue.push(item);
    }
    for (let item = 0; item < itemCount; item += 1) {
        queue.shift();
    }
    return steps;
}

describe("FifoQueue", () => {
    it("should hand items back in the order they were added", () => {
        const items = chance.n(chance.word, 5);
        const queue = new FifoQueue<string>();
        for (const item of items) {
            queue.push(item);
        }

        const taken = items.map(() => queue.shift());

        expect(taken).toEqual(items);
    });

    it("should have nothing to hand back when it is empty", () => {
        expect(new FifoQueue<string>().shift()).toBeUndefined();
    });

    it("should keep the order when items are added between takes", () => {
        const [first, second, third] = chance.n(chance.word, 3);
        const queue = new FifoQueue<string>();
        queue.push(first as string);
        queue.push(second as string);
        const taken = [queue.shift()];
        queue.push(third as string);
        taken.push(queue.shift(), queue.shift());

        expect(taken).toEqual([first, second, third]);
    });

    it("should work again after it has been emptied", () => {
        const [before, after] = chance.n(chance.word, 2);
        const queue = new FifoQueue<string>();
        queue.push(before as string);
        queue.shift();
        queue.push(after as string);

        expect([queue.shift(), queue.shift()]).toEqual([after, undefined]);
    });

    it("should hand back a falsy item rather than treat it as the end", () => {
        const queue = new FifoQueue<number>();
        queue.push(0);
        queue.push(1);

        expect([queue.shift(), queue.shift(), queue.shift()]).toEqual([
            0,
            1,
            undefined,
        ]);
    });

    describe("when a great many items wait before any is taken", () => {
        it.each(ITEM_COUNTS)(
            "should take no more than a few steps for each of %i items, so each take costs the same however many wait",
            (itemCount) => {
                expect(stepsToPassThrough(itemCount)).toBeLessThanOrEqual(
                    itemCount * MAX_STEPS_PER_ITEM,
                );
            },
        );

        it("should take about twice the steps for twice the items", () => {
            const [few, many] = ITEM_COUNTS.map(stepsToPassThrough);

            expect((many as number) / (few as number)).toBeLessThan(2.5);
        });

        it("should still hand the items back in order after it has dropped the ones already taken", () => {
            const queue = new FifoQueue<number>();
            const items = Array.from({ length: 1_000 }, (_, index) => index);
            for (const item of items) {
                queue.push(item);
            }

            const taken = items.map(() => queue.shift());

            expect(taken).toEqual(items);
        });
    });
});
