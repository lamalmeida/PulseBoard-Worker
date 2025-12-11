/**
 * Notification Routes
 * Endpoints for notification history
 */

import { PulseBoardAPI } from "../api";
import { type RouteHandler, jsonResponse, errorResponse } from "../server";

// GET /api/notifications - List notifications for user
const listNotifications: RouteHandler = async (request, auth) => {
    const origin = (request as any).__origin;
    const url = new URL(request.url);

    const limit = parseInt(url.searchParams.get("limit") || "50");

    const { data, error } = await PulseBoardAPI.getNotificationsByUser(auth.userId, limit);

    if (error) {
        return errorResponse(error.message, 500, origin);
    }

    return jsonResponse(data || [], 200, origin);
};

// Export routes
export const notificationRoutes = [
    {
        method: "GET",
        pattern: /^\/api\/notifications$/,
        handler: listNotifications,
        paramNames: [],
    },
];
