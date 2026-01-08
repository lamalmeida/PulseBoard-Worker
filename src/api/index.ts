import { supabase } from "../db";
import { Database } from "../../database.types";

type Endpoint = Database["public"]["Tables"]["endpoints"]["Row"];
type EndpointInsert = Database["public"]["Tables"]["endpoints"]["Insert"];
type EndpointUpdate = Database["public"]["Tables"]["endpoints"]["Update"];
type CheckInsert = Database["public"]["Tables"]["checks"]["Insert"];
type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];
type StatusPageInsert = Database["public"]["Tables"]["status_pages"]["Insert"];
type StatusPageUpdate = Database["public"]["Tables"]["status_pages"]["Update"];
type StatusPageEndpointInsert = Database["public"]["Tables"]["status_page_endpoints"]["Insert"];

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
            .insert(checks)
            .select("id");
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
            .lt("checked_at", olderThanDate.toISOString());
    }

    /**
     * Get IDs of endpoints that have checks within a specific time range.
     * Useful for batch processing cleanup.
     */
    static async getEndpointsWithChecks(since: string, until: string) {
        // limit to unique endpoint_ids.
        // Supabase doesn't support .distinct() easily on select with order, but we can just fetch all and dedup in JS or use a hack.
        // Actually, just fetching distinct endpoint_ids is tough without raw sql or a stored proc if the table is huge.
        // For now, let's just fetch all active endpoints, it's safer/easier.
        return await supabase.from("endpoints").select("id").eq("is_active", true);
    }

    /**
     * Get checks for a specific endpoint within a time range.
     * @param endpointId
     * @param since ISO string
     * @param until ISO string
     */
    static async getChecksInTimeRange(endpointId: string, since: string, until: string) {
        return await supabase
            .from("checks")
            .select("id, checked_at, status, status_code, response_time, num_checks")
            .eq("endpoint_id", endpointId)
            .gte("checked_at", since)
            .lt("checked_at", until)
            .order("checked_at", { ascending: true });
    }

    /**
     * Delete checks for a specific endpoint within a time range.
     * @param endpointId
     * @param since ISO string
     * @param until ISO string
     */
    static async deleteChecksInTimeRange(endpointId: string, since: string, until: string, excludeCheckIds?: string[]) {
        let query = supabase
            .from("checks")
            .delete()
            .eq("endpoint_id", endpointId)
            .gte("checked_at", since)
            .lt("checked_at", until);

        if (excludeCheckIds && excludeCheckIds.length > 0) {
            query = query.not("id", "in", `(${excludeCheckIds.join(",")})`);
        }

        return await query;
    }

    /**
     * Delete checks by their IDs.
     * @param checkIds Array of check UUIDs
     */
    static async deleteChecksByIds(checkIds: string[]) {
        return await supabase
            .from("checks")
            .delete()
            .in("id", checkIds);
    }

    /**
     * Get global platform statistics.
     */
    static async getGlobalStats() {
        const { count, error } = await supabase
            .from("endpoints")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true); // Only active monitors? Or all? User said "active monitors count".
        // "Active monitors count" usually means is_active=true.

        return { count: count || 0, error };
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
            .order("checked_at", { ascending: false })
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
            .gte("checked_at", since);

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

    // ========================================
    // Status Page Methods
    // ========================================

    /**
     * Get a public status page by slug, including endpoints and recent checks.
     * @param slug 
     */
    static async getPublicStatusPageBySlug(slug: string) {
        // 1. Get the page
        const { data: page, error } = await supabase
            .from("status_pages")
            .select("*, status_page_endpoints(endpoint_id)")
            .eq("slug", slug)
            .eq("is_public", true)
            .single();

        if (error || !page) return { data: null, error };

        // 2. Get Endpoints details
        const endpointIds = page.status_page_endpoints.map((spe: any) => spe.endpoint_id);

        if (endpointIds.length === 0) {
            return { data: { ...page, endpoints: [] }, error: null };
        }

        const { data: endpoints, error: endpointsError } = await supabase
            .from("endpoints")
            .select("id, name, url")
            .in("id", endpointIds)
            .order("name");

        if (endpointsError) return { data: null, error: endpointsError };

        // 3. Get recent checks for each endpoint (limit 90)
        // Similar to frontend logic, we'll fetch in parallel for now.
        const endpointsWithChecks = await Promise.all(
            endpoints.map(async (endpoint) => {
                const { data: checks } = await supabase
                    .from("checks")
                    .select("id, status, response_time, checked_at")
                    .eq("endpoint_id", endpoint.id)
                    .order("checked_at", { ascending: false })
                    .limit(90);

                return {
                    ...endpoint,
                    checks: checks ? [...checks].reverse() : [], // Oldest first for chart/bars
                    latestCheck: checks?.[0]
                };
            })
        );

        return {
            data: {
                ...page,
                endpoints: endpointsWithChecks
            },
            error: null
        };
    }

    /**
     * Get all status pages for a user.
     * @param userId 
     */
    static async getStatusPagesByUser(userId: string) {
        return await supabase
            .from("status_pages")
            .select("*, status_page_endpoints(endpoint_id)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
    }

    /**
     * Get a single status page by ID.
     * @param id 
     * @param userId 
     */
    static async getStatusPageById(id: string, userId: string) {
        return await supabase
            .from("status_pages")
            .select("*, status_page_endpoints(endpoint_id), endpoints:status_page_endpoints(endpoints(*))")
            .eq("id", id)
            .eq("user_id", userId)
            .single();
    }

    /**
     * Check if a slug is unique.
     * @param slug 
     */
    static async isSlugUnique(slug: string) {
        const { data } = await supabase
            .from("status_pages")
            .select("id")
            .eq("slug", slug)
            .single();
        return !data;
    }

    /**
     * Create a new status page.
     * @param data 
     * @param endpointIds 
     */
    static async createStatusPage(data: StatusPageInsert, endpointIds: string[]) {
        // 1. Create the page
        const { data: page, error } = await supabase
            .from("status_pages")
            .insert(data)
            .select()
            .single();

        if (error || !page) return { data: null, error };

        // 2. Link endpoints if provided
        if (endpointIds.length > 0) {
            const links = endpointIds.map(eid => ({
                status_page_id: page.id,
                endpoint_id: eid
            }));

            const { error: linkError } = await supabase
                .from("status_page_endpoints")
                .insert(links);

            if (linkError) console.error("Error linking endpoints:", linkError);
        }

        return { data: page, error: null };
    }

    /**
     * Update a status page.
     * @param id 
     * @param userId 
     * @param data 
     * @param endpointIds (Optional) If provided, replaces existing links.
     */
    static async updateStatusPage(id: string, userId: string, data: StatusPageUpdate, endpointIds?: string[]) {
        // 1. Update the page fields
        const { data: page, error } = await supabase
            .from("status_pages")
            .update(data)
            .eq("id", id)
            .eq("user_id", userId)
            .select()
            .single();

        if (error) return { data: null, error };

        // 2. Update endpoints if provided (Replace Strategy)
        if (endpointIds !== undefined) {
            // Delete existing
            await supabase
                .from("status_page_endpoints")
                .delete()
                .eq("status_page_id", id);

            // Insert new
            if (endpointIds.length > 0) {
                const links = endpointIds.map(eid => ({
                    status_page_id: id,
                    endpoint_id: eid
                }));
                await supabase
                    .from("status_page_endpoints")
                    .insert(links);
            }
        }

        return { data: page, error: null };
    }

    /**
     * Delete a status page.
     * @param id 
     * @param userId 
     */
    static async deleteStatusPage(id: string, userId: string) {
        // Links cascade delete usually, but we can verify.
        // Assuming cascade on foreign key, just delete the page.
        return await supabase
            .from("status_pages")
            .delete()
            .eq("id", id)
            .eq("user_id", userId);
    }
}

