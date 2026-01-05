import { auth, signOut } from "@/auth";
import { prisma } from "@/auth";
import { redirect } from "next/navigation";
import { updateProfileImage, removeProfileImage } from "./actions";

export const runtime = "nodejs";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/signin");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      friends: {
        include: {
          friend: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  });

  if (!user) {
    // Should not happen if session is valid, but handle just in case
    redirect("/signin");
  }

  return (
    <div className="min-h-screen bg-green-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* User Profile Card */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-green-100 p-8">
          <div className="uppercase tracking-wide text-sm text-green-600 font-semibold mb-1">
            Profile
          </div>
          <h1 className="block mt-1 text-lg leading-tight font-medium text-green-900">
            User Information
          </h1>

          <div className="mt-6 space-y-6">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700 border-2 border-green-200 overflow-hidden">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name || "User"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user.name?.[0] || user.email?.[0] || "?").toUpperCase()
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {user.name || "No Name Set"}
                </h2>
                <p className="text-gray-500">{user.email}</p>
                {user.image && (
                  <form action={removeProfileImage} className="mt-2">
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-red-50 border border-transparent hover:border-red-100"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                      Remove Picture
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="border-t border-green-100 pt-4">
              <h3 className="text-sm font-medium text-green-700 mb-3">
                Change Profile Picture
              </h3>
              <form action={updateProfileImage} className="flex gap-2">
                <input
                  type="url"
                  name="imageUrl"
                  placeholder="Enter image URL..."
                  required
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white placeholder:text-gray-500"
                />
                <button
                  type="submit"
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Save
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
