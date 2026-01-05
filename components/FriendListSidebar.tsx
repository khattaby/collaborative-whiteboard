"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AddFriendForm from "../app/profile/AddFriendForm";
import { removeFriend } from "../app/profile/friends-actions";
import { io } from "socket.io-client";

type Friend = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type FriendListSidebarProps = {
  friends: {
    friend: Friend;
  }[];
  currentUserId?: string;
};

export default function FriendListSidebar({
  friends: initialFriends,
  currentUserId,
}: FriendListSidebarProps) {
  const router = useRouter();
  const [friends, setFriends] = useState(initialFriends);
  const [socket, setSocket] = useState<any>(null);

  // Sync with prop changes
  useEffect(() => {
    setFriends(initialFriends);
  }, [initialFriends]);

  // Socket connection
  useEffect(() => {
    if (!currentUserId) return;

    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      `http://${window.location.hostname}:3001`;
    const newSocket = io(url, {
      query: { userId: currentUserId },
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("FriendListSidebar connected to socket");
    });

    newSocket.on("friend-request-accepted", (data: any) => {
      console.log("Friend request accepted event received", data);
      const newFriend = data?.friend || data?.friendship?.friend;

      if (newFriend) {
        setFriends((prev) => {
          // Check if already exists
          if (prev.some((f) => f.friend.id === newFriend.id)) {
            return prev;
          }
          return [...prev, { friend: newFriend }];
        });
      }
    });

    newSocket.on(
      "friend-removed",
      ({ removedByUserId }: { removedByUserId: string }) => {
        console.log("Friend removed event received", removedByUserId);
        setFriends((prev) =>
          prev.filter((f) => f.friend.id !== removedByUserId)
        );
      }
    );

    return () => {
      newSocket.disconnect();
    };
  }, [currentUserId]);

  const handleRemoveFriend = async (friendId: string) => {
    if (confirm("Are you sure you want to remove this friend?")) {
      const result = await removeFriend(friendId);
      if (result && result.success && socket) {
        socket.emit("remove-friend", {
          toUserId: friendId,
          removedByUserId: result.removerId,
        });
      }
      setFriends((prev) => prev.filter((f) => f.friend.id !== friendId));
      router.refresh();
    }
  };

  return (
    <div className="w-80 bg-white rounded-xl shadow-xl border border-green-200 overflow-hidden flex flex-col h-full ml-4">
      <div className="p-4 bg-green-50 border-b border-green-100">
        <h2 className="text-lg font-semibold text-green-900">Friends</h2>
      </div>

      <div className="p-4 border-b border-green-100 bg-white">
        <AddFriendForm socket={socket} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {friends.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            No friends yet.
          </p>
        ) : (
          friends.map(({ friend }) => (
            <div
              key={friend.id}
              className="flex items-center gap-3 p-2 hover:bg-green-50 rounded-lg transition-colors group"
            >
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 border border-green-200 overflow-hidden flex-shrink-0">
                {friend.image ? (
                  <img
                    src={friend.image}
                    alt={friend.name || "Friend"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (friend.name?.[0] || friend.email?.[0] || "?").toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {friend.name || "No Name"}
                </p>
                <p className="text-xs text-gray-500 truncate">{friend.email}</p>
              </div>

              <button
                onClick={() => handleRemoveFriend(friend.id)}
                className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Remove Friend"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
