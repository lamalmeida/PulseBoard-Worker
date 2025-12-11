import { PulseBoardAPI } from "../api";
import { checkEndpoint } from "./checker";
import { Database } from "../../database.types";

type Endpoint = Database["public"]["Tables"]["endpoints"]["Row"];

export async function runDispatcherLoop() {
    console.log("🔄 Dispatcher Loop Started");

    while (true) {
        try {
            // 1. Fetch Candidates
            const { data: endpoints, error } = await PulseBoardAPI.fetchCandidates(50);

            if (error) {
                console.error("❌ Dispatcher Fetch Error:", error.message);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            if (endpoints && endpoints.length > 0) {
                // console.log(`⚡ Dispatching ${endpoints.length} checks...`);

                // 2. Update next_check_at immediately
                // We do this in parallel to ensure speed
                const updates = endpoints.map(async (endpoint: Endpoint) => {
                    const interval = (endpoint.check_interval || 60) * 1000;
                    const nextCheck = new Date(Date.now() + interval).toISOString();

                    // Optimistic update
                    const { error: updateError } = await PulseBoardAPI.updateNextCheck(endpoint.id, nextCheck);

                    if (updateError) {
                        console.error(`❌ Failed to update next_check_at for ${endpoint.id}`, updateError.message);
                    } else {
                        checkEndpoint(endpoint);
                    }
                });

                await Promise.all(updates);
            }

        } catch (err) {
            console.error("❌ Dispatcher Crash:", err);
        }

        // 4. Sleep 1s
        await new Promise(r => setTimeout(r, 1000));
    }
}
