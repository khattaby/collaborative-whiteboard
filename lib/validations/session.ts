import { z } from "zod";

// ============================================
// Canvas Element Schemas
// ============================================

const pointSchema = z.object({
    x: z.number(),
    y: z.number(),
});

const baseElementSchema = z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    authorName: z.string().optional(),
    color: z.string(),
});

const pencilElementSchema = baseElementSchema.extend({
    type: z.literal("pencil"),
    points: z.array(pointSchema),
    size: z.number().positive(),
});

const shapeElementSchema = baseElementSchema.extend({
    type: z.enum(["rectangle", "circle", "triangle", "diamond", "arrow", "line"]),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    size: z.number().positive(),
    fill: z.string().optional(),
});

const textElementSchema = baseElementSchema.extend({
    type: z.enum(["text", "sticky"]),
    x: z.number(),
    y: z.number(),
    content: z.string(),
    fontSize: z.number().positive(),
    width: z.number().optional(),
    height: z.number().optional(),
});

export const canvasElementSchema = z.discriminatedUnion("type", [
    pencilElementSchema,
    shapeElementSchema.extend({ type: z.literal("rectangle") }),
    shapeElementSchema.extend({ type: z.literal("circle") }),
    shapeElementSchema.extend({ type: z.literal("triangle") }),
    shapeElementSchema.extend({ type: z.literal("diamond") }),
    shapeElementSchema.extend({ type: z.literal("arrow") }),
    shapeElementSchema.extend({ type: z.literal("line") }),
    textElementSchema.extend({ type: z.literal("text") }),
    textElementSchema.extend({ type: z.literal("sticky") }),
]);

export const canvasElementsArraySchema = z.array(canvasElementSchema);

// ============================================
// Session Schemas
// ============================================

export const createSessionSchema = z.object({
    name: z
        .string()
        .min(1, "Session name is required")
        .max(100, "Session name must be less than 100 characters")
        .trim(),
    invitedFriendIds: z.array(z.string()).optional(),
});

export const inviteUsersSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    userIds: z
        .array(z.string().min(1))
        .min(1, "At least one user must be invited"),
});

export const sessionIdSchema = z.string().min(1, "Session ID is required");

export const saveSessionDataSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    elements: canvasElementsArraySchema,
});

// ============================================
// Type Exports
// ============================================

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type InviteUsersInput = z.infer<typeof inviteUsersSchema>;
export type SaveSessionDataInput = z.infer<typeof saveSessionDataSchema>;
export type CanvasElementInput = z.infer<typeof canvasElementSchema>;
