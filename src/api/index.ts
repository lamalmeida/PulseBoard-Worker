import { supabase } from "../db";
import { Database } from "../../database.types";

type Endpoint = Database["public"]["Tables"]["endpoints"]["Row"];
type EndpointInsert = Database["public"]["Tables"]["endpoints"]["Insert"];
type EndpointUpdate = Database["public"]["Tables"]["endpoints"]["Update"];
type CheckInsert = Database["public"]["Tables"]["checks"]["Insert"];
type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];

export class PulseBoardAPI {
    /**
     * Fetch endpoints that are active and due for a check.
     * @param limit Max number of endpoints to fetch (default 50)
     */
    static async fetchCandidates(limit: number = 50) {
        const now = new Date();
        // 0.5s in the future to catch slightly upcoming tasks to keep cadence smooth
        const checkTimeLimit = new Date(now.getTime() + 500).toISOString();

        return await supabase
            .from("endpoints")
            .select("*")
            .eq("is_active", true)
            .or(`next_check_at.is.null,next_check_at.lte.${checkTimeLimit}`)
            .order("next_check_at", { ascending: true, nullsFirst: true })
            .limit(limit);
    }

    /**
     * Update the next_check_at timestamp for an endpoint.
     * @param endpointId 
     * @param nextCheck ISO timestamp string
     */
    static async updateNextCheck(endpointId: string, nextCheck: string) {
        return await supabase
            .from("endpoints")
            .update({ next_check_at: nextCheck } as any)
            .eq("id", endpointId);
    }

    /**
     * Bulk insert check results.
     * @param checks Array of check inserts
     */
    static async logChecks(checks: CheckInsert[]) {
        return await supabase
            .from("checks")
            .insert(checks);
    }

    /**
     * Get user email by User ID (using Admin Auth API)
     * @param userId 
     */
    static async getUserEmail(userId: string) {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error || !data.user?.email) {
            return null;
        }
        return data.user.email;
    }

    /**
     * Check if a failure notification should be sent based on cooldown.
     * Returns true if NO notification has been sent within the cooldown period.
     * @param endpointId 
     * @param cooldownSeconds 
     */
    static async shouldSendFailureNotification(endpointId: string, cooldownSeconds: number) { // Specialized name as it's specific logic
        const cooldownTime = new Date(Date.now() - cooldownSeconds * 1000).toISOString();

        const { data: recent } = await supabase
            .from("notifications")
            .select("id")
            .eq("endpoint_id", endpointId)
            .eq("notification_type", "failure")
            .gte("sent_at", cooldownTime)
            .limit(1);

        // If we found a recent notification, we should NOT send another one.
        return !recent || recent.length === 0;
    }

    /**
     * Log a sent notification.
     * @param notification 
     */
    static async logNotification(notification: NotificationInsert) {
        return await supabase
            .from("notifications")
            .insert(notification);
    }

    /**
     * Delete checks older than a certain date.
     * @param olderThanDate Date object
     */
    static async deleteOldChecks(olderThanDate: Date) {
        return await supabase
            .from("checks")
            .delete()
            .lt("created_at", olderThanDate.toISOString());
    }

    // ========================================
    // Frontend API Methods (User-scoped)
    // ========================================

    /**
     * Get all endpoints belonging to a user.
     * @param userId 
     */
    static async getEndpointsByUser(userId: string) {
        return await supabase
            .from("endpoints")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
    }

    /**
     * Get a single endpoint by ID, scoped to user.
     * @param endpointId 
     * @param userId 
     */
    static async getEndpointById(endpointId: string, userId: string) {
        const { data, error } = await supabase
            .from("endpoints")
            .select("*")
            .eq("id", endpointId)
            .eq("user_id", userId)
            .single();

        return { data, error };
    }

    /**
     * Create a new endpoint.
     * @param data Endpoint insert data
     */
    static async createEndpoint(data: EndpointInsert) {
        const { data: inserted, error } = await supabase
            .from("endpoints")
            .insert(data)
            .select()
            .single();

        return { data: inserted, error };
    }

    /**
     * Update an endpoint, scoped to user.
     * @param endpointId 
     * @param userId 
     * @param data Update data
     */
    static async updateEndpoint(endpointId: string, userId: string, data: EndpointUpdate) {
        const { data: updated, error } = await supabase
            .from("endpoints")
            .update(data)
            .eq("id", endpointId)
            .eq("user_id", userId)
            .select()
            .single();

        return { data: updated, error };
    }

    /**
     * Delete an endpoint, scoped to user.
     * @param endpointId 
     * @param userId 
     */
    static async deleteEndpoint(endpointId: string, userId: string) {
        return await supabase
            .from("endpoints")
            .delete()
            .eq("id", endpointId)
            .eq("user_id", userId);
    }

    /**
     * Get check history for an endpoint.
     * @param endpointId 
     * @param limit 
     * @param offset 
     */
    static async getChecksByEndpoint(endpointId: string, limit = 50, offset = 0) {
        return await supabase
            .from("checks")
            .select("*")
            .eq("endpoint_id", endpointId)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
    }

    /**
     * Get stats for an endpoint (uptime, avg response time, etc.)
     * @param endpointId 
     */
    static async getEndpointStats(endpointId: string) {
        // Get checks from last 24 hours for stats
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: checks, error } = await supabase
            .from("checks")
            .select("status, response_time")
            .eq("endpoint_id", endpointId)
            .gte("created_at", since);

        if (error) return { data: null, error };

        const total = checks?.length || 0;
        const successes = checks?.filter(c => c.status === "success").length || 0;
        const avgResponseTime = total > 0
            ? Math.round(checks!.reduce((sum, c) => sum + (c.response_time || 0), 0) / total)
            : 0;

        return {
            data: {
                total_checks_24h: total,
                successful_checks_24h: successes,
                uptime_24h: total > 0 ? Math.round((successes / total) * 100 * 100) / 100 : 100,
                avg_response_time_24h: avgResponseTime,
            },
            error: null,
        };
    }

    /**
     * Get notifications for a user (via their endpoints).
     * @param userId 
     * @param limit 
     */
    static async getNotificationsByUser(userId: string, limit = 50) {
        // First get user's endpoint IDs
        const { data: endpoints, error: endpointError } = await supabase
            .from("endpoints")
            .select("id")
            .eq("user_id", userId);

        if (endpointError) return { data: null, error: endpointError };

        const endpointIds = endpoints?.map(e => e.id) || [];

        if (endpointIds.length === 0) {
            return { data: [], error: null };
        }

        return await supabase
            .from("notifications")
            .select("*, endpoints(name, url)")
            .in("endpoint_id", endpointIds)
            .order("sent_at", { ascending: false })
            .limit(limit);
    }
}

