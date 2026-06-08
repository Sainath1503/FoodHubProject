import { existsSync, readFileSync } from "node:fs";
import { firebaseStoreLabel, ingestLatestMetrics, latestMetricsPath, type LatestMetrics } from "./observabilityStore.js";

if (!existsSync(latestMetricsPath)) {
  throw new Error(`Metrics JSON was not found at ${latestMetricsPath}. Run npm run observability:collect first.`);
}

const metrics = JSON.parse(readFileSync(latestMetricsPath, "utf8")) as LatestMetrics;
await ingestLatestMetrics(metrics);

console.log(`Ingested observability run ${metrics.runId} into Firebase Realtime Database at ${firebaseStoreLabel()}`);
