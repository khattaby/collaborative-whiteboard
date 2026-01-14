"use client";

import React from "react";
import Image from "next/image";
import { X, Crown, LogOut } from "lucide-react";
import type { SessionParticipant, SessionUser } from "@/lib/whiteboard/types";

interface ParticipantsListProps {
    participants: SessionParticipant[];
    activeUserIds: Set<string>;
    currentUserId: string;
    creatorId: string;
    onKickUser: (userId: string) => void;
    onLeaveSession: () => void;
    viewOnly?: boolean;
}

export function ParticipantsList({
    participants,
    activeUserIds,
    currentUserId,
    creatorId,
    onKickUser,
    onLeaveSession,
    viewOnly = false,
}: ParticipantsListProps) {
    const isCreator = currentUserId === creatorId;
    const acceptedParticipants = participants.filter(
        (p) => p.status === "ACCEPTED"
    );

    return (
        <div className="absolute top-20 right-4 bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-64">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">Participants</h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {acceptedParticipants.length + 1} total
                </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Creator - always shown first */}
                <ParticipantItem
                    user={{
                        id: creatorId,
                        name: isCreator ? "You" : "Creator",
                    }}
                    isOnline={activeUserIds.has(creatorId) || isCreator}
                    isCreator={true}
                    isCurrentUser={isCreator}
                    canKick={false}
                    onKick={() => { }}
                />

                {/* Other participants */}
                {acceptedParticipants.map((participant) => {
                    if (participant.userId === creatorId) return null;

                    const isCurrentUser = participant.userId === currentUserId;
                    const isOnline = activeUserIds.has(participant.userId) || isCurrentUser;

                    return (
                        <ParticipantItem
                            key={participant.id}
                            user={participant.user}
                            isOnline={isOnline}
                            isCreator={false}
                            isCurrentUser={isCurrentUser}
                            canKick={isCreator && !isCurrentUser && !viewOnly}
                            onKick={() => onKickUser(participant.userId)}
                        />
                    );
                })}
            </div>

            {/* Leave Session Button */}
            {!isCreator && !viewOnly && (
                <>
                    <div className="border-t border-gray-200 my-3" />
                    <button
                        onClick={onLeaveSession}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <LogOut size={16} />
                        Leave Session
                    </button>
                </>
            )}
        </div>
    );
}

interface ParticipantItemProps {
    user: SessionUser;
    isOnline: boolean;
    isCreator: boolean;
    isCurrentUser: boolean;
    canKick: boolean;
    onKick: () => void;
}

function ParticipantItem({
    user,
    isOnline,
    isCreator,
    isCurrentUser,
    canKick,
    onKick,
}: ParticipantItemProps) {
    return (
        <div
            className={`flex items-center gap-2 p-2 rounded-lg ${isCurrentUser ? "bg-green-50" : "hover:bg-gray-50"
                }`}
        >
            {/* Avatar */}
            <div className="relative">
                {user.image ? (
                    <Image
                        src={user.image}
                        alt={user.name || "User"}
                        width={32}
                        height={32}
                        className="rounded-full"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-medium text-sm">
                        {(user.name?.[0] || user.email?.[0] || "U").toUpperCase()}
                    </div>
                )}

                {/* Online indicator */}
                <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isOnline ? "bg-green-500" : "bg-gray-300"
                        }`}
                />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-800 truncate">
                        {isCurrentUser ? "You" : user.name || user.email || "Unknown"}
                    </span>
                    {isCreator && (
                        <Crown size={12} className="text-yellow-500 flex-shrink-0" />
                    )}
                </div>
                <span className="text-xs text-gray-500">
                    {isOnline ? "Online" : "Offline"}
                </span>
            </div>

            {/* Kick button */}
            {canKick && (
                <button
                    onClick={onKick}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove from session"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}

export default ParticipantsList;
