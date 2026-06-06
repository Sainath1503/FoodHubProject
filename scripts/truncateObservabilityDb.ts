import { existsSync } from "node:fs";
import { dbPath, openObservabilityDb, saveObservabilityDb } from "./observabilityStore.js";

if (!existsSync(dbPath)) {
  console.log(`No observability DB found at ${dbPath}. Nothing to truncate.`);
  process.exit(0);
}

const database = await openObservabilityDb();
database.run(`
  DELETE FROM coverage_metrics;
  DELETE FROM load_metrics;
  DELETE FROM test_metrics;
  DELETE FROM request_logs;
  DELETE FROM observability_runs;
`);
saveObservabilityDb(database);

console.log(`Truncated observability tables in ${dbPath}`);
