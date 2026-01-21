import { auth } from "@/auth";
import { prisma } from "@/auth";
import Whiteboard from "@/components/Whiteboard";
import FriendListSidebar from "@/components/FriendListSidebar";
import CreateSessionForm from "@/components/CreateSessionForm";
import SessionDashboard from "@/components/SessionDashboard";
import type { Friend } from "@/lib/whiteboard/types";
import {
  getSessionDetails,
  acceptSessionInvite,
  rejectSessionInvite,
} from "@/app/actions/session-actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Session } from "next-auth";

export const runtime = "nodejs";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    sessionId?: string;
    create?: string;
    viewOnly?: string;
  }>;
}) {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  const { sessionId, create, viewOnly } = await searchParams;

  let friends: { friend: Friend }[] = [];

  if (session?.user?.email) {
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
    if (user) {
      friends = user.friends;
    }
  }

  // Guest Mode - Welcome Screen
  if (!session?.user) {
    return (
      <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-2xl text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">
            Collaborate and Ideate in{" "}
            <span className="text-green-600">Real-Time</span>
          </h1>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            Unleash your creativity with our collaborative whiteboard. Connect
            with friends, share ideas, and bring your projects to life on an
            infinite canvas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold text-lg hover:bg-green-700 transition-colors shadow-lg hover:shadow-xl"
            >
              Get Started for Free
            </Link>
            <Link
              href="/signin"
              className="px-8 py-3 bg-white text-green-700 border-2 border-green-600 rounded-lg font-semibold text-lg hover:bg-green-50 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Logged in but no session selected -> Show Session Dashboard
  if (!sessionId) {
    // If user wants to create a new session, show the create form
    if (create === "new") {
      return (
        <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 flex overflow-hidden">
          <div className="flex-1 h-full overflow-y-auto">
            <CreateSessionForm friends={friends} />
          </div>
          <div className="flex-none h-full border-l border-green-200 bg-white">
            <FriendListSidebar
              friends={friends}
              currentUserId={session.user.id}
            />
          </div>
        </div>
      );
    }

    // Otherwise, show the session dashboard with all user's sessions
    return (
      <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 flex overflow-hidden">
        <div className="flex-1 h-full overflow-y-auto">
          <SessionDashboard />
        </div>
        <div className="flex-none h-full border-l border-green-200 bg-white">
          <FriendListSidebar
            friends={friends}
            currentUserId={session.user.id}
          />
        </div>
      </div>
    );
  }

  // Logged in and session selected
  const whiteboardSession = await getSessionDetails(sessionId);

  // If session not found or user not authorized
  if (!whiteboardSession) {
    return (
      <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md mx-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Session Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            The session you are looking for does not exist or you do not have
            permission to access it.
          </p>
          <Link
            href="/"
            className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // Allow viewing ended sessions in view-only mode, but block access to active sessions that are ended
  if (!whiteboardSession.isActive && viewOnly !== "true") {
    return (
      <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md mx-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Session Ended
          </h2>
          <p className="text-gray-600 mb-6">
            This session has been ended by the creator. You can view it in
            read-only mode.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href={`/?sessionId=${sessionId}&viewOnly=true`}
              className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              View Session
            </Link>
            <Link
              href="/"
              className="inline-block bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If user has not accepted the invite yet
  if (whiteboardSession.isPending) {
    return (
      <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md mx-4 border border-green-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Join &quot;{whiteboardSession.name}&quot;?
          </h2>
          <p className="text-gray-600 mb-8">
            You have been invited to join this brainstorming session. Please
            accept the invitation to start collaborating.
          </p>
          <div className="flex gap-4 justify-center">
            <form
              action={async () => {
                "use server";
                await acceptSessionInvite(sessionId);
              }}
            >
              <button
                type="submit"
                className="bg-green-600 text-white px-8 py-2.5 rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm"
              >
                Accept & Join
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await rejectSessionInvite(sessionId);
                redirect("/");
              }}
            >
              <button
                type="submit"
                className="bg-gray-100 text-gray-700 px-8 py-2.5 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-200"
              >
                Decline
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-16 w-full h-[calc(100vh-4rem)] bg-green-50 p-4 sm:p-6 flex overflow-hidden">
      <div className="flex-1 h-full min-w-0">
        <Whiteboard
          key={sessionId}
          user={session.user}
          sessionId={sessionId}
          sessionName={whiteboardSession?.name}
          creatorId={whiteboardSession?.creatorId}
          friends={friends}
          viewOnly={viewOnly === "true"}
          initialParticipants={whiteboardSession.participants
            .filter((p) => p.status === "ACCEPTED")
            .map((p) => p.user)}
          initialElements={whiteboardSession.data || []}
        />
      </div>
      <div className="flex-none h-full">
        <FriendListSidebar friends={friends} currentUserId={session.user.id} />
      </div>
    </div>
  );
}
