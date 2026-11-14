import type { FocusIssue } from "./find-issues.js";
import type { DirectionWalk, FocusStep, FocusWalkResult } from "./walk-focus.js";

export function formatFocusTable(result: FocusWalkResult, issues: FocusIssue[] = []): string {
  const parts = [
    formatDirection("forward", result.forward),
    "",
    formatDirection("backward", result.backward),
  ];
  if (issues.length) parts.push("", formatIssues(issues));
  return parts.join("\n");
}

function formatIssues(issues: FocusIssue[]): string {
  const header = `issues  ${issues.length}`;
  const rows = issues.map((issue) => [
    issue.kind,
    issue.direction,
    String(issue.index),
    issue.selector,
  ]);
  const titles = ["kind", "dir", "#", "selector"];
  const widths = titles.map((title, i) =>
    Math.max(title.length, ...rows.map((row) => row[i]!.length)),
  );
  const line = (cols: string[]) =>
    cols.map((col, i) => (i === cols.length - 1 ? col : col.padEnd(widths[i]!))).join("  ");
  return `${header}\n${line(titles)}\n${rows.map(line).join("\n")}`;
}

function formatDirection(label: string, walk: DirectionWalk): string {
  const header = `${label}  ${walk.steps.length}  ${walk.stopped}`;
  if (walk.steps.length === 0) return `${header}\n  (none)`;
  return `${header}\n${formatSteps(walk.steps)}`;
}

function formatSteps(steps: FocusStep[]): string {
  const rows = steps.map((step) => [
    String(step.index),
    step.tag,
    step.role || "-",
    step.name || "-",
    step.selector,
    formatBox(step.box),
    step.visible ? "yes" : "no",
    step.inViewport ? "yes" : "no",
  ]);
  const titles = ["#", "tag", "role", "name", "selector", "box", "vis", "view"];
  const widths = titles.map((title, i) =>
    Math.max(title.length, ...rows.map((row) => row[i]!.length)),
  );
  const line = (cols: string[]) =>
    cols.map((col, i) => (i === cols.length - 1 ? col : col.padEnd(widths[i]!))).join("  ");
  return [line(titles), ...rows.map(line)].join("\n");
}

function formatBox(box: FocusStep["box"]): string {
  if (!box) return "-";
  return `${box.x},${box.y} ${box.width}x${box.height}`;
}
