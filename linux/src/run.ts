import { createLogger } from "@src/util/logger.ts";
import { pipelines, hooks } from "@src/workflow.ts";
import type { Hook } from "@src/hook/hook.ts";

const log = createLogger("main");

async function callHook(hooks: Hook[], method: "onStart" | "onComplete" | "onFinish") {
    for (const hook of hooks) {
        await hook[method]?.();
    }
}

async function main() {
    log.info("=========================================");
    log.info("백업 시작");

    // Hook: onStart
    await callHook(hooks, "onStart");

    // 스테이지 실행
    const cleanupStack: typeof pipelines = [];

    try {
        for (const stage of pipelines) {
            log.info(`[${stage.constructor.name}] 실행중...`);
            await stage.run();
            cleanupStack.push(stage);
            log.info(`[${stage.constructor.name}] 완료`);
        }

        // Hook: onComplete (백업 완료, 파일 아직 있음)
        await callHook(hooks, "onComplete");
    } catch (e) {
        log.error(`오류 발생: ${e}`);
    } finally {
        // 스테이지 정리 (역순)
        for (const stage of cleanupStack.reverse()) {
            try {
                log.info(`[${stage.constructor.name}] 정리중...`);
                await stage.cleanup();
            } catch (e) {
                log.error(`[${stage.constructor.name}] 정리 실패: ${e}`);
            }
        }

        // Hook: onFinish (정리까지 완료)
        await callHook(hooks, "onFinish");
    }

    log.info("백업 완료!");
}

main();
