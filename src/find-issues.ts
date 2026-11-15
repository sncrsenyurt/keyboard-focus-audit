import type { Box, DirectionWalk, FocusStep, FocusWalkResult } from "./walk-focus.js";

export type IssueKind = "trap" | "hidden" | "offscreen" | "back-jump" | "no-ring";

export type FocusIssue = {
  kind: IssueKind;
  direction: "forward" | "backward";
  index: number;
  selector: string;
};

export function findIssues(result: FocusWalkResult): FocusIssue[] {
  return [...issuesIn("forward", result.forward), ...issuesIn("backward", result.backward)];
}

function issuesIn(direction: "forward" | "backward", walk: DirectionWalk): FocusIssue[] {
  const issues: FocusIssue[] = [];
  const steps = walk.steps;

  if (isTrap(walk) && steps[0]) {
    issues.push({
      kind: "trap",
      direction,
      index: steps[0].index,
      selector: steps[0].selector,
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (hiddenStop(step)) {
      issues.push({ kind: "hidden", direction, index: step.index, selector: step.selector });
    } else if (!step.inViewport) {
      issues.push({ kind: "offscreen", direction, index: step.index, selector: step.selector });
    }
    if (step.indicator && !step.indicator.visible) {
      issues.push({ kind: "no-ring", direction, index: step.index, selector: step.selector });
    }
    if (direction === "forward" && i > 0 && jumpsBack(steps[i - 1]!, step)) {
      issues.push({ kind: "back-jump", direction, index: step.index, selector: step.selector });
    }
  }

  return issues;
}

function isTrap(walk: DirectionWalk): boolean {
  if (walk.stopped === "loop") return true;
  const seen = new Set<string>();
  for (const step of walk.steps) {
    if (seen.has(step.selector)) return true;
    seen.add(step.selector);
  }
  return false;
}

function hiddenStop(step: FocusStep): boolean {
  return !step.visible || step.box === null;
}

function jumpsBack(from: FocusStep, to: FocusStep): boolean {
  if (hiddenStop(from) || hiddenStop(to) || !from.inViewport || !to.inViewport) {
    return false;
  }
  if (from.box && to.box) {
    if (visuallyBefore(to.box, from.box)) return true;
    if (visuallyBefore(from.box, to.box)) return false;
  }
  return to.domIndex < from.domIndex;
}

function visuallyBefore(a: Box, b: Box): boolean {
  const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
  if (overlapY) return a.x < b.x;
  return a.y < b.y;
}
