"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users, LogOut, X, Trash2, Maximize } from "lucide-react";
import {
  endSession,
  inviteUsersToSession,
  leaveSession,
  removeParticipant,
  saveSessionData,
} from "@/app/actions/session-actions";
import type {
  CanvasElement,
  Friend,
  SessionParticipant,
  SessionUser,
  ToolType,
} from "@/lib/whiteboard/types";
import { stringToColor, getCommonBounds } from "@/lib/whiteboard/utils";
import { useCanvas } from "@/hooks/useCanvas";
import { useDrawingTools } from "@/hooks/useDrawingTools";
import { useWhiteboardSocket } from "@/hooks/useWhiteboardSocket";
import Toolbar from "@/components/whiteboard/Toolbar";
import InviteModal from "@/components/whiteboard/InviteModal";
import ParticipantsList from "@/components/whiteboard/ParticipantsList";
import TextEditor from "@/components/whiteboard/TextEditor";

type FriendListItem = { friend: Friend };

function normalizeFriends(
  friends: Friend[] | FriendListItem[] | undefined,
): Friend[] {
  if (!friends || friends.length === 0) return [];
  const first = friends[0] as Friend | FriendListItem;
  if (typeof (first as FriendListItem).friend === "object") {
    return (friends as FriendListItem[]).map((f) => f.friend);
  }
  return friends as Friend[];
}

function normalizeParticipants(
  participants: SessionParticipant[] | SessionUser[] | undefined,
): SessionParticipant[] {
  if (!participants || participants.length === 0) return [];
  const first = participants[0] as SessionParticipant | SessionUser;
  if (typeof (first as SessionParticipant).userId === "string") {
    return participants as SessionParticipant[];
  }
  return (participants as SessionUser[]).map((u) => ({
    id: u.id,
    userId: u.id,
    status: "ACCEPTED",
    user: u,
  }));
}

export default function Whiteboard({
  user,
  sessionId,
  sessionName,
  initialParticipants,
  creatorId,
  friends,
  viewOnly = false,
  initialElements = [],
}: {
  user?: SessionUser;
  sessionId?: string;
  sessionName?: string;
  initialParticipants?: SessionParticipant[] | SessionUser[];
  creatorId?: string;
  friends?: Friend[] | FriendListItem[];
  viewOnly?: boolean;
  initialElements?: CanvasElement[];
}) {
  const router = useRouter();

  const currentUser: SessionUser | undefined = useMemo(() => {
    if (!user) return undefined;
    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
    };
  }, [user]);

  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.name ?? currentUser?.email ?? "User";
  const currentUserColor = useMemo(
    () => stringToColor(currentUserId ?? "guest"),
    [currentUserId],
  );

  const {
    canvasRef,
    elements,
    setElements,
    viewport,
    setViewport,
    screenToWorldCoords,
    worldToScreenCoords,
    render,
  } = useCanvas({ initialElements });

  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportAnimationRef = useRef<number | null>(null);

  const initialParticipantsNormalized = useMemo(() => {
    const normalized = normalizeParticipants(initialParticipants);
    if (!creatorId) return normalized;
    return normalized.filter((p) => p.userId !== creatorId);
  }, [creatorId, initialParticipants]);

  const [participants, setParticipants] = useState<SessionParticipant[]>(
    initialParticipantsNormalized,
  );
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const handleSessionEnded = () => {
    router.push("/");
  };

  const socket = useWhiteboardSocket({
    sessionId,
    user: currentUser,
    onElementsInit: (serverElements) => {
      setElements(serverElements);
    },
    onElementAdded: (element) => {
      setElements((prev) => {
        if (prev.some((el) => el.id === element.id)) return prev;
        return [...prev, element];
      });
    },
    onElementUpdated: (element) => {
      setElements((prev) => {
        const has = prev.some((el) => el.id === element.id);
        if (!has) return [...prev, element];
        return prev.map((el) => (el.id === element.id ? element : el));
      });
    },
    onElementDeleted: (elementId) => {
      setElements((prev) => prev.filter((el) => el.id !== elementId));
    },
    onElementsUpdate: (serverElements) => {
      setElements(serverElements);
    },
    onCursorUpdate: () => {},
    onCursorRemove: () => {},
    onUserJoined: (joinedUser) => {
      setParticipants((prev) => {
        if (creatorId && joinedUser.id === creatorId) return prev;
        if (prev.some((p) => p.userId === joinedUser.id)) return prev;
        return [
          ...prev,
          {
            id: joinedUser.id,
            userId: joinedUser.id,
            status: "ACCEPTED",
            user: joinedUser,
          },
        ];
      });
    },
    onUserLeft: (leftUserId) => {
      setActiveUserIds((prev) => {
        const next = new Set(prev);
        next.delete(leftUserId);
        return next;
      });
    },
    onUserKicked: (kickedUserId) => {
      if (currentUserId && kickedUserId === currentUserId) {
        window.location.href = "/";
        return;
      }
      setParticipants((prev) => prev.filter((p) => p.userId !== kickedUserId));
    },
    onUserStatusChange: (userId, status) => {
      setActiveUserIds((prev) => {
        const next = new Set(prev);
        if (status === "online") next.add(userId);
        else next.delete(userId);
        return next;
      });
    },
    onActiveUsers: (userIds) => {
      setActiveUserIds(new Set(userIds));
    },
    onSessionEnded: handleSessionEnded,
  });

  const {
    cursors,
    emitCursorMove,
    emitAddElement,
    emitUpdateElement,
    emitDeleteElement,
    emitSessionEnded,
    emitKickUser,
    emitUserLeft,
    emitSendInvite,
    emitClearCanvas,
  } = socket;

  const {
    tool,
    setTool,
    settings,
    setSettings,
    currentElement,
    selectedElement,
    textEditPosition,
    textEditValue,
    setTextEditValue,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTextComplete,
    handleTextCancel,
    handleDeleteSelected,
  } = useDrawingTools({
    userId: currentUserId ?? "guest",
    userName: currentUserName,
    elements,
    setElements,
    screenToWorldCoords,
    worldToScreenCoords,
    onElementAdd: (element) => {
      if (viewOnly) return;
      emitAddElement(element);
    },
    onElementUpdate: (element) => {
      if (viewOnly) return;
      emitUpdateElement(element);
    },
    onElementDelete: (elementId) => {
      if (viewOnly) return;
      emitDeleteElement(elementId);
    },
    ctx,
    scale: viewport.scale,
  });

  const normalizedFriends = useMemo(() => normalizeFriends(friends), [friends]);

  const canvasCursor = useMemo(() => {
    switch (tool) {
      case "pan":
        return isPanning ? "grabbing" : "grab";
      case "select":
        return "default";
      case "text":
      case "sticky":
        return "text";
      case "eraser":
        return "cell";
      case "pencil":
      case "rectangle":
      case "circle":
      case "triangle":
      case "diamond":
      case "arrow":
      case "line":
        return "crosshair";
      default:
        return "default";
    }
  }, [tool, isPanning]);

  useEffect(() => {
    if (viewOnly) {
      setTool("select");
      return;
    }
    setTool("pencil");
  }, [setTool, viewOnly]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      setCtx(ctx);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => ro.disconnect();
  }, [canvasRef]);

  useEffect(() => {
    return () => {
      if (viewportAnimationRef.current) {
        cancelAnimationFrame(viewportAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      render(cursors, currentElement);
    });
    return () => cancelAnimationFrame(raf);
  }, [render, cursors, currentElement, elements, viewport]);

  useEffect(() => {
    if (!sessionId || viewOnly) return;
    const timeout = window.setTimeout(async () => {
      try {
        await saveSessionData(sessionId, elements);
      } catch {
        return;
      }
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [elements, sessionId, viewOnly]);

  useEffect(() => {
    if (!selectedElement) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (viewOnly) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected, selectedElement, viewOnly]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (viewportAnimationRef.current) {
        cancelAnimationFrame(viewportAnimationRef.current);
        viewportAnimationRef.current = null;
      }

      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setViewport((prev) => {
        const nextScale = Math.min(
          1e50,
          Math.max(1e-50, prev.scale * zoomFactor),
        );
        const scaleRatio = nextScale / prev.scale;
        const nextOffsetX = mouseX - (mouseX - prev.offsetX) * scaleRatio;
        const nextOffsetY = mouseY - (mouseY - prev.offsetY) * scaleRatio;
        return {
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
          scale: nextScale,
        };
      });
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, setViewport]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewportAnimationRef.current) {
      cancelAnimationFrame(viewportAnimationRef.current);
      viewportAnimationRef.current = null;
    }

    if (tool === "pan") {
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: viewport.offsetX,
        offsetY: viewport.offsetY,
      };
      setIsPanning(true);
      return;
    }
    handleMouseDown(e);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPoint = screenToWorldCoords(e.clientX, e.clientY);
    if (currentUserId) {
      emitCursorMove(
        worldPoint.x,
        worldPoint.y,
        currentUserName,
        currentUserColor,
      );
    }

    if (isPanning && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setViewport((prev) => ({
        ...prev,
        offsetX: panStart.current!.offsetX + dx,
        offsetY: panStart.current!.offsetY + dy,
      }));
      return;
    }

    handleMouseMove(e);
  };

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
      return;
    }
    handleMouseUp();
  };

  const inviteExistingUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (creatorId) ids.add(creatorId);
    participants.forEach((p) => ids.add(p.userId));
    return Array.from(ids);
  }, [creatorId, participants]);

  const handleInvite = async (friendIds: string[]) => {
    if (!sessionId || !creatorId || !sessionName || !currentUser) return;
    const result = await inviteUsersToSession(sessionId, friendIds);
    if (!result.success || !result.invitedUserIds) return;
    emitSendInvite(result.invitedUserIds, {
      id: sessionId,
      name: sessionName,
      creator: currentUser,
    });
  };

  const handleEnd = async () => {
    if (!sessionId) return;
    const ok = confirm("End this session for everyone?");
    if (!ok) return;
    await saveSessionData(sessionId, elements);
    const result = await endSession(sessionId);
    if (result.success) {
      emitSessionEnded(sessionId);
      router.push("/");
    }
  };

  const handleKick = async (userIdToRemove: string) => {
    if (!sessionId) return;
    const ok = confirm("Remove this participant from the session?");
    if (!ok) return;
    const result = await removeParticipant(sessionId, userIdToRemove);
    if (result.success) {
      emitKickUser(userIdToRemove, sessionId);
      setParticipants((prev) =>
        prev.filter((p) => p.userId !== userIdToRemove),
      );
    }
  };

  const handleLeave = async () => {
    if (!sessionId) return;
    const ok = confirm("Leave this session?");
    if (!ok) return;
    const result = await leaveSession(sessionId);
    if (result.success && currentUserId) {
      emitUserLeft(currentUserId, sessionId);
      router.push("/");
    }
  };

  const handleClearCanvas = () => {
    if (viewOnly) return;
    const ok = confirm(
      "Are you sure you want to clear the canvas? This will remove all drawing for everyone.",
    );
    if (ok) {
      emitClearCanvas();
    }
  };

  const handleResetView = () => {
    if (elements.length === 0) {
      setViewport({ offsetX: 0, offsetY: 0, scale: 1 });
      return;
    }

    const bounds = getCommonBounds(elements, ctx);
    if (!bounds) return;

    const { minX, minY, maxX, maxY } = bounds;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Add some padding
    const padding = 50;

    if (contentWidth === 0 || contentHeight === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = (containerWidth - padding * 2) / contentWidth;
    const scaleY = (containerHeight - padding * 2) / contentHeight;

    // Fit to screen
    let newScale = Math.min(scaleX, scaleY);

    // Clamp scale to reasonable limits (allow very small scale for large content)
    newScale = Math.min(Math.max(newScale, 1e-50), 1e50);

    // Center the content
    const worldCenterX = minX + contentWidth / 2;
    const worldCenterY = minY + contentHeight / 2;

    const screenCenterX = containerWidth / 2;
    const screenCenterY = containerHeight / 2;

    const newOffsetX = screenCenterX - worldCenterX * newScale;
    const newOffsetY = screenCenterY - worldCenterY * newScale;

    const targetViewport = {
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    };

    if (viewportAnimationRef.current) {
      cancelAnimationFrame(viewportAnimationRef.current);
    }

    const startViewport = viewport;
    const duration = 500;
    const startTime = performance.now();

    const easeOutExpo = (x: number): number => {
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeOutExpo(progress);

      setViewport({
        offsetX:
          startViewport.offsetX +
          (targetViewport.offsetX - startViewport.offsetX) * ease,
        offsetY:
          startViewport.offsetY +
          (targetViewport.offsetY - startViewport.offsetY) * ease,
        scale:
          startViewport.scale +
          (targetViewport.scale - startViewport.scale) * ease,
      });

      if (progress < 1) {
        viewportAnimationRef.current = requestAnimationFrame(animate);
      } else {
        viewportAnimationRef.current = null;
      }
    };

    viewportAnimationRef.current = requestAnimationFrame(animate);
  };

  const isCreator =
    !!creatorId && !!currentUserId && creatorId === currentUserId;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="bg-white rounded-2xl shadow-xl border border-green-200 overflow-hidden mb-4">
        <div className="p-4 border-b border-green-100 bg-green-50 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-green-700">Session</div>
            <div className="text-lg font-bold text-green-900 truncate">
              {sessionName ?? "Whiteboard"}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => router.push("/")}
              className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium transition-colors"
            >
              Back
            </button>

            <button
              onClick={() => setIsParticipantsOpen((v) => !v)}
              className="px-3 py-2 rounded-lg bg-white border border-green-200 hover:bg-green-50 text-green-800 text-sm font-medium transition-colors flex items-center gap-2"
              title="Participants"
            >
              <Users size={16} />
              {participants.filter((p) => p.status === "ACCEPTED").length +
                (creatorId ? 1 : 0)}
            </button>

            <button
              onClick={handleResetView}
              className="px-3 py-2 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-sm font-medium transition-colors flex items-center gap-2"
              title="Reset View / Fit Content"
            >
              <Maximize size={16} />
              Fit
            </button>

            {!viewOnly && (
              <button
                onClick={handleClearCanvas}
                className="px-3 py-2 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-medium transition-colors flex items-center gap-2"
                title="Clear Canvas"
              >
                <Trash2 size={16} />
                Clear
              </button>
            )}

            {isCreator && !viewOnly && (
              <button
                onClick={() => setIsInviteOpen(true)}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <UserPlus size={16} />
                Invite
              </button>
            )}

            {!isCreator && !viewOnly && (
              <button
                onClick={handleLeave}
                className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <LogOut size={16} />
                Leave
              </button>
            )}

            {isCreator && !viewOnly && (
              <button
                onClick={handleEnd}
                className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <X size={16} />
                End
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 bg-white rounded-2xl shadow-xl border border-green-200 overflow-hidden relative overscroll-contain"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none w-full h-full"
          style={{ cursor: canvasCursor }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />

        <Toolbar
          tool={tool}
          onToolChange={(t: ToolType) => setTool(t)}
          color={settings.color}
          onColorChange={(c) => setSettings((prev) => ({ ...prev, color: c }))}
          size={settings.size}
          onSizeChange={(s) => setSettings((prev) => ({ ...prev, size: s }))}
          viewOnly={viewOnly}
        />

        {textEditPosition && (
          <TextEditor
            position={textEditPosition}
            value={textEditValue}
            onChange={setTextEditValue}
            onComplete={handleTextComplete}
            onCancel={handleTextCancel}
            toolType={tool}
            viewport={viewport}
          />
        )}

        {isParticipantsOpen && creatorId && currentUserId && (
          <ParticipantsList
            participants={participants}
            activeUserIds={activeUserIds}
            currentUserId={currentUserId}
            creatorId={creatorId}
            onKickUser={handleKick}
            onLeaveSession={handleLeave}
            viewOnly={viewOnly}
          />
        )}

        {isInviteOpen && isCreator && (
          <InviteModal
            friends={normalizedFriends}
            existingParticipantIds={inviteExistingUserIds}
            onInvite={handleInvite}
            onClose={() => setIsInviteOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
