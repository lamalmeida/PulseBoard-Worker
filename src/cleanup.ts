import { PulseBoardAPI } from "./api";

export async function cleanupOldChecks() {
    console.log("🧹 Running cleanup...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await PulseBoardAPI.deleteOldChecks(thirtyDaysAgo);

    if (error) console.error("Cleanup failed:", error);
    else console.log("✅ Old checks deleted.");
}