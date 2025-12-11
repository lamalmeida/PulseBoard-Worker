import { supabase } from "./db";

export async function cleanupOldChecks() {
    console.log("🧹 Running cleanup...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await supabase
        .from("checks")
        .delete()
        .lt("checked_at", thirtyDaysAgo.toISOString());

    if (error) console.error("Cleanup failed:", error);
    else console.log("✅ Old checks deleted.");
}