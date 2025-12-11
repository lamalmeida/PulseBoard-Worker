import { syncEndpoints, runLoop } from "./src/worker";
import { cleanupOldChecks } from "./src/cleanup";

console.log("🚀 PulseBoard Worker Starting on Oracle Cloud...");

// Initial Sync
await syncEndpoints();

// Sync endpoints every 60 seconds
setInterval(syncEndpoints, 60000);

// Run the Smart Loop every 1 second
// This checks if any endpoints are "due" based on their specific intervals
setInterval(runLoop, 1000);

// Run cleanup every 24 hours
setInterval(cleanupOldChecks, 1000 * 60 * 60 * 24);

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("🛑 Worker shutting down...");
    process.exit();
});