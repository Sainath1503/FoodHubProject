import { existsSync } from "node:fs";
import { utils, writeFile } from "xlsx";
import {
  dashboardPath,
  dbPath,
  openObservabilityDb,
  queryAll,
  saveObservabilityDb
} from "./observabilityStore.js";

if (!existsSync(dbPath)) {
  throw new Error(`Observability SQLite DB was not found at ${dbPath}. Run npm run observability:refresh first.`);
}

const database = await openObservabilityDb();

const runs = queryAll(database, `
  SELECT generated_at, report_scope, total_checks, passed_checks, failed_checks, skipped_checks,
         request_count, error_count, avg_duration_ms, p95_duration_ms,
         payment_success_count, payment_failure_count
  FROM observability_runs
  ORDER BY generated_at DESC
`);

const routeMetrics = queryAll(database, `
  SELECT route_family, COUNT(*) AS request_count,
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
         ROUND(AVG(duration_ms), 2) AS avg_duration_ms,
         MAX(duration_ms) AS max_duration_ms
  FROM request_logs
  GROUP BY route_family
  ORDER BY request_count DESC
`);

const statusMetrics = queryAll(database, `
  SELECT status_code, COUNT(*) AS request_count
  FROM request_logs
  GROUP BY status_code
  ORDER BY status_code
`);

const requestLogs = queryAll(database, `
  SELECT timestamp, request_id, method, path, status_code, duration_ms, route_family
  FROM request_logs
  ORDER BY timestamp DESC
  LIMIT 1000
`);

const testMetrics = queryAll(database, `
  SELECT r.generated_at, t.test_type, t.total, t.passed, t.failed, t.skipped
  FROM test_metrics t
  JOIN observability_runs r ON r.id = t.run_id
  ORDER BY r.generated_at DESC, t.test_type
`);

const loadMetrics = queryAll(database, `
  SELECT r.generated_at, l.label, l.value, l.threshold, l.unit, l.status
  FROM load_metrics l
  JOIN observability_runs r ON r.id = l.run_id
  ORDER BY r.generated_at DESC, l.label
`);

const coverageMetrics = queryAll(database, `
  SELECT r.generated_at, c.label, c.value, c.threshold, c.status
  FROM coverage_metrics c
  JOIN observability_runs r ON r.id = c.run_id
  ORDER BY r.generated_at DESC, c.label
`);

const latest = runs[0] ?? {};
const workbook = utils.book_new();

appendSheet("Dashboard", [
  ["FoodHub Local Observability Dashboard"],
  ["Generated At", new Date().toISOString()],
  [],
  ["Latest Run KPI", "Value"],
  ["Report Scope", latest.report_scope ?? "No runs ingested"],
  ["Total Checks", latest.total_checks ?? 0],
  ["Passed Checks", latest.passed_checks ?? 0],
  ["Failed Checks", latest.failed_checks ?? 0],
  ["Skipped Checks", latest.skipped_checks ?? 0],
  ["Request Count", latest.request_count ?? 0],
  ["Error Count", latest.error_count ?? 0],
  ["Average Duration ms", latest.avg_duration_ms ?? 0],
  ["P95 Duration ms", latest.p95_duration_ms ?? 0],
  ["Payment Success Count", latest.payment_success_count ?? 0],
  ["Payment Failure Count", latest.payment_failure_count ?? 0],
  [],
  ["Chart Data: Requests By Route"],
  ["Route", "Requests", "Errors", "Avg ms", "Max ms"],
  ...routeMetrics.map((row) => [
    row.route_family,
    row.request_count,
    row.error_count,
    row.avg_duration_ms,
    row.max_duration_ms
  ]),
  [],
  ["Chart Data: Status Code Distribution"],
  ["Status Code", "Requests"],
  ...statusMetrics.map((row) => [row.status_code, row.request_count])
]);

appendJsonSheet("Run History", runs);
appendJsonSheet("Request Logs", requestLogs);
appendJsonSheet("Route Metrics", routeMetrics);
appendJsonSheet("Status Metrics", statusMetrics);
appendJsonSheet("Test Metrics", testMetrics);
appendJsonSheet("Load Metrics", loadMetrics);
appendJsonSheet("Coverage Metrics", coverageMetrics);

writeFile(workbook, dashboardPath, { compression: true });
saveObservabilityDb(database);
console.log(`Created ${dashboardPath}`);

function appendJsonSheet(name: string, rows: Record<string, unknown>[]) {
  const worksheet = rows.length ? utils.json_to_sheet(rows) : utils.aoa_to_sheet([["No data available"]]);
  worksheet["!cols"] = autoWidths(rows);
  utils.book_append_sheet(workbook, worksheet, name);
}

function appendSheet(name: string, rows: unknown[][]) {
  const worksheet = utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 32 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 }
  ];
  utils.book_append_sheet(workbook, worksheet, name);
}

function autoWidths(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return [{ wch: 18 }];
  }

  return Object.keys(rows[0]).map((key) => ({
    wch: Math.min(
      48,
      Math.max(
        key.length + 2,
        ...rows.map((row) => String(row[key] ?? "").length + 2)
      )
    )
  }));
}
