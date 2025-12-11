import { supabase } from "./db";
import { sendNotification } from "./notifications";
import pLimit from "p-limit";

// Concurrency limit to protect your Oracle instance and not look like a DDOS attack
const limit = pLimit(parseInt(process.env.WORKER_CONCURRENCY || "20"));

// Local Cache
let endpoints: any[] = [];
// Map to track local state: { endpointId: { lastCheck: number, consecutiveFailures: number, previousStatus: string } }
const localState = new Map<string, { lastCheck: number, consecutiveFailures: number, previousStatus: string }>();

// 1. Fetch Endpoints (Runs every 1 minute to sync config changes)
export async function syncEndpoints() {
    const { data, error } = await supabase
        .from("endpoints")
        .select("*")
        .eq("is_active", true);

    if (error) {
        console.error("❌ Failed to sync endpoints:", error.message);
        return;
    }

    endpoints = data || [];
    console.log(`🔄 Synced ${endpoints.length} active endpoints.`);

    // Cleanup local state for deleted endpoints
    const currentIds = new Set(endpoints.map(e => e.id));
    for (const id of localState.keys()) {
        if (!currentIds.has(id)) localState.delete(id);
    }
}

// 2. The Check Logic
async function performCheck(endpoint: any) {
    const startTime = performance.now();
    let status = "failure";
    let statusCode = 0;
    let errorMsg = null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(endpoint.url, {
            method: "GET",
            headers: { "User-Agent": "PulseBoard-Worker/1.0" },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        statusCode = response.status;

        if (response.ok || (statusCode >= 200 && statusCode < 400)) {
            status = "success";
        } else {
            errorMsg = `HTTP ${statusCode}: ${response.statusText}`;
        }
    } catch (err: any) {
        errorMsg = err.message || "Network Error";
        if (err.name === 'AbortError') errorMsg = "Timeout (10s)";
    }

    const responseTime = Math.round(performance.now() - startTime);

    // Update DB (Fire and forget promise to not block logic)
    supabase.from("checks").insert({
        endpoint_id: endpoint.id,
        status,
        response_time: responseTime,
        status_code: statusCode,
        error_message: errorMsg
    }).then(({ error }) => {
        if (error) console.error(`Error saving check for ${endpoint.name}:`, error.message);
    });

    // Handle Logic/Notifications
    const state = localState.get(endpoint.id) || { lastCheck: 0, consecutiveFailures: 0, previousStatus: 'unknown' };

    // Update state timestamp immediately
    state.lastCheck = Date.now();

    if (status === "failure") {
        state.consecutiveFailures++;
        console.log(`🔴 ${endpoint.name} DOWN (${state.consecutiveFailures}/${endpoint.consecutive_failures_threshold}) - ${errorMsg}`);

        if (state.consecutiveFailures >= (endpoint.consecutive_failures_threshold || 2)) {
            await sendNotification(endpoint, "failure", errorMsg || "Unknown Error");
        }
    } else {
        if (state.previousStatus === "failure" && (endpoint.send_recovery_notifications ?? true)) {
            console.log(`Vk ${endpoint.name} RECOVERED`);
            await sendNotification(endpoint, "recovery");
        }
        state.consecutiveFailures = 0; // Reset
        // console.log(`🟢 ${endpoint.name} UP - ${responseTime}ms`);
    }

    state.previousStatus = status;
    localState.set(endpoint.id, state);
}

// 3. The Main Loop
export async function runLoop() {
    const now = Date.now();
    const checksToRun: Promise<void>[] = [];

    for (const endpoint of endpoints) {
        const state = localState.get(endpoint.id);
        const lastCheck = state?.lastCheck || 0;
        const intervalMs = (endpoint.check_interval || 60) * 1000;

        if (now - lastCheck >= intervalMs) {
            // Add to queue
            checksToRun.push(limit(() => performCheck(endpoint)));
        }
    }

    if (checksToRun.length > 0) {
        // Wait for all scheduled checks to complete/be queued
        await Promise.all(checksToRun);
    }
}