import { runDispatcherLoop } from "./src/monitoring/dispatcher";
import { cleanupOldChecks } from "./src/cleanup";
import { startServer } from "./src/server";

console.log("🚀 PulseBoard Worker Starting on Oracle Cloud...");

// Start HTTP API Server
startServer();

// Run cleanup every 1 hour
cleanupOldChecks();
setInterval(cleanupOldChecks, 1000 * 60 * 60);

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("🛑 Worker shutting down...");
    process.exit();
});

// Start the Dispatcher Loop (This will run forever)
runDispatcherLoop();