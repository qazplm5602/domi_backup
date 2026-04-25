import { mkdirSync } from "fs";
import { join } from "path";
import { Stage } from "@src/pipeline/stage.ts";

export class CompressStage extends Stage {
    public async run(): Promise<void> {
        this.assert7zAvailable();

        const archivePath = this.buildArchivePath();
        mkdirSync(join(this.ctx.tempPath, "compress"), { recursive: true });

        this.log.info("압축중...");
        await this.compress(archivePath);

        this.ctx.archivePath = archivePath;
        this.log.info("압축 완료");
    }

    public async cleanup(): Promise<void> {}

    private assert7zAvailable(): void {
        if (!Bun.which("7z")) {
            throw new Error("7z 가 PATH 에 없습니다.");
        }
    }

    private buildArchivePath(): string {
        const stamp = this.formatStamp(this.ctx.backupDate);
        return join(this.ctx.tempPath, "compress", `domiBackup_${stamp}.7z`);
    }

    private formatStamp(d: Date): string {
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
             + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    private async compress(archivePath: string): Promise<void> {
        const proc = Bun.spawn(
            [
                "7z", "a", "-t7z",
                archivePath,
                this.ctx.tempPath,
                "-mx=9", "-m0=lzma2", "-mfb=64", "-md=64m",
                "-bso0", "-bsp0",
                "-xr!compress",
            ],
            { stdout: "ignore", stderr: "pipe" },
        );
        await proc.exited;

        if (proc.exitCode !== 0) {
            const errText = await new Response(proc.stderr).text();
            this.log.error(`압축 실패 (exit ${proc.exitCode})\n${errText}`);
            throw new Error("압축 실패");
        }
    }
}
