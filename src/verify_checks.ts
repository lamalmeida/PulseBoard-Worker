
import { supabase } from "./db";

async function dedupAndFixChecks() {
    console.log("Starting Dedup & Fix script...");

    // 1. Get all endpoints
    const { data: endpoints, error: epError } = await supabase
        .from("endpoints")
        .select("id, name, check_interval");

    if (epError || !endpoints) {
        console.error("Failed to fetch endpoints", epError);
        return;
    }

    console.log(`Found ${endpoints.length} endpoints.`);

    for (const endpoint of endpoints) {
        const intervalSec = endpoint.check_interval || 60;
        console.log(`--------------------------------------------------`);
        console.log(`Processing endpoint: ${endpoint.name} (${endpoint.id})`);

        // 2. Fetch all checks
        let allChecks: { id: string; checked_at: string; num_checks: number | null }[] = [];
        let page = 0;
        const limit = 1000;

        while (true) {
            const { data: checks, error: checkError } = await supabase
                .from("checks")
                .select("id, checked_at, num_checks")
                .eq("endpoint_id", endpoint.id)
                .order("checked_at", { ascending: true })
                .range(page * limit, (page + 1) * limit - 1);

            if (checkError) {
                console.error("Error fetching checks", checkError);
                break;
            }
            if (!checks || checks.length === 0) break;

            allChecks = allChecks.concat(checks);
            if (checks.length < limit) break;
            page++;
        }

        console.log(`  Total checks fetched: ${allChecks.length}`);
        if (allChecks.length < 2) continue;

        // 3. Identify duplicates
        const idsToDelete: string[] = [];
        const uniqueChecks: typeof allChecks = [];
        const DUPLICATE_THRESHOLD_MS = 2000; // 2 seconds

        if (allChecks.length > 0) {
            uniqueChecks.push(allChecks[0]);

            for (let i = 1; i < allChecks.length; i++) {
                const prev = uniqueChecks[uniqueChecks.length - 1];
                const current = allChecks[i];

                const tPrev = new Date(prev.checked_at).getTime();
                const tCurr = new Date(current.checked_at).getTime();

                if ((tCurr - tPrev) < DUPLICATE_THRESHOLD_MS) {
                    idsToDelete.push(current.id);
                } else {
                    uniqueChecks.push(current);
                }
            }
        }

        // 4. Delete Duplicates
        if (idsToDelete.length > 0) {
            console.log(`  🗑️ Found ${idsToDelete.length} duplicates. Deleting...`);

            // Delete in batches of 100
            for (let i = 0; i < idsToDelete.length; i += 100) {
                const batch = idsToDelete.slice(i, i + 100);
                const { error: delError } = await supabase
                    .from("checks")
                    .delete()
                    .in("id", batch);

                if (delError) {
                    console.error("  ❌ Error deleting batch:", delError.message);
                }
            }
            console.log("  ✅ Deletion complete.");
        } else {
            console.log("  ✅ No duplicates found.");
        }

        // 5. Update num_checks for valid checks
        let updatesCount = 0;
        const updates: Promise<any>[] = [];

        for (let i = 0; i < uniqueChecks.length - 1; i++) {
            const current = uniqueChecks[i];
            const next = uniqueChecks[i + 1];

            const t1 = new Date(current.checked_at).getTime();
            const t2 = new Date(next.checked_at).getTime();

            const diffSec = (t2 - t1) / 1000;

            // Expected num_checks
            let expected = Math.round(diffSec / intervalSec);
            if (expected < 1) expected = 1;

            const actual = current.num_checks || 1;

            if (actual !== expected) {
                updates.push(
                    supabase
                        .from("checks")
                        .update({ num_checks: expected } as any)
                        .eq("id", current.id)
                );
                updatesCount++;
            }
        }

        if (updatesCount > 0) {
            console.log(`  Updating ${updatesCount} records with corrected num_checks...`);
            await Promise.all(updates);
            console.log(`  ✅ Updates complete.`);
        } else {
            console.log(`  ✅ All num_checks are consistent.`);
        }
    }

    console.log("Dedup & Fix script complete.");
}

dedupAndFixChecks();
