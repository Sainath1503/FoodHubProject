import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import {
  firebaseStoreLabel,
  legacyDbPath,
  mergeObservabilitySnapshot,
  observabilityDir,
  type CoverageMetric,
  type LoadMetric,
  type ObservabilityRun,
  type RequestLog,
  type TestMetric
} from "./observabilityStore.js";

if (!existsSync(legacyDbPath)) {
  console.log(`No legacy SQLite observability DB found at ${legacyDbPath}. Nothing to migrate.`);
  process.exit(0);
}

mkdirSync(observabilityDir, { recursive: true });

const SQL = await initSqlJs({
  locateFile: (file) => path.resolve("node_modules", "sql.js", "dist", file)
});
const database = new SQL.Database(readFileSync(legacyDbPath));

try {
  const runs = queryAll<ObservabilityRun>(database, `
    SELECT id, generated_at, report_scope, total_checks, passed_checks, failed_checks, skipped_checks,
           request_count, error_count, avg_duration_ms, p95_duration_ms,
           payment_success_count, payment_failure_count
    FROM observability_runs
    ORDER BY generated_at DESC
  `);

  const requestLogs = queryAll<RequestLog>(database, `
    SELECT request_id, run_id, timestamp, method, path, status_code, duration_ms, route_family
    FROM request_logs
  `);

  const testMetrics = queryAll<Omit<TestMetric, "id"> & { rowid: number }>(database, `
    SELECT id AS rowid, run_id, test_type, total, passed, failed, skipped
    FROM test_metrics
  `).map((row) => ({
    id: `legacy-test-${row.rowid}`,
    run_id: row.run_id,
    test_type: row.test_type,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped
  }));

  const loadMetrics = queryAll<Omit<LoadMetric, "id"> & { rowid: number }>(database, `
    SELECT id AS rowid, run_id, label, value, threshold, unit, status
    FROM load_metrics
  `).map((row) => ({
    id: `legacy-load-${row.rowid}`,
    run_id: row.run_id,
    label: row.label,
    value: row.value,
    threshold: row.threshold,
    unit: row.unit,
    status: row.status
  }));

  const coverageMetrics = queryAll<Omit<CoverageMetric, "id"> & { rowid: number }>(database, `
    SELECT id AS rowid, run_id, label, value, threshold, status
    FROM coverage_metrics
  `).map((row) => ({
    id: `legacy-coverage-${row.rowid}`,
    run_id: row.run_id,
    label: row.label,
    value: row.value,
    threshold: row.threshold,
    status: row.status
  }));

  await mergeObservabilitySnapshot({ runs, requestLogs, testMetrics, loadMetrics, coverageMetrics });

  console.log(
    `Migrated ${runs.length} runs, ${requestLogs.length} request logs, ` +
      `${testMetrics.length} test metrics, ${loadMetrics.length} load metrics, ` +
      `${coverageMetrics.length} coverage metrics to Firebase Realtime Database at ${firebaseStoreLabel()}`
  );
} finally {
  database.close();
}

function queryAll<T extends Record<string, unknown>>(database: Database, sql: string): T[] {
  const statement = database.prepare(sql);
  const rows: T[] = [];
  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
  } finally {
    statement.free();
  }
  return rows;
}
