import { auth, signIn } from "@/auth";
export const runtime = "nodejs";
import { prisma } from "@/auth";

export default async function Page() {
  const session = await auth();
  return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-green-50 overflow-hidden">
      <div className="w-full max-w-sm rounded-2xl border border-green-100 bg-white p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-4 text-green-900">
          Create Account
        </h1>
        {!session ? (
          <form
            action={async (formData) => {
              "use server";
              const email = String(formData.get("email") ?? "").toLowerCase();
              const name = String(formData.get("name") ?? "");
              const password = String(formData.get("password") ?? "");
              if (!email || !password) return;
              const { hash } = await import("bcryptjs");
              const hashedPassword = await hash(password, 10);
              try {
                console.log("Attempting to create/update user:", email);
                const user = await prisma.user.upsert({
                  where: { email },
                  create: { email, name: name || null, hashedPassword },
                  update: {
                    hashedPassword,
                    name: name || undefined,
                  },
                });
                console.log("User upserted successfully:", user.id);
              } catch (error) {
                console.error("Error creating user:", error);
              }
              try {
                await signIn("credentials", {
                  email,
                  password,
                  redirectTo: "/",
                });
              } catch (error) {
                // If the error is a NEXT_REDIRECT, we should rethrow it
                // so that Next.js can handle the redirect
                if (
                  error instanceof Error &&
                  error.message.includes("NEXT_REDIRECT")
                ) {
                  throw error;
                }
                // For other errors, we might want to log them or show them to the user
                // but for now we'll just rethrow only redirect errors
                // Actually, NextAuth throws a specific error for redirect that we must rethrow
                throw error;
              }
            }}
            className="space-y-3"
          >
            <input
              name="name"
              type="text"
              placeholder="Name (optional)"
              className="w-full rounded-lg border border-green-200 px-3 py-2 text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-lg border border-green-200 px-3 py-2 text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Password"
              className="w-full rounded-lg border border-green-200 px-3 py-2 text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-green-600 text-white py-2.5 hover:bg-green-700 transition-colors shadow-sm font-medium"
            >
              Create Account
            </button>
          </form>
        ) : (
          <div className="text-sm text-green-700">
            You are already signed in.
          </div>
        )}
      </div>
    </div>
  );
}
