"use client";

import { useActionState, useEffect } from "react";
import { sendFriendRequest } from "./friends-actions";

export default function AddFriendForm({ socket }: { socket?: any }) {
  const [state, action, isPending] = useActionState(sendFriendRequest, null);

  useEffect(() => {
    if (state?.success && state?.request && socket) {
      socket.emit("send-friend-request", {
        toUserId: state.receiverId,
        request: state.request,
      });
    }
  }, [state, socket]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Add Friend by Email
      </h3>
      <form action={action} className="flex gap-2">
        <input
          type="email"
          name="email"
          placeholder="friend@example.com"
          required
          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm px-3 py-2 border text-gray-900 bg-white placeholder:text-gray-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Adding..." : "Add"}
        </button>
      </form>
      {state?.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-2 text-sm text-green-600">
          {state.message || "Friend request sent!"}
        </p>
      )}
    </div>
  );
}
