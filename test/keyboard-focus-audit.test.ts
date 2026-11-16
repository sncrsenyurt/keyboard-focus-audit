import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/keyboard-focus-audit.js";
import type { FocusRecord } from "../src/write-record.js";
import { serveFixture } from "./serve-fixture.js";

describe("run", { timeout: 30_000 }, () => {
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

  it("exits 0 on a clean page", async () => {
    const url = await open("basic.html");
    const dir = await scratch();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await run([url, "--out", dir, "--viewport", "800x600", "--no-ring-check", "--no-shots"]);
      expect(code).toBe(0);
      const text = log.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(text).toContain("summary  trap 0  hidden 0  offscreen 0  back-jump 0  no-ring 0");
      expect(text).toContain(path.join(dir, "focus-record.json"));
      const record = JSON.parse(await readFile(path.join(dir, "focus-record.json"), "utf8")) as FocusRecord;
      expect(record.summary).toEqual({
        trap: 0,
        hidden: 0,
        offscreen: 0,
        "back-jump": 0,
        "no-ring": 0,
      });
      expect(record.forward.steps.every((step) => step.screenshot === null)).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it("exits 2 when the page traps focus", async () => {
    const url = await open("trap.html");
    const dir = await scratch();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await run([url, "--out", dir, "--viewport", "800x600", "--no-ring-check", "--no-shots"]);
      expect(code).toBe(2);
      const text = log.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(text).toContain("summary  trap 2  hidden 0  offscreen 0  back-jump 0  no-ring 0");
      expect(text).toContain("issues  2");
      const record = JSON.parse(await readFile(path.join(dir, "focus-record.json"), "utf8")) as FocusRecord;
      expect(record.summary.trap).toBe(2);
    } finally {
      log.mockRestore();
    }
  });

  it("exits 1 on a bad invocation or a page it cannot open", async () => {
    const dir = await scratch();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await run([])).toBe(1);
      expect(await run(["notaurl"])).toBe(1);
      expect(await run(["--help"])).toBe(0);
      const code = await run([
        "http://127.0.0.1:1/",
        "--out",
        dir,
        "--no-shots",
        "--no-ring-check",
        "--max-steps",
        "1",
      ]);
      expect(code).toBe(1);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});
