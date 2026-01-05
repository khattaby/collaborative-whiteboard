"use server";

import { auth } from "@/auth";
import { prisma } from "@/auth";
import { revalidatePath } from "next/cache";

export async function sendFriendRequest(prevState: any, formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: "Not authenticated" };
  }

  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) {
    return { error: "Invalid email address" };
  }

  const targetEmail = email.toLowerCase();

  if (targetEmail === session.user.email.toLowerCase()) {
    return { error: "You cannot add yourself" };
  }

  // Find receiver
  const receiver = await prisma.user.findUnique({
    where: { email: targetEmail },
  });

  if (!receiver) {
    return { error: "User not found" };
  }

  const senderEmail = session.user.email;
  const sender = await prisma.user.findUnique({
    where: { email: senderEmail },
  });

  if (!sender) {
    throw new Error("Sender not found");
  }

  // Check if already friends
  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: sender.id, friendId: receiver.id },
        { userId: receiver.id, friendId: sender.id },
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
        senderId: sender.id,
        receiverId: receiver.id,
      },
    },
  });

  if (existingRequest) {
    if (existingRequest.status === "PENDING") {
      return { error: "Friend request already pending" };
    }

    // If ACCEPTED or REJECTED, we can update it to PENDING (re-request)
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
  }

  // Check if there is a pending request from RECEIVER to SENDER
  const reverseRequest = await prisma.friendRequest.findUnique({
    where: {
      senderId_receiverId: {
        senderId: receiver.id,
        receiverId: sender.id,
      },
    },
  });

  if (reverseRequest && reverseRequest.status === "PENDING") {
    return { error: "This user has already sent you a friend request" };
  }

  const newRequest = await prisma.friendRequest.create({
    data: {
      senderId: sender.id,
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
}

export async function acceptFriendRequest(requestId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  // Verify the user accepting is the receiver
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user || user.id !== request.receiverId) {
    throw new Error("Unauthorized");
  }

  // Transaction to update request and create friendship (both ways for easier querying)
  // Using sequential operations instead of transaction to avoid "Unable to start a transaction" error
  // which can happen with serverless postgres adapters

  await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: "ACCEPTED" },
  });

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
}

export async function rejectFriendRequest(requestId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user || user.id !== request.receiverId) {
    throw new Error("Unauthorized");
  }

  await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED" },
  });

  revalidatePath("/profile");
  revalidatePath("/");

  return { success: true };
}

export async function removeFriend(friendId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Remove both directions
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
}
