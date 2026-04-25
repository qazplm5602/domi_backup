import type { Hook } from "@src/hook/hook.ts";

export async function callHook(
    hooks: Hook[],
    fn: (h: Hook) => Promise<void> | undefined,
): Promise<void> {
    for (const hook of hooks) {
        await fn(hook);
    }
}
