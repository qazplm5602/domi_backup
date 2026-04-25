import type { Stage } from "@src/pipeline/stage.ts";
import type { Hook } from "@src/hook/hook.ts";
import type { Context } from "@src/context.ts";
import { SqlDumpStage } from "@src/pipeline/sqldump.ts";

type StageClass = new (ctx: Context) => Stage;
type HookClass = new (ctx: Context) => Hook;

// 백업 파이프라인
const pipelines: StageClass[] = [
    SqlDumpStage,
];

// 훅 목록
const hooks: HookClass[] = [

];


export { pipelines, hooks }
