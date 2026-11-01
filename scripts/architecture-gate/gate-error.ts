/**
 * A reason the architecture gate cannot give a trustworthy answer: its inputs
 * are unusable, or coach did not report what the gate needs. The gate fails
 * closed on every one of these.
 */
export class GateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GateError";
    }
}
