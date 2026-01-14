import { z } from "zod";

// ============================================
// Friend Request Schemas
// ============================================

export const sendFriendRequestSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .transform((email) => email.toLowerCase()),
});

export const friendRequestIdSchema = z.string().min(1, "Request ID is required");

export const friendIdSchema = z.string().min(1, "Friend ID is required");

// ============================================
// Type Exports
// ============================================

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
