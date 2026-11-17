#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgv, usageText } from "./read-args.js";
import { findIssues } from "./find-issues.js";
import { formatFocusTable } from "./print-focus-table.js";
import { walkFocus } from "./walk-focus.js";
import { writeFocusReport } from "./write-report.js";
import { countIssues, formatSummary, writeFocusRecord, type FocusRecord } from "./write-record.js";

export async function run(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv);

  if (parsed.kind === "help" || parsed.kind === "empty") {
    console.log(usageText());
    return parsed.kind === "help" ? 0 : 1;
  }

  if (parsed.kind === "bad") {
    console.error(parsed.reason);
    console.error(usageText());
    return 1;
  }

  try {
    const result = await walkFocus({
      href: parsed.walk.href,
      maxSteps: parsed.walk.maxSteps,
      viewport: parsed.walk.viewport,
      indicatorCheck: parsed.walk.indicatorCheck,
      shots: parsed.walk.shots,
      outDir: parsed.walk.outDir,
    });
    const issues = findIssues(result);
    const recordPath = await writeFocusRecord({
      outDir: parsed.walk.outDir,
      viewport: parsed.walk.viewport,
      result,
      issues,
    });
    let reportPath: string | null = null;
    if (parsed.walk.report) {
      const record = JSON.parse(await readFile(recordPath, "utf8")) as FocusRecord;
      reportPath = await writeFocusReport({
        file: parsed.walk.report,
        outDir: parsed.walk.outDir,
        record,
      });
    }
    console.log(
      `${formatFocusTable(result, issues)}\n\n${formatSummary(countIssues(issues), recordPath, reportPath)}`,
    );
    return issues.length ? 2 : 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return 1;
  }
}

function ranAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (ranAsCli()) {
  process.exit(await run(process.argv.slice(2)));
}
