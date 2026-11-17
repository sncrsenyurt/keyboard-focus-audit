import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FocusIssue, IssueKind } from "./find-issues.js";
import type { FocusRecord, IssueCounts, RecordedStep, RecordedWalk } from "./write-record.js";

const KIND_ORDER: IssueKind[] = ["trap", "hidden", "offscreen", "back-jump", "no-ring"];

const KIND_LABEL: Record<IssueKind, string> = {
  trap: "trap",
  hidden: "hidden",
  offscreen: "offscreen",
  "back-jump": "backwards jump",
  "no-ring": "missing focus ring",
};

const STYLE = `
body { margin: 32px auto; max-width: 880px; color: #222; background: #fff; font: 16px/1.45 system-ui, sans-serif; }
h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
h2 { font-size: 18px; font-weight: 600; margin: 28px 0 8px; }
h3 { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
p { margin: 0 0 6px; }
.url { word-break: break-all; }
.when, .note { color: #444; }
.counts strong { color: #933; }
.step { border-top: 1px solid #ddd; padding: 16px 0; }
.step.bad { border-left: 4px solid #933; padding-left: 12px; }
.problems { color: #933; font-weight: 600; }
.problems span { margin-right: 10px; }
.sel { font-family: monospace; }
img { display: block; max-width: 100%; height: auto; margin-top: 8px; border: 1px solid #ccc; }
`.trim();

export function renderFocusReport(record: FocusRecord, shots: ReadonlyMap<string, Buffer> = new Map()): string {
  const body = [
    "<h1>Keyboard focus</h1>",
    `<p class="url">${esc(record.url)}</p>`,
    `<p class="when">${esc(record.timestamp)}</p>`,
    renderCounts(record.summary),
    renderWalk("Forward", "forward", record.forward, record.issues, shots),
    renderWalk("Shift+Tab", "backward", record.backward, record.issues, shots),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keyboard focus</title>
<style>
${STYLE}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export async function writeFocusReport(opts: {
  file: string;
  outDir: string;
  record: FocusRecord;
}): Promise<string> {
  const shots = await loadShots(opts.outDir, opts.record);
  await mkdir(path.dirname(opts.file), { recursive: true });
  await writeFile(opts.file, renderFocusReport(opts.record, shots));
  return opts.file;
}

function renderCounts(summary: IssueCounts): string {
  const bits = KIND_ORDER.map((kind) => {
    const text = `${KIND_LABEL[kind]} ${summary[kind]}`;
    return summary[kind] ? `<strong>${esc(text)}</strong>` : esc(text);
  });
  return `<h2>Problems</h2>\n<p class="counts">${bits.join(", ")}</p>`;
}

function renderWalk(
  title: string,
  direction: "forward" | "backward",
  walk: RecordedWalk,
  issues: FocusIssue[],
  shots: ReadonlyMap<string, Buffer>,
): string {
  const noun = walk.steps.length === 1 ? "step" : "steps";
  const parts = [
    `<h2>${esc(title)}</h2>`,
    `<p class="note">${walk.steps.length} ${noun}, ${esc(walk.stopped)}</p>`,
  ];
  if (!walk.steps.length) {
    parts.push("<p>(none)</p>");
    return parts.join("\n");
  }
  for (const step of walk.steps) parts.push(renderStep(direction, step, issues, shots));
  return parts.join("\n");
}

function renderStep(
  direction: "forward" | "backward",
  step: RecordedStep,
  issues: FocusIssue[],
  shots: ReadonlyMap<string, Buffer>,
): string {
  const mine = issues.filter((issue) => issue.direction === direction && issue.index === step.index);
  const parts = [
    `<article class="${mine.length ? "step bad" : "step"}" id="${direction}-${step.index}">`,
    `<h3>${step.index} ${esc(step.tag)}</h3>`,
    `<p>role ${esc(step.role || "-")}</p>`,
    `<p>name ${esc(step.name || "-")}</p>`,
    `<p class="sel">${esc(step.selector)}</p>`,
    `<p>box ${esc(boxText(step.box))}</p>`,
  ];
  if (mine.length) {
    const marks = mine.map((issue) => `<span>${esc(KIND_LABEL[issue.kind])}</span>`).join(" ");
    parts.push(`<p class="problems">${marks}</p>`);
  }
  const shot = shotTag(step, shots, `${direction} step ${step.index}`);
  if (shot) parts.push(shot);
  parts.push("</article>");
  return parts.join("\n");
}

function shotTag(step: RecordedStep, shots: ReadonlyMap<string, Buffer>, alt: string): string {
  if (!step.screenshot) return "";
  const buf = shots.get(step.screenshot);
  if (!buf) return "";
  return `<img alt="${esc(alt)}" src="data:image/png;base64,${buf.toString("base64")}">`;
}

function boxText(box: RecordedStep["box"]): string {
  if (!box) return "-";
  return `${box.x},${box.y} ${box.width}x${box.height}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadShots(outDir: string, record: FocusRecord): Promise<Map<string, Buffer>> {
  const shots = new Map<string, Buffer>();
  const rels = new Set<string>();
  for (const step of [...record.forward.steps, ...record.backward.steps]) {
    if (step.screenshot) rels.add(step.screenshot);
  }
  for (const rel of rels) {
    if (rel.includes("..") || path.isAbsolute(rel)) continue;
    const buf = await readShot(path.join(outDir, rel));
    if (buf) shots.set(rel, buf);
  }
  return shots;
}

async function readShot(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

function isMissing(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "ENOENT";
}
