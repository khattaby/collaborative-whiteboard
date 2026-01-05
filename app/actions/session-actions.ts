"use server";

import { auth } from "@/auth";
import { prisma } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createSession(prevState: any, formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Session name is required" };
  }

  const friendIds = formData.getAll("friendIds") as string[];

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return { error: "User not found" };
  }

  let newSessionId: string;

  try {
    const newSession = await prisma.whiteboardSession.create({
      data: {
        name: name.trim(),
        creatorId: user.id,
        isActive: true,
        participants: {
          create: [
            { userId: user.id, status: "ACCEPTED" },
            ...friendIds.map((fid) => ({ userId: fid, status: "PENDING" })),
          ],
        },
      },
    });
    newSessionId = newSession.id;
  } catch (e) {
    console.error("Failed to create session:", e);
    return { error: "Failed to create session" };
  }

  return {
    success: true,
    sessionId: newSessionId,
    invitedUserIds: friendIds,
    sessionName: name.trim(),
    creatorName: user.name,
    creatorImage: user.image,
    creatorEmail: user.email,
  };
}

export async function acceptSessionInvite(sessionId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) throw new Error("User not found");

  await prisma.whiteboardSessionParticipant.update({
    where: {
      sessionId_userId: {
        sessionId: sessionId,
        userId: user.id,
      },
    },
    data: { status: "ACCEPTED" },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function leaveSession(sessionId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return { error: "User not found" };

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) return { error: "Session not found" };

  if (whiteboardSession.creatorId === user.id) {
    return {
      error: "Creator cannot leave the session, use End Session instead",
    };
  }

  await prisma.whiteboardSessionParticipant.delete({
    where: {
      sessionId_userId: {
        sessionId: sessionId,
        userId: user.id,
      },
    },
  });

  revalidatePath("/");
  return { success: true };
}

export async function getUserSessions() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
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

  if (!user) {
    return { error: "User not found" };
  }

  const allSessions = [
    ...user.joinedSessions.map((js) => ({
      ...js.session,
      role: js.session.creatorId === user.id ? "creator" : "participant",
      status: js.status,
    })),
    ...user.createdSessions.map((cs) => ({
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
}

export async function removeParticipant(
  sessionId: string,
  userIdToRemove: string
) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return { error: "User not found" };

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) return { error: "Session not found" };

  if (whiteboardSession.creatorId !== user.id) {
    return { error: "Only the creator can remove participants" };
  }

  if (whiteboardSession.creatorId === userIdToRemove) {
    return { error: "Creator cannot remove themselves" };
  }

  await prisma.whiteboardSessionParticipant.delete({
    where: {
      sessionId_userId: {
        sessionId: sessionId,
        userId: userIdToRemove,
      },
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteSession(sessionId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return { error: "User not found" };

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) return { error: "Session not found" };

  if (whiteboardSession.creatorId !== user.id) {
    return { error: "Only the creator can delete the session" };
  }

  await prisma.whiteboardSession.delete({
    where: { id: sessionId },
  });

  revalidatePath("/");
  return { success: true };
}

export async function inviteUsersToSession(
  sessionId: string,
  userIds: string[]
) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return { error: "User not found" };

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) return { error: "Session not found" };

  const newUserIds: string[] = [];

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
}

export async function rejectSessionInvite(sessionId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) throw new Error("User not found");

  await prisma.whiteboardSessionParticipant.delete({
    where: {
      sessionId_userId: {
        sessionId: sessionId,
        userId: user.id,
      },
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function getSessionDetails(sessionId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return null;

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
    include: {
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

  if (participant.status !== "ACCEPTED") {
    return { ...whiteboardSession, isPending: true };
  }

  return whiteboardSession;
}

export async function endSession(sessionId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return { error: "User not found" };

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) return { error: "Session not found" };

  if (whiteboardSession.creatorId !== user.id) {
    return { error: "Only the creator can end the session" };
  }

  await prisma.whiteboardSession.update({
    where: { id: sessionId },
    data: { isActive: false },
  });

  revalidatePath("/");
  return { success: true };
}

export async function saveSessionData(sessionId: string, elements: any[]) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return { error: "User not found" };

  const whiteboardSession = await prisma.whiteboardSession.findUnique({
    where: { id: sessionId },
  });

  if (!whiteboardSession) return { error: "Session not found" };

  const isParticipant = await prisma.whiteboardSessionParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId: sessionId,
        userId: user.id,
      },
    },
  });

  if (!isParticipant) return { error: "Not authorized" };

  await prisma.whiteboardSession.update({
    where: { id: sessionId },
    data: {
      data: elements as any,
    },
  });

  return { success: true };
}
