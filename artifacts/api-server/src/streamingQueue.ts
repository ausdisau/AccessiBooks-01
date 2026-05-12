import { Router, Request, Response } from "express";
import { WebSocket } from "ws";
import { db } from "./db";
import { streamingQueues, streamingQueueItems, queueVotes, books, listeningHistory } from "@workspace/db";
import { eq, desc, and, asc, sql, ne, inArray } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";

interface QueuePlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  updatedAt: number;
}

interface QueueRoomState {
  playback: QueuePlaybackState;
  clients: Map<string, { ws: WebSocket; userId: string; displayName: string }>;
  autoAdvanceTimer?: ReturnType<typeof setTimeout>;
}

const activeQueues = new Map<string, QueueRoomState>();

function broadcastToQueue(queueId: string, message: any, excludeClientId?: string) {
  const room = activeQueues.get(queueId);
  if (!room) return;
  const data = JSON.stringify(message);
  room.clients.forEach((client, cId) => {
    if (cId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function getQueueListenerList(queueId: string) {
  const room = activeQueues.get(queueId);
  if (!room) return [];
  const result: { userId: string; displayName: string }[] = [];
  room.clients.forEach((c) => {
    result.push({ userId: c.userId, displayName: c.displayName });
  });
  return result;
}

async function getPopularGenres(userId: string): Promise<string[]> {
  const history = await db.select({
    bookId: listeningHistory.bookId,
  }).from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .orderBy(desc(listeningHistory.lastPlayedAt))
    .limit(20);

  if (history.length === 0) return [];

  const bookIds = history.map(h => h.bookId);
  const bookRecords = await db.select({
    genre: books.genre,
  }).from(books)
    .where(inArray(books.id, bookIds));

  const genreCounts = new Map<string, number>();
  for (const b of bookRecords) {
    if (b.genre) {
      genreCounts.set(b.genre, (genreCounts.get(b.genre) || 0) + 1);
    }
  }

  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre);
}

async function suggestBooksForQueue(genre?: string | null, excludeBookIds: string[] = [], limit = 10): Promise<any[]> {
  let query = db.select().from(books)
    .where(and(
      eq(books.contentType, "audiobook"),
      books.audioUrl ? sql`${books.audioUrl} IS NOT NULL` : sql`1=1`,
    ))
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  const results = await query;

  const filtered = results.filter(b => 
    !excludeBookIds.includes(b.id) && 
    b.audioUrl &&
    (!genre || b.genre?.toLowerCase().includes(genre.toLowerCase()))
  );

  if (filtered.length >= 3) return filtered;
  return results.filter(b => !excludeBookIds.includes(b.id) && b.audioUrl).slice(0, limit);
}

export function registerStreamingQueueRoutes(app: any) {
  const router = Router();

  router.get("/active", async (_req: Request, res: Response) => {
    const queues = await db.select().from(streamingQueues)
      .where(eq(streamingQueues.status, "active"))
      .orderBy(desc(streamingQueues.listenerCount));
    
    const withCounts = queues.map(q => ({
      ...q,
      listenerCount: activeQueues.get(q.id)?.clients.size || 0,
    }));
    res.json(withCounts);
  });

  router.post("/create", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const { name, description, genre } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "Queue name is required" });
    }

    const suggestions = await suggestBooksForQueue(genre);
    const firstBook = suggestions[0];

    const [queue] = await db.insert(streamingQueues).values({
      name: name.trim(),
      description: description?.trim() || null,
      genre: genre?.trim() || null,
      hostUserId: user.id,
      currentBookId: firstBook?.id || null,
      currentBookTitle: firstBook?.title || null,
      currentBookAuthor: firstBook?.author || null,
      currentBookCover: firstBook?.coverImage || null,
      currentBookAudioUrl: firstBook?.audioUrl || null,
      status: "active",
    }).returning();

    if (suggestions.length > 0) {
      const items = suggestions.map((book, idx) => ({
        queueId: queue.id,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author || null,
        bookCover: book.coverImage || null,
        bookAudioUrl: book.audioUrl || null,
        position: idx,
        status: idx === 0 ? "playing" : "pending",
        addedBy: user.id,
      }));
      await db.insert(streamingQueueItems).values(items);
    }

    res.json(queue);
  });

  router.get("/:id", async (req: Request, res: Response) => {
    const [queue] = await db.select().from(streamingQueues)
      .where(eq(streamingQueues.id, req.params.id))
      .limit(1);
    
    if (!queue) return res.status(404).json({ error: "Queue not found" });

    res.json({
      ...queue,
      listenerCount: activeQueues.get(queue.id)?.clients.size || 0,
    });
  });

  router.get("/:id/items", async (req: Request, res: Response) => {
    const items = await db.select().from(streamingQueueItems)
      .where(eq(streamingQueueItems.queueId, req.params.id))
      .orderBy(asc(streamingQueueItems.position));
    res.json(items);
  });

  router.post("/:id/add-book", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const { bookId } = req.body;

    if (!bookId) return res.status(400).json({ error: "bookId required" });

    const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
    if (!book || !book.audioUrl) return res.status(404).json({ error: "Audiobook not found" });

    const existing = await db.select().from(streamingQueueItems)
      .where(and(
        eq(streamingQueueItems.queueId, req.params.id),
        eq(streamingQueueItems.bookId, bookId),
        ne(streamingQueueItems.status, "played"),
      )).limit(1);

    if (existing.length > 0) return res.status(409).json({ error: "Book already in queue" });

    const maxPos = await db.select({ max: sql<number>`COALESCE(MAX(${streamingQueueItems.position}), -1)` })
      .from(streamingQueueItems)
      .where(eq(streamingQueueItems.queueId, req.params.id));

    const [item] = await db.insert(streamingQueueItems).values({
      queueId: req.params.id,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author || null,
      bookCover: book.coverImage || null,
      bookAudioUrl: book.audioUrl || null,
      position: (maxPos[0]?.max ?? -1) + 1,
      status: "pending",
      addedBy: user.id,
    }).returning();

    broadcastToQueue(req.params.id, {
      type: "queue_updated",
      item,
    });

    res.json(item);
  });

  router.post("/:id/vote/:itemId", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const { itemId } = req.params;

    const existingVote = await db.select().from(queueVotes)
      .where(and(
        eq(queueVotes.queueItemId, itemId),
        eq(queueVotes.userId, user.id),
      )).limit(1);

    if (existingVote.length > 0) {
      await db.delete(queueVotes).where(eq(queueVotes.id, existingVote[0].id));
      await db.update(streamingQueueItems)
        .set({ votes: sql`${streamingQueueItems.votes} - 1` })
        .where(eq(streamingQueueItems.id, itemId));
    } else {
      await db.insert(queueVotes).values({
        queueItemId: itemId,
        userId: user.id,
      });
      await db.update(streamingQueueItems)
        .set({ votes: sql`${streamingQueueItems.votes} + 1` })
        .where(eq(streamingQueueItems.id, itemId));
    }

    const [updated] = await db.select().from(streamingQueueItems)
      .where(eq(streamingQueueItems.id, itemId)).limit(1);

    broadcastToQueue(req.params.id, {
      type: "vote_updated",
      itemId,
      votes: updated?.votes || 0,
    });

    res.json({ voted: existingVote.length === 0, votes: updated?.votes || 0 });
  });

  router.post("/:id/skip", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [queue] = await db.select().from(streamingQueues)
      .where(eq(streamingQueues.id, req.params.id)).limit(1);

    if (!queue) return res.status(404).json({ error: "Queue not found" });
    if (queue.hostUserId !== user.id) return res.status(403).json({ error: "Only the host can skip" });

    const nextBook = await advanceQueue(req.params.id);
    res.json({ nextBook });
  });

  router.post("/:id/close", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [queue] = await db.select().from(streamingQueues)
      .where(eq(streamingQueues.id, req.params.id)).limit(1);

    if (!queue) return res.status(404).json({ error: "Queue not found" });
    if (queue.hostUserId !== user.id) return res.status(403).json({ error: "Only the host can close" });

    await db.update(streamingQueues)
      .set({ status: "closed" })
      .where(eq(streamingQueues.id, req.params.id));

    broadcastToQueue(req.params.id, { type: "queue_closed" });

    const roomState = activeQueues.get(req.params.id);
    if (roomState?.autoAdvanceTimer) clearTimeout(roomState.autoAdvanceTimer);
    activeQueues.delete(req.params.id);

    res.json({ success: true });
  });

  router.get("/:id/suggestions", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [queue] = await db.select().from(streamingQueues)
      .where(eq(streamingQueues.id, req.params.id)).limit(1);

    if (!queue) return res.status(404).json({ error: "Queue not found" });

    const currentItems = await db.select({ bookId: streamingQueueItems.bookId })
      .from(streamingQueueItems)
      .where(eq(streamingQueueItems.queueId, req.params.id));

    const excludeIds = currentItems.map(i => i.bookId);

    const userGenres = await getPopularGenres(user.id);
    const preferredGenre = queue.genre || userGenres[0] || null;

    const suggestions = await suggestBooksForQueue(preferredGenre, excludeIds, 8);
    res.json(suggestions);
  });

  router.get("/:id/my-votes", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const items = await db.select({ queueItemId: streamingQueueItems.id })
      .from(streamingQueueItems)
      .innerJoin(queueVotes, eq(queueVotes.queueItemId, streamingQueueItems.id))
      .where(and(
        eq(streamingQueueItems.queueId, req.params.id),
        eq(queueVotes.userId, user.id),
      ));
    res.json(items.map(i => i.queueItemId));
  });

  app.use("/api/streaming-queue", router);
}

async function advanceQueue(queueId: string): Promise<any | null> {
  if (activeQueues.get(queueId)?.autoAdvanceTimer) {
    clearTimeout(activeQueues.get(queueId)!.autoAdvanceTimer);
  }

  await db.update(streamingQueueItems)
    .set({ status: "played" })
    .where(and(
      eq(streamingQueueItems.queueId, queueId),
      eq(streamingQueueItems.status, "playing"),
    ));

  const pendingItems = await db.select().from(streamingQueueItems)
    .where(and(
      eq(streamingQueueItems.queueId, queueId),
      eq(streamingQueueItems.status, "pending"),
    ))
    .orderBy(desc(streamingQueueItems.votes), asc(streamingQueueItems.position))
    .limit(1);

  const nextItem = pendingItems[0];

  if (!nextItem) {
    const currentItems = await db.select({ bookId: streamingQueueItems.bookId })
      .from(streamingQueueItems)
      .where(eq(streamingQueueItems.queueId, queueId));
    const excludeIds = currentItems.map(i => i.bookId);

    const [queue] = await db.select().from(streamingQueues)
      .where(eq(streamingQueues.id, queueId)).limit(1);

    const newBooks = await suggestBooksForQueue(queue?.genre, excludeIds, 5);
    if (newBooks.length > 0) {
      const maxPos = await db.select({ max: sql<number>`COALESCE(MAX(${streamingQueueItems.position}), -1)` })
        .from(streamingQueueItems)
        .where(eq(streamingQueueItems.queueId, queueId));

      const items = newBooks.map((book, idx) => ({
        queueId,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author || null,
        bookCover: book.coverImage || null,
        bookAudioUrl: book.audioUrl || null,
        position: (maxPos[0]?.max ?? -1) + 1 + idx,
        status: idx === 0 ? "playing" : "pending",
        addedBy: queue?.hostUserId || null,
      }));
      await db.insert(streamingQueueItems).values(items);

      const firstNew = newBooks[0];
      await db.update(streamingQueues).set({
        currentBookId: firstNew.id,
        currentBookTitle: firstNew.title,
        currentBookAuthor: firstNew.author || null,
        currentBookCover: firstNew.coverImage || null,
        currentBookAudioUrl: firstNew.audioUrl || null,
      }).where(eq(streamingQueues.id, queueId));

      broadcastToQueue(queueId, {
        type: "book_changed",
        book: firstNew,
        playback: { currentTime: 0, isPlaying: true, playbackRate: 1, updatedAt: Date.now() },
      });

      const roomState = activeQueues.get(queueId);
      if (roomState) {
        roomState.playback = { currentTime: 0, isPlaying: true, playbackRate: 1, updatedAt: Date.now() };
      }

      return firstNew;
    }
    return null;
  }

  await db.update(streamingQueueItems)
    .set({ status: "playing" })
    .where(eq(streamingQueueItems.id, nextItem.id));

  await db.update(streamingQueues).set({
    currentBookId: nextItem.bookId,
    currentBookTitle: nextItem.bookTitle,
    currentBookAuthor: nextItem.bookAuthor,
    currentBookCover: nextItem.bookCover,
    currentBookAudioUrl: nextItem.bookAudioUrl,
  }).where(eq(streamingQueues.id, queueId));

  const [fullBook] = await db.select().from(books).where(eq(books.id, nextItem.bookId)).limit(1);

  broadcastToQueue(queueId, {
    type: "book_changed",
    book: fullBook || { id: nextItem.bookId, title: nextItem.bookTitle, author: nextItem.bookAuthor, coverImage: nextItem.bookCover, audioUrl: nextItem.bookAudioUrl },
    playback: { currentTime: 0, isPlaying: true, playbackRate: 1, updatedAt: Date.now() },
  });

  const roomState = activeQueues.get(queueId);
  if (roomState) {
    roomState.playback = { currentTime: 0, isPlaying: true, playbackRate: 1, updatedAt: Date.now() };
  }

  return fullBook || nextItem;
}

export function handleQueueWSMessage(
  queueId: string,
  clientId: string,
  userId: string,
  displayName: string,
  msg: any,
  ws: WebSocket,
) {
  switch (msg.type) {
    case "join_queue": {
      if (!activeQueues.has(queueId)) {
        activeQueues.set(queueId, {
          playback: { currentTime: 0, isPlaying: false, playbackRate: 1, updatedAt: Date.now() },
          clients: new Map(),
        });
      }

      const roomState = activeQueues.get(queueId)!;
      roomState.clients.set(clientId, { ws, userId, displayName });

      db.update(streamingQueues)
        .set({ listenerCount: roomState.clients.size })
        .where(eq(streamingQueues.id, queueId))
        .then(() => {});

      ws.send(JSON.stringify({
        type: "queue_state",
        playback: roomState.playback,
        listeners: getQueueListenerList(queueId),
        listenerCount: roomState.clients.size,
      }));

      broadcastToQueue(queueId, {
        type: "listener_joined",
        userId,
        displayName,
        listenerCount: roomState.clients.size,
      }, clientId);

      break;
    }

    case "queue_playback_update": {
      const roomState = activeQueues.get(queueId);
      if (!roomState) return;

      roomState.playback = {
        ...msg.playback,
        updatedAt: Date.now(),
      };

      broadcastToQueue(queueId, {
        type: "queue_playback_sync",
        playback: roomState.playback,
      }, clientId);

      break;
    }

    case "queue_sync_request": {
      const roomState = activeQueues.get(queueId);
      if (roomState) {
        ws.send(JSON.stringify({
          type: "queue_playback_sync",
          playback: roomState.playback,
        }));
      }
      break;
    }

    case "advance_queue": {
      advanceQueue(queueId).catch(err => {
        console.error("[StreamingQueue] Advance error:", err);
      });
      break;
    }
  }
}

export function handleQueueWSLeave(queueId: string, clientId: string) {
  const roomState = activeQueues.get(queueId);
  if (!roomState) return;

  const client = roomState.clients.get(clientId);
  if (!client) return;

  roomState.clients.delete(clientId);

  db.update(streamingQueues)
    .set({ listenerCount: roomState.clients.size })
    .where(eq(streamingQueues.id, queueId))
    .then(() => {});

  broadcastToQueue(queueId, {
    type: "listener_left",
    userId: client.userId,
    displayName: client.displayName,
    listenerCount: roomState.clients.size,
  });

  if (roomState.clients.size === 0) {
    if (roomState.autoAdvanceTimer) clearTimeout(roomState.autoAdvanceTimer);
    activeQueues.delete(queueId);
  }
}
