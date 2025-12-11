/**
 * Check Routes
 * Endpoints for check history and stats
 */

import { PulseBoardAPI } from "../api";
import { type RouteHandler, jsonResponse, errorResponse } from "../server";

// GET /api/endpoints/:id/checks - Get check history
const getChecks: RouteHandler = async (request, auth, params) => {
    const origin = (request as any).__origin;
    const url = new URL(request.url);

    // Parse query params
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // First verify the endpoint belongs to this user
    const { data: endpoint, error: endpointError } = await PulseBoardAPI.getEndpointById(
        params.id,
        auth.userId
    );

    if (endpointError || !endpoint) {
        return errorResponse("Endpoint not found or unauthorized", 404, origin);
    }

    const { data, error } = await PulseBoardAPI.getChecksByEndpoint(params.id, limit, offset);

    if (error) {
        return errorResponse(error.message, 500, origin);
    }

    return jsonResponse(data || [], 200, origin);
};

// GET /api/endpoints/:id/stats - Get endpoint stats
const getStats: RouteHandler = async (request, auth, params) => {
    const origin = (request as any).__origin;

    // First verify the endpoint belongs to this user
    const { data: endpoint, error: endpointError } = await PulseBoardAPI.getEndpointById(
        params.id,
        auth.userId
    );

    if (endpointError || !endpoint) {
        return errorResponse("Endpoint not found or unauthorized", 404, origin);
    }

    const { data, error } = await PulseBoardAPI.getEndpointStats(params.id);

    if (error) {
        return errorResponse(error.message, 500, origin);
    }

    return jsonResponse(data, 200, origin);
};

// Export routes
export const checkRoutes = [
    {
        method: "GET",
        pattern: /^\/api\/endpoints\/([^/]+)\/checks$/,
        handler: getChecks,
        paramNames: ["id"],
    },
    {
        method: "GET",
        pattern: /^\/api\/endpoints\/([^/]+)\/stats$/,
        handler: getStats,
        paramNames: ["id"],
    },
];
