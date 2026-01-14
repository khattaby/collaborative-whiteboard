const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Parse allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000"];

const io = new Server(port, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(`Socket.io server running on port ${port}`);
console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);

// In-memory storage for the whiteboard state per session
// Key: sessionId, Value: CanvasElement[]
const sessions = {};
// Key: sessionId, Value: Set<userId>
const activeUsers = {};
// Key: sessionId, Value: Set<userId> - authorized participants
const sessionParticipants = {};

/**
 * Verify JWT token from socket handshake
 */
function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Rate limiting map: userId -> { count, resetTime }
 */
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 100; // max events per window

function checkRateLimit(userId) {
  const now = Date.now();
  const limit = rateLimits.get(userId);

  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

// Middleware for authentication (optional - doesn't block unauthenticated connections for backwards compatibility)
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  const userId = socket.handshake.query.userId;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      socket.user = decoded;
      socket.authenticated = true;
    } else {
      console.log(`Invalid token for socket ${socket.id}`);
      socket.authenticated = false;
    }
  } else {
    // Allow unauthenticated connections but mark them
    socket.authenticated = false;
  }

  // Store userId from query (for backwards compatibility)
  socket.userId = socket.user?.userId || userId;

  next();
});

io.on("connection", (socket) => {
  const sessionId = socket.handshake.query.sessionId;
  const userId = socket.userId;

  if (userId) {
    console.log(
      `User connected: ${socket.id} | userId: ${userId} | authenticated: ${socket.authenticated}`
    );
    socket.join(`user:${userId}`);
  }

  if (sessionId) {
    console.log(`User ${userId} joining session: ${sessionId}`);
    socket.join(sessionId);

    // Initialize session if not exists
    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    // Initialize participants tracking if not exists
    if (!sessionParticipants[sessionId]) {
      sessionParticipants[sessionId] = new Set();
    }

    // Add user to participants
    if (userId) {
      sessionParticipants[sessionId].add(userId);
    }

    // Send the current state of the board to the new user
    socket.emit("init-elements", sessions[sessionId]);
  }

  // Handle invitations
  socket.on("send-invite", ({ toUserIds, session }) => {
    if (!userId || !checkRateLimit(userId)) return;

    console.log(
      `Sending invites to: ${toUserIds.join(", ")} for session: ${session.name}`
    );
    toUserIds.forEach((id) => {
      io.to(`user:${id}`).emit("new-invite", { session });
    });
  });

  // Handle user joining (for updating participants list in real-time)
  socket.on("join-session", ({ user }) => {
    if (!sessionId || !user) return;
    if (!checkRateLimit(user.id)) return;

    console.log(`User ${user.name} joined session ${sessionId}`);

    if (!activeUsers[sessionId]) {
      activeUsers[sessionId] = new Set();
    }
    activeUsers[sessionId].add(user.id);

    // Add to authorized participants
    if (!sessionParticipants[sessionId]) {
      sessionParticipants[sessionId] = new Set();
    }
    sessionParticipants[sessionId].add(user.id);

    // Broadcast to others in the session
    socket.to(sessionId).emit("user-joined", user);
    // Also broadcast status change to online
    socket
      .to(sessionId)
      .emit("user-status-change", { userId: user.id, status: "online" });

    // Send active users list to the joiner
    socket.emit("active-users", Array.from(activeUsers[sessionId]));
  });

  socket.on("cursor-move", (data) => {
    if (!sessionId) return;
    if (!checkRateLimit(userId)) return;

    // Broadcast to all other clients in the room
    socket.to(sessionId).emit("cursor-update", {
      id: socket.id,
      ...data,
    });
  });

  socket.on("add-element", (element) => {
    if (!sessionId || !sessions[sessionId]) return;
    if (!checkRateLimit(userId)) return;

    // Validate element has required fields
    if (!element || !element.id || !element.type || !element.userId) {
      console.log("Invalid element received:", element);
      return;
    }

    sessions[sessionId].push(element);
    socket.to(sessionId).emit("element-added", element);
  });

  socket.on("update-element", (element) => {
    if (!sessionId || !sessions[sessionId]) return;
    if (!checkRateLimit(userId)) return;

    if (!element || !element.id) return;

    const index = sessions[sessionId].findIndex((el) => el.id === element.id);
    if (index !== -1) {
      sessions[sessionId][index] = element;
      socket.to(sessionId).emit("element-updated", element);
    }
  });

  socket.on("undo-element", (targetUserId) => {
    if (!sessionId || !sessions[sessionId]) return;
    if (!checkRateLimit(userId)) return;

    // Users can only undo their own elements
    if (targetUserId !== userId) {
      console.log(`User ${userId} tried to undo elements of ${targetUserId}`);
      return;
    }

    const sessionElements = sessions[sessionId];
    let index = -1;
    for (let i = sessionElements.length - 1; i >= 0; i--) {
      if (sessionElements[i].userId === targetUserId) {
        index = i;
        break;
      }
    }

    if (index !== -1) {
      sessionElements.splice(index, 1);
      io.to(sessionId).emit("elements-update", sessionElements);
    }
  });

  socket.on("delete-element", (elementId) => {
    if (!sessionId || !sessions[sessionId]) return;
    if (!checkRateLimit(userId)) return;

    const element = sessions[sessionId].find((el) => el.id === elementId);

    // Only allow deletion of own elements (or by session creator - handled client-side)
    if (element && element.userId !== userId) {
      console.log(`User ${userId} tried to delete element owned by ${element.userId}`);
      // Allow for now but log - proper authorization should check creator status
    }

    sessions[sessionId] = sessions[sessionId].filter(
      (el) => el.id !== elementId
    );
    io.to(sessionId).emit("element-deleted", elementId);
  });

  socket.on("clear-user-elements", (targetUserId) => {
    if (!sessionId || !sessions[sessionId]) return;
    if (!checkRateLimit(userId)) return;

    // Users can only clear their own elements
    if (targetUserId !== userId) {
      console.log(`User ${userId} tried to clear elements of ${targetUserId}`);
      return;
    }

    const initialLength = sessions[sessionId].length;
    sessions[sessionId] = sessions[sessionId].filter(
      (s) => s.userId !== targetUserId
    );

    if (sessions[sessionId].length !== initialLength) {
      io.to(sessionId).emit("elements-update", sessions[sessionId]);
    }
  });

  socket.on("session-ended", ({ sessionId: endedSessionId }) => {
    if (!endedSessionId) return;
    if (!checkRateLimit(userId)) return;

    console.log(`Session ${endedSessionId} ended`);
    socket.to(endedSessionId).emit("session-ended");

    // Clean up session data
    delete sessions[endedSessionId];
    delete activeUsers[endedSessionId];
    delete sessionParticipants[endedSessionId];
  });

  socket.on("kick-user", ({ userId: kickedUserId, sessionId: targetSessionId }) => {
    if (!targetSessionId || !kickedUserId) return;
    if (!checkRateLimit(userId)) return;

    console.log(`User ${kickedUserId} kicked from session ${targetSessionId}`);

    // Remove from participants
    if (sessionParticipants[targetSessionId]) {
      sessionParticipants[targetSessionId].delete(kickedUserId);
    }
    if (activeUsers[targetSessionId]) {
      activeUsers[targetSessionId].delete(kickedUserId);
    }

    io.to(targetSessionId).emit("user-kicked", { userId: kickedUserId });
  });

  socket.on("user-left", ({ userId: leftUserId, sessionId: leftSessionId }) => {
    if (!leftSessionId || !leftUserId) return;
    if (!checkRateLimit(userId)) return;

    console.log(`User ${leftUserId} left session ${leftSessionId}`);

    if (activeUsers[leftSessionId]) {
      activeUsers[leftSessionId].delete(leftUserId);
    }
    if (sessionParticipants[leftSessionId]) {
      sessionParticipants[leftSessionId].delete(leftUserId);
    }

    io.to(leftSessionId).emit("user-left", { userId: leftUserId });
  });

  // Handle friend requests
  socket.on("send-friend-request", ({ toUserId, request }) => {
    if (!checkRateLimit(userId)) return;

    console.log(`Friend request sent to: ${toUserId}`);
    io.to(`user:${toUserId}`).emit("new-friend-request", request);
  });

  socket.on("accept-friend-request", ({ toUserId, friendship }) => {
    if (!checkRateLimit(userId)) return;

    console.log(`Friend request accepted by: ${toUserId}`);
    io.to(`user:${toUserId}`).emit("friend-request-accepted", friendship);
  });

  socket.on("remove-friend", ({ toUserId, removedByUserId }) => {
    if (!checkRateLimit(userId)) return;

    console.log(`Friend removed: ${toUserId} by ${removedByUserId}`);
    io.to(`user:${toUserId}`).emit("friend-removed", { removedByUserId });
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id);
    io.to(sessionId).emit("cursor-remove", socket.id);

    if (userId && sessionId) {
      // Check if user has other active sockets in this session
      const sockets = await io.in(sessionId).fetchSockets();
      const isStillOnline = sockets.some(
        (s) => s.handshake.query.userId === userId || s.userId === userId
      );

      if (!isStillOnline) {
        if (activeUsers[sessionId]) {
          activeUsers[sessionId].delete(userId);
        }
        io.to(sessionId).emit("user-status-change", {
          userId,
          status: "offline",
        });
      }
    }
  });
});

// Clean up rate limits periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of rateLimits.entries()) {
    if (now > limit.resetTime + RATE_LIMIT_WINDOW * 10) {
      rateLimits.delete(userId);
    }
  }
}, 60000);
