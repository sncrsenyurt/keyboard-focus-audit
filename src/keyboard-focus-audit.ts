#!/usr/bin/env node
import { parseArgv, usageText } from "./read-args.js";

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

console.error(`walk ${parsed.walk.href}: not built yet`);
process.exit(1);
