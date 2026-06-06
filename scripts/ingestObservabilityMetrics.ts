import { existsSync, readFileSync } from "node:fs";
import { dbPath, latestMetricsPath, openObservabilityDb, saveObservabilityDb } from "./observabilityStore.js";

type LatestMetrics = {
  runId: string;
  generatedAt: string;
  reportScope: string;
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    skippedChecks: number;
    requestCount: number;
    errorCount: number;
    avgDurationMs: number;
    p95DurationMs: number;
    paymentSuccessCount: number;
    paymentFailureCount: number;
  };
  requestLogs: Array<{
    requestId: string;
    timestamp: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    routeFamily: string;
  }>;
  testMetrics: Array<{ type: string; total: number; passed: number; failed: number; skipped: number }>;
  loadMetrics: Array<{ label: string; value: number; threshold: number; unit: string; status: string }>;
  coverageMetrics: Array<{ label: string; value: number; threshold: number; status: string }>;
};

if (!existsSync(latestMetricsPath)) {
  throw new Error(`Metrics JSON was not found at ${latestMetricsPath}. Run npm run observability:collect first.`);
}

const metrics = JSON.parse(readFileSync(latestMetricsPath, "utf8")) as LatestMetrics;
const database = await openObservabilityDb();

database.run("BEGIN TRANSACTION");
try {
  database.run(
    `
      INSERT INTO observability_runs (
        id, generated_at, report_scope, total_checks, passed_checks, failed_checks, skipped_checks,
        request_count, error_count, avg_duration_ms, p95_duration_ms, payment_success_count, payment_failure_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      metrics.runId,
      metrics.generatedAt,
      metrics.reportScope,
      metrics.summary.totalChecks,
      metrics.summary.passedChecks,
      metrics.summary.failedChecks,
      metrics.summary.skippedChecks,
      metrics.summary.requestCount,
      metrics.summary.errorCount,
      metrics.summary.avgDurationMs,
      metrics.summary.p95DurationMs,
      metrics.summary.paymentSuccessCount,
      metrics.summary.paymentFailureCount
    ]
  );

  for (const log of metrics.requestLogs) {
    database.run(
      `
        INSERT OR IGNORE INTO request_logs (
          request_id, run_id, timestamp, method, path, status_code, duration_ms, route_family
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        log.requestId,
        metrics.runId,
        log.timestamp,
        log.method,
        log.path,
        log.statusCode,
        log.durationMs,
        log.routeFamily
      ]
    );
  }

  for (const item of metrics.testMetrics) {
    database.run(
      "INSERT INTO test_metrics (run_id, test_type, total, passed, failed, skipped) VALUES (?, ?, ?, ?, ?, ?)",
      [metrics.runId, item.type, item.total, item.passed, item.failed, item.skipped]
    );
  }

  for (const item of metrics.loadMetrics) {
    database.run(
      "INSERT INTO load_metrics (run_id, label, value, threshold, unit, status) VALUES (?, ?, ?, ?, ?, ?)",
      [metrics.runId, item.label, item.value, item.threshold, item.unit, item.status]
    );
  }

  for (const item of metrics.coverageMetrics) {
    database.run(
      "INSERT INTO coverage_metrics (run_id, label, value, threshold, status) VALUES (?, ?, ?, ?, ?)",
      [metrics.runId, item.label, item.value, item.threshold, item.status]
    );
  }

  database.run("COMMIT");
} catch (error) {
  database.run("ROLLBACK");
  throw error;
}

saveObservabilityDb(database);
console.log(`Ingested observability run ${metrics.runId} into ${dbPath}`);
