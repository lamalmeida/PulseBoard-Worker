import { PulseBoardAPI } from "../api";
import { Database } from "../../database.types";

type CheckInsert = Database["public"]["Tables"]["checks"]["Insert"];

class BufferSystem {
    private buffer: CheckInsert[] = [];
    private readonly limit: number;
    private readonly flushInterval: number; // ms
    private timer: ReturnType<typeof setInterval> | null = null;
    private isFlushing = false;

    private pendingAggregates: Map<string, { startTime: number; checks: CheckInsert[]; endpointId: string }> = new Map();

    constructor(limit = 100, flushInterval = 2000) {
        this.limit = limit;
        this.flushInterval = flushInterval;
        this.startTimer();
    }

    public push(check: CheckInsert, intervalSec: number = 60) {
        // Sub-minute checks: Aggregate in memory
        if (intervalSec < 60) {
            this.addToPending(check);
        } else {
            // Normal checks: Send immediately
            this.buffer.push(check);
            if (this.buffer.length >= this.limit) {
                this.flush();
            }
        }
    }

    private addToPending(check: CheckInsert) {
        // Bucket Key: endpoint_id + minute_timestamp
        const checkTime = new Date(check.checked_at).getTime();
        const minuteFloor = Math.floor(checkTime / 60000) * 60000;
        const key = `${check.endpoint_id}_${minuteFloor}`;

        if (!this.pendingAggregates.has(key)) {
            this.pendingAggregates.set(key, {
                startTime: minuteFloor,
                checks: [],
                endpointId: check.endpoint_id
            });
        }

        this.pendingAggregates.get(key)!.checks.push(check);
    }

    private startTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.flushPending();
            this.flush();
        }, this.flushInterval);
    }

    private flushPending() {
        const now = Date.now();
        // Check for buckets that are "done" (minute is over + buffer time of 5s)
        for (const [key, data] of this.pendingAggregates.entries()) {
            if (now > data.startTime + 60000 + 5000) {
                this.aggregateAndPush(data.checks, data.endpointId);
                this.pendingAggregates.delete(key);
            }
        }
    }

    private aggregateAndPush(checks: CheckInsert[], endpointId: string) {
        if (checks.length === 0) return;

        let totalChecks = 0;
        let successfulChecks = 0;
        let weightedResponseTime = 0;
        let lastStatusCode = 0;

        // Sort by time
        checks.sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime());

        for (const c of checks) {
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

        // Use the timestamp of the LAST check to mark the aggregate time,
        // or the bucket start time? Last check is better for "freshness" feel.
        const lastCheckTime = checks[checks.length - 1].checked_at;

        const aggregate: CheckInsert = {
            endpoint_id: endpointId,
            checked_at: lastCheckTime,
            status: status,
            status_code: successfulChecks > 0 ? 200 : lastStatusCode,
            response_time: avgResponseTime,
            num_checks: totalChecks,
            error_message: null
        };

        this.buffer.push(aggregate);
    }

    public async flush() {
        if (this.isFlushing || this.buffer.length === 0) return;

        this.isFlushing = true;
        const batch = [...this.buffer];
        this.buffer = []; // Clear buffer immediately

        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                const { error } = await PulseBoardAPI.logChecks(batch);
                if (error) {
                    attempt++;
                    console.error(`❌ Flush attempt ${attempt}/${maxRetries} failed:`, error.message);
                    if (attempt < maxRetries) {
                        // Exponential backoff: 500ms, 1000ms, 2000ms
                        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                    }
                } else {
                    // console.log(`✅ Flushed ${batch.length} checks.`);
                    break; // Success, exit retry loop
                }
            } catch (err) {
                attempt++;
                console.error(`❌ Flush exception (attempt ${attempt}/${maxRetries}):`, err);
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                }
            }
        }

        if (attempt >= maxRetries) {
            console.error(`❌ Failed to flush ${batch.length} checks after ${maxRetries} retries. Data discarded.`);
        }

        this.isFlushing = false;
    }
}

export const checkBuffer = new BufferSystem(50, 2000);
