"use client";

import { useActionState, useEffect } from "react";
import { createSession } from "@/app/actions/session-actions";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function CreateSessionForm({ friends }: { friends: any[] }) {
  const [state, action, isPending] = useActionState(createSession, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      // Connect to socket and emit invite
      const url = `http://${window.location.hostname}:3001`;
      const socket = io(url);

      socket.emit("send-invite", {
        toUserIds: state.invitedUserIds,
        session: {
          id: state.sessionId,
          name: state.sessionName,
          creator: {
            name: state.creatorName,
            image: state.creatorImage,
            email: state.creatorEmail,
          },
        },
      });

      // Give a small delay to ensure emit is sent before disconnecting/redirecting
      // Although socket.io usually buffers, better safe.
      setTimeout(() => {
        socket.disconnect();
        router.push(`/?sessionId=${state.sessionId}`);
      }, 100);
    }
  }, [state, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-green-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-green-100">
        <h1 className="text-2xl font-bold text-green-900 mb-6 text-center">
          Start Brainstorming
        </h1>

        <form action={action} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-green-700 mb-2"
            >
              Session Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              placeholder="e.g. Q4 Marketing Plan"
              className="w-full px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-black placeholder:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-700 mb-2">
              Invite Friends
            </label>
            {friends.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No friends to invite yet.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-green-200 rounded-lg divide-y divide-green-50">
                {friends.map((f) => (
                  <label
                    key={f.friend.id}
                    className="flex items-center p-3 hover:bg-green-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      name="friendIds"
                      value={f.friend.id}
                      className="w-4 h-4 text-green-600 rounded border-green-300 focus:ring-green-500"
                    />
                    <div className="ml-3 flex items-center gap-3">
                      {f.friend.image ? (
                        <img
                          src={f.friend.image}
                          alt={f.friend.name}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center text-green-800 text-xs font-bold">
                          {f.friend.name?.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm text-gray-700">
                        {f.friend.name}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {state?.error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Creating..." : "Create Session"}
          </button>
        </form>
      </div>
    </div>
  );
}
