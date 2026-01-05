import { auth, signIn, signOut } from "@/auth";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function Page(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-green-50 overflow-hidden">
      <div className="w-full max-w-sm rounded-2xl border border-green-100 bg-white p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-4 text-green-900">Sign In</h1>
        {searchParams?.error === "InvalidCredentials" && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            Invalid email or password. Please try again.
          </div>
        )}
        {!session ? (
          <form
            action={async (formData) => {
              "use server";
              const email = String(formData.get("email") ?? "").toLowerCase();
              const password = String(formData.get("password") ?? "");
              try {
                await signIn("credentials", {
                  email,
                  password,
                  redirectTo: "/",
                });
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes("NEXT_REDIRECT")
                ) {
                  throw error;
                }
                redirect("/signin?error=InvalidCredentials");
              }
            }}
            className="space-y-3"
          >
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
              Sign In
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-green-700">
              Signed in as {session.user?.email ?? session.user?.name}
            </div>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="w-full rounded-lg border border-green-200 text-green-700 py-2.5 hover:bg-green-50 transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
