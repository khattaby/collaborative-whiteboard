"use server";

import { auth } from "@/auth";
import { prisma } from "@/auth";
import { revalidatePath } from "next/cache";

export async function updateProfileImage(formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const imageUrl = formData.get("imageUrl");

  if (typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
    throw new Error("Invalid image URL");
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: { image: imageUrl },
  });

  revalidatePath("/profile");
}

export async function removeProfileImage() {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: { image: null },
  });

  revalidatePath("/profile");
}
