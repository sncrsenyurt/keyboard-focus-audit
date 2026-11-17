import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FocusIssue, IssueKind } from "./find-issues.js";
import type { Viewport } from "./read-args.js";
import type { DirectionWalk, FocusStep, FocusWalkResult } from "./walk-focus.js";

export type IssueCounts = Record<IssueKind, number>;

export type RecordedStep = {
  index: number;
  tag: string;
  role: string;
  name: string;
  selector: string;
  box: FocusStep["box"];
  visible: boolean;
  inViewport: boolean;
  indicator: FocusStep["indicator"];
  screenshot: string | null;
};

export type RecordedWalk = {
  stopped: DirectionWalk["stopped"];
  steps: RecordedStep[];
};

export type FocusRecord = {
  version: string;
  url: string;
  viewport: Viewport;
  timestamp: string;
  forward: RecordedWalk;
  backward: RecordedWalk;
  issues: FocusIssue[];
  summary: IssueCounts;
};

const KINDS: IssueKind[] = ["trap", "hidden", "offscreen", "back-jump", "no-ring"];
const RECORD_NAME = "focus-record.json";

export function countIssues(issues: FocusIssue[]): IssueCounts {
  const counts: IssueCounts = {
    trap: 0,
    hidden: 0,
    offscreen: 0,
    "back-jump": 0,
    "no-ring": 0,
  };
  for (const issue of issues) counts[issue.kind] += 1;
  return counts;
}

export function formatSummary(
  counts: IssueCounts,
  recordPath: string,
  reportPath?: string | null,
): string {
  const bits = KINDS.map((kind) => `${kind} ${counts[kind]}`).join("  ");
  const lines = [`summary  ${bits}`, `record  ${recordPath}`];
  if (reportPath) lines.push(`report  ${reportPath}`);
  return lines.join("\n");
}

export async function writeFocusRecord(opts: {
  outDir: string;
  viewport: Viewport;
  result: FocusWalkResult;
  issues: FocusIssue[];
}): Promise<string> {
  const record: FocusRecord = {
    version: toolVersion(),
    url: opts.result.href,
    viewport: opts.viewport,
    timestamp: new Date().toISOString(),
    forward: recordedWalk(opts.result.forward),
    backward: recordedWalk(opts.result.backward),
    issues: opts.issues,
    summary: countIssues(opts.issues),
  };
  await mkdir(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, RECORD_NAME);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

function recordedWalk(walk: DirectionWalk): RecordedWalk {
  return {
    stopped: walk.stopped,
    steps: walk.steps.map(recordedStep),
  };
}

function recordedStep(step: FocusStep): RecordedStep {
  return {
    index: step.index,
    tag: step.tag,
    role: step.role,
    name: step.name,
    selector: step.selector,
    box: step.box,
    visible: step.visible,
    inViewport: step.inViewport,
    indicator: step.indicator,
    screenshot: step.shot,
  };
}

function toolVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}
