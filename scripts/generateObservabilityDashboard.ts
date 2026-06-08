import { utils, writeFile } from "xlsx";
import { writeFileSync } from "node:fs";
import { dashboardPath, firebaseStoreLabel, htmlDashboardPath, readObservabilitySnapshot } from "./observabilityStore.js";

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

writeFileSync(htmlDashboardPath, renderHtmlDashboard(), "utf8");
console.log(`Created ${htmlDashboardPath} with cross-platform Chart.js visuals`);

try {
  writeFile(workbook, dashboardPath, { compression: true });
  console.log(`Created ${dashboardPath} from Firebase Realtime Database at ${firebaseStoreLabel()}`);
} catch (error) {
  if (isFileBusyError(error)) {
    console.warn(`Skipped ${dashboardPath} because it is open or locked. Close the workbook and rerun to refresh the Excel file.`);
  } else {
    throw error;
  }
}

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

function isFileBusyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EBUSY";
}

function renderHtmlDashboard() {
  const latestRuns = runs.slice(0, 12).reverse();
  const latestLoadRows = latestByLabel(loadMetrics).slice(0, 8);
  const latestCoverageRows = latestByLabel(coverageMetrics);
  const topRoutes = routeMetrics.slice(0, 8);
  const recentFailures = prCheckFailures.slice(0, 8);
  const latestRequests = requestLogs.slice(0, 12);
  const runHistoryRows = runs.slice(0, 50);
  const latestRun = runs[0];
  const testTypeTrend = buildTestTypeTrend(latestRuns);
  const report = {
    generatedAt: new Date().toISOString(),
    storage: firebaseStoreLabel(),
    summary: {
      ...accumulatedSummary,
      pass_pct: percentage(accumulatedSummary.passed_checks, accumulatedSummary.total_checks),
      fail_pct: percentage(accumulatedSummary.failed_checks, accumulatedSummary.total_checks),
      service_uptime_pct: serviceHealth[0].uptime_pct,
      request_error_rate_pct: serviceHealth[0].request_error_rate_pct,
      pr_failure_count: prCheckFailures.length
    },
    latestRun,
    routeMetrics: topRoutes,
    statusMetrics,
    testTypeRollup,
    testTypeTrend,
    latestRuns,
    loadRollup: latestLoadRows,
    coverageMetrics: latestCoverageRows,
    serviceHealth: serviceHealth[0],
    recentFailures,
    latestRequests
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FoodHub Observability Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <style>
      :root {
        color: #18231f;
        background: #f5f7f6;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      header { background: #13211b; color: #fff; padding: 24px clamp(18px, 4vw, 42px); }
      header p { color: #bed0c8; margin: 6px 0 0; }
      .tabs { display: flex; gap: 10px; margin-top: 18px; }
      .tab-button { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); border-radius: 6px; color: #fff; cursor: pointer; font: inherit; font-weight: 800; min-height: 38px; padding: 0 14px; }
      .tab-button.active { background: #1f6f50; border-color: #1f6f50; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: clamp(1.6rem, 3vw, 2.35rem); margin-bottom: 0; }
      main { display: grid; gap: 18px; padding: 22px clamp(18px, 4vw, 42px) 34px; }
      .tab-panel[hidden] { display: none; }
      .tab-panel { display: grid; gap: 18px; }
      .kpis { display: grid; gap: 12px; grid-template-columns: repeat(8, minmax(0, 1fr)); }
      .card, .panel { background: #fff; border: 1px solid #dce5e0; border-radius: 8px; box-shadow: 0 8px 22px rgba(21, 35, 29, .05); }
      .card { min-height: 112px; padding: 16px; }
      .card span { color: #62746b; display: block; font-size: .76rem; font-weight: 800; margin-bottom: 8px; text-transform: uppercase; }
      .card strong { display: block; font-size: 1.8rem; line-height: 1.1; }
      .card small { color: #62746b; display: block; margin-top: 8px; }
      .grid { display: grid; gap: 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .wide { grid-column: 1 / -1; }
      .panel { min-height: 360px; padding: 18px; }
      .panel h2 { font-size: 1.05rem; margin-bottom: 14px; }
      canvas { max-height: 292px; width: 100%; }
      table { border-collapse: collapse; font-size: .9rem; width: 100%; }
      th, td { border-bottom: 1px solid #e4ebe7; padding: 9px 8px; text-align: left; vertical-align: top; }
      th { color: #52665d; font-size: .75rem; text-transform: uppercase; }
      .status-passed { color: #187044; font-weight: 800; }
      .status-failed { color: #b8322a; font-weight: 800; }
      .status-skipped { color: #6b7780; font-weight: 800; }
      .muted { color: #62746b; }
      .trend-list { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; }
      .trend-pill { background: #f6f8f7; border: 1px solid #dce5e0; border-radius: 6px; padding: 8px 10px; }
      .trend-pill strong { display: block; }
      .trend-up { color: #187044; }
      .trend-down { color: #b8322a; }
      .trend-flat { color: #62746b; }
      @media (max-width: 1100px) {
        .kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .grid { grid-template-columns: 1fr; }
        .trend-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 680px) {
        .kpis { grid-template-columns: 1fr; }
        .tabs { flex-direction: column; }
        .trend-list { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>FoodHub Observability Dashboard</h1>
      <p>Generated at ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.storage)}</p>
      <nav class="tabs" aria-label="Observability dashboard views">
        <button class="tab-button active" type="button" data-tab="dashboard">Dashboard</button>
        <button class="tab-button" type="button" data-tab="history">Run History</button>
      </nav>
    </header>
    <main>
      <section id="dashboard-panel" class="tab-panel">
        <section class="kpis">
          ${kpi("Runs So Far", accumulatedSummary.run_count, `${accumulatedSummary.first_execution_at || "n/a"} to ${accumulatedSummary.last_execution_at || "n/a"}`)}
          ${kpi("Total Checks", accumulatedSummary.total_checks, `${accumulatedSummary.passed_checks} passed`)}
          ${kpi("Pass Rate", `${percentage(accumulatedSummary.passed_checks, accumulatedSummary.total_checks)}%`, `${accumulatedSummary.failed_checks} failed`)}
          ${kpi("Requests", accumulatedSummary.request_count, `${accumulatedSummary.error_count} errors`)}
          ${kpi("Uptime Metrics", `${serviceHealth[0].uptime_pct}%`, `${serviceHealth[0].healthy_checks}/${serviceHealth[0].health_checks} healthy checks`)}
          ${kpi("Any Crashes", serviceHealth[0].crash_indicators ? "Yes" : "No", `${serviceHealth[0].crash_indicators} crash signals`)}
          ${kpi("P95 ms", accumulatedSummary.p95_duration_ms, `Avg ${accumulatedSummary.avg_duration_ms} ms`)}
          ${kpi("Error Rate", `${serviceHealth[0].request_error_rate_pct}%`, `${accumulatedSummary.error_count} failed requests`)}
        </section>

        <section class="grid">
          ${chartPanel("Pass / Fail Distribution", "statusChart")}
          ${chartPanel("Requests By Route", "routeChart")}
          ${chartPanel("Run Trend", "trendChart")}
          ${chartPanel("Last Executions By Test Type", "testExecutionTrendChart")}
          ${chartPanel("Pass / Fail / Skipped By Test Type", "testTypeChart")}
          ${chartPanel("HTTP Status Distribution", "httpStatusChart")}
          ${chartPanel("Load Metrics So Far", "loadChart")}
          ${chartPanel("Coverage Metrics", "coverageChart")}
          ${chartPanel("Service Health", "healthChart")}
          <div class="panel">
            <h2>Test Case Trend Direction</h2>
            <div class="trend-list">
              ${testTypeTrend.datasets.map((item) => trendPill(item.label, item.direction, item.delta)).join("")}
            </div>
          </div>
        </section>

        <section class="grid">
          <div class="panel">
            <h2>Recent PR Check Failures</h2>
            ${table(recentFailures, ["generated_at", "test_type", "failure_summary"])}
          </div>
          <div class="panel">
            <h2>Recent Request Logs</h2>
            ${table(latestRequests, ["timestamp", "method", "path", "status_code", "duration_ms"])}
          </div>
        </section>
      </section>

      <section id="history-panel" class="tab-panel" hidden>
        <div class="panel wide">
          <h2>Run History</h2>
          ${table(runHistoryRows, ["generated_at", "report_scope", "total_checks", "passed_checks", "failed_checks", "skipped_checks", "request_count", "error_count", "p95_duration_ms"])}
        </div>
      </section>
    </main>
    <script>
      const report = ${JSON.stringify(report)};
      const palette = ["#1f6f50", "#2b6cb0", "#fb8c00", "#c2185b", "#00acc1", "#6d4c41", "#7b1fa2", "#5d6d7e"];
      const statusColors = ["#43a047", "#e53935", "#8b98a5"];

      function makeChart(id, config) {
        const canvas = document.getElementById(id);
        if (!canvas || typeof Chart === "undefined") return;
        new Chart(canvas, config);
      }

      makeChart("statusChart", {
        type: "doughnut",
        data: {
          labels: ["Passed", "Failed", "Skipped"],
          datasets: [{ data: [report.summary.passed_checks, report.summary.failed_checks, report.summary.skipped_checks], backgroundColor: statusColors }]
        },
        options: chartOptions()
      });

      makeChart("routeChart", {
        type: "bar",
        data: {
          labels: report.routeMetrics.map((item) => item.route_family),
          datasets: [
            { label: "Requests", data: report.routeMetrics.map((item) => item.request_count), backgroundColor: "#2b6cb0" },
            { label: "Errors", data: report.routeMetrics.map((item) => item.error_count), backgroundColor: "#e53935" }
          ]
        },
        options: chartOptions()
      });

      makeChart("trendChart", {
        type: "line",
        data: {
          labels: report.latestRuns.map((item) => shortDate(item.generated_at)),
          datasets: [
            { label: "Passed", data: report.latestRuns.map((item) => item.passed_checks), borderColor: "#43a047", backgroundColor: "rgba(67,160,71,.14)", tension: .3 },
            { label: "Failed", data: report.latestRuns.map((item) => item.failed_checks), borderColor: "#e53935", backgroundColor: "rgba(229,57,53,.14)", tension: .3 },
            { label: "P95 ms", data: report.latestRuns.map((item) => item.p95_duration_ms), borderColor: "#00acc1", backgroundColor: "rgba(0,172,193,.14)", tension: .3 }
          ]
        },
        options: chartOptions()
      });

      makeChart("testExecutionTrendChart", {
        type: "line",
        data: {
          labels: report.testTypeTrend.labels.map(shortDate),
          datasets: report.testTypeTrend.datasets.map((item, index) => ({
            label: item.label + " (" + item.direction + ")",
            data: item.values,
            borderColor: palette[index % palette.length],
            backgroundColor: palette[index % palette.length] + "22",
            tension: .3
          }))
        },
        options: chartOptions()
      });

      makeChart("testTypeChart", {
        type: "bar",
        data: {
          labels: report.testTypeRollup.map((item) => item.test_type),
          datasets: [
            { label: "Passed", data: report.testTypeRollup.map((item) => item.passed), backgroundColor: "#43a047" },
            { label: "Failed", data: report.testTypeRollup.map((item) => item.failed), backgroundColor: "#e53935" },
            { label: "Skipped", data: report.testTypeRollup.map((item) => item.skipped), backgroundColor: "#8b98a5" }
          ]
        },
        options: chartOptions({ stacked: true })
      });

      makeChart("httpStatusChart", {
        type: "bar",
        data: {
          labels: report.statusMetrics.map((item) => String(item.status_code)),
          datasets: [{ label: "Requests", data: report.statusMetrics.map((item) => item.request_count), backgroundColor: palette }]
        },
        options: chartOptions()
      });

      makeChart("loadChart", {
        type: "bar",
        data: {
          labels: report.loadRollup.map((item) => item.label),
          datasets: [
            { label: "Average", data: report.loadRollup.map((item) => item.average_value), backgroundColor: "#2b6cb0" },
            { label: "Max", data: report.loadRollup.map((item) => item.max_value), backgroundColor: "#fb8c00" },
            { label: "Latest Threshold", data: report.loadRollup.map((item) => item.threshold), backgroundColor: "#8b98a5" }
          ]
        },
        options: chartOptions()
      });

      makeChart("coverageChart", {
        type: "bar",
        data: {
          labels: report.coverageMetrics.map((item) => item.label),
          datasets: [
            { label: "Coverage %", data: report.coverageMetrics.map((item) => item.value), backgroundColor: "#1f6f50" },
            { label: "Threshold %", data: report.coverageMetrics.map((item) => item.threshold), backgroundColor: "#8b98a5" }
          ]
        },
        options: chartOptions()
      });

      makeChart("healthChart", {
        type: "bar",
        data: {
          labels: ["Healthy", "Failed", "Crashes", "Error Rate %"],
          datasets: [{
            label: "Service Health",
            data: [
              report.serviceHealth.healthy_checks,
              report.serviceHealth.failed_health_checks,
              report.serviceHealth.crash_indicators,
              report.serviceHealth.request_error_rate_pct
            ],
            backgroundColor: ["#43a047", "#e53935", "#6d4c41", "#fb8c00"]
          }]
        },
        options: chartOptions()
      });

      function chartOptions(extra = {}) {
        return {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: extra.stacked
            ? { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            : { y: { beginAtZero: true } }
        };
      }

      function shortDate(value) {
        if (!value) return "";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
      }

      document.querySelectorAll(".tab-button").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          const selected = button.dataset.tab;
          document.getElementById("dashboard-panel").hidden = selected !== "dashboard";
          document.getElementById("history-panel").hidden = selected !== "history";
        });
      });
    </script>
  </body>
</html>`;
}

function buildTestTypeTrend(latestRuns: SheetRow[]) {
  const labels = latestRuns.map((run) => String(run.generated_at ?? ""));
  const runSet = new Set(labels);
  const trendRows = testMetrics.filter((row) => runSet.has(String(row.generated_at ?? "")));
  return {
    labels,
    datasets: expectedTestTypes.map((testType) => {
      const values = labels.map((label) => {
        const row = trendRows.find((item) => item.generated_at === label && item.test_type === testType);
        return Number(row?.total ?? 0);
      });
      const delta = values.length ? values[values.length - 1] - values[0] : 0;
      return {
        label: testType,
        values,
        delta,
        direction: delta > 0 ? "increasing" : delta < 0 ? "decreasing" : "flat"
      };
    })
  };
}

function latestByLabel(rows: SheetRow[]) {
  return Array.from(groupBy(rows, (row) => String(row.label ?? row.test_type ?? "")).values())
    .map((items) => [...items].sort((a, b) => String(b.generated_at ?? "").localeCompare(String(a.generated_at ?? "")))[0])
    .filter(Boolean);
}

function kpi(label: string, value: unknown, detail: string) {
  return `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function chartPanel(title: string, id: string) {
  return `<div class="panel"><h2>${escapeHtml(title)}</h2><canvas id="${id}"></canvas></div>`;
}

function trendPill(label: string, direction: string, delta: number) {
  const className = direction === "increasing" ? "trend-up" : direction === "decreasing" ? "trend-down" : "trend-flat";
  const sign = delta > 0 ? `+${delta}` : String(delta);
  return `<div class="trend-pill"><strong>${escapeHtml(label)}</strong><span class="${className}">${escapeHtml(direction)} (${escapeHtml(sign)})</span></div>`;
}

function table(rows: SheetRow[], headers: string[]) {
  if (!rows.length) {
    return `<p class="muted">No rows available.</p>`;
  }

  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header.replace(/_/g, " "))}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${headers.map((header) => `<td>${formatCell(row[header])}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function formatCell(value: unknown) {
  const text = String(value ?? "");
  const className = text === "Passed" ? "status-passed" : text === "Failed" ? "status-failed" : text === "Skipped" ? "status-skipped" : "";
  return className ? `<span class="${className}">${escapeHtml(text)}</span>` : escapeHtml(text);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
