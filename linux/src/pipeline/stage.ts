import { createLogger } from "@src/util/logger.ts";
import type { Context } from "@src/context.ts";

export abstract class Stage {
    protected log = createLogger(this.constructor.name);

    constructor(protected readonly ctx: Context) {}

    // 스테이지 실행
    public abstract run(): Promise<void>
    // 정리
    public abstract cleanup(): Promise<void>
}
