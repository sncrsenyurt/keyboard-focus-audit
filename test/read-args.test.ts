import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgv, usageText } from "../src/read-args.js";

describe("parseArgv", () => {
  it("treats no args as empty", () => {
    expect(parseArgv([])).toEqual({ kind: "empty" });
  });

  it("treats --help as help", () => {
    expect(parseArgv(["--help"])).toEqual({ kind: "help" });
  });

  it("fills in the defaults for a bare url", () => {
    expect(parseArgv(["https://example.com"])).toEqual({
      kind: "walk",
      walk: {
        href: "https://example.com",
        maxSteps: 50,
        outDir: "focus-out",
        viewport: { width: 1280, height: 720 },
        indicatorCheck: true,
        shots: true,
        report: path.join("focus-out", "focus-report.html"),
      },
    });
  });

  it("takes the flags", () => {
    expect(
      parseArgv([
        "https://example.com",
        "--max-steps",
        "20",
        "--out",
        "tmp/walk",
        "--viewport",
        "390x844",
      ]),
    ).toEqual({
      kind: "walk",
      walk: {
        href: "https://example.com",
        maxSteps: 20,
        outDir: "tmp/walk",
        viewport: { width: 390, height: 844 },
        indicatorCheck: true,
        shots: true,
        report: path.join("tmp/walk", "focus-report.html"),
      },
    });
  });

  it("takes the equals form of a flag", () => {
    expect(parseArgv(["https://example.com", "--max-steps=8"])).toEqual({
      kind: "walk",
      walk: {
        href: "https://example.com",
        maxSteps: 8,
        outDir: "focus-out",
        viewport: { width: 1280, height: 720 },
        indicatorCheck: true,
        shots: true,
        report: path.join("focus-out", "focus-report.html"),
      },
    });
  });

  it("turns the ring check off", () => {
    const parsed = parseArgv(["--no-ring-check", "https://example.com"]);
    expect(parsed.kind === "walk" && parsed.walk.indicatorCheck).toBe(false);
  });

  it("turns the screenshots off", () => {
    const parsed = parseArgv(["--no-shots", "https://example.com"]);
    expect(parsed.kind === "walk" && parsed.walk.shots).toBe(false);
  });

  it("mentions --no-shots in the usage", () => {
    expect(usageText()).toContain("--no-shots");
  });

  it("puts the report next to the record unless told otherwise", () => {
    const custom = parseArgv(["https://example.com", "--report=tmp/page.html"]);
    expect(custom.kind === "walk" && custom.walk.report).toBe("tmp/page.html");

    const skipped = parseArgv(["--no-report", "https://example.com"]);
    expect(skipped.kind === "walk" && skipped.walk.report).toBeNull();
  });

  it("rejects a report path and --no-report together", () => {
    expect(parseArgv(["https://example.com", "--report", "a.html", "--no-report"]).kind).toBe("bad");
  });

  it("rejects a missing report path", () => {
    expect(parseArgv(["https://example.com", "--report"]).kind).toBe("bad");
  });

  it("mentions the report flags in the usage", () => {
    const usage = usageText();
    expect(usage).toContain("--report");
    expect(usage).toContain("--no-report");
  });

  it("rejects an unknown flag", () => {
    expect(parseArgv(["https://example.com", "--quiet"]).kind).toBe("bad");
  });

  it("rejects a bad viewport", () => {
    expect(parseArgv(["https://example.com", "--viewport", "wide"]).kind).toBe("bad");
  });

  it("rejects a url that is not http", () => {
    expect(parseArgv(["ftp://example.com"]).kind).toBe("bad");
  });
});
