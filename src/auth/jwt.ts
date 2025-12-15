/**
 * JWT Authentication Middleware
 * Validates Supabase JWTs using Supabase Client
 */

import { createClient } from "@supabase/supabase-js";

// Simple base64url decode (works in Bun)
function base64UrlDecode(str: string): string {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    return atob(base64 + padding);
}

export interface JWTPayload {
    sub: string;  // user_id
    email?: string;
    role?: string;
    aud?: string;
    exp?: number;
    iat?: number;
}

export interface AuthContext {
    userId: string;
    email?: string;
}

/**
 * Decode a Supabase JWT without verification
 * @param token The JWT token string
 * @returns The decoded payload or null if invalid
 */
export function decodeJWT(token: string): JWTPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(base64UrlDecode(parts[1]));
        return payload as JWTPayload;
    } catch {
        return null;
    }
}

/**
 * Extract auth context from request using Supabase Client
 * @param request The incoming request
 * @returns AuthContext if valid, null otherwise
 */
export async function authenticate(request: Request): Promise<AuthContext | null> {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Debug logging for troubleshooting
    // const parts = token.split('.');
    // try {
    //     const header = JSON.parse(base64UrlDecode(parts[0]));
    //     console.log(`[Auth] Token Header: alg=${header.alg}, kid=${header.kid || 'null'}, typ=${header.typ}`);
    // } catch (e) {
    //     console.error("[Auth] Failed to decode token header");
    // }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
        return null;
    }

    try {
        // Use Supabase Client to verify token
        // This handles HS256, RS256, ES256 automatically
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        });

        // verify the token by fetching user
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error("Authentication failed via Supabase client:", error?.message);
            return null;
        }

        return {
            userId: user.id,
            email: user.email
        };

    } catch (err) {
        console.error("Unexpected authentication error:", err);
        return null;
    }
}
