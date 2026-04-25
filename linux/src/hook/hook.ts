import { createLogger } from "@src/util/logger.ts";
import type { Context } from "@src/context.ts";

export abstract class Hook {
    protected log = createLogger(this.constructor.name);

    constructor(protected readonly ctx: Context) {}

    public onStart?(): Promise<void>
    public onComplete?(): Promise<void>    // 백업 완료
    public onFinish?(): Promise<void>      // 백업 및 정리까지 완료
}
