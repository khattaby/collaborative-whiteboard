"use client";

import { useState, useRef, useEffect } from "react";
import {
  acceptFriendRequest,
  rejectFriendRequest,
} from "@/app/profile/friends-actions";
import {
  acceptSessionInvite,
  rejectSessionInvite,
} from "@/app/actions/session-actions";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

type FriendRequest = {
  id: string;
  sender: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type SessionInvite = {
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
};

export default function NotificationDropdown({
  requests = [],
  sessionInvites = [],
  userId,
}: {
  requests: FriendRequest[];
  sessionInvites?: SessionInvite[];
  userId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [invites, setInvites] = useState<SessionInvite[]>(sessionInvites);
  const [friendRequests, setFriendRequests] =
    useState<FriendRequest[]>(requests);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();

  // Update states when props change
  useEffect(() => {
    setInvites(sessionInvites);
  }, [sessionInvites]);

  useEffect(() => {
    setFriendRequests(requests);
  }, [requests]);

  // Real-time updates via Socket.io
  useEffect(() => {
    if (!userId) return;

    const url = `http://${window.location.hostname}:3001`;
    const socket = io(url, { query: { userId } });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Notification socket connected");
    });

    socket.on("new-invite", (data: { session: SessionInvite["session"] }) => {
      console.log("Received new invite:", data);
      setInvites((prev) => {
        if (prev.some((inv) => inv.session.id === data.session.id)) {
          return prev;
        }
        return [...prev, { session: data.session }];
      });
    });

    socket.on("new-friend-request", (request: FriendRequest) => {
      console.log("Received new friend request:", request);
      setFriendRequests((prev) => {
        if (prev.some((req) => req.id === request.id)) return prev;
        return [...prev, request];
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [userId]);

  const totalCount = friendRequests.length + (invites?.length || 0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAccept = async (requestId: string) => {
    try {
      const result = await acceptFriendRequest(requestId);
      if (result && result.success) {
        // Emit event to notify sender that request was accepted
        if (socketRef.current) {
          socketRef.current.emit("accept-friend-request", {
            toUserId: result.senderId,
            friendship: result.friendshipForSender,
          });
        }
        // Remove from list
        setFriendRequests((prev) => prev.filter((req) => req.id !== requestId));
        // Refresh page to sync everything properly if needed, but we handle lists locally now
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to accept friend request:", error);
    }
  };

  const handleReject = async (requestId: string) => {
    await rejectFriendRequest(requestId);
    setFriendRequests((prev) => prev.filter((req) => req.id !== requestId));
    router.refresh();
  };

  const handleAcceptSession = async (sessionId: string) => {
    await acceptSessionInvite(sessionId);
    setIsOpen(false);
    router.refresh();
    router.push(`/?sessionId=${sessionId}`);
  };

  const handleRejectSession = async (sessionId: string) => {
    await rejectSessionInvite(sessionId);
    setInvites((prev) => prev.filter((i) => i.session.id !== sessionId));
    router.refresh();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-green-700 hover:text-green-900 hover:bg-green-50 rounded-full transition-colors focus:outline-none"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {totalCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-1 ring-white">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-green-100 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden origin-top-right transform transition-all">
          <div className="p-3 bg-green-50 border-b border-green-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-green-900">
              Notifications
            </h3>
            <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
              {totalCount} New
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {totalCount === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No new notifications
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {/* Session Invites Section */}
                {invites && invites.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Session Invites
                    </div>
                    {invites.map((invite) => (
                      <div
                        key={invite.session.id}
                        className="p-3 hover:bg-green-50/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-700 font-bold overflow-hidden border border-blue-200">
                            {invite.session.creator.image ? (
                              <img
                                src={invite.session.creator.image}
                                alt={invite.session.creator.name || "User"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              (
                                invite.session.creator.name?.[0] ||
                                invite.session.creator.email?.[0] ||
                                "?"
                              ).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              <span className="font-bold">
                                {invite.session.creator.name}
                              </span>{" "}
                              invited you to{" "}
                              <span className="text-green-600">
                                &quot;{invite.session.name}&quot;
                              </span>
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() =>
                                  handleAcceptSession(invite.session.id)
                                }
                                className="flex-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700 transition-colors font-medium shadow-sm"
                              >
                                Join
                              </button>
                              <button
                                onClick={() =>
                                  handleRejectSession(invite.session.id)
                                }
                                className="flex-1 bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded hover:bg-gray-200 transition-colors font-medium border border-gray-200"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Friend Requests Section */}
                {friendRequests.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Friend Requests
                    </div>
                    {friendRequests.map((request) => (
                      <div
                        key={request.id}
                        className="p-3 border-b border-gray-100 hover:bg-green-50/30 transition-colors last:border-0"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-100 flex-shrink-0 flex items-center justify-center text-green-700 font-bold overflow-hidden border border-green-200">
                            {request.sender.image ? (
                              <img
                                src={request.sender.image}
                                alt={request.sender.name || "User"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              (
                                request.sender.name?.[0] ||
                                request.sender.email?.[0] ||
                                "?"
                              ).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              <span className="font-bold">
                                {request.sender.name}
                              </span>{" "}
                              sent you a friend request
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => handleAccept(request.id)}
                                className="flex-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700 transition-colors font-medium shadow-sm"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleReject(request.id)}
                                className="flex-1 bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded hover:bg-gray-200 transition-colors font-medium border border-gray-200"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
