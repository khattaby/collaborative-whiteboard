import NextAuth from "next-auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import Credentials from "next-auth/providers/credentials";
import { PrismaClient } from "@/app/generated/prisma/client";
import type { User } from "@/app/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
const pool = new Pool({
  connectionString: connectionString
    ? connectionString.split("?")[0]
    : undefined,
  ssl: { rejectUnauthorized: false },
});

const prismaClient =
  globalThis.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
  });
if (process.env.NODE_ENV !== "production") globalThis.prisma = prismaClient;
export const prisma = prismaClient;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { compare } = await import("bcryptjs");
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.toLowerCase()
            : undefined;
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : undefined;
        if (!email || !password) return null;
        const user: User | null = await prisma.user.findUnique({
          where: { email },
        });
        const hashed = user?.hashedPassword ?? undefined;
        if (!user || !hashed) return null;
        let ok = false;
        try {
          ok = await compare(password, hashed);
        } catch {
          ok = false;
        }
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
});
