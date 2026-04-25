import { readFileSync, writeFileSync, statSync, renameSync } from "fs";
import { isAbsolute, join } from "path";
import { Hook } from "@src/hook/hook.ts";

type Metrics = {
    domi_backup_last_timestamp: number;
    domi_backup_last_success: number;
    domi_backup_last_success_timestamp: number;
    domi_backup_size_bytes: number;
};

const METRIC_KEYS: (keyof Metrics)[] = [
    "domi_backup_last_timestamp",
    "domi_backup_last_success",
    "domi_backup_last_success_timestamp",
    "domi_backup_size_bytes",
];

const HELP: Record<keyof Metrics, string> = {
    domi_backup_last_timestamp: "Unix timestamp of last backup attempt",
    domi_backup_last_success: "Whether the last backup was successful (1=success, 0=failure)",
    domi_backup_last_success_timestamp: "Unix timestamp of last successful backup",
    domi_backup_size_bytes: "Size of last successful backup in bytes",
};

export class PrometheusHook extends Hook {
    public async onFinish(): Promise<void> {
        const cfg = this.ctx.config.prometheus;
        if (!cfg?.enable) return;

        const path = this.resolvePath(cfg.path);
        const metrics = this.loadExisting(path);
        this.updateMetrics(metrics);

        const content = this.render(metrics);
        this.writeAtomic(path, content);

        this.log.info(`prometheus 메트릭 기록 완료: ${path}`);
    }

    private resolvePath(p: string): string {
        return isAbsolute(p) ? p : join(process.cwd(), p);
    }

    private loadExisting(path: string): Metrics {
        const metrics: Metrics = {
            domi_backup_last_timestamp: 0,
            domi_backup_last_success: 0,
            domi_backup_last_success_timestamp: 0,
            domi_backup_size_bytes: 0,
        };

        let content: string;
        try {
            content = readFileSync(path, "utf8");
        } catch (e: any) {
            if (e?.code === "ENOENT") return metrics;
            throw e;
        }

        for (const line of content.split(/\r?\n/)) {
            if (line.startsWith("#") || !line.startsWith("domi_")) continue;

            const [key, value] = line.split(" ");
            if (!key || value === undefined) continue;
            if (!(key in metrics)) continue;

            const num = Number(value);
            if (!Number.isFinite(num)) continue;

            metrics[key as keyof Metrics] = num;
        }

        return metrics;
    }

    private updateMetrics(m: Metrics): void {
        const now = Math.floor(Date.now() / 1000);
        const success = this.ctx.result.success;

        m.domi_backup_last_timestamp = now;
        m.domi_backup_last_success = success ? 1 : 0;

        if (success) {
            m.domi_backup_last_success_timestamp = now;
            m.domi_backup_size_bytes = this.getArchiveSize();
        }
    }

    private getArchiveSize(): number {
        const archivePath = this.ctx.archivePath;
        if (!archivePath) return 0;

        try {
            return statSync(archivePath).size;
        } catch {
            return 0;
        }
    }

    private render(m: Metrics): string {
        const lines: string[] = [];
        for (const key of METRIC_KEYS) {
            lines.push(`# HELP ${key} ${HELP[key]}`);
            lines.push(`# TYPE ${key} gauge`);
            lines.push(`${key} ${m[key]}`);
        }
        
        return lines.join("\n") + "\n";
    }

    private writeAtomic(path: string, content: string): void {
        const tmp = path + ".tmp";
        writeFileSync(tmp, content, { encoding: "utf8" });
        renameSync(tmp, path);
    }
}
