import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface SocketTokenPayload {
    userId: string;
    email: string;
    name?: string;
}

/**
 * Sign a JWT token for socket authentication
 */
export function signSocketToken(payload: SocketTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: "24h",
    });
}

/**
 * Verify and decode a JWT token
 */
export function verifySocketToken(token: string): SocketTokenPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as SocketTokenPayload;
        return decoded;
    } catch {
        return null;
    }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeSocketToken(token: string): SocketTokenPayload | null {
    try {
        return jwt.decode(token) as SocketTokenPayload;
    } catch {
        return null;
    }
}
