import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { findIssues } from "../src/find-issues.js";
import { walkFocus, type FocusWalkResult } from "../src/walk-focus.js";
import { countIssues, formatSummary, writeFocusRecord, type FocusRecord } from "../src/write-record.js";
import { serveFixture } from "./serve-fixture.js";

const viewport = { width: 800, height: 600 };

describe("countIssues", () => {
  it("counts each kind and leaves the rest at zero", () => {
    expect(
      countIssues([
        { kind: "trap", direction: "forward", index: 0, selector: "#one" },
        { kind: "trap", direction: "backward", index: 0, selector: "#two" },
        { kind: "offscreen", direction: "forward", index: 1, selector: "#off" },
      ]),
    ).toEqual({
      trap: 2,
      hidden: 0,
      offscreen: 1,
      "back-jump": 0,
      "no-ring": 0,
    });
  });
});

describe("formatSummary", () => {
  it("prints the counts and the record path", () => {
    expect(
      formatSummary(
        { trap: 2, hidden: 0, offscreen: 1, "back-jump": 0, "no-ring": 3 },
        "focus-out/focus-record.json",
      ),
    ).toBe(
      "summary  trap 2  hidden 0  offscreen 1  back-jump 0  no-ring 3\nrecord  focus-out/focus-record.json",
    );
  });

  it("adds the report path when there is one", () => {
    expect(
      formatSummary(
        { trap: 0, hidden: 0, offscreen: 0, "back-jump": 0, "no-ring": 0 },
        "focus-out/focus-record.json",
        "focus-out/focus-report.html",
      ),
    ).toBe(
      "summary  trap 0  hidden 0  offscreen 0  back-jump 0  no-ring 0\nrecord  focus-out/focus-record.json\nreport  focus-out/focus-report.html",
    );
  });
});

describe("writeFocusRecord", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function scratch(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "kfa-"));
    dirs.push(dir);
    return dir;
  }

  it("writes the step fields and drops the bookkeeping", async () => {
    const dir = await scratch();
    const result: FocusWalkResult = {
      href: "http://127.0.0.1/page",
      forward: {
        stopped: "body",
        steps: [
          {
            index: 0,
            tag: "a",
            role: "link",
            name: "Home",
            selector: "#home",
            box: { x: 8, y: 8, width: 40, height: 16 },
            visible: true,
            inViewport: true,
            domIndex: 4,
            indicator: { styleChanges: ["outline"], changedPixels: 12, totalPixels: 80, visible: true },
            shot: "steps/forward-001.png",
          },
        ],
      },
      backward: { stopped: "max-steps", steps: [] },
    };
    const issues = [{ kind: "no-ring" as const, direction: "forward" as const, index: 1, selector: "#bare" }];
    const recordPath = await writeFocusRecord({ outDir: dir, viewport, result, issues });

    expect(recordPath).toBe(path.join(dir, "focus-record.json"));
    const record = JSON.parse(await readFile(recordPath, "utf8")) as FocusRecord;
    expect(record.version).toBe("0.0.1");
    expect(record.url).toBe("http://127.0.0.1/page");
    expect(record.viewport).toEqual(viewport);
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
    expect(record.forward.stopped).toBe("body");
    expect(record.backward.stopped).toBe("max-steps");
    expect(record.forward.steps[0]).toEqual({
      index: 0,
      tag: "a",
      role: "link",
      name: "Home",
      selector: "#home",
      box: { x: 8, y: 8, width: 40, height: 16 },
      visible: true,
      inViewport: true,
      indicator: { styleChanges: ["outline"], changedPixels: 12, totalPixels: 80, visible: true },
      screenshot: "steps/forward-001.png",
    });
    expect(record.forward.steps[0]).not.toHaveProperty("domIndex");
    expect(record.issues).toEqual(issues);
    expect(record.summary).toEqual({
      trap: 0,
      hidden: 0,
      offscreen: 0,
      "back-jump": 0,
      "no-ring": 1,
    });
  });
});

describe("record from a page", { timeout: 60_000 }, () => {
  let close: (() => Promise<void>) | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function open(file: string): Promise<string> {
    const served = await serveFixture(file);
    close = served.close;
    return served.url;
  }

  async function scratch(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "kfa-"));
    dirs.push(dir);
    return dir;
  }

  it("writes a shot per step and zero counts on a clean page", async () => {
    const url = await open("basic.html");
    const dir = await scratch();
    const result = await walkFocus({
      href: url,
      maxSteps: 20,
      viewport,
      shots: true,
      outDir: dir,
    });
    const issues = findIssues(result);
    const record = JSON.parse(
      await readFile(await writeFocusRecord({ outDir: dir, viewport, result, issues }), "utf8"),
    ) as FocusRecord;

    expect(record.url).toBe(url);
    expect(record.forward.stopped).toBe("body");
    expect(record.backward.stopped).toBe("body");
    expect(record.forward.steps.map((s) => s.selector)).toEqual(["#home", "#email", "#send"]);
    expect(record.backward.steps.map((s) => s.selector)).toEqual(["#send", "#email", "#home"]);
    expect(record.issues).toEqual([]);
    expect(record.summary).toEqual({
      trap: 0,
      hidden: 0,
      offscreen: 0,
      "back-jump": 0,
      "no-ring": 0,
    });

    const names = [
      "steps/forward-001.png",
      "steps/forward-002.png",
      "steps/forward-003.png",
      "steps/backward-001.png",
      "steps/backward-002.png",
      "steps/backward-003.png",
    ];
    expect(record.forward.steps.map((s) => s.screenshot)).toEqual(names.slice(0, 3));
    expect(record.backward.steps.map((s) => s.screenshot)).toEqual(names.slice(3));
    expect(record.forward.steps.every((s) => s.indicator && s.indicator.visible)).toBe(true);
    expect(record.backward.steps.every((s) => s.indicator === null)).toBe(true);

    for (const step of [...record.forward.steps, ...record.backward.steps]) {
      const png = PNG.sync.read(await readFile(path.join(dir, step.screenshot!)));
      expect(png.width).toBe(viewport.width);
      expect(png.height).toBe(viewport.height);
      const box = step.box!;
      expect(isMagenta(pixel(png, box.x + 2, box.y + 2))).toBe(true);
    }

    const files = await readdir(path.join(dir, "steps"));
    expect(files.sort()).toEqual([
      "backward-001.png",
      "backward-002.png",
      "backward-003.png",
      "forward-001.png",
      "forward-002.png",
      "forward-003.png",
    ]);
  });

  it("counts the traps on the trap fixture", async () => {
    const url = await open("trap.html");
    const dir = await scratch();
    const result = await walkFocus({
      href: url,
      maxSteps: 20,
      viewport,
      indicatorCheck: false,
      shots: true,
      outDir: dir,
    });
    const issues = findIssues(result);
    const record = JSON.parse(
      await readFile(await writeFocusRecord({ outDir: dir, viewport, result, issues }), "utf8"),
    ) as FocusRecord;

    expect(record.forward.stopped).toBe("loop");
    expect(record.backward.stopped).toBe("loop");
    expect(record.forward.steps.map((s) => s.selector)).toEqual(["#one", "#two"]);
    expect(record.summary).toEqual({
      trap: 2,
      hidden: 0,
      offscreen: 0,
      "back-jump": 0,
      "no-ring": 0,
    });
    expect(record.issues.map((issue) => `${issue.kind}:${issue.direction}`)).toEqual([
      "trap:forward",
      "trap:backward",
    ]);
    for (const step of [...record.forward.steps, ...record.backward.steps]) {
      const buf = await readFile(path.join(dir, step.screenshot!));
      expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      PNG.sync.read(buf);
    }
  });
});

function pixel(png: PNG, x: number, y: number): [number, number, number] {
  const i = (png.width * y + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

function isMagenta(rgb: [number, number, number]): boolean {
  return rgb[0] > 220 && rgb[1] < 40 && rgb[2] > 220;
}
