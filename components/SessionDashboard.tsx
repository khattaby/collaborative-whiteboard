import { getUserSessions } from "@/app/actions/session-actions";
import Link from "next/link";
import { Calendar, Clock, User, Plus, Users } from "lucide-react";
import DeleteSessionButton from "./DeleteSessionButton";

interface DashboardSession {
  id: string;
  name: string;
  createdAt: Date;
  isActive: boolean;
  role: string;
  status: string;
  creator?: {
    name: string | null;
    image: string | null;
  };
}

export default async function SessionDashboard() {
  let result;

  try {
    result = await getUserSessions();
  } catch (error) {
    console.error("Error loading sessions:", error);
    result = { error: "Failed to load sessions" };
  }

  if (result.error) {
    return (
      <div className="p-8 text-center text-red-600">
        <p className="text-lg font-semibold">Error loading sessions</p>
        <p className="text-sm text-gray-500 mt-2">{result.error}</p>
      </div>
    );
  }

  const sessions = result.sessions || [];
  const activeSessions = sessions.filter((s) => s.isActive);
  const endedSessions = sessions.filter((s) => !s.isActive);

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Your Whiteboard Sessions
        </h1>
        <p className="text-gray-600">
          Manage and access all your collaborative sessions
        </p>
      </div>

      {/* Create New Session Button */}
      <div className="mb-6">
        <Link
          href="/?create=new"
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New Session
        </Link>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            Active Sessions ({activeSessions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}

      {/* Ended Sessions */}
      {endedSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
            Ended Sessions ({endedSessions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {endedSessions.map((session) => (
              <SessionCard key={session.id} session={session} ended />
            ))}
          </div>
        </div>
      )}

      {/* No Sessions */}
      {sessions.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No sessions yet
          </h3>
          <p className="text-gray-500 mb-4">
            Create your first whiteboard session to start collaborating
          </p>
          <Link
            href="/?create=new"
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Session
          </Link>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  ended = false,
}: {
  session: DashboardSession;
  ended?: boolean;
}) {
  const createdDate = new Date(session.createdAt).toLocaleDateString();
  const createdTime = new Date(session.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const statusText = session.status === "PENDING" ? "Pending" : "Active";

  return (
    <div
      className={`relative p-4 rounded-lg border transition-all hover:shadow-md ${
        ended
          ? "bg-gray-50 border-gray-200 hover:border-gray-300"
          : "bg-white border-gray-200 hover:border-green-300"
      }`}
    >
      <Link
        href={`/?sessionId=${session.id}${ended ? "&viewOnly=true" : ""}`}
        className="absolute inset-0 z-0"
        aria-label={`View ${session.name}`}
      />

      <div className="relative z-10 pointer-events-none">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">
            {session.name}
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                ended
                  ? "bg-gray-100 text-gray-600"
                  : session.status === "PENDING"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {ended ? "Ended" : statusText}
            </span>
            {session.role === "creator" && (
              <div className="pointer-events-auto">
                <DeleteSessionButton sessionId={session.id} />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center">
            <User className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="truncate">
              {session.role === "creator"
                ? "You created this session"
                : `Created by ${session.creator?.name || "Unknown"}`}
            </span>
          </div>

          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{createdDate}</span>
          </div>

          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{createdTime}</span>
          </div>
        </div>

        {session.status === "PENDING" && !ended && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <span className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
              Invitation pending
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
