import type { Stage } from "@src/pipeline/stage.ts";
import type { Hook } from "@src/hook/hook.ts";
import type { Context } from "@src/context.ts";
import { SqlDumpStage } from "@src/pipeline/sqldump.ts";
import { FileBackupStage } from "@src/pipeline/filebackup.ts";
import { CompressStage } from "@src/pipeline/compress.ts";
import { SmbTransferStage } from "@src/pipeline/smbtransfer.ts";

type StageClass = new (ctx: Context) => Stage;
type HookClass = new (ctx: Context) => Hook;

// 백업 파이프라인
const pipelines: StageClass[] = [
    SqlDumpStage,
    FileBackupStage,
    CompressStage,
    SmbTransferStage,
];

// 훅 목록
const hooks: HookClass[] = [

];


export { pipelines, hooks }
