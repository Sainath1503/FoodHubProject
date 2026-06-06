import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { latestMetricsPath, metricsDir, rawDir } from "./observabilityStore.js";

type RequestLog = {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

type Report = {
  generatedAt: string;
  tests: Array<{ type: string; status: string; durationMs: number }>;
  byType: Array<{ type: string; total: number; passed: number; failed: number; skipped: number }>;
  statusCounts: { passed: number; failed: number; skipped: number };
  loadMetrics: Array<{ label: string; value: number; threshold: number; unit: string; status: string }>;
  coverageMetrics: Array<{ label: string; value: number; threshold: number; status: string }>;
};

const reportPath = path.resolve("qa-artifacts", "test-report.html");
const requestLogPath = path.join(rawDir, "request-logs.jsonl");
const generatedAt = new Date().toISOString();
const report = readReport();
const requests = readRequestLogs();
const durations = requests.map((item) => Number(item.durationMs)).sort((a, b) => a - b);
const requestCount = requests.length;
const errorCount = requests.filter((item) => item.statusCode >= 400).length;
const paymentRequests = requests.filter((item) => item.path.includes("/order"));

const payload = {
  runId: randomUUID(),
  generatedAt,
  reportScope: detectReportScope(),
  summary: {
    totalChecks: report?.tests.length ?? 0,
    passedChecks: report?.statusCounts.passed ?? 0,
    failedChecks: report?.statusCounts.failed ?? 0,
    skippedChecks: report?.statusCounts.skipped ?? 0,
    requestCount,
    errorCount,
    avgDurationMs: average(durations),
    p95DurationMs: percentile(durations, 95),
    paymentSuccessCount: paymentRequests.filter((item) => item.statusCode >= 200 && item.statusCode < 300).length,
    paymentFailureCount: paymentRequests.filter((item) => item.statusCode >= 400).length
  },
  requestLogs: requests.map((item) => ({
    ...item,
    routeFamily: routeFamily(item.path)
  })),
  testMetrics: report?.byType ?? [],
  loadMetrics: report?.loadMetrics ?? [],
  coverageMetrics: report?.coverageMetrics ?? []
};

mkdirSync(metricsDir, { recursive: true });
writeFileSync(latestMetricsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Created ${latestMetricsPath}`);

function readReport(): Report | undefined {
  if (!existsSync(reportPath)) {
    return undefined;
  }

  const html = readFileSync(reportPath, "utf8");
  const match = html.match(/const report = (.*?);\s+const buttons/s);
  if (!match) {
    return undefined;
  }

  return JSON.parse(match[1]) as Report;
}

function detectReportScope(): string {
  if (!existsSync(reportPath)) {
    return "Unknown";
  }

  const html = readFileSync(reportPath, "utf8");
  const match = html.match(/Scope: ([^.<]+)\./);
  return match?.[1] ?? "All Tests";
}

function readRequestLogs(): RequestLog[] {
  if (!existsSync(requestLogPath)) {
    return [];
  }

  return readFileSync(requestLogPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as RequestLog];
      } catch {
        return [];
      }
    });
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.ceil((percentileValue / 100) * values.length) - 1);
  return round(values[index]);
}

function routeFamily(urlPath: string): string {
  const cleanPath = urlPath.split("?")[0];
  if (cleanPath.startsWith("/api-docs")) return "/api-docs";
  if (cleanPath.startsWith("/order")) return "/order";
  if (cleanPath.startsWith("/menu")) return "/menu";
  if (cleanPath.startsWith("/health")) return "/health";
  if (cleanPath.startsWith("/openapi.json")) return "/openapi.json";
  if (cleanPath === "/" || cleanPath.startsWith("/app") || cleanPath.startsWith("/styles")) return "static-ui";
  return "other";
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
