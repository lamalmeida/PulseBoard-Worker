/**
 * JWT Authentication Middleware
 * Validates Supabase JWTs and extracts user information
 */

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
 * Decode and validate a Supabase JWT
 * @param token The JWT token string
 * @param secret The JWT secret from Supabase
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
 * Verify JWT signature using HMAC-SHA256
 * Uses Web Crypto API available in Bun
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [headerB64, payloadB64, signatureB64] = parts;

        // Import the secret key
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        // Decode the signature from base64url
        const signature = Uint8Array.from(
            atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
        );

        // Verify the signature
        const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
        const isValid = await crypto.subtle.verify('HMAC', key, signature, data);

        if (!isValid) return null;

        // Decode and return the payload
        const payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;

        // Check expiration
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            return null; // Token expired
        }

        return payload;
    } catch (err) {
        console.error('JWT verification error:', err);
        return null;
    }
}

/**
 * Extract auth context from request
 * @param request The incoming request
 * @returns AuthContext if valid, null otherwise
 */
export async function authenticate(request: Request): Promise<AuthContext | null> {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    const secret = process.env.SUPABASE_JWT_SECRET;

    if (!secret) {
        console.error('SUPABASE_JWT_SECRET not configured');
        return null;
    }

    const payload = await verifyJWT(token, secret);

    if (!payload || !payload.sub) {
        return null;
    }

    return {
        userId: payload.sub,
        email: payload.email
    };
}
