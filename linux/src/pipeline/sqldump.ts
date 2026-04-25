import { mkdirSync, writeFileSync, openSync, closeSync, rmSync } from "fs";
import { join } from "path";
import { Stage } from "@src/pipeline/stage.ts";
import type { SqlConfig } from "@src/util/config.ts";

export class SqlDumpStage extends Stage {
    public async run(): Promise<void> {
        const sql = this.ctx.config.sql;
        if (!sql?.databases?.length) return;

        this.assertMysqldumpAvailable();

        const credFile = this.writeCredentialFile(sql);
        const dbDir = join(this.ctx.tempPath, "db");
        mkdirSync(dbDir, { recursive: true });

        try {
            for (const database of sql.databases) {
                await this.dumpDatabase(database, credFile, dbDir);
            }
        } finally {
            // 자격증명 파일은 노출 시간 최소화를 위해 즉시 삭제
            rmSync(credFile, { force: true });
        }
    }

    public async cleanup(): Promise<void> {}

    private assertMysqldumpAvailable(): void {
        if (!Bun.which("mysqldump")) {
            throw new Error("mysqldump 가 PATH 에 없습니다.");
        }
    }

    private loadPassword(passwordEnv: string | undefined): string | undefined {
        if (!passwordEnv) return undefined;
        const password = process.env[passwordEnv];
        if (password === undefined) {
            throw new Error("SQL 비밀번호를 가져올 수 없습니다.");
        }
        return password;
    }

    // 자격증명 파일을 0600 권한으로 작성하고 경로 반환
    private writeCredentialFile(sql: SqlConfig): string {
        const password = this.loadPassword(sql.password_env);

        let content = `[mysqldump]\nuser=${sql.user}\n`;
        if (password !== undefined) content += `password=${password}\n`;
        if (sql.host !== undefined) content += `host=${sql.host}\n`;
        if (sql.port !== undefined) content += `port=${sql.port}\n`;

        const path = join(this.ctx.tempPath, ".mysqldump.cnf");
        writeFileSync(path, content, { mode: 0o600 });

        return path;
    }

    private async dumpDatabase(database: string, credFile: string, dbDir: string): Promise<void> {
        this.log.info(`${database} 데이터베이스 덤프중...`);

        const sqlPath = join(dbDir, `${database}.sql`);
        const errPath = join(dbDir, `${database}.err`);

        const sqlFd = openSync(sqlPath, "w");
        const errFd = openSync(errPath, "w");

        try {
            const proc = Bun.spawn(
                [
                    "mysqldump",
                    `--defaults-extra-file=${credFile}`,
                    "--default-character-set=binary",
                    database,
                ],
                { stdout: sqlFd, stderr: errFd },
            );
            await proc.exited;

            if (proc.exitCode !== 0) {
                const errText = await Bun.file(errPath).text();
                this.log.error(`${database} DB 덤프 실패\n${errText}`);
                throw new Error(`${database} DB 덤프 실패`);
            }
        } finally {
            closeSync(sqlFd);
            closeSync(errFd);
        }

        rmSync(errPath, { force: true });
        this.log.info(`${database} 데이터베이스 덤프 완료`);
    }
}
