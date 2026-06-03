import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Pattern = {
  name: string;
  regex: RegExp;
  explanation: string;
};

const patterns: Pattern[] = [
  {
    name: "Timeout",
    regex: /timeout|timed out|exceeded/i,
    explanation: "May indicate slow app startup, async race conditions, or unstable waits."
  },
  {
    name: "Selector or UI locator",
    regex: /locator|getByRole|getByText|selector|strict mode violation/i,
    explanation: "May indicate brittle locators or UI text changing between runs."
  },
  {
    name: "Network or service startup",
    regex: /ECONNREFUSED|Unable to connect|ERR_CONNECTION|webServer|port|listen/i,
    explanation: "May indicate dependent services are not ready or ports are already in use."
  },
  {
    name: "Payment gateway flow",
    regex: /gateway|payment|redirect|4174|4173/i,
    explanation: "May indicate cross-service redirect, callback, or payment-state issues."
  },
  {
    name: "Retry signal",
    regex: /retry|flaky|on-first-retry/i,
    explanation: "May indicate the test only passes after a retry and needs stabilization."
  }
];

const logPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("tests/fixtures/failureLogs/sample-flaky-log.txt");
const outputDir = path.resolve("qa-artifacts");
const reportPath = path.join(outputDir, "failure-analysis-report.md");
const promptPath = path.join(outputDir, "ai-failure-analysis-prompt.txt");

if (!existsSync(logPath)) {
  throw new Error(`Log file not found: ${logPath}`);
}

const log = readFileSync(logPath, "utf8");
const matches = patterns
  .map((pattern) => ({
    ...pattern,
    count: (log.match(new RegExp(pattern.regex.source, "gi")) ?? []).length
  }))
  .filter((pattern) => pattern.count > 0);

const likelyFlaky = matches.some((match) =>
  ["Timeout", "Network or service startup", "Retry signal", "Selector or UI locator"].includes(match.name)
);

const report = [
  "# Failure Analysis Report",
  "",
  `Log analyzed: ${logPath}`,
  `Likely flaky pattern: ${likelyFlaky ? "Yes" : "No obvious flaky signal"}`,
  "",
  "## Signals",
  "",
  ...matches.map((match) => `- ${match.name}: ${match.count} hit(s). ${match.explanation}`),
  matches.length ? "" : "- No known flaky patterns were detected.",
  "",
  "## Recommended Next Actions",
  "",
  "- If timeout signals appear, replace fixed waits with web-first assertions and verify service startup readiness.",
  "- If selector signals appear, prefer accessible roles and stable labels over CSS-only selectors.",
  "- If network signals appear, isolate ports and make dependent service health checks explicit.",
  "- If retry signals appear, compare first-run failure traces against retry-pass traces.",
  ""
].join("\n");

const prompt = [
  "You are a senior QA automation engineer.",
  "Analyze the following test logs and identify flaky patterns.",
  "Classify each finding as product bug, test bug, environment issue, or unknown.",
  "Return: likely root cause, evidence from logs, confidence, and recommended fix.",
  "",
  "Known FoodHub context:",
  "- Main app: http://127.0.0.1:4173",
  "- Payment gateway: http://127.0.0.1:4174",
  "- Test levels: Vitest unit/integration and Playwright E2E",
  "",
  "Logs:",
  "```",
  log.slice(0, 12_000),
  "```"
].join("\n");

mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, report);
writeFileSync(promptPath, prompt);

console.log(report);
console.log(`AI-ready prompt written to ${promptPath}`);
