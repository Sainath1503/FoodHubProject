import { mkdirSync } from "node:fs";
import path from "node:path";

export const observabilityDir = path.resolve("qa-artifacts", "observability");
export const rawDir = path.join(observabilityDir, "raw");
export const metricsDir = path.join(observabilityDir, "metrics");
export const legacyDbPath = path.join(observabilityDir, "foodhub-observability.sqlite");
export const dashboardPath = path.resolve("qa-artifacts", "FoodHub-Observability-Dashboard.xlsx");
export const htmlDashboardPath = path.resolve("qa-artifacts", "FoodHub-Observability-Dashboard.html");
export const latestMetricsPath = path.join(metricsDir, "latest-observability-metrics.json");

export const firebaseDatabaseUrl =
  process.env.FOODHUB_FIREBASE_DATABASE_URL ?? "https://foodhub-6ba1c-default-rtdb.firebaseio.com/";
const firebaseRootPath = trimSlashes(process.env.FOODHUB_FIREBASE_OBSERVABILITY_PATH ?? "observability");
const firebaseAuthToken = process.env.FOODHUB_FIREBASE_AUTH_TOKEN;

export type LatestMetrics = {
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
  requestLogs: RequestLogInput[];
  testMetrics: TestMetricInput[];
  loadMetrics: LoadMetricInput[];
  coverageMetrics: CoverageMetricInput[];
};

export type ObservabilityRun = {
  id: string;
  generated_at: string;
  report_scope: string;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  skipped_checks: number;
  request_count: number;
  error_count: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  payment_success_count: number;
  payment_failure_count: number;
};

export type RequestLog = {
  request_id: string;
  run_id: string;
  timestamp: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  route_family: string;
};

export type TestMetric = {
  id: string;
  run_id: string;
  test_type: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
};

export type LoadMetric = {
  id: string;
  run_id: string;
  label: string;
  value: number;
  threshold: number;
  unit: string;
  status: string;
};

export type CoverageMetric = {
  id: string;
  run_id: string;
  label: string;
  value: number;
  threshold: number;
  status: string;
};

type RequestLogInput = {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  routeFamily: string;
};

type TestMetricInput = { type: string; total: number; passed: number; failed: number; skipped: number };
type LoadMetricInput = { label: string; value: number; threshold: number; unit: string; status: string };
type CoverageMetricInput = { label: string; value: number; threshold: number; status: string };

export type ObservabilitySnapshot = {
  runs: ObservabilityRun[];
  requestLogs: RequestLog[];
  testMetrics: TestMetric[];
  loadMetrics: LoadMetric[];
  coverageMetrics: CoverageMetric[];
};

type FirebaseSnapshot = {
  runs?: Record<string, ObservabilityRun>;
  requestLogs?: Record<string, RequestLog>;
  testMetrics?: Record<string, TestMetric>;
  loadMetrics?: Record<string, LoadMetric>;
  coverageMetrics?: Record<string, CoverageMetric>;
};

export async function ingestLatestMetrics(metrics: LatestMetrics) {
  mkdirSync(observabilityDir, { recursive: true });

  const run = latestMetricsToRun(metrics);
  await putFirebase(`runs/${firebaseKey(metrics.runId)}`, run);
  await patchFirebase("requestLogs", objectFromEntries(metrics.requestLogs.map((log) => {
    const requestLog = latestRequestLogToRecord(metrics.runId, log);
    return [firebaseKey(requestLog.request_id), requestLog];
  })));
  await patchFirebase("testMetrics", objectFromEntries(metrics.testMetrics.map((item, index) => {
    const id = metricId(metrics.runId, item.type, index);
    return [id, { id, run_id: metrics.runId, test_type: item.type, total: item.total, passed: item.passed, failed: item.failed, skipped: item.skipped }];
  })));
  await patchFirebase("loadMetrics", objectFromEntries(metrics.loadMetrics.map((item, index) => {
    const id = metricId(metrics.runId, item.label, index);
    return [id, { id, run_id: metrics.runId, label: item.label, value: item.value, threshold: item.threshold, unit: item.unit, status: item.status }];
  })));
  await patchFirebase("coverageMetrics", objectFromEntries(metrics.coverageMetrics.map((item, index) => {
    const id = metricId(metrics.runId, item.label, index);
    return [id, { id, run_id: metrics.runId, label: item.label, value: item.value, threshold: item.threshold, status: item.status }];
  })));
}

export async function readObservabilitySnapshot(): Promise<ObservabilitySnapshot> {
  const snapshot = (await getFirebase("")) as FirebaseSnapshot | null;
  return normalizeSnapshot(snapshot);
}

export async function replaceObservabilitySnapshot(snapshot: ObservabilitySnapshot) {
  await putFirebase("", {
    runs: recordsByKey(snapshot.runs, (row) => row.id),
    requestLogs: recordsByKey(snapshot.requestLogs, (row) => row.request_id),
    testMetrics: recordsByKey(snapshot.testMetrics, (row) => row.id),
    loadMetrics: recordsByKey(snapshot.loadMetrics, (row) => row.id),
    coverageMetrics: recordsByKey(snapshot.coverageMetrics, (row) => row.id)
  });
}

export async function mergeObservabilitySnapshot(snapshot: ObservabilitySnapshot) {
  await patchFirebase("runs", recordsByKey(snapshot.runs, (row) => row.id));
  await patchFirebase("requestLogs", recordsByKey(snapshot.requestLogs, (row) => row.request_id));
  await patchFirebase("testMetrics", recordsByKey(snapshot.testMetrics, (row) => row.id));
  await patchFirebase("loadMetrics", recordsByKey(snapshot.loadMetrics, (row) => row.id));
  await patchFirebase("coverageMetrics", recordsByKey(snapshot.coverageMetrics, (row) => row.id));
}

export async function truncateObservabilityStore() {
  await deleteFirebase("");
}

export function firebaseStoreLabel() {
  return `${firebaseDatabaseUrl.replace(/\/$/, "")}/${firebaseRootPath}`;
}

function latestMetricsToRun(metrics: LatestMetrics): ObservabilityRun {
  return {
    id: metrics.runId,
    generated_at: metrics.generatedAt,
    report_scope: metrics.reportScope,
    total_checks: metrics.summary.totalChecks,
    passed_checks: metrics.summary.passedChecks,
    failed_checks: metrics.summary.failedChecks,
    skipped_checks: metrics.summary.skippedChecks,
    request_count: metrics.summary.requestCount,
    error_count: metrics.summary.errorCount,
    avg_duration_ms: metrics.summary.avgDurationMs,
    p95_duration_ms: metrics.summary.p95DurationMs,
    payment_success_count: metrics.summary.paymentSuccessCount,
    payment_failure_count: metrics.summary.paymentFailureCount
  };
}

function latestRequestLogToRecord(runId: string, log: RequestLogInput): RequestLog {
  return {
    request_id: log.requestId,
    run_id: runId,
    timestamp: log.timestamp,
    method: log.method,
    path: log.path,
    status_code: log.statusCode,
    duration_ms: log.durationMs,
    route_family: log.routeFamily
  };
}

function normalizeSnapshot(snapshot: FirebaseSnapshot | null): ObservabilitySnapshot {
  return {
    runs: Object.values(snapshot?.runs ?? {}).sort(descByGeneratedAt),
    requestLogs: Object.values(snapshot?.requestLogs ?? {}).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    testMetrics: Object.values(snapshot?.testMetrics ?? {}),
    loadMetrics: Object.values(snapshot?.loadMetrics ?? {}),
    coverageMetrics: Object.values(snapshot?.coverageMetrics ?? {})
  };
}

function descByGeneratedAt(a: { generated_at: string }, b: { generated_at: string }) {
  return b.generated_at.localeCompare(a.generated_at);
}

function recordsByKey<T>(records: T[], key: (record: T) => string) {
  return objectFromEntries(records.map((record) => [firebaseKey(key(record)), record]));
}

function objectFromEntries<T>(entries: Array<[string, T]>) {
  return Object.fromEntries(entries) as Record<string, T>;
}

function metricId(runId: string, label: string, index: number) {
  return firebaseKey(`${runId}-${label}-${index}`);
}

function firebaseKey(value: string) {
  return value.replace(/[.#$/[\]]/g, "_");
}

async function getFirebase(pathName: string) {
  return requestFirebase(pathName, "GET");
}

async function putFirebase(pathName: string, body: unknown) {
  return requestFirebase(pathName, "PUT", body);
}

async function patchFirebase(pathName: string, body: Record<string, unknown>) {
  if (!Object.keys(body).length) {
    return;
  }

  return requestFirebase(pathName, "PATCH", body);
}

async function deleteFirebase(pathName: string) {
  return requestFirebase(pathName, "DELETE");
}

async function requestFirebase(pathName: string, method: string, body?: unknown) {
  const response = await fetch(firebaseUrl(pathName), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase ${method} ${firebaseUrl(pathName)} failed with ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function firebaseUrl(pathName: string) {
  const base = firebaseDatabaseUrl.replace(/\/$/, "");
  const fullPath = [firebaseRootPath, trimSlashes(pathName)].filter(Boolean).join("/");
  const url = new URL(`${base}/${fullPath}.json`);
  if (firebaseAuthToken) {
    url.searchParams.set("auth", firebaseAuthToken);
  }
  return url.toString();
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}
