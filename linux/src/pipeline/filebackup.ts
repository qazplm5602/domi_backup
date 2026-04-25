import { mkdirSync, existsSync, cpSync } from "fs";
import { join } from "path";
import { Stage } from "@src/pipeline/stage.ts";
import { retry } from "@src/util/retry.ts";
import type { BackupTarget } from "@src/util/config.ts";

const COPY_RETRIES = 3;
const COPY_WAIT_MS = 5_000;

export class FileBackupStage extends Stage {
    public async run(): Promise<void> {
        for (const target of this.ctx.config.backup_targets) {
            await this.backupTarget(target);
        }
    }

    public async cleanup(): Promise<void> {}

    private async backupTarget(target: BackupTarget): Promise<void> {
        this.log.info(`${target.name} 백업중...`);

        const targetDir = join(this.ctx.tempPath, target.name);
        mkdirSync(targetDir, { recursive: true });

        this.assertNoDuplicateDestPaths(target, targetDir);

        for (const [destSubPath, sourceAbsPath] of target.source_paths) {
            await this.copyOne(target.name, sourceAbsPath, destSubPath, targetDir);
        }

        this.log.info(`${target.name} 백업 완료`);
    }

    private assertNoDuplicateDestPaths(target: BackupTarget, targetDir: string): void {
        const seen = new Set<string>();
        for (const [destSubPath] of target.source_paths) {
            const dest = join(targetDir, destSubPath);
            if (seen.has(dest)) {
                throw new Error(`중복된 대상 경로: ${dest}`);
            }

            seen.add(dest);
        }
    }

    // path가 비어있는것과 백업할 폴더가 없는것은 다른 에러로 구분
    private async copyOne(
        targetName: string,
        sourceAbsPath: string,
        destSubPath: string,
        targetDir: string,
    ): Promise<void> {
        if (!sourceAbsPath) {
            this.log.error(`${targetName} 백업 실패 (${destSubPath} 경로가 지정되지 않음)`);
            throw new Error(`${targetName} 백업 실패`);
        }

        if (!existsSync(sourceAbsPath)) {
            this.log.error(`소스 경로가 존재하지 않습니다: ${sourceAbsPath}`);
            throw new Error(`소스 경로 없음: ${sourceAbsPath}`);
        }

        const dest = join(targetDir, destSubPath);

        await retry(
            () => cpSync(sourceAbsPath, dest, { recursive: true }),
            {
                retries: COPY_RETRIES,
                waitMs: COPY_WAIT_MS,
                onRetry: (e, attempt, total) => {
                    this.log.error(`${sourceAbsPath} 복사 실패, 재시도 ${attempt}/${total - 1}: ${e}`);
                },
            },
        );
    }
}
