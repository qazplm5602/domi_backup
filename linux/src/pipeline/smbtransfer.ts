import { writeFileSync, rmSync, existsSync } from "fs";
import { join, basename } from "path";
import { Stage } from "@src/pipeline/stage.ts";
import { retry } from "@src/util/retry.ts";
import type { SmbStorage } from "@src/util/config.ts";

const UPLOAD_RETRIES = 5;
const UPLOAD_WAIT_MS = 10_000;

export class SmbTransferStage extends Stage {
    public async run(): Promise<void> {
        const storages = this.collectSmbStorages();
        if (storages.length === 0) return;

        this.assertSmbclientAvailable();
        this.assertArchiveExists();

        for (const storage of storages) {
            await this.uploadOne(storage);
            await this.pruneOldBackups(storage);
        }
    }

    public async cleanup(): Promise<void> {}

    private collectSmbStorages(): SmbStorage[] {
        const list = this.ctx.config.backup_storage ?? [];
        return list.filter((s): s is SmbStorage => s.type === "smb");
    }

    private assertSmbclientAvailable(): void {
        if (!Bun.which("smbclient")) {
            throw new Error("smbclient 가 PATH 에 없습니다.");
        }
    }

    private assertArchiveExists(): void {
        if (!this.ctx.archivePath || !existsSync(this.ctx.archivePath)) {
            throw new Error("압축 파일이 존재하지 않습니다.");
        }
    }

    private async uploadOne(storage: SmbStorage): Promise<void> {
        this.log.info(`${storage.share_path}(${storage.host})으로 파일 복사중...`);

        const credFile = this.writeCredentialFile(storage);
        try {
            const { service, remoteDir } = this.parseSharePath(storage.host, storage.share_path);
            const archivePath = this.ctx.archivePath!;
            const remoteName = basename(archivePath);

            const cmd = this.buildPutCommand(remoteDir, archivePath, remoteName);

            await retry(
                () => this.runSmbclient(service, credFile, cmd),
                {
                    retries: UPLOAD_RETRIES,
                    waitMs: UPLOAD_WAIT_MS,
                    onRetry: (e, attempt, total) => {
                        this.log.error(`${storage.share_path}(${storage.host}) 업로드 실패, 재시도 ${attempt}/${total - 1}: ${e}`);
                    },
                },
            );
        } finally {
            rmSync(credFile, { force: true });
        }

        this.log.info(`${storage.share_path}(${storage.host})으로 파일 복사 완료`);
    }

    private async pruneOldBackups(storage: SmbStorage): Promise<void> {
        if (storage.retain_days === undefined) return;

        this.log.info(`${storage.share_path}(${storage.host}) 오래된 백업 정리중 (보존: ${storage.retain_days}일)...`);

        const credFile = this.writeCredentialFile(storage);
        try {
            const { service, remoteDir } = this.parseSharePath(storage.host, storage.share_path);

            const stdout = await this.runSmbclient(
                service, credFile,
                this.buildListCommand(remoteDir),
            );

            const files = this.parseBackupListing(stdout);
            const expired = this.selectExpired(files, storage.retain_days);

            if (expired.length === 0) {
                this.log.info(`${storage.share_path}(${storage.host}) 삭제할 오래된 백업 없음`);
                return;
            }

            await this.deleteRemoteFiles(storage, credFile, service, remoteDir, expired);
        } finally {
            rmSync(credFile, { force: true });
        }
    }

    private buildPutCommand(remoteDir: string, archivePath: string, remoteName: string): string {
        const parts = ["prompt OFF"];

        if (remoteDir) parts.push(`cd "${remoteDir}"`);
        parts.push(`put "${archivePath}" "${remoteName}"`);
        
        return parts.join("; ");
    }

    private buildListCommand(remoteDir: string): string {
        const parts: string[] = [];

        if (remoteDir) parts.push(`cd "${remoteDir}"`);
        parts.push("ls domiBackup_*.7z");

        return parts.join("; ");
    }

    private buildDeleteCommand(remoteDir: string, files: string[]): string {
        const parts = ["prompt OFF"];

        if (remoteDir) parts.push(`cd "${remoteDir}"`);
        for (const name of files) parts.push(`del "${name}"`);

        return parts.join("; ");
    }

    private loadPassword(passwordEnv: string): string {
        const password = process.env[passwordEnv];
        if (password === undefined) {
            throw new Error("SMB 비밀번호를 가져올 수 없습니다.");
        }
        
        return password;
    }

    // smbclient -A 가 요구하는 0600 자격증명 파일 작성
    private writeCredentialFile(storage: SmbStorage): string {
        const password = this.loadPassword(storage.password_env);
        const content = `username = ${storage.user}\npassword = ${password}\n`;

        const path = join(this.ctx.tempPath, ".smbclient.cred");
        writeFileSync(path, content, { mode: 0o600 });

        return path;
    }

    // 'share/sub/dir' → service '//host/share', remoteDir 'sub/dir'
    private parseSharePath(host: string, sharePath: string): { service: string; remoteDir: string } {
        const trimmed = sharePath.replace(/^\/+|\/+$/g, "");
        const slashIdx = trimmed.indexOf("/");

        if (slashIdx === -1) {
            return { service: `//${host}/${trimmed}`, remoteDir: "" };
        }

        const shareName = trimmed.slice(0, slashIdx);
        const remoteDir = trimmed.slice(slashIdx + 1);
        return { service: `//${host}/${shareName}`, remoteDir };
    }

    private async spawnSmbclient(
        service: string, credFile: string, command: string,
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        const proc = Bun.spawn(
            ["smbclient", service, "-A", credFile, "-c", command],
            { stdout: "pipe", stderr: "pipe" },
        );
        await proc.exited;

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();

        return { stdout, stderr, exitCode: proc.exitCode ?? -1 };
    }

    private async runSmbclient(service: string, credFile: string, command: string): Promise<string> {
        const { stdout, stderr, exitCode } = await this.spawnSmbclient(service, credFile, command);

        if (exitCode !== 0) {
            this.log.error(`smbclient 실패 (exit ${exitCode})\n${stderr}`);
            throw new Error("smbclient 실패");
        }

        return stdout;
    }

    // 파일명의 timestamp 로 일자 파싱
    private parseBackupListing(stdout: string): { name: string; date: Date }[] {
        const re = /domiBackup_(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.7z/g;
        const seen = new Set<string>();
        const result: { name: string; date: Date }[] = [];

        for (const m of stdout.matchAll(re)) {
            const name = m[0];
            if (seen.has(name)) continue;
            seen.add(name);

            const date = new Date(
                Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                Number(m[4]), Number(m[5]), Number(m[6]),
            );
            result.push({ name, date });
        }

        return result;
    }

    // 만료 기준 시점 이전 파일만, 이번 회차에 업로드한 파일은 제외
    private selectExpired(
        files: { name: string; date: Date }[],
        retainDays: number,
    ): string[] {
        const thresholdMs = Date.now() - retainDays * 86400 * 1000;
        const currentArchive = this.ctx.archivePath ? basename(this.ctx.archivePath) : "";

        return files
            .filter(f => f.name !== currentArchive && f.date.getTime() < thresholdMs)
            .map(f => f.name);
    }

    // 업로드는 이미 끝났으므로 삭제 실패 시에도 throw 하지 않고 에러 로그만 남김
    private async deleteRemoteFiles(
        storage: SmbStorage,
        credFile: string,
        service: string,
        remoteDir: string,
        files: string[],
    ): Promise<void> {
        const cmd = this.buildDeleteCommand(remoteDir, files);
        const { stderr, exitCode } = await this.spawnSmbclient(service, credFile, cmd);

        if (exitCode !== 0) {
            this.log.error(`${storage.share_path}(${storage.host}) 일부 오래된 백업 삭제 실패 (exit ${exitCode})\n${stderr}`);
            return;
        }

        for (const name of files) {
            this.log.info(`오래된 백업 삭제: ${name}`);
        }
    }
}
