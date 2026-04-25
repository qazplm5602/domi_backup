// 실패 시 일정 간격으로 재시도함
// 마지막 시도까지 실패하면 마지막 에러를 그대로 throw.
export async function retry<T>(
    fn: () => Promise<T> | T,
    opts: {
        retries: number;
        waitMs: number;
        onRetry?: (error: unknown, attempt: number, total: number) => void;
    },
): Promise<T> {
    const total = opts.retries + 1;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= total; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (attempt < total) {
                opts.onRetry?.(e, attempt, total);
                await Bun.sleep(opts.waitMs);
            }
        }
    }

    throw lastErr;
}
