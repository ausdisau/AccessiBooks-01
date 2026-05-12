import { Router, Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import passport from "passport";
import { db } from "./db";
import { listeningRooms, listeningRoomParticipants, listeningRoomMessages, users } from "@workspace/db";
import { eq, desc, and, asc } from "drizzle-orm";
import { isAuthenticated, getSessionMiddleware } from "./multiAuth";
import { handleQueueWSMessage, handleQueueWSLeave } from "./streamingQueue";
import type { SubscriptionTier } from "@workspace/db";

const TIER_ROOM_LIMITS: Record<string, { canCreate: boolean; maxListeners: number; coHost: boolean }> = {
  free: { canCreate: false, maxListeners: 0, coHost: false },
  plus: { canCreate: true, maxListeners: 10, coHost: false },
  premium: { canCreate: true, maxListeners: 50, coHost: true },
};

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  updatedAt: number;
}

interface RoomState {
  playback: PlaybackState;
  clients: Map<string, { ws: WebSocket; userId: string; displayName: string; role: string }>;
}

const activeRooms = new Map<string, RoomState>();

type WSMessageType =
  | "join_room"
  | "leave_room"
  | "chat_message"
  | "playback_update"
  | "sync_request"
  | "participant_joined"
  | "participant_left"
  | "chat_broadcast"
  | "playback_sync"
  | "error"
  | "room_closed";

interface WSMessage {
  type: WSMessageType;
  roomId?: string;
  userId?: string;
  displayName?: string;
  content?: string;
  playback?: PlaybackState;
  participants?: { userId: string; displayName: string; role: string }[];
  error?: string;
  messageId?: string;
  createdAt?: string;
}

function broadcastToRoom(roomId: string, message: WSMessage, excludeClientId?: string) {
  const room = activeRooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  room.clients.forEach((client, cId) => {
    if (cId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function getRoomParticipantList(roomId: string): { userId: string; displayName: string; role: string }[] {
  const room = activeRooms.get(roomId);
  if (!room) return [];
  const result: { userId: string; displayName: string; role: string }[] = [];
  room.clients.forEach((c) => {
    result.push({ userId: c.userId, displayName: c.displayName, role: c.role });
  });
  return result;
}

function authenticateWS(request: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const sessionMiddleware = getSessionMiddleware();
    if (!sessionMiddleware) {
      return reject(new Error("Session middleware not initialized"));
    }

    const mockRes = {
      writeHead: () => {},
      end: () => {},
      setHeader: () => {},
      getHeader: () => undefined,
    } as any;

    sessionMiddleware(request as any, mockRes, () => {
      passport.initialize()(request as any, mockRes, () => {
        passport.session()(request as any, mockRes, () => {
          const user = (request as any).user;
          if (user && user.id) {
            resolve(user);
          } else {
            reject(new Error("Not authenticated"));
          }
        });
      });
    });
  });
}

export function setupListeningPartyWS(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  const queueWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (request: IncomingMessage, socket, head) => {
    const isParty = request.url?.startsWith("/ws/listening-party");
    const isQueue = request.url?.startsWith("/ws/streaming-queue");
    if (!isParty && !isQueue) return;

    try {
      const user = await authenticateWS(request);
      (request as any)._wsUser = user;
      const targetWss = isQueue ? queueWss : wss;
      targetWss.handleUpgrade(request, socket, head, (ws) => {
        targetWss.emit("connection", ws, request);
      });
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const user = (request as any)._wsUser;
    if (!user || !user.id) {
      ws.close(1008, "Not authenticated");
      return;
    }

    const userId: string = user.id;
    const displayName: string = user.firstName
      ? `${user.firstName} ${user.lastName || ""}`.trim()
      : user.email || "User";
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });
    let currentRoomId: string | null = null;
    let lastChatTime = 0;

    ws.on("message", async (raw) => {
      try {
        const msg: WSMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case "join_room": {
            if (!msg.roomId) {
              ws.send(JSON.stringify({ type: "error", error: "Missing roomId" }));
              return;
            }

            const roomId = msg.roomId;
            currentRoomId = roomId;

            const [room] = await db.select().from(listeningRooms).where(eq(listeningRooms.id, roomId)).limit(1);
            if (!room || room.status !== "active") {
              ws.send(JSON.stringify({ type: "error", error: "Room not found or closed" }));
              return;
            }

            if (!activeRooms.has(roomId)) {
              activeRooms.set(roomId, {
                playback: { currentTime: 0, isPlaying: false, playbackRate: 1, updatedAt: Date.now() },
                clients: new Map(),
              });
            }

            const roomState = activeRooms.get(roomId)!;

            const currentCount = roomState.clients.size;
            const maxListeners = room.maxListeners || 10;
            if (room.hostUserId !== userId && currentCount >= maxListeners) {
              ws.send(JSON.stringify({ type: "error", error: `Room is full (${maxListeners}/${maxListeners} listeners)` }));
              return;
            }

            const role = room.hostUserId === userId ? "host" : "guest";
            roomState.clients.set(clientId, { ws, userId, displayName, role });

            const existingParticipant = await db.select().from(listeningRoomParticipants)
              .where(and(
                eq(listeningRoomParticipants.roomId, roomId),
                eq(listeningRoomParticipants.userId, userId)
              )).limit(1);

            if (existingParticipant.length === 0) {
              await db.insert(listeningRoomParticipants).values({
                roomId,
                userId,
                displayName,
                role,
              });
            }

            ws.send(JSON.stringify({
              type: "playback_sync",
              playback: roomState.playback,
              participants: getRoomParticipantList(roomId),
            }));

            broadcastToRoom(roomId, {
              type: "participant_joined",
              userId,
              displayName,
              participants: getRoomParticipantList(roomId),
            }, clientId);

            break;
          }

          case "leave_room": {
            if (currentRoomId) {
              handleLeave(clientId, currentRoomId);
              currentRoomId = null;
            }
            break;
          }

          case "chat_message": {
            if (!currentRoomId || !msg.content) return;

            const now = Date.now();
            if (now - lastChatTime < 500) return;
            lastChatTime = now;

            const content = msg.content.trim().slice(0, 500);
            if (!content) return;

            const roomState = activeRooms.get(currentRoomId);
            if (!roomState || !roomState.clients.has(clientId)) return;

            const [saved] = await db.insert(listeningRoomMessages).values({
              roomId: currentRoomId,
              userId,
              displayName,
              content,
            }).returning();

            broadcastToRoom(currentRoomId, {
              type: "chat_broadcast",
              roomId: currentRoomId,
              userId,
              displayName,
              content,
              messageId: saved?.id,
              createdAt: saved?.createdAt?.toISOString(),
            });

            break;
          }

          case "playback_update": {
            if (!currentRoomId || !msg.playback) return;

            const roomState = activeRooms.get(currentRoomId);
            if (!roomState) return;

            const client = roomState.clients.get(clientId);
            if (!client || (client.role !== "host" && client.role !== "co-host")) {
              ws.send(JSON.stringify({ type: "error", error: "Only the host or co-host can control playback" }));
              return;
            }

            roomState.playback = {
              ...msg.playback,
              updatedAt: Date.now(),
            };

            broadcastToRoom(currentRoomId, {
              type: "playback_sync",
              playback: roomState.playback,
            }, clientId);

            break;
          }

          case "sync_request": {
            if (!currentRoomId) return;
            const roomState = activeRooms.get(currentRoomId);
            if (roomState) {
              ws.send(JSON.stringify({
                type: "playback_sync",
                playback: roomState.playback,
              }));
            }
            break;
          }
        }
      } catch (err) {
        console.error("[ListeningParty WS] Error:", err);
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      if (currentRoomId) {
        handleLeave(clientId, currentRoomId);
      }
    });
  });

  // Streaming Queue WebSocket connections
  queueWss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const user = (request as any)._wsUser;
    if (!user || !user.id) {
      ws.close(1008, "Not authenticated");
      return;
    }

    const userId: string = user.id;
    const displayName: string = user.firstName
      ? `${user.firstName} ${user.lastName || ""}`.trim()
      : user.email || "User";
    const clientId = `qclient_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });
    let currentQueueId: string | null = null;

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "join_queue" && msg.queueId) {
          currentQueueId = msg.queueId;
        }

        if (currentQueueId || msg.queueId) {
          handleQueueWSMessage(
            currentQueueId || msg.queueId,
            clientId,
            userId,
            displayName,
            msg,
            ws,
          );
        }
      } catch (err) {
        console.error("[StreamingQueue WS] Error:", err);
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      if (currentQueueId) {
        handleQueueWSLeave(currentQueueId, clientId);
      }
    });
  });

  function handleLeave(clientId: string, roomId: string) {
    const roomState = activeRooms.get(roomId);
    if (!roomState) return;

    const client = roomState.clients.get(clientId);
    if (!client) return;

    roomState.clients.delete(clientId);

    broadcastToRoom(roomId, {
      type: "participant_left",
      userId: client.userId,
      displayName: client.displayName,
      participants: getRoomParticipantList(roomId),
    });

    if (roomState.clients.size === 0) {
      activeRooms.delete(roomId);
    }
  }

  const heartbeatInterval = setInterval(() => {
    const pingClients = (clientSet: Set<WebSocket>) => {
      clientSet.forEach((ws) => {
        const w = ws as any;
        if (w.isAlive === false) {
          ws.terminate();
          return;
        }
        w.isAlive = false;
        ws.ping();
      });
    };
    pingClients(wss.clients);
    pingClients(queueWss.clients);
  }, 30000);

  server.on("close", () => clearInterval(heartbeatInterval));
}

export function registerListeningPartyRoutes(app: Router) {
  app.get("/api/listening-party/tier-limits", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const tier = (dbUser?.subscriptionTier || "free") as string;
      const limits = TIER_ROOM_LIMITS[tier] || TIER_ROOM_LIMITS.free;
      res.json({ tier, ...limits });
    } catch (error) {
      console.error("Error fetching tier limits:", error);
      res.status(500).json({ message: "Failed to fetch tier limits" });
    }
  });

  app.post("/api/listening-party/rooms", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { bookId, bookTitle, bookAuthor, bookCover, roomName } = req.body;

      if (!bookId || !bookTitle) {
        return res.status(400).json({ message: "bookId and bookTitle are required" });
      }

      const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const tier = (dbUser?.subscriptionTier || "free") as string;
      const limits = TIER_ROOM_LIMITS[tier] || TIER_ROOM_LIMITS.free;

      if (!limits.canCreate) {
        return res.status(403).json({
          message: "Room creation requires a Plus or Premium subscription",
          requiresUpgrade: true,
          currentTier: tier,
        });
      }

      let roomCode = generateRoomCode();
      let attempts = 0;
      while (attempts < 10) {
        const existing = await db.select().from(listeningRooms)
          .where(eq(listeningRooms.roomCode, roomCode)).limit(1);
        if (existing.length === 0) break;
        roomCode = generateRoomCode();
        attempts++;
      }

      const [room] = await db.insert(listeningRooms).values({
        bookId,
        bookTitle,
        bookAuthor: bookAuthor || null,
        bookCover: bookCover || null,
        hostUserId: user.id,
        roomCode,
        roomName: roomName || null,
        maxListeners: limits.maxListeners,
        hostTier: tier,
        status: "active",
      }).returning();

      await db.insert(listeningRoomParticipants).values({
        roomId: room!.id,
        userId: user.id,
        displayName: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.email || "Host",
        role: "host",
      });

      res.json(room);
    } catch (error) {
      console.error("Error creating listening room:", error);
      res.status(500).json({ message: "Failed to create room" });
    }
  });

  app.post("/api/listening-party/rooms/:id/co-host", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { id } = req.params;
      const { userId: targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const [room] = await db.select().from(listeningRooms)
        .where(eq(listeningRooms.id, id!)).limit(1);

      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.hostUserId !== user.id) {
        return res.status(403).json({ message: "Only the host can assign co-hosts" });
      }

      if (room.hostTier !== "premium") {
        return res.status(403).json({ message: "Co-host feature requires Premium subscription" });
      }

      await db.update(listeningRoomParticipants)
        .set({ role: "co-host" })
        .where(and(
          eq(listeningRoomParticipants.roomId, id!),
          eq(listeningRoomParticipants.userId, targetUserId)
        ));

      const roomState = activeRooms.get(id!);
      if (roomState) {
        roomState.clients.forEach((client) => {
          if (client.userId === targetUserId) {
            client.role = "co-host";
          }
        });
        broadcastToRoom(id!, {
          type: "participant_joined",
          participants: getRoomParticipantList(id!),
        });
      }

      res.json({ message: "Co-host assigned" });
    } catch (error) {
      console.error("Error assigning co-host:", error);
      res.status(500).json({ message: "Failed to assign co-host" });
    }
  });

  app.get("/api/listening-party/rooms/join/:code", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const [room] = await db.select().from(listeningRooms)
        .where(and(
          eq(listeningRooms.roomCode, code!.toUpperCase()),
          eq(listeningRooms.status, "active"),
        )).limit(1);

      if (!room) {
        return res.status(404).json({ message: "Room not found or no longer active" });
      }

      res.json(room);
    } catch (error) {
      console.error("Error joining room:", error);
      res.status(500).json({ message: "Failed to join room" });
    }
  });

  app.get("/api/listening-party/rooms/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [room] = await db.select().from(listeningRooms)
        .where(eq(listeningRooms.id, id!)).limit(1);

      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json(room);
    } catch (error) {
      console.error("Error fetching room:", error);
      res.status(500).json({ message: "Failed to fetch room" });
    }
  });

  app.get("/api/listening-party/rooms/:id/participants", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const participants = await db.select().from(listeningRoomParticipants)
        .where(eq(listeningRoomParticipants.roomId, id!))
        .orderBy(asc(listeningRoomParticipants.joinedAt));

      res.json(participants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  app.get("/api/listening-party/rooms/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      const msgs = await db.select().from(listeningRoomMessages)
        .where(eq(listeningRoomMessages.roomId, id!))
        .orderBy(desc(listeningRoomMessages.createdAt))
        .limit(limit);

      res.json(msgs.reverse());
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/listening-party/rooms/:id/close", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { id } = req.params;

      const [room] = await db.select().from(listeningRooms)
        .where(eq(listeningRooms.id, id!)).limit(1);

      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.hostUserId !== user.id) {
        return res.status(403).json({ message: "Only the host can close the room" });
      }

      await db.update(listeningRooms).set({ status: "closed" })
        .where(eq(listeningRooms.id, id!));

      const roomState = activeRooms.get(id!);
      if (roomState) {
        broadcastToRoom(id!, { type: "room_closed" });
        activeRooms.delete(id!);
      }

      res.json({ message: "Room closed" });
    } catch (error) {
      console.error("Error closing room:", error);
      res.status(500).json({ message: "Failed to close room" });
    }
  });

  app.get("/api/listening-party/my-rooms", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const rooms = await db.select().from(listeningRooms)
        .where(eq(listeningRooms.hostUserId, user.id))
        .orderBy(desc(listeningRooms.createdAt))
        .limit(20);

      res.json(rooms);
    } catch (error) {
      console.error("Error fetching user rooms:", error);
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });
}
