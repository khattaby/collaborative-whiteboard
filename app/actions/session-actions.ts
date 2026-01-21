"use server";

import { auth } from "@/auth";
import { prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createSessionSchema,
  sessionIdSchema,
  inviteUsersSchema,
  canvasElementsArraySchema,
} from "@/lib/validations/session";
import type {
  SessionParticipant,
  SessionUser,
  WhiteboardSessionData,
} from "@/lib/whiteboard/types";

// ============================================
// Type Definitions
// ============================================

interface SessionActionResult {
  success?: boolean;
  error?: string;
  sessionId?: string;
  invitedUserIds?: string[];
  sessionName?: string;
  creatorName?: string | null;
  creatorImage?: string | null;
  creatorEmail?: string | null;
}

interface SessionsResult {
  sessions?: Array<{
    id: string;
    name: string;
    createdAt: Date;
    isActive: boolean;
    role: string;
    status: string;
    creator?: { name: string | null; image: string | null };
  }>;
  error?: string;
}

// ============================================
// Helper Functions
// ============================================

async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  return user;
}

// ============================================
// Session Actions
// ============================================

export async function createSession(
  prevState: SessionActionResult | null,
  formData: FormData
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate input
  const rawName = formData.get("name");
  const friendIds = formData.getAll("friendIds") as string[];

  const parseResult = createSessionSchema.safeParse({
    name: rawName,
    invitedFriendIds: friendIds,
  });

  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return { error: firstError?.message || "Invalid input" };
  }

  const { name, invitedFriendIds = [] } = parseResult.data;

  try {
    const newSession = await prisma.whiteboardSession.create({
      data: {
        name,
        creatorId: user.id,
        isActive: true,
        participants: {
          create: [
            { userId: user.id, status: "ACCEPTED" },
            ...invitedFriendIds.map((fid) => ({
              userId: fid,
              status: "PENDING",
            })),
          ],
        },
      },
    });

    return {
      success: true,
      sessionId: newSession.id,
      invitedUserIds: invitedFriendIds,
      sessionName: name,
      creatorName: user.name,
      creatorImage: user.image,
      creatorEmail: user.email,
    };
  } catch (e) {
    console.error("Failed to create session:", e);
    return { error: "Failed to create session" };
  }
}

export async function acceptSessionInvite(
  sessionId: string
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Validate sessionId
  const parseResult = sessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    throw new Error("Invalid session ID");
  }

  try {
    await prisma.whiteboardSessionParticipant.update({
      where: {
        sessionId_userId: {
          sessionId,
          userId: user.id,
        },
      },
      data: { status: "ACCEPTED" },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (e) {
    console.error("Failed to accept invite:", e);
    throw new Error("Failed to accept session invite");
  }
}

export async function leaveSession(
  sessionId: string
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate sessionId
  const parseResult = sessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    return { error: "Invalid session ID" };
  }

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) {
    return { error: "Session not found" };
  }

  if (whiteboardSession.creatorId === user.id) {
    return {
      error: "Creator cannot leave the session, use End Session instead",
    };
  }

  try {
    await prisma.whiteboardSessionParticipant.delete({
      where: {
        sessionId_userId: {
          sessionId,
          userId: user.id,
        },
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (e) {
    console.error("Failed to leave session:", e);
    return { error: "Failed to leave session" };
  }
}

export async function getUserSessions(): Promise<SessionsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  try {
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        joinedSessions: {
          include: {
            session: {
              select: {
                id: true,
                name: true,
                createdAt: true,
                isActive: true,
                creatorId: true,
                creator: {
                  select: {
                    name: true,
                    image: true,
                  },
                },
              },
            },
          },
        },
        createdSessions: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            isActive: true,
          },
        },
      },
    });

    if (!userData) {
      return { error: "User not found" };
    }

    const allSessions = [
      ...userData.joinedSessions.map((js) => ({
        ...js.session,
        role: js.session.creatorId === user.id ? "creator" : "participant",
        status: js.status,
      })),
      ...userData.createdSessions.map((cs) => ({
        ...cs,
        role: "creator",
        status: "ACCEPTED",
      })),
    ];

    const uniqueSessions = allSessions.filter(
      (session, index, self) =>
        index === self.findIndex((s) => s.id === session.id)
    );

    return { sessions: uniqueSessions };
  } catch (e) {
    console.error("Failed to get sessions:", e);
    return { error: "Failed to load sessions" };
  }
}

export async function removeParticipant(
  sessionId: string,
  userIdToRemove: string
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate inputs
  const sessionIdResult = sessionIdSchema.safeParse(sessionId);
  const userIdResult = z.string().min(1).safeParse(userIdToRemove);

  if (!sessionIdResult.success || !userIdResult.success) {
    return { error: "Invalid input" };
  }

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) {
    return { error: "Session not found" };
  }

  if (whiteboardSession.creatorId !== user.id) {
    return { error: "Only the creator can remove participants" };
  }

  if (whiteboardSession.creatorId === userIdToRemove) {
    return { error: "Creator cannot remove themselves" };
  }

  try {
    await prisma.whiteboardSessionParticipant.delete({
      where: {
        sessionId_userId: {
          sessionId,
          userId: userIdToRemove,
        },
      },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (e) {
    console.error("Failed to remove participant:", e);
    return { error: "Failed to remove participant" };
  }
}

export async function deleteSession(
  sessionId: string
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const parseResult = sessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    return { error: "Invalid session ID" };
  }

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) {
    return { error: "Session not found" };
  }

  if (whiteboardSession.creatorId !== user.id) {
    return { error: "Only the creator can delete the session" };
  }

  try {
    await prisma.whiteboardSession.delete({
      where: { id: sessionId },
    });

    revalidatePath("/");
    return { success: true };
  } catch (e) {
    console.error("Failed to delete session:", e);
    return { error: "Failed to delete session" };
  }
}

export async function inviteUsersToSession(
  sessionId: string,
  userIds: string[]
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate inputs
  const parseResult = inviteUsersSchema.safeParse({ sessionId, userIds });
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return { error: firstError?.message || "Invalid input" };
  }

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) {
    return { error: "Session not found" };
  }

  const newUserIds: string[] = [];

  try {
    for (const userId of userIds) {
      const existing = await prisma.whiteboardSessionParticipant.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });

      if (!existing) {
        await prisma.whiteboardSessionParticipant.create({
          data: {
            sessionId,
            userId,
            status: "PENDING",
          },
        });
        newUserIds.push(userId);
      }
    }

    return {
      success: true,
      invitedUserIds: newUserIds,
      sessionName: whiteboardSession.name,
      creatorName: user.name,
      creatorImage: user.image,
      creatorEmail: user.email,
    };
  } catch (e) {
    console.error("Failed to invite users:", e);
    return { error: "Failed to invite users" };
  }
}

export async function rejectSessionInvite(
  sessionId: string
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const parseResult = sessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    throw new Error("Invalid session ID");
  }

  try {
    await prisma.whiteboardSessionParticipant.delete({
      where: {
        sessionId_userId: {
          sessionId,
          userId: user.id,
        },
      },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (e) {
    console.error("Failed to reject invite:", e);
    throw new Error("Failed to reject session invite");
  }
}

export async function getSessionDetails(sessionId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const parseResult = sessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    return null;
  }

  try {
    const whiteboardSession = await prisma.whiteboardSession.findUnique({
      where: { id: sessionId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!whiteboardSession) return null;

    const participant = whiteboardSession.participants.find(
      (p) => p.userId === user.id
    );

    if (!participant) return null;

    const normalizedParticipants: SessionParticipant[] =
      whiteboardSession.participants.map((p) => {
        const status: SessionParticipant["status"] =
          p.status === "ACCEPTED" ||
          p.status === "REJECTED" ||
          p.status === "PENDING"
            ? p.status
            : "PENDING";
        const normalizedUser: SessionUser = {
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          image: p.user.image,
        };
        return {
          id: p.id,
          userId: p.userId,
          status,
          user: normalizedUser,
        };
      });

    const creator: SessionUser = {
      id: whiteboardSession.creator.id,
      name: whiteboardSession.creator.name,
      email: whiteboardSession.creator.email,
      image: whiteboardSession.creator.image,
    };

    const rawData = whiteboardSession.data;
    const dataParse =
      rawData == null
        ? { success: true as const, data: [] }
        : canvasElementsArraySchema.safeParse(rawData);
    const data = dataParse.success ? dataParse.data : [];

    const result: WhiteboardSessionData & { isPending: boolean } = {
      id: whiteboardSession.id,
      name: whiteboardSession.name,
      isActive: whiteboardSession.isActive,
      createdAt: whiteboardSession.createdAt,
      creatorId: whiteboardSession.creatorId,
      creator,
      participants: normalizedParticipants,
      data,
      isPending: participant.status !== "ACCEPTED",
    };

    return result;
  } catch (e) {
    console.error("Failed to get session details:", e);
    return null;
  }
}

export async function endSession(
  sessionId: string
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const parseResult = sessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    return { error: "Invalid session ID" };
  }

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) {
    return { error: "Session not found" };
  }

  if (whiteboardSession.creatorId !== user.id) {
    return { error: "Only the creator can end the session" };
  }

  try {
    await prisma.whiteboardSession.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    revalidatePath("/");
    return { success: true };
  } catch (e) {
    console.error("Failed to end session:", e);
    return { error: "Failed to end session" };
  }
}

export async function saveSessionData(
  sessionId: string,
  elements: unknown[]
): Promise<SessionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate sessionId
  const sessionIdResult = sessionIdSchema.safeParse(sessionId);
  if (!sessionIdResult.success) {
    return { error: "Invalid session ID" };
  }

  // Validate elements (with lenient parsing for flexibility)
  // We use a more permissive validation here since canvas data can vary
  if (!Array.isArray(elements)) {
    return { error: "Invalid elements format" };
  }

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) {
    return { error: "Session not found" };
  }

  const isParticipant = await prisma.whiteboardSessionParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId: user.id,
      },
    },
  });

  if (!isParticipant) {
    return { error: "Not authorized" };
  }

  try {
    await prisma.whiteboardSession.update({
      where: { id: sessionId },
      data: {
        data: elements as z.infer<typeof canvasElementsArraySchema>,
      },
    });

    return { success: true };
  } catch (e) {
    console.error("Failed to save session data:", e);
    return { error: "Failed to save session data" };
  }
}
