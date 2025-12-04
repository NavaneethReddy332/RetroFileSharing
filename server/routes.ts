import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertTransferSessionSchema } from "@shared/schema";
import { generateSecureCode, generateSessionToken, verifySessionToken, checkRateLimit } from "./lib/security";
import { z } from "zod";

interface TransferRoom {
  sender?: WebSocket;
  receiver?: WebSocket;
  sessionId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  senderAuthenticated: boolean;
  receiverAuthenticated: boolean;
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

  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req) => {
    let currentCode: string | null = null;
    let role: "sender" | "receiver" | null = null;
    
    const clientIP = req.socket.remoteAddress || 'unknown';
    const wsRateLimit = checkRateLimit(`ws:${clientIP}`, 50, 60000);
    
    if (!wsRateLimit.allowed) {
      ws.close(1008, "Rate limit exceeded");
      return;
    }

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join-sender": {
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
              };
              rooms.set(code, room);
            }

            room.sender = ws;
            room.senderAuthenticated = true;
            ws.send(JSON.stringify({ type: "joined", role: "sender" }));

            if (room.receiver && room.sender && room.senderAuthenticated && room.receiverAuthenticated) {
              room.sender.send(JSON.stringify({ type: "peer-connected" }));
              room.receiver.send(JSON.stringify({ type: "peer-connected" }));
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
              };
              rooms.set(code, room);
            }

            room.receiver = ws;
            room.receiverAuthenticated = true;
            ws.send(JSON.stringify({
              type: "joined",
              role: "receiver",
              fileName: room.fileName,
              fileSize: room.fileSize,
              mimeType: room.mimeType,
            }));

            if (room.sender && room.receiver && room.senderAuthenticated && room.receiverAuthenticated) {
              room.sender.send(JSON.stringify({ type: "peer-connected" }));
              room.receiver.send(JSON.stringify({ type: "peer-connected" }));
            }
            break;
          }

          case "signal": {
            if (!currentCode) return;
            const room = rooms.get(currentCode);
            if (!room) return;

            const target = role === "sender" ? room.receiver : room.sender;
            if (target && target.readyState === WebSocket.OPEN) {
              target.send(JSON.stringify({
                type: "signal",
                data: message.data,
              }));
            }
            break;
          }

          case "transfer-complete": {
            if (!currentCode) return;
            const room = rooms.get(currentCode);
            if (!room) return;

            await storage.markSessionCompleted(room.sessionId);

            if (room.sender && room.sender.readyState === WebSocket.OPEN) {
              room.sender.send(JSON.stringify({ type: "transfer-complete" }));
            }
            if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
              room.receiver.send(JSON.stringify({ type: "transfer-complete" }));
            }

            rooms.delete(currentCode);
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
            if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
              room.receiver.send(JSON.stringify({ type: "peer-disconnected" }));
            }
          } else if (role === "receiver") {
            room.receiver = undefined;
            room.receiverAuthenticated = false;
            if (room.sender && room.sender.readyState === WebSocket.OPEN) {
              room.sender.send(JSON.stringify({ type: "peer-disconnected" }));
            }
          }

          if (!room.sender && !room.receiver) {
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
      
      if (!senderAlive && !receiverAlive) {
        rooms.delete(code);
      }
    }
  }, 30000);

  return httpServer;
}
