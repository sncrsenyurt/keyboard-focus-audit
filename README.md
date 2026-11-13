# keyboard-focus-audit

I want one command that opens a url, walks it with Tab and Shift+Tab, and writes down the focus order.

```
keyboard-focus-audit https://example.com
```

`--max-steps` caps how far the walk goes. `--out` is the folder for the report. `--viewport` is the width and height, written as `1280x720`. The command prints a compact table of the forward and backward focus order and then exits 0. I have not added trap or missing-indicator checks yet. The html report with a screenshot of each step is also still ahead.

```
npm install
npx playwright install chromium
npm test
npm run build
node dist/keyboard-focus-audit.js https://example.com
```
