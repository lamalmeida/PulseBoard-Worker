import { runDispatcherLoop } from "./src/monitoring/dispatcher";
import { cleanupOldChecks } from "./src/cleanup";
import { startServer } from "./src/server";

console.log("🚀 PulseBoard Worker Starting on Oracle Cloud...");

// Start HTTP API Server
startServer();

// Run cleanup every 24 hours
// Initial cleanup? Maybe not needed to block start.
setInterval(cleanupOldChecks, 1000 * 60 * 60 * 24);

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("🛑 Worker shutting down...");
    process.exit();
});

// Start the Dispatcher Loop (This will run forever)
runDispatcherLoop();