import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import type { Config } from "@src/util/config.ts";

// 파이프라인 전체에서 공유하는 문맥
export interface Context {
    // YAML 설정
    config: Config;
    // 임시 폴더 경로
    tempPath: string;
    // 백업 시작 시간
    backupDate: Date;
    // 파이프라인 실행 결과 (Hook에서 참조)
    result: {
        success: boolean;
        backupFileSize?: number;
    };
}

// 파이프라인 시작 전에 Context 생성
export function createContext(config: Config): Context {
    const backupDate = new Date();
    const tempPath = mkdtempSync(join(config.temp_directory, "domi_backup-"));

    return {
        config,
        tempPath,
        backupDate,
        result: {
            success: false,
        },
    };
}

// 파이프라인 종료 후에 Context 정리
export function disposeContext(ctx: Context): void {
    rmSync(ctx.tempPath, { recursive: true, force: true });
}
