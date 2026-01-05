const { Server } = require("socket.io");

const port = process.env.PORT || 3001;
const io = new Server(port, {
  cors: {
    origin: "*", // Allow all origins for dev simplicity
    methods: ["GET", "POST"],
  },
});

console.log(`Socket.io server running on port ${port}`);

// In-memory storage for the whiteboard state per session
// Key: sessionId (or "global"), Value: Stroke[]
const sessions = {};
// Key: sessionId, Value: Set<userId>
const activeUsers = {};

io.on("connection", (socket) => {
  const sessionId = socket.handshake.query.sessionId;
  const userId = socket.handshake.query.userId;

  if (userId) {
    console.log(`User connected: ${socket.id} with userId: ${userId}`);
    socket.join(`user:${userId}`);
  }

  if (sessionId) {
    console.log(`User connected: ${socket.id} to session: ${sessionId}`);
    socket.join(sessionId);

    // Initialize session if not exists
    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    // Send the current state of the board to the new user
    socket.emit("init-elements", sessions[sessionId]);
  }

  // Handle invitations
  socket.on("send-invite", ({ toUserIds, session }) => {
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
    console.log(`User ${user.name} joined session ${sessionId}`);

    if (!activeUsers[sessionId]) {
      activeUsers[sessionId] = new Set();
    }
    activeUsers[sessionId].add(user.id);

    // Broadcast to others in the session
    socket.to(sessionId).emit("user-joined", user);
    // Also broadcast status change to online (in case they were already in the list but offline)
    socket
      .to(sessionId)
      .emit("user-status-change", { userId: user.id, status: "online" });

    // Send active users list to the joiner
    socket.emit("active-users", Array.from(activeUsers[sessionId]));
  });

  socket.on("cursor-move", (data) => {
    if (!sessionId) return;
    // Broadcast to all other clients in the room
    socket.to(sessionId).emit("cursor-update", {
      id: socket.id,
      ...data,
    });
  });

  socket.on("add-element", (element) => {
    // Add to history
    sessions[sessionId].push(element);
    // Broadcast to others in the room
    socket.to(sessionId).emit("element-added", element);
  });

  socket.on("update-element", (element) => {
    if (!sessions[sessionId]) return;
    const index = sessions[sessionId].findIndex((el) => el.id === element.id);
    if (index !== -1) {
      sessions[sessionId][index] = element;
      socket.to(sessionId).emit("element-updated", element);
    }
  });

  socket.on("undo-element", (userId) => {
    // Remove the last element by this specific user
    const sessionElements = sessions[sessionId];
    let index = -1;
    for (let i = sessionElements.length - 1; i >= 0; i--) {
      if (sessionElements[i].userId === userId) {
        index = i;
        break;
      }
    }

    if (index !== -1) {
      sessionElements.splice(index, 1);
      // Broadcast the updated full list to the room
      io.to(sessionId).emit("elements-update", sessionElements);
    }
  });

  socket.on("delete-element", (elementId) => {
    if (!sessions[sessionId]) return;
    sessions[sessionId] = sessions[sessionId].filter(
      (el) => el.id !== elementId
    );
    io.to(sessionId).emit("element-deleted", elementId);
  });

  socket.on("clear-user-elements", (userId) => {
    // Remove all elements by this user
    let sessionElements = sessions[sessionId];
    const initialLength = sessionElements.length;
    sessions[sessionId] = sessionElements.filter((s) => s.userId !== userId);

    if (sessions[sessionId].length !== initialLength) {
      io.to(sessionId).emit("elements-update", sessions[sessionId]);
    }
  });

  socket.on("session-ended", ({ sessionId }) => {
    console.log(`Session ${sessionId} ended`);
    // Broadcast to all clients in the room (including sender if they were listening, but sender handles it in UI)
    socket.to(sessionId).emit("session-ended");
    // Clean up session data
    delete sessions[sessionId];
  });

  socket.on("kick-user", ({ userId, sessionId }) => {
    console.log(`User ${userId} kicked from session ${sessionId}`);
    // Broadcast to the room so all clients update their list
    // The kicked user client will also receive this and handle the redirect
    io.to(sessionId).emit("user-kicked", { userId });
  });

  socket.on("user-left", ({ userId, sessionId }) => {
    console.log(`User ${userId} left session ${sessionId}`);
    if (activeUsers[sessionId]) {
      activeUsers[sessionId].delete(userId);
    }
    io.to(sessionId).emit("user-left", { userId });
  });

  // Handle friend requests
  socket.on("send-friend-request", ({ toUserId, request }) => {
    console.log(`Friend request sent to: ${toUserId}`);
    io.to(`user:${toUserId}`).emit("new-friend-request", request);
  });

  socket.on("accept-friend-request", ({ toUserId, friendship }) => {
    console.log(`Friend request accepted by: ${toUserId}`);
    io.to(`user:${toUserId}`).emit("friend-request-accepted", friendship);
  });

  socket.on("remove-friend", ({ toUserId, removedByUserId }) => {
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
        (s) => s.handshake.query.userId === userId
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
