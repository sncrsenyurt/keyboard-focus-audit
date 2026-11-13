#!/usr/bin/env node
import { parseArgv, usageText } from "./read-args.js";
import { formatFocusTable } from "./print-focus-table.js";
import { walkFocus } from "./walk-focus.js";

const parsed = parseArgv(process.argv.slice(2));

if (parsed.kind === "help" || parsed.kind === "empty") {
  console.log(usageText());
  process.exit(parsed.kind === "help" ? 0 : 1);
}

if (parsed.kind === "bad") {
  console.error(parsed.reason);
  console.error(usageText());
  process.exit(1);
}

try {
  const result = await walkFocus(parsed.walk);
  console.log(formatFocusTable(result));
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
