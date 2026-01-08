import { Database } from "../../database.types";
import { checkBuffer } from "./buffer";
import { sendNotification } from "../notification";

type Endpoint = Database["public"]["Tables"]["endpoints"]["Row"];

// Local state tracking
const localState = new Map<string, { lastCheck: number, consecutiveFailures: number, previousStatus: string }>();

export async function checkEndpoint(endpoint: Endpoint) {
    const startTime = performance.now();
    let status = "failure";
    let statusCode = 0;
    let errorMsg: string | null = null;

    // Default values
    const method = endpoint.http_method || "GET";
    const timeoutMs = (endpoint.timeout_sec || 10) * 1000;

    // Parse headers
    let headers: Record<string, string> = { "User-Agent": "PulseBoard-Worker/1.0" };
    if (endpoint.request_headers) {
        try {
            const customHeaders = typeof endpoint.request_headers === 'string'
                ? JSON.parse(endpoint.request_headers)
                : endpoint.request_headers;
            headers = { ...headers, ...customHeaders };
        } catch (e) {
            console.error(`Error parsing headers for ${endpoint.id}`, e);
        }
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const options: RequestInit = {
            method: method,
            headers: headers,
            signal: controller.signal,
        };

        if (endpoint.request_body && (method === "POST" || method === "PUT" || method === "PATCH")) {
            options.body = endpoint.request_body;
        }

        const response = await fetch(endpoint.url, options);

        clearTimeout(timeoutId);
        statusCode = response.status;

        if (response.ok || (statusCode >= 200 && statusCode < 400)) {
            status = "success";
        } else {
            errorMsg = `HTTP ${statusCode}: ${response.statusText}`;
        }

    } catch (err: any) {
        errorMsg = err.message || "Network Error";
        if (err.name === 'AbortError') errorMsg = `Timeout (${endpoint.timeout_sec || 10}s)`;
    }

    const responseTime = Math.round(performance.now() - startTime);

    // Push to Buffer
    checkBuffer.push({
        endpoint_id: endpoint.id,
        checked_at: new Date().toISOString(),
        status,
        response_time: responseTime,
        status_code: statusCode,
        error_message: errorMsg
    }, endpoint.check_interval || 60);

    // Handle Notifications & State
    const state = localState.get(endpoint.id) || { lastCheck: 0, consecutiveFailures: 0, previousStatus: 'unknown' };
    state.lastCheck = Date.now(); // Update last check time in memory

    if (status === "failure") {
        state.consecutiveFailures++;
        console.log(`🔴 ${endpoint.name} DOWN (${state.consecutiveFailures}/${endpoint.consecutive_failures_threshold}) - ${errorMsg}`);

        if (state.consecutiveFailures >= (endpoint.consecutive_failures_threshold || 2)) {
            // Check if we already sent a notification recently handled either here or inside sendNotification
            // logic matches original worker.ts which delegates cooldown check to sendNotification (which queries DB)
            await sendNotification(endpoint, "failure", errorMsg || "Unknown Error");
        }
    } else {
        if (state.previousStatus === "failure" && (endpoint.send_recovery_notifications ?? true)) {
            console.log(`✅ ${endpoint.name} RECOVERED`);
            await sendNotification(endpoint, "recovery");
        }
        state.consecutiveFailures = 0;
        // console.log(`🟢 ${endpoint.name} UP - ${responseTime}ms`);
    }

    state.previousStatus = status;
    localState.set(endpoint.id, state);
}
