import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

// SMB 백업 장치
export interface SmbStorage {
    type: "smb";
    host: string;
    share_path: string;
    user: string;
    password_env: string;
    retain_days?: number;
}

export type BackupStorage = SmbStorage;

// SQL 덤프 설정
export interface SqlConfig {
    host?: string;
    port?: number;
    user: string;
    password_env?: string;
    databases: string[];
}

// 백업 대상 폴더
// source_paths: [백업 내부 하위경로, 원본 절대경로][]
export interface BackupTarget {
    name: string;
    source_paths: [string, string][];
}

// Prometheus 출력 설정
export interface PrometheusConfig {
    enable: boolean;
    path: string;
}

// 전체 설정
export interface Config {
    temp_directory: string;
    backup_storage?: BackupStorage[];
    sql?: SqlConfig;
    backup_targets: BackupTarget[];
    prometheus?: PrometheusConfig;
}

// CONFIG_PATH 환경변수 or 현재 경로의 config.yaml
const defaultConfigPath = process.env.CONFIG_PATH ?? join(process.cwd(), "config.yaml");

export function loadConfig(path: string = defaultConfigPath): Config {
    const raw = readFileSync(path, "utf8");
    const config = parse(raw) as Config;

    // 필수 필드 검증
    if (!config.temp_directory) {
        throw new Error("config.yaml: temp_directory가 지정되지 않았습니다.");
    }
    if (!config.backup_targets || config.backup_targets.length === 0) {
        throw new Error("config.yaml: backup_targets가 비어있습니다.");
    }

    return config;
}
