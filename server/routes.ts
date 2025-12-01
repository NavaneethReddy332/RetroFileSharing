import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertTransferSessionSchema } from "@shared/schema";

interface TransferRoom {
  sender?: WebSocket;
  receiver?: WebSocket;
  sessionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

const rooms = new Map<string, TransferRoom>();

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/session", async (req, res) => {
    try {
      const { fileName, fileSize, mimeType } = req.body;
      
      if (!fileName || !fileSize || !mimeType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      const session = await storage.createTransferSession({
        fileName,
        fileSize,
        mimeType,
        code: "",
        expiresAt,
      });

      res.json({
        code: session.code,
        sessionId: session.id,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/session/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "Invalid code format" });
      }

      const session = await storage.getSessionByCode(code);

      if (!session) {
        return res.status(404).json({ error: "Session not found or expired" });
      }

      res.json({
        code: session.code,
        fileName: session.fileName,
        fileSize: session.fileSize,
        mimeType: session.mimeType,
        status: session.status,
      });
    } catch (error) {
      console.error("Session lookup error:", error);
      res.status(500).json({ error: "Failed to retrieve session" });
    }
  });

  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let currentCode: string | null = null;
    let role: "sender" | "receiver" | null = null;

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join-sender": {
            const { code } = message;
            currentCode = code;
            role = "sender";

            let room = rooms.get(code);
            if (!room) {
              const session = await storage.getSessionByCode(code);
              if (!session) {
                ws.send(JSON.stringify({ type: "error", error: "Session not found" }));
                return;
              }
              room = {
                sessionId: session.id,
                fileName: session.fileName,
                fileSize: session.fileSize,
                mimeType: session.mimeType,
              };
              rooms.set(code, room);
            }

            room.sender = ws;
            ws.send(JSON.stringify({ type: "joined", role: "sender" }));

            if (room.receiver) {
              room.sender.send(JSON.stringify({ type: "peer-connected" }));
              room.receiver.send(JSON.stringify({ type: "peer-connected" }));
            }
            break;
          }

          case "join-receiver": {
            const { code } = message;
            currentCode = code;
            role = "receiver";

            let room = rooms.get(code);
            if (!room) {
              const session = await storage.getSessionByCode(code);
              if (!session) {
                ws.send(JSON.stringify({ type: "error", error: "Session not found" }));
                return;
              }
              room = {
                sessionId: session.id,
                fileName: session.fileName,
                fileSize: session.fileSize,
                mimeType: session.mimeType,
              };
              rooms.set(code, room);
            }

            room.receiver = ws;
            ws.send(JSON.stringify({
              type: "joined",
              role: "receiver",
              fileName: room.fileName,
              fileSize: room.fileSize,
              mimeType: room.mimeType,
            }));

            if (room.sender) {
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

          case "chunk": {
            if (!currentCode || role !== "sender") return;
            const room = rooms.get(currentCode);
            if (!room || !room.receiver) return;

            if (room.receiver.readyState === WebSocket.OPEN) {
              room.receiver.send(JSON.stringify({
                type: "chunk",
                data: message.data,
                index: message.index,
                total: message.total,
              }));
            }
            break;
          }

          case "transfer-complete": {
            if (!currentCode) return;
            const room = rooms.get(currentCode);
            if (!room) return;

            await storage.updateSessionStatus(room.sessionId, "completed");

            if (room.sender && room.sender.readyState === WebSocket.OPEN) {
              room.sender.send(JSON.stringify({ type: "transfer-complete" }));
            }
            if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
              room.receiver.send(JSON.stringify({ type: "transfer-complete" }));
            }

            rooms.delete(currentCode);
            break;
          }

          case "progress": {
            if (!currentCode) return;
            const room = rooms.get(currentCode);
            if (!room) return;

            const target = role === "receiver" ? room.sender : room.receiver;
            if (target && target.readyState === WebSocket.OPEN) {
              target.send(JSON.stringify({
                type: "progress",
                percent: message.percent,
              }));
            }
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
            if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
              room.receiver.send(JSON.stringify({ type: "peer-disconnected" }));
            }
          } else if (role === "receiver") {
            room.receiver = undefined;
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

  return httpServer;
}
