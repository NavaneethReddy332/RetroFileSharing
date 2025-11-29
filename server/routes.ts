import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { backblazeService, formatFileSize } from "./backblaze";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { insertGuestbookEntrySchema } from "@shared/schema";
import Busboy from "busboy";
import { EventEmitter } from "events";
import archiver from "archiver";
import { PassThrough } from "stream";
import { 
  passwordVerificationLimiter, 
  downloadLimiter, 
  uploadLimiter, 
  codeLookupLimiter 
} from "./middleware/rateLimiter";
import { validateFile } from "./middleware/fileValidation";
import { validateExpirationHours } from "./middleware/expirationValidator";

interface FileInfo {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

const uploadProgressEmitters = new Map<string, EventEmitter>();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/upload-progress/:uploadId", (req, res) => {
    const { uploadId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    res.write('data: {"type":"connected"}\n\n');
    
    const emitter = new EventEmitter();
    uploadProgressEmitters.set(uploadId, emitter);
    
    const progressListener = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    emitter.on('progress', progressListener);
    
    req.on('close', () => {
      emitter.off('progress', progressListener);
      uploadProgressEmitters.delete(uploadId);
    });
  });

  app.post("/api/upload", uploadLimiter, async (req, res) => {
    const startTime = Date.now();
    const uploadId = req.query.uploadId as string || randomBytes(16).toString('hex');
    const progressEmitter = uploadProgressEmitters.get(uploadId);
    
    const busboy = Busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 1024 * 1024 * 1024,
      }
    });
    
    let uploadComplete = false;
    const formFields: Record<string, string> = {};
    const collectedFiles: FileInfo[] = [];
    let fileProcessingPromise: Promise<void> | null = null;
    
    busboy.on('field', (fieldname, value) => {
      formFields[fieldname] = value;
    });
    
    busboy.on('file', async (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      collectedFiles.push({
        buffer,
        filename,
        mimeType: mimeType || 'application/octet-stream',
      });
    });

    busboy.on('finish', async () => {
      try {
        const fileCount = parseInt(formFields.fileCount || '1');
        const totalSize = parseInt(formFields.totalSize || '0');
        const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;
        
        if (collectedFiles.length === 0) {
          if (progressEmitter) {
            progressEmitter.emit('progress', { type: 'error', error: 'No files uploaded' });
          }
          res.status(400).json({ error: 'No files uploaded' });
          return;
        }
        
        for (const file of collectedFiles) {
          const validation = validateFile(file.filename, file.mimeType, file.buffer.length);
          if (!validation.valid) {
            if (progressEmitter) {
              progressEmitter.emit('progress', { type: 'error', error: validation.error });
            }
            res.status(400).json({ error: validation.error });
            return;
          }
        }
        
        let code = generateCode();
        let existingFile = await storage.getFileByCode(code);
        while (existingFile) {
          code = generateCode();
          existingFile = await storage.getFileByCode(code);
        }

        const expiresInHours = validateExpirationHours(formFields.expiresIn);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);

        let finalBuffer: Buffer;
        let finalFilename: string;
        let finalMimeType: string;
        let originalDisplayName: string;
        
        if (collectedFiles.length > 1) {
          console.log(`[UPLOAD] Creating ZIP archive for ${collectedFiles.length} files`);
          
          const { PassThrough } = await import('stream');
          
          const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 6 } });
            const passThrough = new PassThrough();
            const chunks: Buffer[] = [];
            
            passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
            passThrough.on('end', () => resolve(Buffer.concat(chunks)));
            passThrough.on('error', reject);
            
            archive.on('error', reject);
            archive.on('warning', (err: any) => {
              if (err.code !== 'ENOENT') {
                console.warn('[ZIP] Warning:', err);
              }
            });
            
            archive.pipe(passThrough);
            
            for (const file of collectedFiles) {
              archive.append(file.buffer, { name: file.filename });
            }
            
            archive.finalize();
          });
          
          finalBuffer = zipBuffer;
          originalDisplayName = `archive-${collectedFiles.length}-files.zip`;
          finalFilename = `${Date.now()}-${randomBytes(8).toString('hex')}-${originalDisplayName}`;
          finalMimeType = 'application/zip';
          
          console.log(`[UPLOAD] ZIP created: ${formatFileSize(zipBuffer.length)}`);
        } else {
          const file = collectedFiles[0];
          finalBuffer = file.buffer;
          originalDisplayName = file.filename;
          finalFilename = `${Date.now()}-${randomBytes(8).toString('hex')}-${file.filename}`;
          finalMimeType = file.mimeType;
        }
        
        const fileSize = finalBuffer.length;
        console.log(`[UPLOAD] ${formatFileSize(fileSize)} | ${fileSize >= LARGE_FILE_THRESHOLD ? 'Large File API' : 'Standard'}`);
        
        let b2Upload;
        
        if (fileSize >= LARGE_FILE_THRESHOLD) {
          const { Readable } = await import('stream');
          const bufferStream = Readable.from(finalBuffer);
          b2Upload = await backblazeService.uploadLargeFile(
            bufferStream,
            finalFilename,
            finalMimeType,
            fileSize,
            progressEmitter
          );
        } else {
          b2Upload = await backblazeService.uploadFile(
            finalBuffer,
            finalFilename,
            finalMimeType,
            progressEmitter
          );
        }

        console.log(`[UPLOAD] Complete: ${formatFileSize(b2Upload.uploadedBytes)}`);

        const { password, maxDownloads, isOneTime } = formFields;
        
        let passwordHash = null;
        let isPasswordProtected = 0;
        
        if (password && password.trim() !== "") {
          passwordHash = await bcrypt.hash(password, 10);
          isPasswordProtected = 1;
        }

        const dbFile = await storage.createFile({
          code,
          filename: finalFilename,
          originalName: originalDisplayName,
          size: fileSize,
          mimetype: finalMimeType,
          expiresAt,
          passwordHash,
          isPasswordProtected,
          maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
          isOneTime: isOneTime === 'true' ? 1 : 0,
          b2FileId: b2Upload.fileId,
        });

        uploadComplete = true;
        res.json({
          code: dbFile.code,
          originalName: dbFile.originalName,
          size: dbFile.size,
          expiresAt: dbFile.expiresAt,
          isPasswordProtected: dbFile.isPasswordProtected,
          maxDownloads: dbFile.maxDownloads,
          isOneTime: dbFile.isOneTime,
          fileCount: collectedFiles.length,
        });
      } catch (error: any) {
        if (!uploadComplete) {
          console.error(`[UPLOAD] Failed:`, error.message);
          
          const errorMessage = error.message || "Upload failed";
          const statusCode = error.message?.includes('1GB limit') ? 413 : 500;
          
          res.status(statusCode).json({ 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      }
    });

    busboy.on('error', (error: any) => {
      console.error('[UPLOAD] Busboy error:', error);
      if (!uploadComplete) {
        res.status(500).json({ error: "Upload stream error" });
      }
    });

    req.pipe(busboy);
  });

  app.get("/api/file/:code", codeLookupLimiter, async (req, res) => {
    try {
      const { code } = req.params;
      
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "Invalid code format" });
      }

      const file = await storage.getFileByCode(code);

      if (!file) {
        return res.status(404).json({ error: "File not found or expired" });
      }

      const remainingDownloads = file.maxDownloads 
        ? file.maxDownloads - file.downloadCount 
        : null;

      res.json({
        code: file.code,
        originalName: file.originalName,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: file.uploadedAt,
        expiresAt: file.expiresAt,
        isPasswordProtected: file.isPasswordProtected,
        downloadCount: file.downloadCount,
        maxDownloads: file.maxDownloads,
        remainingDownloads,
        isOneTime: file.isOneTime,
      });
    } catch (error) {
      console.error("File lookup error:", error);
      res.status(500).json({ error: "Failed to retrieve file information" });
    }
  });

  app.post("/api/file/:code/verify", passwordVerificationLimiter, async (req, res) => {
    try {
      const { code } = req.params;
      const { password } = req.body;

      const file = await storage.getFileByCode(code);

      if (!file) {
        return res.status(404).json({ error: "File not found or expired" });
      }

      if (!file.isPasswordProtected) {
        return res.json({ success: true });
      }

      if (!password) {
        return res.status(401).json({ error: "Password required" });
      }

      const isValid = await bcrypt.compare(password, file.passwordHash || "");
      
      if (!isValid) {
        return res.status(401).json({ error: "Incorrect password" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Password verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/file/:code/get-download-link", passwordVerificationLimiter, async (req, res) => {
    try {
      const { code } = req.params;
      const { password } = req.body;
      
      const file = await storage.getFileByCode(code);

      if (!file) {
        return res.status(404).json({ error: "File not found or expired" });
      }

      if (file.isPasswordProtected) {
        if (!password) {
          return res.status(401).json({ error: "Password required" });
        }
        const isValid = await bcrypt.compare(password, file.passwordHash || "");
        if (!isValid) {
          return res.status(401).json({ error: "Incorrect password" });
        }
      }

      if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
        return res.status(403).json({ error: "Download limit reached" });
      }

      const baseUrl = req.protocol + '://' + req.get('host');
      const downloadUrl = `${baseUrl}/download/${code}`;

      res.json({
        downloadUrl,
        filename: file.originalName,
        requiresPassword: file.isPasswordProtected === 1,
      });
    } catch (error) {
      console.error("Get download link error:", error);
      res.status(500).json({ error: "Failed to generate download link" });
    }
  });

  app.get("/api/download-direct/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      const file = await storage.getFileByCode(code);

      if (!file) {
        return res.status(404).send("<h1>404 - File Not Found</h1><p>This file may have expired or been deleted.</p>");
      }

      // Redirect all direct download links to the download center page
      // This prevents auto-downloading and lets users see file details first
      return res.redirect(302, `/download/${code}`);
    } catch (error) {
      console.error("Direct download redirect error:", error);
      res.status(500).send("<h1>Error</h1><p>An error occurred while processing your request.</p>");
    }
  });

  app.post("/api/download/:code", downloadLimiter, async (req, res) => {
    const startTime = Date.now();
    try {
      const { code } = req.params;
      const { password } = req.body;
      
      // Download started
      
      const file = await storage.getFileByCode(code);

      if (!file) {
        return res.status(404).json({ error: "File not found or expired" });
      }

      if (file.isPasswordProtected) {
        if (!password) {
          return res.status(401).json({ error: "Password required" });
        }
        const isValid = await bcrypt.compare(password, file.passwordHash || "");
        if (!isValid) {
          return res.status(401).json({ error: "Incorrect password" });
        }
      }

      if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
        return res.status(403).json({ error: "Download limit reached" });
      }

      // Increment download count BEFORE streaming
      await storage.incrementDownloadCount(file.id);
      const currentDownloadCount = file.downloadCount + 1;

      console.log(`[DOWNLOAD] ${formatFileSize(file.size)}`);
      
      let fileStream;
      try {
        fileStream = await backblazeService.downloadFileStream(file.filename);
      } catch (streamError) {
        console.error(`[DOWNLOAD] Failed to get stream from Backblaze:`, streamError);
        // Rollback download count if we can't get the stream
        await storage.incrementDownloadCount(file.id, -1);
        return res.status(500).json({ error: "Failed to retrieve file from storage" });
      }
      
      res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
      res.setHeader("Content-Type", file.mimetype);
      res.setHeader("Content-Length", file.size);
      res.setHeader("Cache-Control", "no-cache");
      
      let streamCompleted = false;
      let bytesTransferred = 0;
      
      // Track actual bytes transferred
      fileStream.on('data', (chunk: Buffer) => {
        bytesTransferred += chunk.length;
      });
      
      fileStream.on('end', () => {
        streamCompleted = true;
        const duration = Date.now() - startTime;
        console.log(`[DOWNLOAD] Complete: ${formatFileSize(bytesTransferred)} in ${(duration / 1000).toFixed(1)}s`);
      });

      fileStream.on('error', async (error) => {
        console.error(`[DOWNLOAD] Stream error:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download stream failed" });
        }
        // Rollback if stream failed before completion
        if (!streamCompleted) {
          try {
            await storage.incrementDownloadCount(file.id, -1);
            console.log(`[DOWNLOAD] Rolled back download count due to stream error`);
          } catch (rollbackError) {
            console.error(`[DOWNLOAD] Failed to rollback download count:`, rollbackError);
          }
        }
        res.destroy();
      });

      // Handle client disconnect
      res.on('close', async () => {
        if (!streamCompleted && res.writableEnded === false) {
          console.log(`[DOWNLOAD] Client disconnected before completion`);
          try {
            await storage.incrementDownloadCount(file.id, -1);
            console.log(`[DOWNLOAD] Rolled back download count due to client disconnect`);
          } catch (rollbackError) {
            console.error(`[DOWNLOAD] Failed to rollback download count:`, rollbackError);
          }
        }
      });

      fileStream.pipe(res);

      res.on('finish', async () => {
        if (streamCompleted && (file.isOneTime || (file.maxDownloads && currentDownloadCount >= file.maxDownloads))) {
          try {
            await storage.deleteFile(file.id);
            if (file.b2FileId) {
              await backblazeService.deleteFile(file.filename, file.b2FileId);
            }
            console.log(`[DOWNLOAD] File deleted after download: ${file.originalName}`);
          } catch (deleteError) {
            console.error("File cleanup error:", deleteError);
          }
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DOWNLOAD] Failed after ${duration}ms:`, error);
      res.status(500).json({ error: "Download failed" });
    }
  });

  app.get("/api/guestbook", async (req, res) => {
    try {
      const entries = await storage.getAllGuestbookEntries();
      res.json(entries);
    } catch (error) {
      console.error("Guestbook fetch error:", error);
      res.status(500).json({ error: "Failed to fetch guestbook entries" });
    }
  });

  app.post("/api/guestbook", async (req, res) => {
    try {
      const result = insertGuestbookEntrySchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: "Invalid guestbook entry data" });
      }

      const entry = await storage.createGuestbookEntry(result.data);
      res.json(entry);
    } catch (error) {
      console.error("Guestbook post error:", error);
      res.status(500).json({ error: "Failed to create guestbook entry" });
    }
  });

  const httpServer = createServer(app);
  
  httpServer.timeout = 600000;
  httpServer.keepAliveTimeout = 610000;
  httpServer.headersTimeout = 620000;

  return httpServer;
}
