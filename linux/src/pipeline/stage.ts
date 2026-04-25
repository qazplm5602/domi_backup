import { createLogger } from "@src/util/logger";

export abstract class Stage {
    protected log = createLogger(this.constructor.name);
    
    // 스테이지 실행
    public abstract run(): Promise<void>
    // 정리
    public abstract cleanup(): Promise<void>
}