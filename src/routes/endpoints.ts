/**
 * Endpoint Routes
 * CRUD operations for endpoints
 */

import { PulseBoardAPI } from "../api";
import { type RouteHandler, jsonResponse, errorResponse } from "../http";
import type { AuthContext } from "../auth/jwt";

// GET /api/endpoints - List all endpoints for user
const listEndpoints: RouteHandler = async (request, auth) => {
    const origin = (request as any).__origin;
    const { data, error } = await PulseBoardAPI.getEndpointsByUser(auth.userId);

    if (error) {
        return errorResponse(error.message, 500, origin);
    }

    return jsonResponse(data || [], 200, origin);
};

// POST /api/endpoints - Create a new endpoint
const createEndpoint: RouteHandler = async (request, auth) => {
    const origin = (request as any).__origin;

    try {
        const body = await request.json();

        const { data, error } = await PulseBoardAPI.createEndpoint({
            ...body,
            user_id: auth.userId, // Force user_id from auth
        });

        if (error) {
            return errorResponse(error.message, 400, origin);
        }

        return jsonResponse(data, 201, origin);
    } catch {
        return errorResponse("Invalid JSON body", 400, origin);
    }
};

// GET /api/endpoints/:id - Get single endpoint
const getEndpoint: RouteHandler = async (request, auth, params) => {
    const origin = (request as any).__origin;
    const { data, error } = await PulseBoardAPI.getEndpointById(params.id, auth.userId);

    if (error) {
        return errorResponse(error.message, 500, origin);
    }

    if (!data) {
        return errorResponse("Endpoint not found", 404, origin);
    }

    return jsonResponse(data, 200, origin);
};

// PUT /api/endpoints/:id - Update an endpoint
const updateEndpoint: RouteHandler = async (request, auth, params) => {
    const origin = (request as any).__origin;

    try {
        const body = await request.json();

        // Remove fields that shouldn't be updated via API
        delete body.id;
        delete body.user_id;
        delete body.created_at;

        const { data, error } = await PulseBoardAPI.updateEndpoint(params.id, auth.userId, body);

        if (error) {
            return errorResponse(error.message, 400, origin);
        }

        if (!data) {
            return errorResponse("Endpoint not found or unauthorized", 404, origin);
        }

        return jsonResponse(data, 200, origin);
    } catch {
        return errorResponse("Invalid JSON body", 400, origin);
    }
};

// DELETE /api/endpoints/:id - Delete an endpoint
const deleteEndpoint: RouteHandler = async (request, auth, params) => {
    const origin = (request as any).__origin;
    const { error } = await PulseBoardAPI.deleteEndpoint(params.id, auth.userId);

    if (error) {
        return errorResponse(error.message, 400, origin);
    }

    return jsonResponse({ success: true }, 200, origin);
};

// POST /api/endpoints/:id/check-now - Trigger immediate check
const checkNow: RouteHandler = async (request, auth, params) => {
    const origin = (request as any).__origin;

    // First verify the endpoint belongs to this user
    const { data: endpoint, error } = await PulseBoardAPI.getEndpointById(params.id, auth.userId);

    if (error || !endpoint) {
        return errorResponse("Endpoint not found or unauthorized", 404, origin);
    }

    // Set next_check_at to now to trigger immediate check by dispatcher
    const { error: updateError } = await PulseBoardAPI.updateNextCheck(params.id, new Date().toISOString());

    if (updateError) {
        return errorResponse(updateError.message, 500, origin);
    }

    return jsonResponse({ success: true, message: "Check scheduled" }, 200, origin);
};

// Export routes with patterns
export const endpointRoutes = [
    {
        method: "GET",
        pattern: /^\/api\/endpoints$/,
        handler: listEndpoints,
        paramNames: [],
    },
    {
        method: "POST",
        pattern: /^\/api\/endpoints$/,
        handler: createEndpoint,
        paramNames: [],
    },
    {
        method: "GET",
        pattern: /^\/api\/endpoints\/([^/]+)$/,
        handler: getEndpoint,
        paramNames: ["id"],
    },
    {
        method: "PUT",
        pattern: /^\/api\/endpoints\/([^/]+)$/,
        handler: updateEndpoint,
        paramNames: ["id"],
    },
    {
        method: "DELETE",
        pattern: /^\/api\/endpoints\/([^/]+)$/,
        handler: deleteEndpoint,
        paramNames: ["id"],
    },
    {
        method: "POST",
        pattern: /^\/api\/endpoints\/([^/]+)\/check-now$/,
        handler: checkNow,
        paramNames: ["id"],
    },
];
