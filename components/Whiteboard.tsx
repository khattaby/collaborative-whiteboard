"use client";

import React, { useRef, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  endSession,
  inviteUsersToSession,
  removeParticipant,
  leaveSession,
  saveSessionData,
} from "@/app/actions/session-actions";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Hand,
  Pencil,
  Square,
  Circle,
  Triangle,
  Diamond,
  ArrowRight,
  Minus,
  Type,
  StickyNote,
  Eraser,
  X,
  Check,
  MousePointer2,
} from "lucide-react";

type Point = { x: number; y: number };

type ElementType =
  | "pencil"
  | "rectangle"
  | "circle"
  | "triangle"
  | "diamond"
  | "arrow"
  | "line"
  | "text"
  | "sticky";
type ToolType = ElementType | "hand" | "eraser" | "select";

interface BaseElement {
  id: string;
  type: ElementType;
  userId: string;
  authorName?: string;
  color: string;
}

interface PencilElement extends BaseElement {
  type: "pencil";
  points: Point[];
  size: number;
}

interface ShapeElement extends BaseElement {
  type: "rectangle" | "circle" | "triangle" | "diamond" | "arrow" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  size: number; // border width
  fill?: string;
}

interface TextElement extends BaseElement {
  type: "text" | "sticky";
  x: number;
  y: number;
  content: string;
  fontSize: number;
  width?: number;
  height?: number;
}

type CanvasElement = PencilElement | ShapeElement | TextElement;

type Cursor = {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
};

// Helper to generate consistent color from string
function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 70 + (Math.abs(hash >> 8) % 30);
  const l = 35 + (Math.abs(hash >> 16) % 20);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const l2 = Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
  if (l2 === 0)
    return Math.sqrt(Math.pow(p.x - a.x, 2) + Math.pow(p.y - a.y, 2));
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return Math.sqrt(
    Math.pow(p.x - projection.x, 2) + Math.pow(p.y - projection.y, 2)
  );
}

function calculateStickyHeight(
  ctx: CanvasRenderingContext2D,
  sticky: TextElement
): number {
  const stickyWidth = sticky.width || 200;
  let stickyHeight = sticky.height || 200;

  ctx.font = `${sticky.fontSize}px sans-serif`;
  ctx.textBaseline = "top";

  const paragraphs = sticky.content.split("\n");
  let lineY = sticky.y + 10;
  const lineHeight = sticky.fontSize * 1.2;
  const maxWidth = stickyWidth - 20;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lineY += lineHeight;
      continue;
    }

    const words = paragraph.split(" ");
    let line = "";

    for (let n = 0; n < words.length; n++) {
      const word = words[n];
      const wordWidth = ctx.measureText(word).width;

      if (wordWidth > maxWidth) {
        if (line) {
          lineY += lineHeight;
          line = "";
        }
        let currentPart = "";
        for (let i = 0; i < word.length; i++) {
          const char = word[i];
          const testPart = currentPart + char;
          if (ctx.measureText(testPart).width > maxWidth) {
            lineY += lineHeight;
            currentPart = char;
          } else {
            currentPart = testPart;
          }
        }
        line = currentPart;
      } else {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          lineY += lineHeight;
          line = word;
        } else {
          line = testLine;
        }
      }
    }
    if (line) {
      lineY += lineHeight;
    }
  }

  const contentBottom = lineY + 10;
  const requiredHeight = contentBottom - sticky.y;
  return Math.max(stickyHeight, requiredHeight);
}

function getElementAtPosition(
  x: number,
  y: number,
  elements: CanvasElement[],
  ctx?: CanvasRenderingContext2D | null
): CanvasElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];

    switch (element.type) {
      case "pencil":
        const pencil = element as PencilElement;
        for (let j = 0; j < pencil.points.length - 1; j++) {
          const p1 = pencil.points[j];
          const p2 = pencil.points[j + 1];
          if (distanceToSegment({ x, y }, p1, p2) < pencil.size + 5) {
            return element;
          }
        }
        break;

      case "rectangle":
      case "triangle":
      case "diamond":
        const rect = element as ShapeElement;
        const rx = rect.width < 0 ? rect.x + rect.width : rect.x;
        const ry = rect.height < 0 ? rect.y + rect.height : rect.y;
        const rw = Math.abs(rect.width);
        const rh = Math.abs(rect.height);
        if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
          return element;
        }
        break;

      case "line":
      case "arrow":
        const line = element as ShapeElement;
        const p1 = { x: line.x, y: line.y };
        const p2 = { x: line.x + line.width, y: line.y + line.height };
        if (distanceToSegment({ x, y }, p1, p2) < line.size + 5) {
          return element;
        }
        break;

      case "circle":
        const circle = element as ShapeElement;
        const cx = circle.x + circle.width / 2;
        const cy = circle.y + circle.height / 2;
        const rx_c = Math.abs(circle.width) / 2;
        const ry_c = Math.abs(circle.height) / 2;
        if (
          Math.pow(x - cx, 2) / Math.pow(rx_c, 2) +
            Math.pow(y - cy, 2) / Math.pow(ry_c, 2) <=
          1
        ) {
          return element;
        }
        break;

      case "text":
        const text = element as TextElement;
        const w = text.width || text.content.length * text.fontSize * 0.6;
        const h = text.height || text.fontSize * 1.5;
        if (x >= text.x && x <= text.x + w && y >= text.y && y <= text.y + h) {
          return element;
        }
        break;

      case "sticky":
        const sticky = element as TextElement;
        const sw = sticky.width || 200;
        let sh = sticky.height || 200;

        if (ctx) {
          sh = calculateStickyHeight(ctx, sticky);
        }

        if (
          x >= sticky.x &&
          x <= sticky.x + sw &&
          y >= sticky.y &&
          y <= sticky.y + sh
        ) {
          return element;
        }
        break;
    }
  }
  return null;
}

export default function Whiteboard({
  user,
  sessionId,
  sessionName,
  initialParticipants,
  creatorId,
  friends = [],
  viewOnly = false,
  initialElements = [],
}: {
  user?: any;
  sessionId?: string;
  sessionName?: string;
  initialParticipants?: any[];
  creatorId?: string;
  friends?: any[];
  viewOnly?: boolean;
  initialElements?: any[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [friendsList, setFriendsList] = useState(friends);

  // Sync friends list when prop changes (e.g. after router.refresh())
  useEffect(() => {
    setFriendsList(friends || []);
  }, [friends]);

  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  // Persistent User ID for guests
  const guestIdRef = useRef<string>(
    "guest-" + Math.random().toString(36).substr(2, 9)
  );
  const userId = user?.email || guestIdRef.current;

  // Memoize user color
  const userColor = React.useMemo(() => stringToColor(userId), [userId]);

  // Camera state (Infinite Canvas)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });

  // View-only mode state
  const [isViewOnly, setIsViewOnly] = useState(viewOnly);

  // Data state
  const [elements, setElements] = useState<CanvasElement[]>(
    (initialElements as CanvasElement[]) || []
  );
  // Temporary element being drawn
  const [currentElement, setCurrentElement] = useState<CanvasElement | null>(
    null
  );
  // Text editing state
  const [editingElement, setEditingElement] = useState<TextElement | null>(
    null
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Collaboration state
  const [remoteCursors, setRemoteCursors] = useState<Record<string, Cursor>>(
    {}
  );
  const [participants, setParticipants] = useState(initialParticipants || []);
  const socketRef = useRef<Socket | null>(null);

  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [tool, setTool] = useState<ToolType>(isViewOnly ? "hand" : "pencil");
  const lastMouse = useRef<{ x: number; y: number } | null>(null);

  // Selection state
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null
  );
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const hoverMouseRef = useRef<{ x: number; y: number } | null>(null);

  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [draggingElementSnapshot, setDraggingElementSnapshot] =
    useState<CanvasElement | null>(null);

  const [showShapeMenu, setShowShapeMenu] = useState(false);

  // Track editing state to handle race conditions between blur and mousedown
  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = !!editingElement;

    if (editingElement && textareaRef.current) {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }, 10);
    }
  }, [editingElement]);

  // Coordinate conversion
  const screenToWorld = (screenX: number, screenY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    const relativeX = screenX - rect.left;
    const relativeY = screenY - rect.top;

    return {
      x: relativeX / camera.zoom + camera.x,
      y: relativeY / camera.zoom + camera.y,
    };
  };

  const worldToScreen = (worldX: number, worldY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: (worldX - camera.x) * camera.zoom + rect.left,
      y: (worldY - camera.y) * camera.zoom + rect.top,
    };
  };

  // Setup Socket Connection
  useEffect(() => {
    const url = `http://${window.location.hostname}:3001`;
    const socket = io(url, {
      query: {
        sessionId,
        userId: user?.id || userId,
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to socket server", socket.id);
      if (user && sessionId) {
        socket.emit("join-session", { user });
      }
    });

    socket.on("user-joined", (newUser: any) => {
      setParticipants((prev) => {
        if (prev.some((p) => p.id === newUser.id)) return prev;
        return [...prev, newUser];
      });
    });

    socket.on("init-elements", (serverElements: CanvasElement[]) => {
      if (!viewOnly) {
        setElements(serverElements);
      }
    });

    socket.on("element-added", (element: CanvasElement) => {
      if (!viewOnly) {
        setElements((prev) => [...prev, element]);
      }
    });

    socket.on("elements-update", (serverElements: CanvasElement[]) => {
      if (!viewOnly) {
        setElements(serverElements);
      }
    });

    socket.on("element-deleted", (elementId: string) => {
      if (!viewOnly) {
        setElements((prev) => prev.filter((el) => el.id !== elementId));
      }
    });

    socket.on("element-updated", (element: CanvasElement) => {
      if (!viewOnly) {
        setElements((prev) =>
          prev.map((el) => (el.id === element.id ? element : el))
        );
      }
    });

    socket.on("cursor-update", (data: Cursor) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [data.id]: data,
      }));
    });

    socket.on("cursor-remove", (id: string) => {
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on("session-ended", () => {
      alert("The session has been ended by the creator.");
      router.push("/");
    });

    socket.on("user-kicked", ({ userId: kickedUserId }) => {
      if (user && user.id === kickedUserId) {
        alert("You have been removed from the session.");
        window.location.href = "/";
      } else {
        setParticipants((prev) => prev.filter((p) => p.id !== kickedUserId));
      }
    });

    socket.on("user-left", ({ userId: leftUserId }) => {
      setParticipants((prev) => prev.filter((p) => p.id !== leftUserId));
    });

    socket.on("user-status-change", ({ userId, status }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, status } : p))
      );
    });

    socket.on("active-users", (activeUserIds: string[]) => {
      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          status: activeUserIds.includes(p.id) ? "online" : "offline",
        }))
      );
    });

    socket.on("friend-request-accepted", (data: any) => {
      const newFriend = data?.friend || data?.friendship?.friend;
      if (newFriend) {
        setFriendsList((prev) => {
          if (prev.some((f: any) => f.friend.id === newFriend.id)) return prev;
          return [...prev, { friend: newFriend }];
        });
      }
    });

    socket.on(
      "friend-removed",
      ({ removedByUserId }: { removedByUserId: string }) => {
        setFriendsList((prev) =>
          prev.filter((f: any) => f.friend.id !== removedByUserId)
        );
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [sessionId, user, router]);

  const handleKickUser = async (userIdToKick: string) => {
    if (!sessionId) return;
    if (!confirm("Are you sure you want to remove this user from the session?"))
      return;

    const result = await removeParticipant(sessionId, userIdToKick);
    if (result.success) {
      socketRef.current?.emit("kick-user", { userId: userIdToKick, sessionId });
      setParticipants((prev) => prev.filter((p) => p.id !== userIdToKick));
    } else {
      alert("Failed to remove user: " + result.error);
    }
  };

  const handleEndSession = async () => {
    if (
      !confirm(
        "Are you sure you want to end this session? All participants will be disconnected."
      )
    )
      return;

    if (sessionId) {
      // Save session data before ending
      const saveResult = await saveSessionData(sessionId, elements);
      if (saveResult?.error) {
        alert("Failed to save session data: " + saveResult.error);
        return;
      }

      const result = await endSession(sessionId);
      if (result.success) {
        socketRef.current?.emit("session-ended", { sessionId });
        router.push("/");
      } else {
        alert("Failed to end session: " + result.error);
      }
    }
  };

  const handleLeaveSession = async () => {
    if (!confirm("Are you sure you want to leave this session?")) return;

    if (sessionId) {
      const result = await leaveSession(sessionId);
      if (result.success) {
        socketRef.current?.emit("user-left", { userId: user?.id, sessionId });
        router.push("/");
      } else {
        alert("Failed to leave session: " + result.error);
      }
    }
  };

  const handleInviteUsers = async () => {
    if (!sessionId || selectedFriends.length === 0) return;
    setInviting(true);

    const result = await inviteUsersToSession(sessionId, selectedFriends);

    if (result.success) {
      const socket = socketRef.current;
      if (socket) {
        socket.emit("send-invite", {
          toUserIds: result.invitedUserIds,
          session: {
            id: sessionId,
            name: result.sessionName,
            creator: {
              name: result.creatorName,
              image: result.creatorImage,
              email: result.creatorEmail,
            },
          },
        });
      }
      setShowInviteModal(false);
      setSelectedFriends([]);
      alert("Invitations sent successfully!");
    } else {
      alert("Failed to send invitations: " + result.error);
    }
    setInviting(false);
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const { clientWidth, clientHeight } = containerRef.current;

        canvasRef.current.width = clientWidth * dpr;
        canvasRef.current.height = clientHeight * dpr;
        canvasRef.current.style.width = `${clientWidth}px`;
        canvasRef.current.style.height = `${clientHeight}px`;
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Wheel Handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);

      setCamera((prevCamera) => {
        const newZoom = prevCamera.zoom * zoomFactor;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = mouseX / prevCamera.zoom + prevCamera.x;
        const worldY = mouseY / prevCamera.zoom + prevCamera.y;

        return {
          zoom: newZoom,
          x: worldX - mouseX / newZoom,
          y: worldY - mouseY / newZoom,
        };
      });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  const colors = [
    "#000000", // Black
    "#ef4444", // Red
    "#22c55e", // Green
    "#3b82f6", // Blue
    "#eab308", // Yellow
    "#a855f7", // Purple
    "#ec4899", // Pink
    "#f97316", // Orange
  ];

  // Helper to draw an element
  const drawElement = (
    ctx: CanvasRenderingContext2D,
    element: CanvasElement
  ) => {
    ctx.strokeStyle = element.color;
    ctx.fillStyle = element.color;

    switch (element.type) {
      case "pencil":
        const pencil = element as PencilElement;
        if (pencil.points.length < 1) return;
        ctx.beginPath();
        ctx.lineWidth = pencil.size;
        ctx.moveTo(pencil.points[0].x, pencil.points[0].y);
        for (let i = 1; i < pencil.points.length; i++) {
          ctx.lineTo(pencil.points[i].x, pencil.points[i].y);
        }
        ctx.stroke();
        break;

      case "rectangle":
        const rect = element as ShapeElement;
        ctx.lineWidth = rect.size;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        break;

      case "circle":
        const circle = element as ShapeElement;
        ctx.lineWidth = circle.size;
        ctx.beginPath();
        // Calculate radius from width/height (ellipses are harder, assume circle for now based on max dim)
        const radiusX = Math.abs(circle.width) / 2;
        const radiusY = Math.abs(circle.height) / 2;
        ctx.ellipse(
          circle.x + circle.width / 2,
          circle.y + circle.height / 2,
          radiusX,
          radiusY,
          0,
          0,
          2 * Math.PI
        );
        ctx.stroke();
        break;

      case "triangle":
        const tri = element as ShapeElement;
        ctx.lineWidth = tri.size;
        ctx.beginPath();
        ctx.moveTo(tri.x + tri.width / 2, tri.y);
        ctx.lineTo(tri.x, tri.y + tri.height);
        ctx.lineTo(tri.x + tri.width, tri.y + tri.height);
        ctx.closePath();
        ctx.stroke();
        break;

      case "diamond":
        const dia = element as ShapeElement;
        ctx.lineWidth = dia.size;
        ctx.beginPath();
        ctx.moveTo(dia.x + dia.width / 2, dia.y);
        ctx.lineTo(dia.x + dia.width, dia.y + dia.height / 2);
        ctx.lineTo(dia.x + dia.width / 2, dia.y + dia.height);
        ctx.lineTo(dia.x, dia.y + dia.height / 2);
        ctx.closePath();
        ctx.stroke();
        break;

      case "line":
        const line = element as ShapeElement;
        ctx.lineWidth = line.size;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.x + line.width, line.y + line.height);
        ctx.stroke();
        break;

      case "arrow":
        const arrow = element as ShapeElement;
        ctx.lineWidth = arrow.size;
        const headLen = 20; // length of head in pixels
        const angle = Math.atan2(arrow.height, arrow.width);
        const endX = arrow.x + arrow.width;
        const endY = arrow.y + arrow.height;

        ctx.beginPath();
        ctx.moveTo(arrow.x, arrow.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle - Math.PI / 6),
          endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle + Math.PI / 6),
          endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
        break;

      case "text":
        const text = element as TextElement;
        ctx.font = `${text.fontSize}px sans-serif`;
        ctx.textBaseline = "top";
        {
          const lines = text.content.split("\n");
          const lineHeight = text.fontSize * 1.2;
          for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], text.x, text.y + i * lineHeight);
          }
        }
        break;

      case "sticky":
        const sticky = element as TextElement;
        const stickyWidth = sticky.width || 200;
        let stickyHeight = sticky.height || 200;

        // Setup font for measurement
        ctx.font = `${sticky.fontSize}px sans-serif`;
        ctx.textBaseline = "top";

        const paragraphs = sticky.content.split("\n");
        let lineY = sticky.y + 10;
        const lineHeight = sticky.fontSize * 1.2;
        const maxWidth = stickyWidth - 20;

        const linesToDraw: { text: string; y: number }[] = [];

        for (const paragraph of paragraphs) {
          // Handle empty lines
          if (paragraph.length === 0) {
            lineY += lineHeight;
            continue;
          }

          const words = paragraph.split(" ");
          let line = "";

          for (let n = 0; n < words.length; n++) {
            const word = words[n];
            const wordWidth = ctx.measureText(word).width;

            // Case 1: Word itself is longer than maxWidth (force break)
            if (wordWidth > maxWidth) {
              // If there's existing text on current line, flush it
              if (line) {
                linesToDraw.push({ text: line, y: lineY });
                lineY += lineHeight;
                line = "";
              }

              // Break the long word character by character
              let currentPart = "";
              for (let i = 0; i < word.length; i++) {
                const char = word[i];
                const testPart = currentPart + char;
                if (ctx.measureText(testPart).width > maxWidth) {
                  linesToDraw.push({ text: currentPart, y: lineY });
                  lineY += lineHeight;
                  currentPart = char;
                } else {
                  currentPart = testPart;
                }
              }
              // Continue with the remainder of the long word
              line = currentPart;
            }
            // Case 2: Standard word wrapping
            else {
              const testLine = line ? `${line} ${word}` : word;
              const metrics = ctx.measureText(testLine);

              if (metrics.width > maxWidth && line) {
                linesToDraw.push({ text: line, y: lineY });
                lineY += lineHeight;
                line = word;
              } else {
                line = testLine;
              }
            }
          }

          if (line) {
            linesToDraw.push({ text: line, y: lineY });
            lineY += lineHeight;
          }
        }

        // Calculate dynamic height
        const contentBottom = lineY + 10; // Add bottom padding
        const requiredHeight = contentBottom - sticky.y;
        stickyHeight = Math.max(stickyHeight, requiredHeight);

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(sticky.x + 4, sticky.y + 4, stickyWidth, stickyHeight);

        // Background
        ctx.fillStyle = "#fef3c7"; // Yellow-100
        ctx.fillRect(sticky.x, sticky.y, stickyWidth, stickyHeight);

        // Text
        ctx.fillStyle = "#000";
        // Font is already set

        for (const lineObj of linesToDraw) {
          ctx.fillText(lineObj.text, sticky.x + 10, lineObj.y);
        }
        break;
    }
  };

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw saved elements
      elements.forEach((el) => {
        try {
          drawElement(ctx, el);
        } catch (e) {
          console.error("Failed to draw element:", el, e);
        }
      });

      // Draw current element
      if (currentElement) {
        try {
          drawElement(ctx, currentElement);
        } catch (e) {
          console.error("Failed to draw current element:", currentElement, e);
        }
      }

      // Draw Remote Cursors
      ctx.restore();
      ctx.save();
      ctx.scale(dpr, dpr);

      Object.values(remoteCursors).forEach((cursor) => {
        const screenX = (cursor.x - camera.x) * camera.zoom;
        const screenY = (cursor.y - camera.y) * camera.zoom;

        ctx.fillStyle = cursor.color;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + 6, screenY + 18);
        ctx.lineTo(screenX + 10, screenY + 12);
        ctx.lineTo(screenX + 18, screenY + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = cursor.color;
        ctx.font = "12px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(cursor.name, screenX + 12, screenY + 14);
      });

      // Draw Author Tooltip on Hover
      if (hoverMouseRef.current && !currentElement && !isDraggingElement) {
        const mousePos = hoverMouseRef.current;
        const worldPos = screenToWorld(mousePos.x, mousePos.y);
        const hoveredElement = getElementAtPosition(
          worldPos.x,
          worldPos.y,
          elements,
          ctx
        );

        if (hoveredElement) {
          // Use stored author name or fallback to "Unknown"
          let displayName = hoveredElement.authorName || "";

          if (displayName && hoveredElement.userId === userId) {
            displayName = `${displayName} (You)`;
          }

          if (!displayName) {
            const participant = participants.find(
              (p) =>
                p.email === hoveredElement.userId ||
                p.id === hoveredElement.userId
            );
            if (participant) {
              displayName = participant.name;
            } else if (hoveredElement.userId === userId) {
              displayName = "You";
            } else if (hoveredElement.userId.startsWith("guest-")) {
              displayName = "Guest";
            } else {
              displayName = "Unknown";
            }
          }

          const rect = canvas.getBoundingClientRect();
          const screenX = mousePos.x - rect.left;
          const screenY = mousePos.y - rect.top;

          // Tooltip box
          ctx.font = "12px sans-serif";
          const padding = 6;
          const textWidth = ctx.measureText(displayName).width;
          const boxWidth = textWidth + padding * 2;
          const boxHeight = 24;
          const boxX = screenX + 15;
          const boxY = screenY + 15;

          // Shadow
          ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;

          // Background
          ctx.fillStyle = "white";
          ctx.strokeStyle = "#cbd5e1"; // slate-300
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
          ctx.fill();
          ctx.stroke();

          // Reset shadow
          ctx.shadowColor = "transparent";

          // Text
          ctx.fillStyle = "#334155"; // slate-700
          ctx.textBaseline = "middle";
          ctx.fillText(displayName, boxX + padding, boxY + boxHeight / 2);
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [camera, elements, currentElement, remoteCursors]);

  useEffect(() => {
    if (isViewOnly) {
      setTool("hand");
    }
  }, [isViewOnly]);

  // Mouse Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    // In view-only mode, only allow panning
    if (isViewOnly && tool !== "hand" && e.button !== 1) {
      return;
    }

    lastMouse.current = { x: e.clientX, y: e.clientY };

    // If editing text, prevent creating new elements unless clicking outside
    // But we need to allow interaction with the textarea itself (handled by stopPropagation on textarea)
    if (isEditingRef.current) {
      // Only blur if we're not clicking on the textarea itself
      if (e.target !== textareaRef.current) {
        textareaRef.current?.blur();
      }
      return;
    }

    if (e.button === 1 || tool === "hand") {
      setIsPanning(true);
      return;
    }

    if (isViewOnly) return;

    if (e.button === 0) {
      const point = screenToWorld(e.clientX, e.clientY);
      const ctx = canvasRef.current?.getContext("2d");

      if (tool === "select") {
        const clickedElement = getElementAtPosition(
          point.x,
          point.y,
          elements,
          ctx
        );
        if (clickedElement) {
          setSelectedElementId(clickedElement.id);
          setIsDraggingElement(true);
          setDragStartPos(point);
          setDraggingElementSnapshot(clickedElement);
        } else {
          setSelectedElementId(null);
        }
        return;
      }

      if (tool === "eraser") {
        const elementToDelete = getElementAtPosition(
          point.x,
          point.y,
          elements,
          ctx
        );
        if (elementToDelete) {
          setElements((prev) =>
            prev.filter((el) => el.id !== elementToDelete.id)
          );
          if (socketRef.current && !isViewOnly) {
            socketRef.current.emit("delete-element", elementToDelete.id);
          }
        }
        return;
      }

      const id = Math.random().toString(36).substr(2, 9);
      const authorName = user?.name || "Guest";

      if (tool === "pencil") {
        setCurrentElement({
          id,
          type: "pencil",
          points: [point],
          color: selectedColor,
          size: 3 / camera.zoom,
          userId,
          authorName,
        });
      } else if (
        tool === "rectangle" ||
        tool === "circle" ||
        tool === "triangle" ||
        tool === "diamond" ||
        tool === "arrow" ||
        tool === "line"
      ) {
        setCurrentElement({
          id,
          type: tool,
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          color: selectedColor,
          size: 3 / camera.zoom,
          userId,
          authorName,
        });
      }
    }
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (isViewOnly) return;
    if (tool !== "text" && tool !== "sticky") return;
    if (isEditingRef.current) return;
    if (e.button !== 0) return;

    const point = screenToWorld(e.clientX, e.clientY);
    const id = Math.random().toString(36).substr(2, 9);

    setEditingElement({
      id,
      type: tool,
      x: point.x,
      y: point.y,
      content: "",
      fontSize: 24 / camera.zoom,
      width: tool === "sticky" ? 200 / camera.zoom : undefined,
      height: tool === "sticky" ? 200 / camera.zoom : undefined,
      color: tool === "text" ? selectedColor : userColor,
      userId,
      authorName: user?.name || "Guest",
    });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (socketRef.current && !isViewOnly) {
      const worldPoint = screenToWorld(e.clientX, e.clientY);
      socketRef.current.emit("cursor-move", {
        x: worldPoint.x,
        y: worldPoint.y,
        name: user?.name || "Guest",
        color: userColor,
      });
    }

    // Update hover position for tooltip
    hoverMouseRef.current = { x: e.clientX, y: e.clientY };

    if (!lastMouse.current) return;

    if (
      tool === "select" &&
      isDraggingElement &&
      draggingElementSnapshot &&
      dragStartPos
    ) {
      const worldPoint = screenToWorld(e.clientX, e.clientY);
      const dx = worldPoint.x - dragStartPos.x;
      const dy = worldPoint.y - dragStartPos.y;

      const updatedElement = { ...draggingElementSnapshot };

      if (updatedElement.type === "pencil") {
        (updatedElement as PencilElement).points = (
          draggingElementSnapshot as PencilElement
        ).points.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      } else {
        // Shape or Text
        (updatedElement as any).x = (draggingElementSnapshot as any).x + dx;
        (updatedElement as any).y = (draggingElementSnapshot as any).y + dy;
      }

      setElements((prev) =>
        prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
      );

      if (socketRef.current && !isViewOnly) {
        socketRef.current.emit("update-element", updatedElement);
      }
      return;
    }

    if (isPanning) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      setCamera((prev) => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
    } else if (tool === "eraser" && e.buttons === 1) {
      // Eraser drag
      const point = screenToWorld(e.clientX, e.clientY);
      const elementToDelete = getElementAtPosition(point.x, point.y, elements);
      if (elementToDelete) {
        setElements((prev) =>
          prev.filter((el) => el.id !== elementToDelete.id)
        );
        if (socketRef.current) {
          socketRef.current.emit("delete-element", elementToDelete.id);
        }
      }
    } else if (currentElement) {
      const point = screenToWorld(e.clientX, e.clientY);

      if (currentElement.type === "pencil") {
        setCurrentElement((prev) =>
          prev
            ? { ...prev, points: [...(prev as PencilElement).points, point] }
            : null
        );
      } else if (
        currentElement.type === "rectangle" ||
        currentElement.type === "circle" ||
        currentElement.type === "triangle" ||
        currentElement.type === "diamond" ||
        currentElement.type === "arrow" ||
        currentElement.type === "line"
      ) {
        setCurrentElement((prev) => {
          if (!prev) return null;
          const startX = (prev as ShapeElement).x;
          const startY = (prev as ShapeElement).y;
          return {
            ...prev,
            width: point.x - startX,
            height: point.y - startY,
          };
        });
      }
    }

    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = () => {
    setIsPanning(false);

    if (tool === "select") {
      setIsDraggingElement(false);
      setDragStartPos(null);
      setDraggingElementSnapshot(null);
    }

    if (currentElement) {
      setElements((prev) => [...prev, currentElement]);
      if (socketRef.current && !isViewOnly) {
        socketRef.current.emit("add-element", currentElement);
      }
      setCurrentElement(null);
    }
    lastMouse.current = null;
  };

  const handleTextComplete = () => {
    if (!editingElement) return;

    // If content is empty, cancel
    if (!editingElement.content.trim()) {
      setEditingElement(null);
      return;
    }

    // Add to elements
    const newElement = { ...editingElement };
    setElements((prev) => [...prev, newElement]);

    if (socketRef.current && !isViewOnly) {
      socketRef.current.emit("add-element", newElement);
    }

    setEditingElement(null);
  };

  const handleUndo = () => {
    if (socketRef.current && !isViewOnly) {
      socketRef.current.emit("undo-element", userId);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable keyboard shortcuts in view-only mode
      if (isViewOnly) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [userId, isViewOnly]);

  const getCursor = () => {
    if (isPanning || tool === "hand") return "grab";
    if (tool === "select") return isDraggingElement ? "grabbing" : "default";
    if (tool === "text" || tool === "sticky") return "text";
    if (tool === "eraser") return "crosshair";
    return "default";
  };

  return (
    <div className="flex flex-col w-full h-full bg-green-50 rounded-xl overflow-hidden relative">
      {/* View-Only Banner */}
      {isViewOnly && (
        <div className="flex-none bg-gray-100 border-b border-gray-200 px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-700">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <span className="text-sm font-medium">Viewing Ended Session</span>
            <span className="text-xs text-gray-500">• Read Only Mode</span>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="flex-none p-4 flex items-center justify-between z-10">
        <h1 className="text-xl font-bold text-green-900 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-600"></span>
          {sessionName || "Infinite Canvas"}
          {isViewOnly && (
            <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full border border-gray-200">
              View Only
            </span>
          )}
        </h1>

        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Back
          </button>

          {/* Participants Avatars */}
          {participants && participants.length > 0 && (
            <div
              className="flex items-center -space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowParticipantsModal(true)}
              title="View Participants"
            >
              {participants.map((p) => (
                <div key={p.id} className="relative group">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className={`w-8 h-8 rounded-full border-2 border-white ${
                        p.status === "offline" ? "opacity-50 grayscale" : ""
                      }`}
                    />
                  ) : (
                    <div
                      className={`w-8 h-8 rounded-full bg-green-200 border-2 border-white flex items-center justify-center text-xs font-bold text-green-800 ${
                        p.status === "offline" ? "opacity-50 grayscale" : ""
                      }`}
                    >
                      {p.name?.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  {/* Status Indicator */}
                  <div
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      p.status === "offline" ? "bg-gray-400" : "bg-green-500"
                    }`}
                  />
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                    {p.name} {p.status === "offline" ? "(Away)" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {creatorId && user?.id === creatorId && !isViewOnly && (
            <>
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <UserPlus size={16} />
                Invite
              </button>
              <button
                onClick={handleEndSession}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                End Session
              </button>
            </>
          )}

          {creatorId && user?.id && user.id !== creatorId && !isViewOnly && (
            <button
              onClick={handleLeaveSession}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Leave Session
            </button>
          )}

          <div className="text-sm text-green-700">
            Auto-saved • {elements.length} elements
          </div>
        </div>
      </div>

      {/* Frame Container */}
      <div
        ref={containerRef}
        className="flex-1 bg-white m-4 mt-0 rounded-2xl shadow-xl border border-green-200 overflow-hidden relative"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none w-full h-full"
          style={{ cursor: getCursor() }}
          onMouseDown={onMouseDown}
          onClick={onCanvasClick}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Text/Sticky Input Overlay */}
        {editingElement && (
          <textarea
            key={editingElement.id}
            ref={textareaRef}
            autoFocus
            value={editingElement.content}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              setEditingElement({
                ...editingElement,
                content: e.target.value,
              })
            }
            onBlur={handleTextComplete}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingElement(null);
                return;
              }
              // Stop propagation to prevent whiteboard shortcuts (like Ctrl+Z)
              e.stopPropagation();

              if (editingElement.type === "text") {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              } else {
                if (
                  e.key === "Enter" &&
                  (e.ctrlKey || e.metaKey) &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }
            }}
            style={{
              position: "absolute",
              zIndex: 50,
              left: `${(editingElement.x - camera.x) * camera.zoom}px`,
              top: `${(editingElement.y - camera.y) * camera.zoom}px`,
              fontSize: `${editingElement.fontSize * camera.zoom}px`,
              color:
                editingElement.type === "sticky"
                  ? "#000"
                  : editingElement.color,
              background:
                editingElement.type === "sticky"
                  ? "#fef3c7"
                  : "rgba(255, 255, 255, 0.9)",
              border: "2px solid #22c55e",
              borderRadius: "4px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              padding: "8px",
              minWidth: "100px",
              width:
                editingElement.type === "sticky"
                  ? `${editingElement.width! * camera.zoom}px`
                  : "auto",
              height:
                editingElement.type === "sticky"
                  ? `${editingElement.height! * camera.zoom}px`
                  : "auto",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              overflowWrap: "break-word",
              wordBreak: "break-word",
            }}
            placeholder={
              editingElement.type === "sticky" ? "Note..." : "Type here..."
            }
          />
        )}

        {/* Floating Toolbar (Left Side) */}
        <div className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col gap-2 bg-white/90 backdrop-blur shadow-lg border border-green-200 rounded-xl p-2">
          <button
            onClick={() => !isViewOnly && setTool("select")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "select" && !isViewOnly
                ? "bg-green-100 text-green-700"
                : isViewOnly
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-600 hover:bg-green-50"
            }`}
            title={isViewOnly ? "View Only Mode" : "Cursor (Select/Move)"}
            disabled={isViewOnly}
          >
            <MousePointer2 size={20} />
          </button>
          <div className="h-px bg-gray-200 my-1" />
          <button
            onClick={() => setTool("hand")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "hand"
                ? "bg-green-100 text-green-700"
                : "text-gray-600 hover:bg-green-50"
            }`}
            title="Hand (Pan)"
          >
            <Hand size={20} />
          </button>
          <div className="h-px bg-gray-200 my-1" />
          <button
            onClick={() => !isViewOnly && setTool("pencil")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "pencil" && !isViewOnly
                ? "bg-green-100 text-green-700"
                : isViewOnly
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-600 hover:bg-green-50"
            }`}
            title={isViewOnly ? "View Only Mode" : "Pencil"}
            disabled={isViewOnly}
          >
            <Pencil size={20} />
          </button>
          <button
            onClick={() => !isViewOnly && setTool("text")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "text" && !isViewOnly
                ? "bg-green-100 text-green-700"
                : isViewOnly
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-600 hover:bg-green-50"
            }`}
            title={isViewOnly ? "View Only Mode" : "Text"}
            disabled={isViewOnly}
          >
            <Type size={20} />
          </button>
          <button
            onClick={() => !isViewOnly && setTool("sticky")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "sticky" && !isViewOnly
                ? "bg-green-100 text-green-700"
                : isViewOnly
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-600 hover:bg-green-50"
            }`}
            title={isViewOnly ? "View Only Mode" : "Sticky Note"}
            disabled={isViewOnly}
          >
            <StickyNote size={20} />
          </button>
          <div className="h-px bg-gray-200 my-1" />

          <div className="relative group">
            <button
              onClick={() => !isViewOnly && setShowShapeMenu(!showShapeMenu)}
              className={`p-2 rounded-lg transition-colors ${
                [
                  "rectangle",
                  "circle",
                  "triangle",
                  "diamond",
                  "arrow",
                  "line",
                ].includes(tool) && !isViewOnly
                  ? "bg-green-100 text-green-700"
                  : isViewOnly
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-gray-600 hover:bg-green-50"
              }`}
              title={isViewOnly ? "View Only Mode" : "Shapes"}
              disabled={isViewOnly}
            >
              <Square size={20} />
              <div className="absolute right-0 bottom-0 text-[8px] text-gray-500">
                ▼
              </div>
            </button>

            {/* Shape Menu Dropdown */}
            {showShapeMenu && (
              <div className="absolute left-full top-0 ml-2 bg-white/95 backdrop-blur shadow-xl border border-green-200 rounded-xl p-2 flex flex-col gap-2 min-w-[50px]">
                <button
                  onClick={() => {
                    setTool("rectangle");
                    setShowShapeMenu(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    tool === "rectangle"
                      ? "bg-green-100 text-green-700"
                      : "text-gray-600 hover:bg-green-50"
                  }`}
                  title="Rectangle"
                >
                  <Square size={20} />
                </button>
                <button
                  onClick={() => {
                    setTool("circle");
                    setShowShapeMenu(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    tool === "circle"
                      ? "bg-green-100 text-green-700"
                      : "text-gray-600 hover:bg-green-50"
                  }`}
                  title="Circle"
                >
                  <Circle size={20} />
                </button>
                <button
                  onClick={() => {
                    setTool("triangle");
                    setShowShapeMenu(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    tool === "triangle"
                      ? "bg-green-100 text-green-700"
                      : "text-gray-600 hover:bg-green-50"
                  }`}
                  title="Triangle"
                >
                  <Triangle size={20} />
                </button>
                <button
                  onClick={() => {
                    setTool("diamond");
                    setShowShapeMenu(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    tool === "diamond"
                      ? "bg-green-100 text-green-700"
                      : "text-gray-600 hover:bg-green-50"
                  }`}
                  title="Diamond"
                >
                  <Diamond size={20} />
                </button>
                <button
                  onClick={() => {
                    setTool("arrow");
                    setShowShapeMenu(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    tool === "arrow"
                      ? "bg-green-100 text-green-700"
                      : "text-gray-600 hover:bg-green-50"
                  }`}
                  title="Arrow"
                >
                  <ArrowRight size={20} />
                </button>
                <button
                  onClick={() => {
                    setTool("line");
                    setShowShapeMenu(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    tool === "line"
                      ? "bg-green-100 text-green-700"
                      : "text-gray-600 hover:bg-green-50"
                  }`}
                  title="Line"
                >
                  <Minus size={20} />
                </button>
              </div>
            )}
          </div>
          <div className="h-px bg-gray-200 my-1" />
          <button
            onClick={() => !isViewOnly && setTool("eraser")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "eraser" && !isViewOnly
                ? "bg-green-100 text-green-700"
                : isViewOnly
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-600 hover:bg-green-50"
            }`}
            title={isViewOnly ? "View Only Mode" : "Eraser"}
            disabled={isViewOnly}
          >
            <Eraser size={20} />
          </button>

          <div className="h-px bg-gray-200 my-1" />

          <div className="relative group">
            <button
              onClick={() =>
                !isViewOnly && setShowColorPicker(!showColorPicker)
              }
              className="p-2 rounded-lg transition-colors text-gray-600 hover:bg-green-50"
              title={isViewOnly ? "View Only Mode" : "Color Picker"}
              disabled={isViewOnly}
            >
              <div
                className="w-5 h-5 rounded-full border border-gray-300"
                style={{ backgroundColor: selectedColor }}
              />
            </button>

            {showColorPicker && (
              <div className="absolute left-full top-0 ml-2 bg-white/95 backdrop-blur shadow-xl border border-green-200 rounded-xl p-2 grid grid-cols-2 gap-2 min-w-[80px]">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setSelectedColor(color);
                      setShowColorPicker(false);
                      // Update selected element color if any
                      if (selectedElementId) {
                        const updatedElement = elements.find(
                          (el) => el.id === selectedElementId
                        );
                        if (updatedElement) {
                          const newElement = { ...updatedElement, color };
                          setElements((prev) =>
                            prev.map((el) =>
                              el.id === selectedElementId ? newElement : el
                            )
                          );
                          if (socketRef.current && !isViewOnly) {
                            socketRef.current.emit(
                              "update-element",
                              newElement
                            );
                          }
                        }
                      }
                    }}
                    className={`w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform ${
                      selectedColor === color
                        ? "ring-2 ring-offset-1 ring-green-500"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals remain mostly same but need to be included if I am overwriting */}
      {showInviteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg">Invite Friends</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 max-h-[300px] overflow-y-auto space-y-2">
              {friendsList.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No friends to invite. Add friends from your profile!
                </p>
              ) : (
                friendsList.map(({ friend }: any) => (
                  <div
                    key={friend.id}
                    onClick={() => toggleFriendSelection(friend.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                      selectedFriends.includes(friend.id)
                        ? "bg-green-50 border-green-500"
                        : "hover:bg-gray-50 border-transparent"
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                      {friend.image ? (
                        <img
                          src={friend.image}
                          alt={friend.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-500 font-bold">
                          {friend.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{friend.name}</p>
                      <p className="text-xs text-gray-500">{friend.email}</p>
                    </div>
                    {selectedFriends.includes(friend.id) && (
                      <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center text-white">
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={handleInviteUsers}
                disabled={selectedFriends.length === 0 || inviting}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {inviting ? "Sending..." : "Send Invites"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showParticipantsModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-black">Participants</h3>
              <button
                onClick={() => setShowParticipantsModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full text-black"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 max-h-[300px] overflow-y-auto space-y-2">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all"
                >
                  <div className="relative h-10 w-10 flex-shrink-0">
                    <div className="h-full w-full rounded-full bg-gray-200 overflow-hidden">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          className={`h-full w-full object-cover ${
                            p.status === "offline" ? "grayscale opacity-50" : ""
                          }`}
                        />
                      ) : (
                        <div
                          className={`h-full w-full flex items-center justify-center text-gray-700 font-bold ${
                            p.status === "offline" ? "grayscale opacity-50" : ""
                          }`}
                        >
                          {p.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Status Dot */}
                    <div
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                        p.status === "offline" ? "bg-gray-400" : "bg-green-500"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium flex items-center gap-2 text-black">
                      {p.name}
                      {p.status === "offline" && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                          Away
                        </span>
                      )}
                      {p.id === creatorId && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full">
                          Host
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-900">{p.email}</p>
                  </div>
                  {creatorId && user?.id === creatorId && p.id !== user.id && (
                    <button
                      onClick={() => handleKickUser(p.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
