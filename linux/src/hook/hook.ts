import { createLogger } from "@src/util/logger";

export abstract class Hook {
    protected log = createLogger(this.constructor.name);

    public onStart?(): Promise<void>
    public onFinish?(): Promise<void>
}