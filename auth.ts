import NextAuth from "next-auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import Credentials from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import type { User } from "@prisma/client";

// Extend NextAuth types using module augmentation
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const authSecret = process.env.AUTH_SECRET;
if (!authSecret) {
  throw new Error("AUTH_SECRET is not set");
}

const pool = new Pool({
  connectionString,
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
  secret: authSecret,
  trustHost: true,
  logger: {
    error(error) {
      if (error?.name === "JWTSessionError") {
        return;
      }
      console.error("[auth][error]", error);
    },
  },
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
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && typeof token.id === "string" && session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
});
