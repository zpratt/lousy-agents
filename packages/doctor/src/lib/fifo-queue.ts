/** Counts the steps a queue takes; a test uses it to check the cost per item. */
export type CountSteps = (steps: number) => void;

const ignoreSteps: CountSteps = () => undefined;

/**
 * A first-in, first-out queue whose take costs the same however many items
 * wait. `Array.shift` moves every remaining item on each call, so a queue of
 * n items costs n squared to drain. This queue moves a read position instead,
 * and drops the items already taken only when they are at least half of what
 * it holds, so the copying across a whole drain stays within the number of
 * items.
 */
export class FifoQueue<T> {
    private items: Array<T | undefined> = [];
    private head = 0;

    constructor(private readonly countSteps: CountSteps = ignoreSteps) {}

    push(item: T): void {
        this.countSteps(1);
        this.items.push(item);
    }

    shift(): T | undefined {
        this.countSteps(1);
        if (this.head >= this.items.length) {
            return undefined;
        }
        const item = this.items[this.head];
        this.items[this.head] = undefined;
        this.head += 1;
        this.dropTakenItems();
        return item;
    }

    private dropTakenItems(): void {
        if (this.head === this.items.length) {
            this.items = [];
            this.head = 0;
            return;
        }
        if (this.head * 2 >= this.items.length) {
            this.countSteps(this.items.length - this.head);
            this.items = this.items.slice(this.head);
            this.head = 0;
        }
    }
}
