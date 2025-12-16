import { PulseBoardAPI } from "../api";
import { type RouteHandler, jsonResponse, errorResponse } from "../server";

/**
 * GET /api/stats/global
 * Public endpoint to get global system stats
 */
const getGlobalStats: RouteHandler = async (request) => {
    const origin = (request as any).__origin;
    const { count, error } = await PulseBoardAPI.getGlobalStats();

    if (error) {
        return errorResponse(error.message, 500, origin);
    }

    return jsonResponse({ active_endpoints: count }, 200, origin);
};

export const statsRoutes = [
    {
        method: "GET",
        pattern: /^\/api\/stats\/global$/,
        handler: getGlobalStats,
        paramNames: [],
    }
];
