"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
    CanvasElement,
    Cursor,
    SessionUser,
    SessionParticipant,
} from "@/lib/whiteboard/types";

interface UseWhiteboardSocketOptions {
    sessionId?: string;
    user?: SessionUser;
    onElementsInit: (elements: CanvasElement[]) => void;
    onElementAdded: (element: CanvasElement) => void;
    onElementUpdated: (element: CanvasElement) => void;
    onElementDeleted: (elementId: string) => void;
    onElementsUpdate: (elements: CanvasElement[]) => void;
    onCursorUpdate: (cursor: Cursor) => void;
    onCursorRemove: (cursorId: string) => void;
    onUserJoined: (user: SessionUser) => void;
    onUserLeft: (userId: string) => void;
    onUserKicked: (userId: string) => void;
    onUserStatusChange: (userId: string, status: "online" | "offline") => void;
    onActiveUsers: (userIds: string[]) => void;
    onSessionEnded: () => void;
    onNewInvite?: (session: { id: string; name: string; creator: SessionUser }) => void;
    authToken?: string;
}

interface UseWhiteboardSocketReturn {
    socket: Socket | null;
    isConnected: boolean;
    cursors: Map<string, Cursor>;
    emitCursorMove: (x: number, y: number, name: string, color: string) => void;
    emitAddElement: (element: CanvasElement) => void;
    emitUpdateElement: (element: CanvasElement) => void;
    emitDeleteElement: (elementId: string) => void;
    emitUndoElement: (userId: string) => void;
    emitClearUserElements: (userId: string) => void;
    emitSessionEnded: (sessionId: string) => void;
    emitKickUser: (userId: string, sessionId: string) => void;
    emitUserLeft: (userId: string, sessionId: string) => void;
    emitSendInvite: (toUserIds: string[], session: { id: string; name: string }) => void;
    emitJoinSession: (user: SessionUser) => void;
}

export function useWhiteboardSocket(
    options: UseWhiteboardSocketOptions
): UseWhiteboardSocketReturn {
    const {
        sessionId,
        user,
        onElementsInit,
        onElementAdded,
        onElementUpdated,
        onElementDeleted,
        onElementsUpdate,
        onCursorUpdate,
        onCursorRemove,
        onUserJoined,
        onUserLeft,
        onUserKicked,
        onUserStatusChange,
        onActiveUsers,
        onSessionEnded,
        onNewInvite,
        authToken,
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [cursors, setCursors] = useState<Map<string, Cursor>>(new Map());
    const socketRef = useRef<Socket | null>(null);

    // Store callbacks in refs to avoid reconnection on every callback change
    const callbacksRef = useRef(options);
    callbacksRef.current = options;

    useEffect(() => {
        if (!sessionId || !user?.id) return;

        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

        const socket = io(socketUrl, {
            query: {
                sessionId,
                userId: user.id,
                ...(authToken ? { token: authToken } : {}),
            },
            transports: ["websocket", "polling"],
        });

        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
            console.log("Socket connected:", socket.id);
        });

        socket.on("disconnect", () => {
            setIsConnected(false);
            console.log("Socket disconnected");
        });

        socket.on("connect_error", (error) => {
            console.error("Socket connection error:", error);
            setIsConnected(false);
        });

        // Element events
        socket.on("init-elements", (elements: CanvasElement[]) => {
            callbacksRef.current.onElementsInit(elements);
        });

        socket.on("element-added", (element: CanvasElement) => {
            callbacksRef.current.onElementAdded(element);
        });

        socket.on("element-updated", (element: CanvasElement) => {
            callbacksRef.current.onElementUpdated(element);
        });

        socket.on("element-deleted", (elementId: string) => {
            callbacksRef.current.onElementDeleted(elementId);
        });

        socket.on("elements-update", (elements: CanvasElement[]) => {
            callbacksRef.current.onElementsUpdate(elements);
        });

        // Cursor events
        socket.on("cursor-update", (cursor: Cursor) => {
            setCursors((prev) => {
                const next = new Map(prev);
                next.set(cursor.id, cursor);
                return next;
            });
            callbacksRef.current.onCursorUpdate(cursor);
        });

        socket.on("cursor-remove", (cursorId: string) => {
            setCursors((prev) => {
                const next = new Map(prev);
                next.delete(cursorId);
                return next;
            });
            callbacksRef.current.onCursorRemove(cursorId);
        });

        // User events
        socket.on("user-joined", (joinedUser: SessionUser) => {
            callbacksRef.current.onUserJoined(joinedUser);
        });

        socket.on("user-left", ({ userId }: { userId: string }) => {
            callbacksRef.current.onUserLeft(userId);
        });

        socket.on("user-kicked", ({ userId }: { userId: string }) => {
            callbacksRef.current.onUserKicked(userId);
        });

        socket.on(
            "user-status-change",
            ({ userId, status }: { userId: string; status: "online" | "offline" }) => {
                callbacksRef.current.onUserStatusChange(userId, status);
            }
        );

        socket.on("active-users", (userIds: string[]) => {
            callbacksRef.current.onActiveUsers(userIds);
        });

        socket.on("session-ended", () => {
            callbacksRef.current.onSessionEnded();
        });

        socket.on("new-invite", ({ session }) => {
            callbacksRef.current.onNewInvite?.(session);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [sessionId, user?.id, authToken]);

    // Emit functions
    const emitCursorMove = useCallback(
        (x: number, y: number, name: string, color: string) => {
            socketRef.current?.emit("cursor-move", { x, y, name, color });
        },
        []
    );

    const emitAddElement = useCallback((element: CanvasElement) => {
        socketRef.current?.emit("add-element", element);
    }, []);

    const emitUpdateElement = useCallback((element: CanvasElement) => {
        socketRef.current?.emit("update-element", element);
    }, []);

    const emitDeleteElement = useCallback((elementId: string) => {
        socketRef.current?.emit("delete-element", elementId);
    }, []);

    const emitUndoElement = useCallback((userId: string) => {
        socketRef.current?.emit("undo-element", userId);
    }, []);

    const emitClearUserElements = useCallback((userId: string) => {
        socketRef.current?.emit("clear-user-elements", userId);
    }, []);

    const emitSessionEnded = useCallback((sessionId: string) => {
        socketRef.current?.emit("session-ended", { sessionId });
    }, []);

    const emitKickUser = useCallback((userId: string, sessionId: string) => {
        socketRef.current?.emit("kick-user", { userId, sessionId });
    }, []);

    const emitUserLeft = useCallback((userId: string, sessionId: string) => {
        socketRef.current?.emit("user-left", { userId, sessionId });
    }, []);

    const emitSendInvite = useCallback(
        (toUserIds: string[], session: { id: string; name: string }) => {
            socketRef.current?.emit("send-invite", { toUserIds, session });
        },
        []
    );

    const emitJoinSession = useCallback((user: SessionUser) => {
        socketRef.current?.emit("join-session", { user });
    }, []);

    return {
        socket: socketRef.current,
        isConnected,
        cursors,
        emitCursorMove,
        emitAddElement,
        emitUpdateElement,
        emitDeleteElement,
        emitUndoElement,
        emitClearUserElements,
        emitSessionEnded,
        emitKickUser,
        emitUserLeft,
        emitSendInvite,
        emitJoinSession,
    };
}
