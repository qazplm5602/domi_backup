import { createLogger } from "@src/util/logger";

export abstract class Hook {
    protected log = createLogger(this.constructor.name);

    public onStart?(): Promise<void>
    public onComplete?(): Promise<void>    // 백업 완료
    public onFinish?(): Promise<void>      // 백업 및 정리까지 완료
}