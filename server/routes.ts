import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertTransferSessionSchema } from "@shared/schema";
import { generateSecureCode, generateSessionToken, verifySessionToken, checkRateLimit } from "./lib/security";
import { b2Service } from "./lib/b2";
import { z } from "zod";
import Busboy from "busboy";
import bcrypt from "bcrypt";

interface ReceiverInfo {
  ws: WebSocket;
  id: string;
  authenticated: boolean;
  transferComplete: boolean;
  userId?: number;
}

interface TransferRoom {
  sender?: WebSocket;
  receiver?: WebSocket;
  receivers: Map<string, ReceiverInfo>;
  sessionId: number;
  code: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  senderAuthenticated: boolean;
  receiverAuthenticated: boolean;
  isMultiShare: boolean;
  maxReceivers: number;
  senderUserId?: number;
  receiverUserId?: number;
}

const rooms = new Map<string, TransferRoom>();

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024;
const MAX_CLOUD_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB max for server-proxied cloud uploads

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
    // Ensure CORS is configured when checking status
    if (b2Service.isEnabled()) {
      await b2Service.ensureCorsConfigured();
    }
    
    res.json({ 
      enabled: b2Service.isEnabled(),
      provider: 'backblaze-b2',
      corsConfigured: b2Service.isCorsConfigured()
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

      // Ensure CORS is configured for direct browser uploads
      const corsConfigured = await b2Service.ensureCorsConfigured();
      if (!corsConfigured) {
        return res.status(503).json({ 
          error: "Cloud storage CORS is not configured. Please configure CORS rules on your B2 bucket to allow browser uploads.",
          corsRequired: true
        });
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

  // Server-side upload endpoint - proxies file to B2 (avoids CORS issues)
  // Limited to 500MB to prevent memory issues; larger files should use P2P transfer
  app.post("/api/cloud/upload", async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`cloud-upload:${clientIP}`, 5, 60000); // 5 uploads per minute
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      if (!b2Service.isEnabled()) {
        return res.status(503).json({ error: "Cloud storage is not configured" });
      }

      // Check content-length header first to reject oversized uploads early
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      if (contentLength > MAX_CLOUD_UPLOAD_SIZE) {
        return res.status(400).json({ 
          error: `File too large for cloud upload. Maximum size is 500MB. Use P2P transfer for larger files.`,
          maxSize: MAX_CLOUD_UPLOAD_SIZE
        });
      }

      const busboy = Busboy({ 
        headers: req.headers,
        limits: {
          fileSize: MAX_CLOUD_UPLOAD_SIZE,
          files: 1
        }
      });

      let fileBuffer: Buffer | null = null;
      let fileName = '';
      let contentType = 'application/octet-stream';
      let fileSizeExceeded = false;
      let uploadError: Error | null = null;

      busboy.on('file', (fieldname, file, info) => {
        fileName = info.filename;
        contentType = info.mimeType || 'application/octet-stream';
        
        const chunks: Buffer[] = [];
        let totalSize = 0;
        
        file.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize <= MAX_CLOUD_UPLOAD_SIZE) {
            chunks.push(chunk);
          }
        });
        
        file.on('limit', () => {
          fileSizeExceeded = true;
          file.resume(); // Drain the stream
        });
        
        file.on('end', () => {
          if (!fileSizeExceeded) {
            fileBuffer = Buffer.concat(chunks);
          }
        });
        
        file.on('error', (err) => {
          uploadError = err;
        });
      });

      busboy.on('finish', async () => {
        if (uploadError) {
          return res.status(500).json({ error: "File processing error" });
        }

        if (fileSizeExceeded) {
          return res.status(400).json({ 
            error: "File too large for cloud upload. Maximum size is 500MB. Use P2P transfer for larger files.",
            maxSize: MAX_CLOUD_UPLOAD_SIZE
          });
        }

        if (!fileBuffer || !fileName) {
          return res.status(400).json({ error: "No file provided" });
        }

        const fileSize = fileBuffer.length;
        console.log(`Uploading file to B2: ${fileName} (${fileSize} bytes)`);
        
        const result = await b2Service.uploadFile(fileBuffer, fileName, contentType);
        
        // Clear buffer to help garbage collection
        fileBuffer = null;
        
        if (result.success && result.fileName) {
          // Create a permanent cloud upload record
          const cloudUpload = await storage.createCloudUpload({
            fileName: fileName,
            fileSize: fileSize,
            mimeType: contentType,
            storageKey: result.fileName,
            fileId: result.fileId || null,
          });

          // Record file in user's history if logged in
          const userId = req.session.userId;
          if (userId) {
            try {
              await storage.createUserFile({
                userId,
                fileName: fileName,
                fileSize: fileSize,
                mimeType: contentType,
                transferType: 'cloud_upload',
                direction: 'sent',
                code: cloudUpload.code,
              });
            } catch (err) {
              console.error("Failed to record user file:", err);
            }
          }

          res.json({
            success: true,
            code: cloudUpload.code,
            fileName: cloudUpload.fileName,
            fileId: result.fileId,
            storageKey: result.fileName,
          });
        } else {
          res.status(500).json({ 
            error: result.error || "Failed to upload file to cloud storage" 
          });
        }
      });

      busboy.on('error', (error) => {
        console.error('Busboy error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: "File upload processing failed" });
        }
      });

      req.pipe(busboy);
    } catch (error) {
      console.error("Cloud upload error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to upload file" });
      }
    }
  });

  // Get cloud upload info and download URL by permanent code
  app.get("/api/cloud/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      if (!code || code.length !== 8) {
        return res.status(400).json({ error: "Invalid cloud code format" });
      }

      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`cloud-download:${clientIP}`, 30, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      const cloudUpload = await storage.getCloudUploadByCode(code.toUpperCase());
      
      if (!cloudUpload) {
        return res.status(404).json({ error: "Cloud file not found" });
      }

      if (!b2Service.isEnabled()) {
        return res.status(503).json({ error: "Cloud storage is not configured" });
      }

      // Get download authorization from B2
      const downloadAuth = await b2Service.getDownloadAuthorization(
        cloudUpload.fileId || '',
        cloudUpload.storageKey,
        86400 // 24 hours validity
      );

      if (!downloadAuth) {
        return res.status(500).json({ error: "Failed to generate download URL" });
      }

      // Increment download count
      await storage.incrementCloudDownloadCount(cloudUpload.id);

      // Record download in user's history if logged in
      const userId = req.session.userId;
      if (userId) {
        try {
          await storage.createUserFile({
            userId,
            fileName: cloudUpload.fileName,
            fileSize: cloudUpload.fileSize,
            mimeType: cloudUpload.mimeType,
            transferType: 'cloud_download',
            direction: 'received',
            code: cloudUpload.code,
          });
        } catch (err) {
          console.error("Failed to record user file download:", err);
        }
      }

      res.json({
        code: cloudUpload.code,
        fileName: cloudUpload.fileName,
        fileSize: cloudUpload.fileSize,
        mimeType: cloudUpload.mimeType,
        downloadUrl: downloadAuth.downloadUrl,
        downloadCount: cloudUpload.downloadCount + 1,
        createdAt: cloudUpload.createdAt,
      });
    } catch (error) {
      console.error("Cloud download lookup error:", error);
      res.status(500).json({ error: "Failed to retrieve cloud file" });
    }
  });

  const registerSchema = z.object({
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    email: z.string().email(),
    password: z.string().min(6).max(100),
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`auth:${clientIP}`, 10, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      const parseResult = registerSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        });
      }

      const { username, email, password } = parseResult.data;

      // Normalize case before checking for duplicates
      const normalizedEmail = email.toLowerCase();
      const normalizedUsername = username.toLowerCase();

      const isBlocked = await storage.isEmailBlocked(normalizedEmail);
      if (isBlocked) {
        return res.status(400).json({ error: "This email cannot be used for registration at this time. Please try again in a few days." });
      }

      const existingEmail = await storage.getUserByEmail(normalizedEmail);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const existingUsername = await storage.getUserByUsername(normalizedUsername);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
      });

      req.session.userId = user.id;

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`auth:${clientIP}`, 10, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      const parseResult = loginSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        });
      }

      const { email, password } = parseResult.data;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      req.session.userId = user.id;

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  const googleAuthSchema = z.object({
    credential: z.string().min(1),
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const rateLimit = checkRateLimit(`auth:${clientIP}`, 10, 60000);
      
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
      }

      const parseResult = googleAuthSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        });
      }

      const { credential } = parseResult.data;

      // Decode the JWT token (Google ID token)
      const parts = credential.split('.');
      if (parts.length !== 3) {
        return res.status(400).json({ error: "Invalid Google token format" });
      }

      let payload;
      try {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
        payload = JSON.parse(jsonPayload);
      } catch (e) {
        return res.status(400).json({ error: "Failed to decode Google token" });
      }

      // Verify the token issuer and audience
      const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        console.error("Google Client ID not configured");
        return res.status(500).json({ error: "Google authentication not configured" });
      }

      if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
        return res.status(400).json({ error: "Invalid token issuer" });
      }

      if (payload.aud !== googleClientId) {
        return res.status(400).json({ error: "Invalid token audience" });
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return res.status(400).json({ error: "Token has expired" });
      }

      const email = payload.email?.toLowerCase();
      const name = payload.name || payload.email?.split('@')[0];

      if (!email) {
        return res.status(400).json({ error: "Email not provided by Google" });
      }

      // Check if email is blocked
      const isBlocked = await storage.isEmailBlocked(email);
      if (isBlocked) {
        return res.status(400).json({ error: "This email cannot be used for authentication at this time." });
      }

      // Check if user exists
      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Create new user with Google auth (no password needed)
        const username = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
        let finalUsername = username;
        
        // Check if username exists and generate unique one
        let usernameExists = await storage.getUserByUsername(finalUsername);
        let counter = 1;
        while (usernameExists) {
          finalUsername = `${username}_${counter}`;
          usernameExists = await storage.getUserByUsername(finalUsername);
          counter++;
        }

        // Create user with a random password hash (they'll use Google to login)
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        
        user = await storage.createUser({
          username: finalUsername,
          email: email,
          passwordHash: randomPassword,
        });
      }

      req.session.userId = user.id;

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
      });
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ error: "Failed to authenticate with Google" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
      });
    } catch (error) {
      console.error("Auth check error:", error);
      res.status(500).json({ error: "Failed to check authentication" });
    }
  });

  app.patch("/api/account/profile", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { username, email } = req.body;
      
      if (!username || !email) {
        return res.status(400).json({ error: "Username and email are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: "Email already in use" });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername && existingUsername.id !== userId) {
        return res.status(400).json({ error: "Username already in use" });
      }

      await storage.updateUser(userId, { username, email });
      
      res.json({ success: true, username, email });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/account/change-password", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, newPasswordHash);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.delete("/api/account", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password confirmation is required" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ error: "Incorrect password" });
      }

      await storage.addDeletedEmail(user.email);
      await storage.deleteUser(userId);

      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error during account deletion:", err);
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  app.get("/api/account/storage", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const files = await storage.getUserFiles(userId, 1000);
      const used = files.reduce((acc, f) => acc + f.fileSize, 0);
      const total = 500 * 1024 * 1024;
      
      res.json({
        used,
        total,
        fileCount: files.length,
      });
    } catch (error) {
      console.error("Storage usage error:", error);
      res.status(500).json({ error: "Failed to get storage usage" });
    }
  });

  app.get("/api/account/stats", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(userId);
      const files = await storage.getUserFiles(userId, 1000);
      
      const totalTransfers = files.length;
      const totalBytesTransferred = files.reduce((acc, f) => acc + f.fileSize, 0);
      
      res.json({
        totalTransfers,
        totalBytesTransferred,
        joinedDate: user?.createdAt || new Date().toISOString(),
      });
    } catch (error) {
      console.error("Account stats error:", error);
      res.status(500).json({ error: "Failed to get account stats" });
    }
  });

  app.get("/api/account/sessions", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      res.json([]);
    } catch (error) {
      console.error("Sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  app.delete("/api/account/sessions/:sessionId", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Session revoke error:", error);
      res.status(500).json({ error: "Failed to revoke session" });
    }
  });

  app.get("/api/user/files", async (req, res) => {
    try {
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const files = await storage.getUserFiles(userId, 100);
      res.json(files);
    } catch (error) {
      console.error("User files error:", error);
      res.status(500).json({ error: "Failed to retrieve user files" });
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
                code: code,
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
            
            // Store sender's userId if provided in the message
            if (typeof message.userId === 'number' && message.userId > 0) {
              room.senderUserId = message.userId;
            }
            
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
                code: code,
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
                userId: (typeof message.userId === 'number' && message.userId > 0) ? message.userId : undefined,
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
              // Store receiver's userId if provided in the message
              if (typeof message.userId === 'number' && message.userId > 0) {
                room.receiverUserId = message.userId;
              }
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
                  
                  // Record file for receiver in multi-share P2P transfer
                  if (receiverInfo.userId) {
                    try {
                      await storage.createUserFile({
                        userId: receiverInfo.userId,
                        fileName: room.fileName,
                        fileSize: room.fileSize,
                        mimeType: room.mimeType,
                        transferType: 'p2p',
                        direction: 'received',
                        code: room.code,
                        status: 'completed',
                      });
                    } catch (err) {
                      console.error("Failed to record P2P multi-share receiver file:", err);
                    }
                  }
                }
                ws.send(JSON.stringify({ type: "transfer-complete" }));
              }
            } else {
              await storage.markSessionCompleted(room.sessionId);
              
              // Record files for sender and receiver in single P2P transfer
              if (room.senderUserId) {
                try {
                  await storage.createUserFile({
                    userId: room.senderUserId,
                    fileName: room.fileName,
                    fileSize: room.fileSize,
                    mimeType: room.mimeType,
                    transferType: 'p2p',
                    direction: 'sent',
                    code: room.code,
                    status: 'completed',
                  });
                } catch (err) {
                  console.error("Failed to record P2P sender file:", err);
                }
              }
              
              if (room.receiverUserId) {
                try {
                  await storage.createUserFile({
                    userId: room.receiverUserId,
                    fileName: room.fileName,
                    fileSize: room.fileSize,
                    mimeType: room.mimeType,
                    transferType: 'p2p',
                    direction: 'received',
                    code: room.code,
                    status: 'completed',
                  });
                } catch (err) {
                  console.error("Failed to record P2P receiver file:", err);
                }
              }

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
            
            // Record file for sender in multi-share P2P transfer (if at least one receiver completed)
            const completedReceivers = Array.from(room.receivers.values()).filter(r => r.transferComplete);
            if (room.senderUserId && completedReceivers.length > 0) {
              try {
                await storage.createUserFile({
                  userId: room.senderUserId,
                  fileName: room.fileName,
                  fileSize: room.fileSize,
                  mimeType: room.mimeType,
                  transferType: 'p2p',
                  direction: 'sent',
                  code: room.code,
                  status: 'completed',
                });
              } catch (err) {
                console.error("Failed to record P2P multi-share sender file:", err);
              }
            }

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

  // Temp Mail API Proxy Routes (Mail.tm)
  const MAIL_TM_API = 'https://api.mail.tm';

  app.get("/api/tempmail/domains", async (_req, res) => {
    try {
      const response = await fetch(`${MAIL_TM_API}/domains`);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch domains' });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Temp mail domains error:', error);
      res.status(500).json({ error: 'Failed to fetch domains' });
    }
  });

  app.post("/api/tempmail/accounts", async (req, res) => {
    try {
      const { address, password } = req.body;
      
      if (!address || !password) {
        return res.status(400).json({ error: 'Address and password are required' });
      }

      const response = await fetch(`${MAIL_TM_API}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Temp mail account creation error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  app.post("/api/tempmail/token", async (req, res) => {
    try {
      const { address, password } = req.body;
      
      if (!address || !password) {
        return res.status(400).json({ error: 'Address and password are required' });
      }

      const response = await fetch(`${MAIL_TM_API}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Temp mail token error:', error);
      res.status(500).json({ error: 'Failed to get token' });
    }
  });

  app.get("/api/tempmail/messages", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const response = await fetch(`${MAIL_TM_API}/messages`, {
        headers: { 'Authorization': authHeader },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch messages' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Temp mail messages error:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get("/api/tempmail/messages/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const response = await fetch(`${MAIL_TM_API}/messages/${id}`, {
        headers: { 'Authorization': authHeader },
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch message' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Temp mail message detail error:', error);
      res.status(500).json({ error: 'Failed to fetch message' });
    }
  });

  app.delete("/api/tempmail/messages/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const response = await fetch(`${MAIL_TM_API}/messages/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader },
      });
      
      if (response.ok || response.status === 204) {
        res.status(204).send();
      } else {
        res.status(response.status).json({ error: 'Failed to delete message' });
      }
    } catch (error) {
      console.error('Temp mail message delete error:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  return httpServer;
}
