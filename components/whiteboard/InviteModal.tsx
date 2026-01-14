"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Check, UserPlus, Search } from "lucide-react";
import type { Friend } from "@/lib/whiteboard/types";

interface InviteModalProps {
    friends: Friend[];
    existingParticipantIds: string[];
    onInvite: (friendIds: string[]) => void;
    onClose: () => void;
}

export function InviteModal({
    friends,
    existingParticipantIds,
    onInvite,
    onClose,
}: InviteModalProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Filter out friends who are already participants
    const availableFriends = friends.filter(
        (friend) => !existingParticipantIds.includes(friend.id)
    );

    // Filter by search query
    const filteredFriends = availableFriends.filter((friend) => {
        const query = searchQuery.toLowerCase();
        return (
            friend.name?.toLowerCase().includes(query) ||
            friend.email?.toLowerCase().includes(query)
        );
    });

    const toggleFriend = (friendId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(friendId)) {
                next.delete(friendId);
            } else {
                next.add(friendId);
            }
            return next;
        });
    };

    const handleInvite = async () => {
        if (selectedIds.size === 0) return;

        setIsLoading(true);
        try {
            await onInvite(Array.from(selectedIds));
            onClose();
        } catch (error) {
            console.error("Failed to invite users:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <UserPlus className="text-green-600" size={20} />
                        <h2 className="text-lg font-semibold text-gray-800">
                            Invite Friends
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                        <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search friends..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {/* Friends List */}
                <div className="max-h-64 overflow-y-auto p-2">
                    {filteredFriends.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            {availableFriends.length === 0
                                ? "All friends are already in this session"
                                : "No friends found"}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredFriends.map((friend) => {
                                const isSelected = selectedIds.has(friend.id);
                                return (
                                    <button
                                        key={friend.id}
                                        onClick={() => toggleFriend(friend.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${isSelected
                                                ? "bg-green-50 border-2 border-green-500"
                                                : "hover:bg-gray-50 border-2 border-transparent"
                                            }`}
                                    >
                                        {/* Avatar */}
                                        {friend.image ? (
                                            <Image
                                                src={friend.image}
                                                alt={friend.name || "Friend"}
                                                width={40}
                                                height={40}
                                                className="rounded-full"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-medium">
                                                {(
                                                    friend.name?.[0] ||
                                                    friend.email?.[0] ||
                                                    "U"
                                                ).toUpperCase()}
                                            </div>
                                        )}

                                        {/* Info */}
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="font-medium text-gray-800 truncate">
                                                {friend.name || "Unknown"}
                                            </div>
                                            <div className="text-sm text-gray-500 truncate">
                                                {friend.email}
                                            </div>
                                        </div>

                                        {/* Checkbox */}
                                        <div
                                            className={`w-5 h-5 rounded-full flex items-center justify-center ${isSelected
                                                    ? "bg-green-500 text-white"
                                                    : "border-2 border-gray-300"
                                                }`}
                                        >
                                            {isSelected && <Check size={12} />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleInvite}
                        disabled={selectedIds.size === 0 || isLoading}
                        className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${selectedIds.size === 0 || isLoading
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                    >
                        {isLoading ? (
                            <span className="animate-spin">⏳</span>
                        ) : (
                            <>
                                <UserPlus size={16} />
                                Invite ({selectedIds.size})
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default InviteModal;
