import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertTransferSessionSchema } from "@shared/schema";
import { generateSecureCode, generateSessionToken, verifySessionToken, checkRateLimit } from "./lib/security";
import { b2Service } from "./lib/b2";
import { z } from "zod";

interface ReceiverInfo {
  ws: WebSocket;
  id: string;
  authenticated: boolean;
  transferComplete: boolean;
}

interface TransferRoom {
  sender?: WebSocket;
  receiver?: WebSocket;
  receivers: Map<string, ReceiverInfo>;
  sessionId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  senderAuthenticated: boolean;
  receiverAuthenticated: boolean;
  isMultiShare: boolean;
  maxReceivers: number;
}

const rooms = new Map<string, TransferRoom>();

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024;

const sessionCreateSchema = z.object({
  fileName: z.string().min(1).max(500),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  mimeType: z.string().min(1).max(200),
});

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/health", async (_req, res) => {
    try {
      const dbHealth = await storage.healthCheck();
      res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        database: dbHealth ? "connected" : "disconnected",
        uptime: process.uptime()
      });
    } catch (error) {
      res.status(503).json({ 
        status: "error", 
        timestamp: new Date().toISOString(),
        database: "error"
      });
    }
  });

  app.post("/api/session", async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`session:${clientIP}`, 20, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      const parseResult = sessionCreateSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        });
      }

      const { fileName, fileSize, mimeType } = parseResult.data;

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      const session = await storage.createTransferSession({
        fileName,
        fileSize,
        mimeType,
        code: "",
        expiresAt: expiresAt.toISOString(),
      });

      const token = generateSessionToken(session.id, session.code);

      res.json({
        code: session.code,
        sessionId: session.id,
        expiresAt: session.expiresAt,
        token,
      });
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/session/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Invalid code format" });
      }

      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`lookup:${clientIP}`, 30, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      const sessionWithCompleted = await storage.getSessionByCodeIncludeCompleted(code);

      if (!sessionWithCompleted) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (sessionWithCompleted.status === 'completed') {
        const completedDate = sessionWithCompleted.completedAt 
          ? new Date(sessionWithCompleted.completedAt)
          : new Date(sessionWithCompleted.createdAt);
        
        return res.status(410).json({ 
          error: "This transfer was completed",
          status: "completed",
          fileName: sessionWithCompleted.fileName,
          fileSize: sessionWithCompleted.fileSize,
          completedAt: completedDate.toISOString(),
          message: "This transfer was completed long ago"
        });
      }

      if (sessionWithCompleted.status === 'expired' || 
          sessionWithCompleted.expiresAt <= new Date().toISOString()) {
        return res.status(410).json({ 
          error: "This session has expired",
          status: "expired",
          fileName: sessionWithCompleted.fileName,
          fileSize: sessionWithCompleted.fileSize,
          message: "This transfer session has expired"
        });
      }

      const token = generateSessionToken(sessionWithCompleted.id, sessionWithCompleted.code);

      res.json({
        code: sessionWithCompleted.code,
        fileName: sessionWithCompleted.fileName,
        fileSize: sessionWithCompleted.fileSize,
        mimeType: sessionWithCompleted.mimeType,
        status: sessionWithCompleted.status,
        token,
      });
    } catch (error) {
      console.error("Session lookup error:", error);
      res.status(500).json({ error: "Failed to retrieve session" });
    }
  });

  app.get("/api/cloud/status", async (_req, res) => {
    res.json({ 
      enabled: b2Service.isEnabled(),
      provider: 'backblaze-b2'
    });
  });

  app.post("/api/cloud/upload-url", async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`cloud:${clientIP}`, 30, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      if (!b2Service.isEnabled()) {
        return res.status(503).json({ error: "Cloud storage is not configured" });
      }

      const { fileName, contentType, fileSize } = req.body;

      if (!fileName || typeof fileName !== 'string') {
        return res.status(400).json({ error: "fileName is required" });
      }

      if (!contentType || typeof contentType !== 'string') {
        return res.status(400).json({ error: "contentType is required" });
      }

      if (typeof fileSize !== 'number' || fileSize <= 0) {
        return res.status(400).json({ error: "fileSize must be a positive number" });
      }

      if (fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File size exceeds maximum allowed (4GB)" });
      }

      const uploadData = await b2Service.getUploadUrl(fileName);
      
      if (!uploadData) {
        return res.status(500).json({ error: "Failed to get upload URL" });
      }

      res.json({
        uploadUrl: uploadData.uploadUrl,
        authorizationToken: uploadData.authorizationToken,
        fileName: uploadData.fileName,
        bucketId: uploadData.bucketId,
      });
    } catch (error) {
      console.error("Cloud upload URL error:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  let receiverIdCounter = 0;
  const generateReceiverId = () => `r${Date.now()}-${++receiverIdCounter}`;

  wss.on("connection", (ws: WebSocket, req) => {
    let currentCode: string | null = null;
    let role: "sender" | "receiver" | null = null;
    let receiverId: string | null = null;
    
    const clientIP = req.socket.remoteAddress || 'unknown';
    const wsRateLimit = checkRateLimit(`ws:${clientIP}`, 50, 60000);
    
    if (!wsRateLimit.allowed) {
      ws.close(1008, "Rate limit exceeded");
      return;
    }

    const sendReceiverCountUpdate = (room: TransferRoom) => {
      if (room.sender && room.sender.readyState === WebSocket.OPEN && room.isMultiShare) {
        const activeReceivers = Array.from(room.receivers.values()).filter(r => r.authenticated);
        room.sender.send(JSON.stringify({
          type: "receiver-count-update",
          count: activeReceivers.length,
          maxReceivers: room.maxReceivers,
          receivers: activeReceivers.map(r => ({ id: r.id, transferComplete: r.transferComplete }))
        }));
      }
    };

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join-sender": {
            const { code, token, isMultiShare = false } = message;
            
            if (!token) {
              ws.send(JSON.stringify({ type: "error", error: "Authentication required" }));
              return;
            }

            const verification = verifySessionToken(token, code);
            if (!verification.valid) {
              ws.send(JSON.stringify({ type: "error", error: "Invalid or expired token" }));
              return;
            }

            currentCode = code;
            role = "sender";

            let room = rooms.get(code);
            if (!room) {
              const session = await storage.getSessionByCode(code);
              if (!session) {
                ws.send(JSON.stringify({ type: "error", error: "Session not found or already completed" }));
                return;
              }
              room = {
                sessionId: session.id,
                fileName: session.fileName,
                fileSize: session.fileSize,
                mimeType: session.mimeType,
                senderAuthenticated: false,
                receiverAuthenticated: false,
                receivers: new Map(),
                isMultiShare: isMultiShare,
                maxReceivers: isMultiShare ? 4 : 1,
              };
              rooms.set(code, room);
            }

            room.sender = ws;
            room.senderAuthenticated = true;
            room.isMultiShare = isMultiShare;
            room.maxReceivers = isMultiShare ? 4 : 1;
            
            ws.send(JSON.stringify({ type: "joined", role: "sender", isMultiShare }));

            if (!isMultiShare && room.receiver && room.sender && room.senderAuthenticated && room.receiverAuthenticated) {
              room.sender.send(JSON.stringify({ type: "peer-connected" }));
              room.receiver.send(JSON.stringify({ type: "peer-connected" }));
            }
            
            if (isMultiShare) {
              sendReceiverCountUpdate(room);
            }
            break;
          }

          case "join-receiver": {
            const { code, token } = message;
            
            if (!token) {
              ws.send(JSON.stringify({ type: "error", error: "Authentication required" }));
              return;
            }

            const verification = verifySessionToken(token, code);
            if (!verification.valid) {
              ws.send(JSON.stringify({ type: "error", error: "Invalid or expired token" }));
              return;
            }

            currentCode = code;
            role = "receiver";

            let room = rooms.get(code);
            if (!room) {
              const session = await storage.getSessionByCode(code);
              if (!session) {
                ws.send(JSON.stringify({ type: "error", error: "Session not found or already completed" }));
                return;
              }
              room = {
                sessionId: session.id,
                fileName: session.fileName,
                fileSize: session.fileSize,
                mimeType: session.mimeType,
                senderAuthenticated: false,
                receiverAuthenticated: false,
                receivers: new Map(),
                isMultiShare: false,
                maxReceivers: 1,
              };
              rooms.set(code, room);
            }

            if (room.isMultiShare) {
              if (room.receivers.size >= room.maxReceivers) {
                ws.send(JSON.stringify({ type: "error", error: "Session is full (max 4 receivers)" }));
                return;
              }
              
              receiverId = generateReceiverId();
              const receiverInfo: ReceiverInfo = {
                ws,
                id: receiverId,
                authenticated: true,
                transferComplete: false,
              };
              room.receivers.set(receiverId, receiverInfo);
              
              ws.send(JSON.stringify({
                type: "joined",
                role: "receiver",
                receiverId,
                fileName: room.fileName,
                fileSize: room.fileSize,
                mimeType: room.mimeType,
                isMultiShare: true,
              }));
              
              sendReceiverCountUpdate(room);
              
              if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                room.sender.send(JSON.stringify({ 
                  type: "multi-peer-connected", 
                  receiverId 
                }));
              }
            } else {
              room.receiver = ws;
              room.receiverAuthenticated = true;
              ws.send(JSON.stringify({
                type: "joined",
                role: "receiver",
                fileName: room.fileName,
                fileSize: room.fileSize,
                mimeType: room.mimeType,
                isMultiShare: false,
              }));

              if (room.sender && room.receiver && room.senderAuthenticated && room.receiverAuthenticated) {
                room.sender.send(JSON.stringify({ type: "peer-connected" }));
                room.receiver.send(JSON.stringify({ type: "peer-connected" }));
              }
            }
            break;
          }

          case "signal": {
            if (!currentCode) return;
            const room = rooms.get(currentCode);
            if (!room) return;

            if (room.isMultiShare) {
              if (role === "sender" && message.targetReceiverId) {
                const targetReceiver = room.receivers.get(message.targetReceiverId);
                if (targetReceiver && targetReceiver.ws.readyState === WebSocket.OPEN) {
                  targetReceiver.ws.send(JSON.stringify({
                    type: "signal",
                    data: message.data,
                  }));
                }
              } else if (role === "receiver" && receiverId) {
                if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                  room.sender.send(JSON.stringify({
                    type: "signal",
                    data: message.data,
                    fromReceiverId: receiverId,
                  }));
                }
              }
            } else {
              const target = role === "sender" ? room.receiver : room.sender;
              if (target && target.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify({
                  type: "signal",
                  data: message.data,
                }));
              }
            }
            break;
          }

          case "transfer-complete": {
            if (!currentCode) return;
            const room = rooms.get(currentCode);
            if (!room) return;

            if (room.isMultiShare) {
              if (role === "receiver" && receiverId) {
                const receiverInfo = room.receivers.get(receiverId);
                if (receiverInfo) {
                  receiverInfo.transferComplete = true;
                  sendReceiverCountUpdate(room);
                }
                ws.send(JSON.stringify({ type: "transfer-complete" }));
              }
            } else {
              await storage.markSessionCompleted(room.sessionId);

              if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                room.sender.send(JSON.stringify({ type: "transfer-complete" }));
              }
              if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
                room.receiver.send(JSON.stringify({ type: "transfer-complete" }));
              }

              rooms.delete(currentCode);
            }
            break;
          }

          case "stop-multi-share": {
            if (!currentCode || role !== "sender") return;
            const room = rooms.get(currentCode);
            if (!room || !room.isMultiShare) return;

            for (const [id, receiver] of Array.from(room.receivers.entries())) {
              if (receiver.ws.readyState === WebSocket.OPEN) {
                receiver.ws.send(JSON.stringify({ type: "session-stopped" }));
              }
            }

            await storage.markSessionCompleted(room.sessionId);

            if (room.sender && room.sender.readyState === WebSocket.OPEN) {
              room.sender.send(JSON.stringify({ type: "multi-share-stopped" }));
            }

            rooms.delete(currentCode);
            break;
          }

          case "sender-cancelled": {
            if (!currentCode || role !== "sender") return;
            const room = rooms.get(currentCode);
            if (!room) return;

            if (room.isMultiShare) {
              for (const [id, receiver] of Array.from(room.receivers.entries())) {
                if (receiver.ws.readyState === WebSocket.OPEN) {
                  receiver.ws.send(JSON.stringify({ type: "sender-cancelled" }));
                }
              }
              room.receivers.clear();
            } else {
              if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
                room.receiver.send(JSON.stringify({ type: "sender-cancelled" }));
              }
              room.receiver = undefined;
              room.receiverAuthenticated = false;
            }
            
            room.sender = undefined;
            room.senderAuthenticated = false;
            rooms.delete(currentCode);
            
            storage.updateSession(currentCode, { status: "cancelled" })
              .catch((err: Error) => console.error("Failed to update session status:", err));
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      if (currentCode) {
        const room = rooms.get(currentCode);
        if (room) {
          if (role === "sender") {
            room.sender = undefined;
            room.senderAuthenticated = false;
            
            if (room.isMultiShare) {
              for (const [id, receiver] of Array.from(room.receivers.entries())) {
                if (receiver.ws.readyState === WebSocket.OPEN) {
                  receiver.ws.send(JSON.stringify({ type: "peer-disconnected" }));
                }
              }
              rooms.delete(currentCode);
            } else {
              if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
                room.receiver.send(JSON.stringify({ type: "peer-disconnected" }));
              }
            }
          } else if (role === "receiver") {
            if (room.isMultiShare && receiverId) {
              room.receivers.delete(receiverId);
              sendReceiverCountUpdate(room);
              
              if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                room.sender.send(JSON.stringify({ 
                  type: "multi-peer-disconnected", 
                  receiverId 
                }));
              }
            } else {
              room.receiver = undefined;
              room.receiverAuthenticated = false;
              if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                room.sender.send(JSON.stringify({ type: "peer-disconnected" }));
              }
            }
          }

          if (!room.sender && !room.receiver && room.receivers.size === 0) {
            rooms.delete(currentCode);
          }
        }
      }
    });
  });

  setInterval(() => {
    const roomEntries = Array.from(rooms.entries());
    for (const [code, room] of roomEntries) {
      const senderAlive = room.sender && room.sender.readyState === WebSocket.OPEN;
      const receiverAlive = room.receiver && room.receiver.readyState === WebSocket.OPEN;
      const hasActiveReceivers = room.isMultiShare && Array.from(room.receivers.values()).some(r => r.ws.readyState === WebSocket.OPEN);
      
      if (!senderAlive && !receiverAlive && !hasActiveReceivers) {
        rooms.delete(code);
      }
    }
  }, 30000);

  return httpServer;
}
