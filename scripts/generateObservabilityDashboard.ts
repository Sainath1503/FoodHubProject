import { utils, writeFile } from "xlsx";
import { dashboardPath, firebaseStoreLabel, readObservabilitySnapshot } from "./observabilityStore.js";

type SheetRow = Record<string, unknown>;

const snapshot = await readObservabilitySnapshot();
const runs = snapshot.runs.map(withoutId);
const runLookup = new Map(snapshot.runs.map((run) => [run.id, run]));

const routeMetrics = Array.from(groupBy(snapshot.requestLogs, (row) => row.route_family).entries())
  .map(([routeFamily, logs]) => ({
    route_family: routeFamily,
    request_count: logs.length,
    error_count: logs.filter((log) => log.status_code >= 400).length,
    avg_duration_ms: round(avg(logs.map((log) => log.duration_ms)), 2),
    max_duration_ms: Math.max(...logs.map((log) => log.duration_ms))
  }))
  .sort((a, b) => b.request_count - a.request_count);

const statusMetrics = Array.from(groupBy(snapshot.requestLogs, (row) => String(row.status_code)).entries())
  .map(([statusCode, logs]) => ({
    status_code: Number(statusCode),
    request_count: logs.length
  }))
  .sort((a, b) => a.status_code - b.status_code);

const requestLogs = snapshot.requestLogs.slice(0, 1000).map(withoutId);

const testMetrics = snapshot.testMetrics
  .map((metric) => ({
    generated_at: runLookup.get(metric.run_id)?.generated_at ?? "",
    test_type: metric.test_type,
    total: metric.total,
    passed: metric.passed,
    failed: metric.failed,
    skipped: metric.skipped
  }))
  .sort(sortGeneratedAtDescThen("test_type"));

const loadMetrics = snapshot.loadMetrics
  .map((metric) => ({
    generated_at: runLookup.get(metric.run_id)?.generated_at ?? "",
    label: metric.label,
    value: metric.value,
    threshold: metric.threshold,
    unit: metric.unit,
    status: metric.status
  }))
  .sort(sortGeneratedAtDescThen("label"));

const coverageMetrics = snapshot.coverageMetrics
  .map((metric) => ({
    generated_at: runLookup.get(metric.run_id)?.generated_at ?? "",
    label: metric.label,
    value: metric.value,
    threshold: metric.threshold,
    status: metric.status
  }))
  .sort(sortGeneratedAtDescThen("label"));

const accumulatedSummary = {
  report_scope: "All Firebase Runs So Far",
  run_count: runs.length,
  first_execution_at: runs.length ? runs[runs.length - 1].generated_at : "",
  last_execution_at: runs[0]?.generated_at ?? "",
  total_checks: sum(runs.map((run) => run.total_checks)),
  passed_checks: sum(runs.map((run) => run.passed_checks)),
  failed_checks: sum(runs.map((run) => run.failed_checks)),
  skipped_checks: sum(runs.map((run) => run.skipped_checks)),
  request_count: snapshot.requestLogs.length,
  error_count: snapshot.requestLogs.filter((log) => log.status_code >= 400).length,
  avg_duration_ms: round(avg(snapshot.requestLogs.map((log) => log.duration_ms)), 2),
  p95_duration_ms: percentile(snapshot.requestLogs.map((log) => log.duration_ms), 95),
  payment_success_count: snapshot.requestLogs.filter((log) => log.route_family === "/order" && log.status_code >= 200 && log.status_code < 300).length,
  payment_failure_count: snapshot.requestLogs.filter((log) => log.route_family === "/order" && log.status_code >= 400).length
};

const testTypeRollup = Array.from(groupBy(testMetrics, (row) => String(row.test_type)).entries())
  .map(([testType, rows]) => {
    const sortedRows = [...rows].sort((a, b) => String(b.generated_at ?? "").localeCompare(String(a.generated_at ?? "")));
    const total = sum(rows.map((row) => Number(row.total ?? 0)));
    const passed = sum(rows.map((row) => Number(row.passed ?? 0)));
    const failed = sum(rows.map((row) => Number(row.failed ?? 0)));
    const skipped = sum(rows.map((row) => Number(row.skipped ?? 0)));
    return {
      test_type: testType,
      executions: rows.length,
      last_execution_at: sortedRows[0]?.generated_at ?? "",
      total,
      passed,
      failed,
      skipped,
      pass_pct: percentage(passed, total),
      fail_pct: percentage(failed, total)
    };
  })
  .sort((a, b) => a.test_type.localeCompare(b.test_type));

const coverageRollup = coverageExecutionRollup(coverageMetrics);
if (coverageRollup) {
  testTypeRollup.push(coverageRollup);
}

const expectedTestTypes = ["Unit", "Integration", "Contract", "Coverage", "E2E", "Load"];
for (const testType of expectedTestTypes) {
  if (!testTypeRollup.some((row) => row.test_type === testType)) {
    testTypeRollup.push({
      test_type: testType,
      executions: 0,
      last_execution_at: "",
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      pass_pct: 0,
      fail_pct: 0
    });
  }
}
testTypeRollup.sort((a, b) => expectedTestTypes.indexOf(a.test_type) - expectedTestTypes.indexOf(b.test_type));

const prCheckFailures = [
  ...testMetrics
    .filter((row) => Number(row.failed ?? 0) > 0 || Number(row.skipped ?? 0) > 0)
    .map((row) => ({
    generated_at: row.generated_at,
    test_type: row.test_type,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped,
    failure_summary: failureSummary(Number(row.failed ?? 0), Number(row.skipped ?? 0))
    })),
  ...coverageFailureRows(coverageMetrics)
]
  .sort(sortGeneratedAtDescThen("test_type"));

const loadRollup = Array.from(groupBy(loadMetrics, (row) => String(row.label)).entries())
  .map(([label, rows]) => {
    const sortedRows = [...rows].sort((a, b) => String(b.generated_at ?? "").localeCompare(String(a.generated_at ?? "")));
    const values = rows.map((row) => Number(row.value ?? 0));
    return {
      label,
      executions: rows.length,
      latest_generated_at: sortedRows[0]?.generated_at ?? "",
      latest_value: Number(sortedRows[0]?.value ?? 0),
      average_value: round(avg(values), 2),
      max_value: values.length ? Math.max(...values) : 0,
      threshold: Number(sortedRows[0]?.threshold ?? 0),
      unit: sortedRows[0]?.unit ?? "",
      passed_runs: rows.filter((row) => String(row.status).toLowerCase() === "passed").length,
      failed_runs: rows.filter((row) => String(row.status).toLowerCase() !== "passed").length,
      latest_status: sortedRows[0]?.status ?? ""
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

const healthLogs = snapshot.requestLogs.filter((log) => log.route_family === "/health");
const healthSuccess = healthLogs.filter((log) => log.status_code >= 200 && log.status_code < 300).length;
const healthFailures = healthLogs.length - healthSuccess;
const serviceCrashes = snapshot.requestLogs.filter((log) => log.status_code >= 500);
const latestHealth = [...healthLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
const serviceHealth = [
  {
    service: "FoodHub API",
    health_checks: healthLogs.length,
    healthy_checks: healthSuccess,
    failed_health_checks: healthFailures,
    uptime_pct: percentage(healthSuccess, healthLogs.length),
    crash_indicators: serviceCrashes.length,
    request_error_rate_pct: percentage(accumulatedSummary.error_count, accumulatedSummary.request_count),
    latest_health_at: latestHealth?.timestamp ?? "",
    latest_health_status: latestHealth?.status_code ?? "",
    last_crash_at: serviceCrashes.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp ?? ""
  }
];

const workbook = utils.book_new();

appendSheet("Dashboard", [
  ["FoodHub Observability Dashboard"],
  ["Generated At", new Date().toISOString()],
  ["Storage", firebaseStoreLabel()],
  [],
  ["Execution So Far KPI", "Value"],
  ["Report Scope", accumulatedSummary.report_scope],
  ["Run Count", accumulatedSummary.run_count],
  ["First Execution At", accumulatedSummary.first_execution_at],
  ["Last Execution At", accumulatedSummary.last_execution_at],
  ["Total Checks", accumulatedSummary.total_checks],
  ["Passed Checks", accumulatedSummary.passed_checks],
  ["Failed Checks", accumulatedSummary.failed_checks],
  ["Skipped Checks", accumulatedSummary.skipped_checks],
  ["Pass %", percentage(accumulatedSummary.passed_checks, accumulatedSummary.total_checks)],
  ["Fail %", percentage(accumulatedSummary.failed_checks, accumulatedSummary.total_checks)],
  ["PR Check Failures", prCheckFailures.length],
  ["Request Count", accumulatedSummary.request_count],
  ["Error Count", accumulatedSummary.error_count],
  ["Average Duration ms", accumulatedSummary.avg_duration_ms],
  ["P95 Duration ms", accumulatedSummary.p95_duration_ms],
  ["Payment Success Count", accumulatedSummary.payment_success_count],
  ["Payment Failure Count", accumulatedSummary.payment_failure_count],
  ["Service Uptime %", serviceHealth[0].uptime_pct],
  ["Crash Indicators", serviceHealth[0].crash_indicators],
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

appendJsonSheet("Execution Summary", [accumulatedSummary], [
  "report_scope",
  "run_count",
  "first_execution_at",
  "last_execution_at",
  "total_checks",
  "passed_checks",
  "failed_checks",
  "skipped_checks",
  "request_count",
  "error_count",
  "avg_duration_ms",
  "p95_duration_ms",
  "payment_success_count",
  "payment_failure_count"
]);
appendJsonSheet("Run History", runs, [
  "generated_at",
  "report_scope",
  "total_checks",
  "passed_checks",
  "failed_checks",
  "skipped_checks",
  "request_count",
  "error_count",
  "avg_duration_ms",
  "p95_duration_ms",
  "payment_success_count",
  "payment_failure_count"
]);
appendJsonSheet("Request Logs", requestLogs, [
  "timestamp",
  "request_id",
  "method",
  "path",
  "status_code",
  "duration_ms",
  "route_family"
]);
appendJsonSheet("Route Metrics", routeMetrics, ["route_family", "request_count", "error_count", "avg_duration_ms", "max_duration_ms"]);
appendJsonSheet("Status Metrics", statusMetrics, ["status_code", "request_count"]);
appendJsonSheet("Test Metrics", testMetrics, ["generated_at", "test_type", "total", "passed", "failed", "skipped"]);
appendJsonSheet("Test Type Rollup", testTypeRollup, ["test_type", "executions", "last_execution_at", "total", "passed", "failed", "skipped", "pass_pct", "fail_pct"]);
appendJsonSheet("PR Check Failures", prCheckFailures, ["generated_at", "test_type", "total", "passed", "failed", "skipped", "failure_summary"]);
appendJsonSheet("Load Metrics", loadMetrics, ["generated_at", "label", "value", "threshold", "unit", "status"]);
appendJsonSheet("Load Rollup", loadRollup, ["label", "executions", "latest_generated_at", "latest_value", "average_value", "max_value", "threshold", "unit", "passed_runs", "failed_runs", "latest_status"]);
appendJsonSheet("Coverage Metrics", coverageMetrics, ["generated_at", "label", "value", "threshold", "status"]);
appendJsonSheet("Service Health", serviceHealth, ["service", "health_checks", "healthy_checks", "failed_health_checks", "uptime_pct", "crash_indicators", "request_error_rate_pct", "latest_health_at", "latest_health_status", "last_crash_at"]);

writeFile(workbook, dashboardPath, { compression: true });
console.log(`Created ${dashboardPath} from Firebase Realtime Database at ${firebaseStoreLabel()}`);

function appendJsonSheet(name: string, rows: SheetRow[], headers: string[]) {
  const sheetRows = rows.map((row) => Object.fromEntries(headers.map((header) => [header, row[header]])));
  const worksheet = rows.length
    ? utils.json_to_sheet(sheetRows, { header: headers })
    : utils.aoa_to_sheet([headers.length ? headers : ["No data available"]]);
  worksheet["!cols"] = autoWidths(sheetRows, headers);
  utils.book_append_sheet(workbook, worksheet, name);
}

function appendSheet(name: string, rows: unknown[][]) {
  const worksheet = utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 32 },
    { wch: 52 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 }
  ];
  utils.book_append_sheet(workbook, worksheet, name);
}

function autoWidths(rows: SheetRow[], headers?: string[]) {
  if (!rows.length) {
    return [{ wch: 18 }];
  }

  return (headers ?? Object.keys(rows[0])).map((key) => ({
    wch: Math.min(
      48,
      Math.max(
        key.length + 2,
        ...rows.map((row) => String(row[key] ?? "").length + 2)
      )
    )
  }));
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }
  return groups;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function percentage(part: number, total: number) {
  return total > 0 ? round((part / total) * 100, 2) : 0;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) {
    return 0;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.min(sortedValues.length - 1, Math.ceil((percentileValue / 100) * sortedValues.length) - 1);
  return round(sortedValues[index], 2);
}

function failureSummary(failed: number, skipped: number) {
  const parts = [];
  if (failed) {
    parts.push(`${failed} failed`);
  }
  if (skipped) {
    parts.push(`${skipped} skipped`);
  }
  return parts.join(", ");
}

function coverageExecutionRollup(rows: SheetRow[]) {
  if (!rows.length) {
    return undefined;
  }

  const sortedRows = [...rows].sort((a, b) => String(b.generated_at ?? "").localeCompare(String(a.generated_at ?? "")));
  const total = rows.length;
  const passed = rows.filter((row) => String(row.status) === "Passed").length;
  const failed = rows.filter((row) => String(row.status) === "Failed").length;
  const skipped = rows.filter((row) => String(row.status) === "Skipped").length;
  const executions = new Set(rows.map((row) => String(row.generated_at ?? ""))).size;

  return {
    test_type: "Coverage",
    executions,
    last_execution_at: sortedRows[0]?.generated_at ?? "",
    total,
    passed,
    failed,
    skipped,
    pass_pct: percentage(passed, total),
    fail_pct: percentage(failed, total)
  };
}

function coverageFailureRows(rows: SheetRow[]) {
  return Array.from(groupBy(rows, (row) => String(row.generated_at ?? "")).entries())
    .flatMap(([generatedAt, coverageRows]) => {
      const total = coverageRows.length;
      const passed = coverageRows.filter((row) => String(row.status) === "Passed").length;
      const failed = coverageRows.filter((row) => String(row.status) === "Failed").length;
      const skipped = coverageRows.filter((row) => String(row.status) === "Skipped").length;
      if (!failed && !skipped) {
        return [];
      }

      const affectedMetrics = coverageRows
        .filter((row) => String(row.status) !== "Passed")
        .map((row) => `${row.label}: ${row.status}`)
        .join(", ");

      return [{
        generated_at: generatedAt,
        test_type: "Coverage",
        total,
        passed,
        failed,
        skipped,
        failure_summary: `${failureSummary(failed, skipped)}${affectedMetrics ? ` (${affectedMetrics})` : ""}`
      }];
    });
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function sortGeneratedAtDescThen(key: string) {
  return (a: SheetRow, b: SheetRow) =>
    String(b.generated_at ?? "").localeCompare(String(a.generated_at ?? "")) ||
    String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
}

function withoutId<T extends { id?: string }>(row: T) {
  const { id: _id, ...rest } = row;
  return rest;
}
