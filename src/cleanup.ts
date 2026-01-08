
import { PulseBoardAPI } from "./api";
import pLimit from "p-limit";

const CONCURRENCY = 3;   // Reduced from 5 to 3 to be safer for main loop
const TIME_CHUNK_MS = 4 * 60 * 60 * 1000; // Increased to 4 hours to reduce overhead since we select fewer cols

export async function cleanupOldChecks() {
    console.log("🧹 Running cleanup (v2 - refined tiers)...");
    const now = new Date();

    // 1. Delete > 1 year
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const { error: deletionError } = await PulseBoardAPI.deleteOldChecks(oneYearAgo);
    if (deletionError) console.error("Failed to delete > 1yr checks:", deletionError);
    else console.log("✅ Deleted checks older than 1 year.");

    // 2. Aggregation Tiers
    // Sub-1h: Keep real (No tier)
    // 1h - 1d:       5 min
    // 1d - 1w:       30 min
    // 1w - 1m:       2 hours (120 min)
    // 1m - 1q (90d): 12 hours (720 min)
    // 1q+:           1 day (1440 min) -- up to 1 year

    const tiers = [
        { name: "1q+", startAge: 365 * 24 * 60, endAge: 90 * 24 * 60, intervalMinutes: 1440 },
        { name: "1m-1q", startAge: 90 * 24 * 60, endAge: 30 * 24 * 60, intervalMinutes: 720 },
        { name: "1w-1m", startAge: 30 * 24 * 60, endAge: 7 * 24 * 60, intervalMinutes: 120 },
        { name: "1d-1w", startAge: 7 * 24 * 60, endAge: 1 * 24 * 60, intervalMinutes: 30 },
        { name: "1h-1d", startAge: 1 * 24 * 60, endAge: 60, intervalMinutes: 5 },
    ];

    const getDateAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

    // Get all active endpoints
    const { data: endpoints, error: epError } = await PulseBoardAPI.getEndpointsWithChecks(
        getDateAgo(365 * 24 * 60).toISOString(),
        now.toISOString()
    );

    if (epError || !endpoints) {
        console.error("Failed to fetch endpoints for cleanup:", epError);
        return;
    }

    console.log(`Processing aggregation for ${endpoints.length} endpoints...`);
    const limit = pLimit(CONCURRENCY);

    const tasks = endpoints.map((ep) => limit(async () => {
        for (const tier of tiers) {
            const startTier = getDateAgo(tier.startAge);
            const endTier = getDateAgo(tier.endAge);

            if (startTier >= endTier) continue;

            let chunkStart = startTier.getTime();
            const chunkEnd = endTier.getTime();

            while (chunkStart < chunkEnd) {
                const currentChunkEnd = Math.min(chunkStart + TIME_CHUNK_MS, chunkEnd);

                // Process chunk
                await aggregateRange(
                    ep.id,
                    new Date(chunkStart),
                    new Date(currentChunkEnd),
                    tier.intervalMinutes
                );

                chunkStart = currentChunkEnd;
            }
        }
    }));

    await Promise.all(tasks);
    console.log("✅ Cleanup and aggregation complete.");
}

import { Database } from "../database.types";

type CheckRow = Pick<Database["public"]["Tables"]["checks"]["Row"], "id" | "checked_at" | "status" | "status_code" | "response_time" | "num_checks">;

async function aggregateRange(endpointId: string, since: Date, until: Date, intervalMinutes: number) {
    // 1. Fetch checks
    const { data, error } = await PulseBoardAPI.getChecksInTimeRange(
        endpointId,
        since.toISOString(),
        until.toISOString()
    );

    if (error) {
        console.error(`Error fetching checks for ${endpointId}:`, error);
        return;
    }
    const checks = data as CheckRow[];
    if (!checks || checks.length === 0) return;

    // 2. Bucketize
    const intervalMs = intervalMinutes * 60 * 1000;
    const buckets: Record<string, CheckRow[]> = {};

    for (const check of checks) {
        const checkTime = new Date(check.checked_at).getTime();
        const bucketTime = Math.floor(checkTime / intervalMs) * intervalMs;
        const bucketKey = new Date(bucketTime).toISOString();

        if (!buckets[bucketKey]) buckets[bucketKey] = [];
        buckets[bucketKey].push(check);
    }

    const payload: any[] = [];
    let idsToDelete: string[] = [];

    // 3. Process buckets
    for (const [bucketTimeStr, bucketChecks] of Object.entries(buckets)) {
        // Validation: If we only have 1 check and it is already aligned (checked_at == bucketTime),
        // and its num_checks seems reasonable (approx interval/rate), we could skip.
        // BUT to ensure "total sum is unchanged" and "no two checks", it's safer to re-aggregate if there's any doubt.
        // Optimization: If bucketChecks.length === 1 && bucketChecks[0].checked_at === bucketTimeStr
        // We can just skip this bucket as it's already aggregated.
        // Wait, what if the existing aggregate has wrong num_checks? The user said "ensure total sum... is unchanged".
        // If we leave it alone, we trust it. If we re-aggregate 1 check, we get the same result.
        // So skipping single aligned checks is a valid optimization.

        if (bucketChecks.length === 1 && bucketChecks[0].checked_at === bucketTimeStr) {
            continue;
        }

        let totalChecks = 0;
        let successfulChecks = 0;
        let weightedResponseTime = 0;
        let lastStatusCode = 0;

        // Collect IDs to delete (ALL checks in this bucket will be replaced by the new aggregate)
        const bucketIds = bucketChecks.map(c => c.id);
        idsToDelete.push(...bucketIds);

        // Sort by time to get the "last" status code correctly
        bucketChecks.sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime());

        for (const c of bucketChecks) {
            const count = c.num_checks ?? 1;
            const isSuccess = c.status === 'success';

            totalChecks += count;

            if (isSuccess) {
                successfulChecks += count;
                weightedResponseTime += ((c.response_time || 0) * count);
            }

            lastStatusCode = c.status_code;
        }

        const avgResponseTime = successfulChecks > 0 ? Math.round(weightedResponseTime / successfulChecks) : 0;
        const status = successfulChecks > 0 ? 'success' : 'failure';

        payload.push({
            endpoint_id: endpointId,
            checked_at: bucketTimeStr,
            status: status,
            status_code: successfulChecks > 0 ? 200 : lastStatusCode,
            response_time: avgResponseTime,
            num_checks: totalChecks,
            error_message: null
        });
    }

    // 4. Batch Write & Delete
    if (payload.length > 0) {
        // A. Insert new aggregates
        const { error: insertError } = await PulseBoardAPI.logChecks(payload);

        if (insertError) {
            console.error(`Failed to insert aggregated checks for ${endpointId}:`, insertError);
            return;
            // Abort delete if insert failed to prevent data loss
        }

        // B. Delete replaced checks by ID
        // Delete in chunks to be safe with URL limits or query size (though 4h chunk shouldn't be huge)
        const DELETE_CHUNK_SIZE = 500;
        for (let i = 0; i < idsToDelete.length; i += DELETE_CHUNK_SIZE) {
            const batch = idsToDelete.slice(i, i + DELETE_CHUNK_SIZE);
            const { error: deleteError } = await PulseBoardAPI.deleteChecksByIds(batch);

            if (deleteError) {
                console.error(`Failed to delete old checks batch for ${endpointId}:`, deleteError);
            }
        }
    }
}