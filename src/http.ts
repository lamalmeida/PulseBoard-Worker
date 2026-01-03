
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "https://pulseboard.lamas-co.com,https://lamas-co.com,https://www.lamas-co.com").split(",");

// Auth context interface (moved from jwt.ts if needed, but RouteHandler uses it)
// Actually AuthContext is in jwt.ts, so we import it.
import { AuthContext } from "./auth/jwt";

// CORS headers
export function corsHeaders(origin: string | null): HeadersInit {
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
export interface Route {
    method: string;
    pattern: RegExp;
    handler: RouteHandler;
    paramNames: string[];
}
