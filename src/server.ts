/**
 * HTTP Server for PulseBoard API
 * Serves REST endpoints with JWT authentication
 */

import { authenticate, AuthContext } from "./auth/jwt";
import { endpointRoutes } from "./routes/endpoints";
import { checkRoutes } from "./routes/checks";
import { notificationRoutes } from "./routes/notifications";
import { statusPageRoutes } from "./routes/status-pages";
import { statsRoutes } from "./routes/stats";

const PORT = parseInt(process.env.API_PORT || "3001");
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "https://pulseboard.lamas-co.com").split(",");

// CORS headers
function corsHeaders(origin: string | null): HeadersInit {
    const allowedOrigin = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    };
}

// JSON response helper
export function jsonResponse(data: unknown, status = 200, origin: string | null = null): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
        },
    });
}

// Error response helper
export function errorResponse(message: string, status = 400, origin: string | null = null): Response {
    return jsonResponse({ error: message }, status, origin);
}

// Route handler type
export type RouteHandler = (
    request: Request,
    auth: AuthContext,
    params: Record<string, string>
) => Promise<Response>;

// Route definition
interface Route {
    method: string;
    pattern: RegExp;
    handler: RouteHandler;
    paramNames: string[];
}

// All routes
const routes: Route[] = [
    ...endpointRoutes,
    ...checkRoutes,
    ...notificationRoutes,
    ...statusPageRoutes,
];

// Parse URL path params
function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of routes) {
        if (route.method !== method) continue;

        const match = path.match(route.pattern);
        if (match) {
            const params: Record<string, string> = {};
            route.paramNames.forEach((name, i) => {
                params[name] = match[i + 1];
            });
            return { route, params };
        }
    }
    return null;
}

// Main request handler
async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("Origin");

    console.log(`[${request.method}] ${path} | Origin: ${origin || 'null'}`);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(origin),
        });
    }

    // Health check endpoint (no auth required)
    if (path === "/health" && request.method === "GET") {
        return jsonResponse({ status: "healthy", timestamp: new Date().toISOString() }, 200, origin);
    }

        ...notificationRoutes,
        ...statusPageRoutes,
        ...statsRoutes,
    ];

    // ...

    // All /api/* routes require authentication
    if (path.startsWith("/api/")) {
        // Public routes exception
        const isPublic = path.includes("/api/status-pages/public/") ||
            path === "/api/stats/global";

        let auth: AuthContext | null = null;
        if (!isPublic) {
            auth = await authenticate(request);

            if (!auth) {
                console.warn(`[401] Unauthorized access attempt to ${path}`);
                return errorResponse("Unauthorized", 401, origin);
            }
        } else {
            // Mock auth for public routes if needed, or handle in route
            // RouteHandler expects auth, so we can pass a dummy or null (need to update type or pass dummy)
            // Let's pass a "public" context
            auth = { userId: "public", email: "public@system" };
        }

        const matched = matchRoute(request.method, path);

        if (!matched) {
            console.warn(`[404] Route not found: ${path}`);
            return errorResponse("Not Found", 404, origin);
        }

        try {
            // Add origin to request for CORS in handlers
            (request as any).__origin = origin;
            return await matched.route.handler(request, auth, matched.params);
        } catch (err) {
            console.error("Route handler error:", err);
            return errorResponse("Internal Server Error", 500, origin);
        }
    }

    console.warn(`[404] Path not found: ${path}`);
    return errorResponse("Not Found", 404, origin);
}

// Start the server
export function startServer() {
    console.log(`🌐 HTTP API Server starting on port ${PORT}...`);

    Bun.serve({
        port: PORT,
        fetch: handleRequest,
    });

    console.log(`✅ HTTP API Server running at http://localhost:${PORT}`);
}
