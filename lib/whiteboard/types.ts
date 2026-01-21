// ============================================
// Canvas Element Types
// ============================================

export interface Point {
    x: number;
    y: number;
}

export type ElementType =
    | "pencil"
    | "rectangle"
    | "circle"
    | "triangle"
    | "diamond"
    | "arrow"
    | "line"
    | "text"
    | "sticky";

export type ToolType = ElementType | "pan" | "select" | "eraser";

export interface BaseElement {
    id: string;
    type: ElementType;
    userId: string;
    authorName?: string;
    color: string;
}

export interface PencilElement extends BaseElement {
    type: "pencil";
    points: Point[];
    size: number;
}

export interface ShapeElement extends BaseElement {
    type: "rectangle" | "circle" | "triangle" | "diamond" | "arrow" | "line";
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    fill?: string;
}

export interface TextElement extends BaseElement {
    type: "text" | "sticky";
    x: number;
    y: number;
    content: string;
    fontSize: number;
    width?: number;
    height?: number;
}

export type CanvasElement = PencilElement | ShapeElement | TextElement;

// ============================================
// Cursor Types
// ============================================

export interface Cursor {
    id: string;
    x: number;
    y: number;
    name: string;
    color: string;
}

// ============================================
// User & Session Types
// ============================================

export interface SessionUser {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
}

export interface SessionParticipant {
    id: string;
    userId: string;
    status: "PENDING" | "ACCEPTED" | "REJECTED";
    user: SessionUser;
}

export interface WhiteboardSessionData {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    creatorId: string;
    data?: CanvasElement[];
    creator: SessionUser;
    participants: SessionParticipant[];
}

export interface Friend {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
}

// ============================================
// Socket Event Types (Client -> Server)
// ============================================

export interface ClientToServerEvents {
    "join-session": (data: { user: SessionUser }) => void;
    "cursor-move": (data: { x: number; y: number; name: string; color: string }) => void;
    "add-element": (element: CanvasElement) => void;
    "update-element": (element: CanvasElement) => void;
    "delete-element": (elementId: string) => void;
    "undo-element": (userId: string) => void;
    "clear-user-elements": (userId: string) => void;
    "session-ended": (data: { sessionId: string }) => void;
    "kick-user": (data: { userId: string; sessionId: string }) => void;
    "user-left": (data: { userId: string; sessionId: string }) => void;
    "send-invite": (data: { toUserIds: string[]; session: { id: string; name: string; creator: SessionUser } }) => void;
    "send-friend-request": (data: { toUserId: string; request: unknown }) => void;
    "accept-friend-request": (data: { toUserId: string; friendship: unknown }) => void;
    "remove-friend": (data: { toUserId: string; removedByUserId: string }) => void;
}

// ============================================
// Socket Event Types (Server -> Client)
// ============================================

export interface ServerToClientEvents {
    "init-elements": (elements: CanvasElement[]) => void;
    "elements-update": (elements: CanvasElement[]) => void;
    "element-added": (element: CanvasElement) => void;
    "element-updated": (element: CanvasElement) => void;
    "element-deleted": (elementId: string) => void;
    "cursor-update": (cursor: Cursor) => void;
    "cursor-remove": (cursorId: string) => void;
    "user-joined": (user: SessionUser) => void;
    "user-left": (data: { userId: string }) => void;
    "user-kicked": (data: { userId: string }) => void;
    "user-status-change": (data: { userId: string; status: "online" | "offline" }) => void;
    "active-users": (userIds: string[]) => void;
    "session-ended": () => void;
    "new-invite": (data: { session: { id: string; name: string; creator: SessionUser } }) => void;
    "new-friend-request": (request: unknown) => void;
    "friend-request-accepted": (friendship: unknown) => void;
    "friend-removed": (data: { removedByUserId: string }) => void;
}

// ============================================
// Viewport/Transform Types
// ============================================

export interface ViewportState {
    offsetX: number;
    offsetY: number;
    scale: number;
}

// ============================================
// Tool State Types
// ============================================

export interface DrawingState {
    isDrawing: boolean;
    currentElement: CanvasElement | null;
    startPoint: Point | null;
}

export interface ToolSettings {
    color: string;
    size: number;
    fontSize: number;
}
