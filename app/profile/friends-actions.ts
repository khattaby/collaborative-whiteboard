"use server";

import { auth } from "@/auth";
import { prisma } from "@/auth";
import { revalidatePath } from "next/cache";
import {
  sendFriendRequestSchema,
  friendRequestIdSchema,
  friendIdSchema,
} from "@/lib/validations/friends";

// ============================================
// Type Definitions
// ============================================

interface FriendActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  request?: {
    id: string;
    sender: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  };
  receiverId?: string;
  friendship?: {
    friend: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
  };
  friendshipForSender?: {
    friend: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
  };
  senderId?: string;
  removedFriendId?: string;
  removerId?: string;
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
// Friend Actions
// ============================================

export async function sendFriendRequest(
  prevState: FriendActionResult | null,
  formData: FormData
): Promise<FriendActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate input
  const rawEmail = formData.get("email");
  const parseResult = sendFriendRequestSchema.safeParse({ email: rawEmail });

  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return { error: firstError?.message || "Invalid email address" };
  }

  const targetEmail = parseResult.data.email;

  if (targetEmail === user.email?.toLowerCase()) {
    return { error: "You cannot add yourself" };
  }

  // Find receiver
  const receiver = await prisma.user.findUnique({
    where: { email: targetEmail },
  });

  if (!receiver) {
    return { error: "User not found" };
  }

  // Check if already friends
  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: user.id, friendId: receiver.id },
        { userId: receiver.id, friendId: user.id },
      ],
    },
  });

  if (existingFriendship) {
    return { error: "Already friends" };
  }

  // Check if there is an existing request from SENDER to RECEIVER
  const existingRequest = await prisma.friendRequest.findUnique({
    where: {
      senderId_receiverId: {
        senderId: user.id,
        receiverId: receiver.id,
      },
    },
  });

  if (existingRequest) {
    if (existingRequest.status === "PENDING") {
      return { error: "Friend request already pending" };
    }

    // If ACCEPTED or REJECTED, we can update it to PENDING (re-request)
    try {
      const updatedRequest = await prisma.friendRequest.update({
        where: { id: existingRequest.id },
        data: { status: "PENDING" },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      revalidatePath("/profile");
      revalidatePath("/");
      return {
        success: true,
        message: "Friend request sent!",
        request: updatedRequest,
        receiverId: receiver.id,
      };
    } catch (e) {
      console.error("Failed to update friend request:", e);
      return { error: "Failed to send friend request" };
    }
  }

  // Check if there is a pending request from RECEIVER to SENDER
  const reverseRequest = await prisma.friendRequest.findUnique({
    where: {
      senderId_receiverId: {
        senderId: receiver.id,
        receiverId: user.id,
      },
    },
  });

  if (reverseRequest && reverseRequest.status === "PENDING") {
    return { error: "This user has already sent you a friend request" };
  }

  try {
    const newRequest = await prisma.friendRequest.create({
      data: {
        senderId: user.id,
        receiverId: receiver.id,
        status: "PENDING",
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    revalidatePath("/profile");
    revalidatePath("/");
    return {
      success: true,
      message: "Friend request sent!",
      request: newRequest,
      receiverId: receiver.id,
    };
  } catch (e) {
    console.error("Failed to create friend request:", e);
    return { error: "Failed to send friend request" };
  }
}

export async function acceptFriendRequest(
  requestId: string
): Promise<FriendActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Validate input
  const parseResult = friendRequestIdSchema.safeParse(requestId);
  if (!parseResult.success) {
    throw new Error("Invalid request ID");
  }

  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  // Verify the user accepting is the receiver
  if (user.id !== request.receiverId) {
    throw new Error("Unauthorized");
  }

  try {
    // Update request status
    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: "ACCEPTED" },
    });

    // Create bidirectional friendship
    await prisma.friendship.create({
      data: {
        userId: request.senderId,
        friendId: request.receiverId,
      },
    });

    await prisma.friendship.create({
      data: {
        userId: request.receiverId,
        friendId: request.senderId,
      },
    });

    // Get user details for the response
    const friendUser = await prisma.user.findUnique({
      where: { id: request.senderId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    const currentUser = await prisma.user.findUnique({
      where: { id: request.receiverId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    revalidatePath("/profile");
    revalidatePath("/");

    return {
      success: true,
      friendship: {
        friend: friendUser,
      },
      friendshipForSender: {
        friend: currentUser,
      },
      senderId: request.senderId,
      receiverId: request.receiverId,
    };
  } catch (e) {
    console.error("Failed to accept friend request:", e);
    throw new Error("Failed to accept friend request");
  }
}

export async function rejectFriendRequest(
  requestId: string
): Promise<FriendActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Validate input
  const parseResult = friendRequestIdSchema.safeParse(requestId);
  if (!parseResult.success) {
    throw new Error("Invalid request ID");
  }

  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  if (user.id !== request.receiverId) {
    throw new Error("Unauthorized");
  }

  try {
    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED" },
    });

    revalidatePath("/profile");
    revalidatePath("/");

    return { success: true };
  } catch (e) {
    console.error("Failed to reject friend request:", e);
    throw new Error("Failed to reject friend request");
  }
}

export async function removeFriend(
  friendId: string
): Promise<FriendActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Validate input
  const parseResult = friendIdSchema.safeParse(friendId);
  if (!parseResult.success) {
    throw new Error("Invalid friend ID");
  }

  try {
    // Remove both directions of the friendship
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: user.id, friendId: friendId },
          { userId: friendId, friendId: user.id },
        ],
      },
    });

    revalidatePath("/profile");
    revalidatePath("/");

    return { success: true, removedFriendId: friendId, removerId: user.id };
  } catch (e) {
    console.error("Failed to remove friend:", e);
    throw new Error("Failed to remove friend");
  }
}
