import { appendFileSync, renameSync, statSync } from "fs";
import { join } from "path";

type LogLevel = "INFO" | "ERROR";

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// LOG_PATH 환경변수가 없으면 현재 경로의 log.txt에 기록
const logPath = process.env.LOG_PATH ?? join(process.cwd(), "log.txt");

// 로그 파일이 10MB를 초과하면 타임스탬프를 붙여 아카이브
function rotateIfNeeded() {
    try {
        const stat = statSync(logPath);
        if (stat.size > MAX_LOG_SIZE) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const ext = logPath.endsWith(".txt") ? ".txt" : "";
            const base = ext ? logPath.slice(0, -ext.length) : logPath;
            renameSync(logPath, `${base}-${timestamp}${ext}`);
        }
    } catch {
        // 파일이 없으면 로테이션 불필요
    }
}

// 로그 한 줄 기록
// 형식: 2026-04-25 14:30:00 [source] INFO message
function write(source: string, level: LogLevel, message: string) {
    const time = new Date().toISOString().replace("T", " ").slice(0, 19);
    const line = `${time} [${source}] ${level} ${message}`;

    console.log(line);

    rotateIfNeeded();
    appendFileSync(logPath, line + "\n");
}

// source 이름을 고정한 로거 인스턴스
export class Logger {
    constructor(private source: string) {}

    info(message: string) {
        write(this.source, "INFO", message);
    }

    error(message: string) {
        write(this.source, "ERROR", message);
    }
}

export function createLogger(source: string) {
    return new Logger(source);
}
