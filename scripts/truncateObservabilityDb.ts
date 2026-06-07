import { firebaseStoreLabel, truncateObservabilityStore } from "./observabilityStore.js";

await truncateObservabilityStore();

console.log(`Truncated observability data in Firebase Realtime Database at ${firebaseStoreLabel()}`);
