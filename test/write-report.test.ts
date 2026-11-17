import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import type { FocusRecord } from "../src/write-record.js";
import { renderFocusReport, writeFocusReport } from "../src/write-report.js";

const viewport = { width: 800, height: 600 };

function record(partial: Partial<FocusRecord> = {}): FocusRecord {
  return {
    version: "0.0.1",
    url: "http://127.0.0.1/page",
    viewport,
    timestamp: "2026-11-17T04:51:00.000Z",
    forward: {
      stopped: "body",
      steps: [
        {
          index: 0,
          tag: "button",
          role: "button",
          name: "One",
          selector: "#one",
          box: { x: 8, y: 8, width: 40, height: 20 },
          visible: true,
          inViewport: true,
          indicator: null,
          screenshot: "steps/forward-001.png",
        },
        {
          index: 1,
          tag: "a",
          role: "link",
          name: 'Tom & "Jerry" <script>',
          selector: 'a[href="<x>"]',
          box: { x: 8, y: 40, width: 80, height: 16 },
          visible: true,
          inViewport: true,
          indicator: { styleChanges: [], changedPixels: 0, totalPixels: 100, visible: false },
          screenshot: "steps/forward-002.png",
        },
      ],
    },
    backward: {
      stopped: "loop",
      steps: [
        {
          index: 0,
          tag: "a",
          role: "link",
          name: "Off",
          selector: "#off",
          box: { x: -10000, y: 0, width: 40, height: 16 },
          visible: true,
          inViewport: false,
          indicator: null,
          screenshot: null,
        },
      ],
    },
    issues: [
      { kind: "trap", direction: "forward", index: 0, selector: "#one" },
      { kind: "back-jump", direction: "forward", index: 1, selector: 'a[href="<x>"]' },
      { kind: "no-ring", direction: "forward", index: 1, selector: 'a[href="<x>"]' },
      { kind: "offscreen", direction: "backward", index: 0, selector: "#off" },
    ],
    summary: { trap: 1, hidden: 0, offscreen: 1, "back-jump": 1, "no-ring": 1 },
    ...partial,
  };
}

function between(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = html.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return html.slice(from, to);
}

function assetHrefs(html: string): string[] {
  const found: string[] = [];
  const attr = /\s(?:src|href)\s*=\s*["']([^"']*)["']/gi;
  const urlFn = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  for (const re of [attr, urlFn]) {
    for (const match of html.matchAll(re)) found.push(match[1]!);
  }
  return found.filter((value) => /^https?:/i.test(value));
}

describe("renderFocusReport", () => {
  it("lists each step and the problems on it", () => {
    const png = PNG.sync.write(new PNG({ width: 2, height: 2 }));
    const html = renderFocusReport(
      record(),
      new Map([["steps/forward-001.png", png]]),
    );

    expect(html).toContain("http://127.0.0.1/page");
    expect(html).toContain("2026-11-17T04:51:00.000Z");
    expect(html).toContain("trap 1");
    expect(html).toContain("hidden 0");
    expect(html).toContain("offscreen 1");
    expect(html).toContain("backwards jump 1");
    expect(html).toContain("missing focus ring 1");
    expect(html).toContain("<h2>Forward</h2>");
    expect(html).toContain("<h2>Shift+Tab</h2>");

    const first = between(html, 'id="forward-0"', 'id="forward-1"');
    expect(first).toContain("button");
    expect(first).toContain("One");
    expect(first).toContain("#one");
    expect(first).toContain("8,8 40x20");
    expect(first).toContain("trap");
    expect(first).toContain(`data:image/png;base64,${png.toString("base64")}`);
    expect(first).not.toContain("backwards jump");

    const second = between(html, 'id="forward-1"', 'id="backward-0"');
    expect(second).toContain("backwards jump");
    expect(second).toContain("missing focus ring");
    expect(second).not.toContain("<img");

    const back = html.slice(html.indexOf('id="backward-0"'));
    expect(back).toContain("#off");
    expect(back).toContain("offscreen");
    expect(back).toContain("-10000,0 40x16");
    expect(back).not.toContain("<img");
  });

  it("escapes names, selectors, and the url", () => {
    const html = renderFocusReport(
      record({ url: "http://evil.test/?a=1&b=2<script>" }),
    );
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;script&gt;");
    expect(html).toContain("a[href=&quot;&lt;x&gt;&quot;]");
    expect(html).toContain("http://evil.test/?a=1&amp;b=2&lt;script&gt;");
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toContain("<x>");
  });

  it("does not point at an external asset", () => {
    const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
    const html = renderFocusReport(record(), new Map([["steps/forward-001.png", png]]));
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(assetHrefs(html)).toEqual([]);
    expect(html).toContain("data:image/png;base64,");
  });

  it("still lists the steps when there are no shots", () => {
    const bare = record();
    for (const step of [...bare.forward.steps, ...bare.backward.steps]) step.screenshot = null;
    const html = renderFocusReport(bare);
    expect(html).not.toContain("<img");
    expect(html).toContain("#one");
    expect(html).toContain("#off");
    expect(html).toContain("One");
    expect(html).toContain("2 steps, body");
    expect(html).toContain("1 step, loop");
  });
});

describe("writeFocusReport", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("inlines a shot saved next to the record", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kfa-"));
    dirs.push(dir);
    const png = PNG.sync.write(new PNG({ width: 3, height: 3 }));
    await mkdir(path.join(dir, "steps"), { recursive: true });
    await writeFile(path.join(dir, "steps", "forward-001.png"), png);

    const file = path.join(dir, "nested", "page.html");
    await writeFocusReport({ file, outDir: dir, record: record() });
    const html = await readFile(file, "utf8");
    expect(html).toContain(`data:image/png;base64,${png.toString("base64")}`);
    expect(assetHrefs(html)).toEqual([]);
  });
});
