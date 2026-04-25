import { createLogger } from "@src/util/logger.ts";
import { pipelines, hooks } from "@src/workflow.ts";
import { callHook } from "@src/hook/callHook.ts";
import { createContext } from "@src/context.ts";
import { loadConfig } from "@src/util/config.ts";

const log = createLogger("main");


async function main() {
    log.info("=========================================");
    log.info("백업 시작");

    // 설정 로드
    const config = loadConfig();

    const ctx = createContext(config);

    const stages = pipelines.map(S => new S(ctx));
    const hookList = hooks.map(H => new H(ctx));

    // 시작 이벤트
    await callHook(hookList, h => h.onStart?.());

    // 스테이지 실행
    const cleanupStack: typeof stages = [];

    try {
        for (const stage of stages) {
            log.info(`[${stage.constructor.name}] 실행중...`);
            
            await stage.run();
            cleanupStack.push(stage);

            log.info(`[${stage.constructor.name}] 완료`);
        }

        // 백업 완료 이벤트
        await callHook(hookList, h => h.onComplete?.());
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

        // 백업 완료 및 마무리 이벤트
        await callHook(hookList, h => h.onFinish?.());
    }

    log.info("백업 완료!");
}

main();
