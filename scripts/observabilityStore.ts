import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

export const observabilityDir = path.resolve("qa-artifacts", "observability");
export const rawDir = path.join(observabilityDir, "raw");
export const metricsDir = path.join(observabilityDir, "metrics");
export const dbPath = path.join(observabilityDir, "foodhub-observability.sqlite");
export const dashboardPath = path.resolve("qa-artifacts", "FoodHub-Observability-Dashboard.xlsx");
export const latestMetricsPath = path.join(metricsDir, "latest-observability-metrics.json");

let sqlPromise: Promise<SqlJsStatic> | undefined;

export type SqlDatabase = Database;

export async function openObservabilityDb(): Promise<Database> {
  mkdirSync(observabilityDir, { recursive: true });
  const SQL = await loadSql();
  const database = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database();
  migrate(database);
  return database;
}

export function saveObservabilityDb(database: Database) {
  mkdirSync(observabilityDir, { recursive: true });
  writeFileSync(dbPath, Buffer.from(database.export()));
  database.close();
}

export function queryAll<T extends Record<string, unknown>>(database: Database, sql: string, params: unknown[] = []): T[] {
  const statement = database.prepare(sql, params);
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

function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({
    locateFile: (file) => path.resolve("node_modules", "sql.js", "dist", file)
  });
  return sqlPromise;
}

function migrate(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS observability_runs (
      id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      report_scope TEXT NOT NULL,
      total_checks INTEGER NOT NULL,
      passed_checks INTEGER NOT NULL,
      failed_checks INTEGER NOT NULL,
      skipped_checks INTEGER NOT NULL,
      request_count INTEGER NOT NULL,
      error_count INTEGER NOT NULL,
      avg_duration_ms REAL NOT NULL,
      p95_duration_ms REAL NOT NULL,
      payment_success_count INTEGER NOT NULL,
      payment_failure_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      request_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      route_family TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_type TEXT NOT NULL,
      total INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      skipped INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS load_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value REAL NOT NULL,
      threshold REAL NOT NULL,
      unit TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coverage_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value REAL NOT NULL,
      threshold REAL NOT NULL,
      status TEXT NOT NULL
    );
  `);
}
