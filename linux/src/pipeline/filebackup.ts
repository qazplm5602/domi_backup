import { mkdirSync, existsSync, cpSync } from "fs";
import { join } from "path";
import { Stage } from "@src/pipeline/stage.ts";
import type { BackupTarget } from "@src/util/config.ts";

export class FileBackupStage extends Stage {
    public async run(): Promise<void> {
        for (const target of this.ctx.config.backup_targets) {
            this.backupTarget(target);
        }
    }

    public async cleanup(): Promise<void> {}

    private backupTarget(target: BackupTarget): void {
        this.log.info(`${target.name} 백업중...`);

        const targetDir = join(this.ctx.tempPath, target.name);
        mkdirSync(targetDir, { recursive: true });

        this.assertNoDuplicateDestPaths(target, targetDir);

        for (const [destSubPath, sourceAbsPath] of target.source_paths) {
            this.copyOne(target.name, sourceAbsPath, destSubPath, targetDir);
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
    private copyOne(
        targetName: string,
        sourceAbsPath: string,
        destSubPath: string,
        targetDir: string,
    ): void {
        if (!sourceAbsPath) {
            this.log.error(`${targetName} 백업 실패 (${destSubPath} 경로가 지정되지 않음)`);
            throw new Error(`${targetName} 백업 실패`);
        }

        if (!existsSync(sourceAbsPath)) {
            this.log.error(`소스 경로가 존재하지 않습니다: ${sourceAbsPath}`);
            throw new Error(`소스 경로 없음: ${sourceAbsPath}`);
        }

        const dest = join(targetDir, destSubPath);
        cpSync(sourceAbsPath, dest, { recursive: true });
    }
}
