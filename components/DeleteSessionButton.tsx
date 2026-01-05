"use client";

import { deleteSession } from "@/app/actions/session-actions";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export default function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteSession(sessionId);
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert("Failed to delete session");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors z-10 relative"
      title="Delete Session"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
