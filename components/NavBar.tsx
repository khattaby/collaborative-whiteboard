import { auth, signOut } from "@/auth";
import { prisma } from "@/auth";
import Link from "next/link";
import Image from "next/image";
import NotificationDropdown from "./NotificationDropdown";
import type { Session } from "next-auth";

type PendingFriendRequest = {
  id: string;
  sender: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type PendingSessionInvite = {
  session: {
    id: string;
    name: string;
    creator: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  };
  status: string;
};

export default async function NavBar() {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  let userImage = session?.user?.image;
  let userName = session?.user?.name;
  let pendingRequests: PendingFriendRequest[] = [];
  let pendingSessionInvites: PendingSessionInvite[] = [];

  if (session?.user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        image: true,
        name: true,
        receivedFriendRequests: {
          where: { status: "PENDING" },
          include: {
            sender: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        joinedSessions: {
          where: { status: "PENDING" },
          include: {
            session: {
              include: {
                creator: {
                  select: { id: true, name: true, email: true, image: true },
                },
              },
            },
          },
        },
      },
    });
    if (dbUser) {
      userImage = dbUser.image;
      userName = dbUser.name;
      pendingRequests = dbUser.receivedFriendRequests;
      pendingSessionInvites = dbUser.joinedSessions;
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      {/* Glassmorphism Background with subtle gradient - More distinct green */}
      <div className="absolute inset-0 bg-gradient-to-r from-green-100/90 via-emerald-50/90 to-green-100/90 backdrop-blur-md border-b border-green-300/50 shadow-sm" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="group flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:shadow-green-500/30 transition-all duration-300">
                W
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-700 to-teal-700 group-hover:from-green-600 group-hover:to-teal-600 transition-all">
                Whiteboard
              </span>
            </Link>
          </div>

          {/* Right side - User info or Sign In */}
          <div className="flex items-center space-x-4">
            {session?.user ? (
              <>
                <NotificationDropdown
                  requests={pendingRequests}
                  sessionInvites={pendingSessionInvites}
                  userId={session.user.id}
                />
                <div className="flex items-center gap-3 pl-4 border-l border-green-200">
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    {userImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={36}
                        height={36}
                        className="rounded-full border-2 border-white shadow-sm ring-2 ring-green-100"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center text-green-700 font-bold text-sm border border-green-300 shadow-inner">
                        {(
                          userName?.[0] ||
                          session.user.email?.[0] ||
                          "U"
                        ).toUpperCase()}
                      </div>
                    )}
                  </Link>
                </div>

                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm font-medium text-green-600 hover:text-red-600 px-3 py-2 rounded-full hover:bg-red-50 transition-all duration-200"
                  >
                    Sign Out
                  </button>
                </form>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/signin"
                  className="text-green-700 hover:text-green-900 font-medium text-sm px-4 py-2 rounded-full hover:bg-green-50 transition-all"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="bg-gradient-to-r from-green-600 to-teal-600 text-white px-5 py-2 rounded-full text-sm font-medium hover:from-green-700 hover:to-teal-700 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
