/**
 * Orders strings by UTF-16 code unit.
 *
 * Unlike `localeCompare`, the result does not depend on the machine's locale
 * or ICU data, so anything sorted with it (directory entries, inventory
 * paths) comes out in the same order on every machine and in CI.
 */
export function compareCodeUnits(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
}
