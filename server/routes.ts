import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { backblazeService, formatFileSize } from "./backblaze";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { insertGuestbookEntrySchema } from "@shared/schema";
import Busboy from "busboy";
import { EventEmitter } from "events";
import archiver from "archiver";
import { PassThrough, Readable, Transform } from "stream";
import { createWriteStream, createReadStream, unlink, stat, readFileSync } from "fs";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { 
  passwordVerificationLimiter, 
  downloadLimiter, 
  uploadLimiter, 
  codeLookupLimiter 
} from "./middleware/rateLimiter";
import { validateFile } from "./middleware/fileValidation";
import { validateExpirationHours } from "./middleware/expirationValidator";

const unlinkAsync = promisify(unlink);
const statAsync = promisify(stat);

interface TempFileInfo {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
}

const uploadProgressEmitters = new Map<string, EventEmitter>();
const pendingCodes = new Set<string>();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function generateUniqueCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const code = generateCode();
    
    if (pendingCodes.has(code)) {
      attempts++;
      continue;
    }
    
    pendingCodes.add(code);
    
    try {
      const existingFile = await storage.getFileByCode(code);
      if (!existingFile) {
        return code;
      }
    } finally {
      if (attempts >= maxAttempts - 1) {
        pendingCodes.delete(code);
      }
    }
    
    pendingCodes.delete(code);
    attempts++;
  }
  
  throw new Error('Failed to generate unique code');
}

function releaseCode(code: string): void {
  pendingCodes.delete(code);
}

async function cleanupTempFiles(files: TempFileInfo[]): Promise<void> {
  for (const file of files) {
    try {
      await unlinkAsync(file.path);
    } catch (err) {
    }
  }
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
    let isAborted = false;
    let b2UploadInProgress = false;
    const formFields: Record<string, string> = {};
    const tempFiles: TempFileInfo[] = [];
    const allTempPaths: string[] = [];
    let code: string | null = null;
    let totalBytesReceived = 0;
    const fileWritePromises: Promise<void>[] = [];
    
    const cleanupAllTempFiles = async () => {
      for (const path of allTempPaths) {
        try {
          await unlinkAsync(path);
        } catch (err) {}
      }
    };
    
    req.on('aborted', async () => {
      isAborted = true;
      if (!b2UploadInProgress) {
        await cleanupAllTempFiles();
      }
      if (code) releaseCode(code);
    });
    
    req.on('close', async () => {
      if (!uploadComplete && !isAborted && !b2UploadInProgress) {
        await cleanupAllTempFiles();
        if (code) releaseCode(code);
      }
    });
    
    busboy.on('field', (fieldname, value) => {
      formFields[fieldname] = value;
    });
    
    busboy.on('file', async (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const tempPath = join(tmpdir(), `upload-${Date.now()}-${randomBytes(8).toString('hex')}`);
      allTempPaths.push(tempPath);
      
      const writeStream = createWriteStream(tempPath);
      
      let fileSize = 0;
      const totalSize = parseInt(formFields.totalSize || '0');
      
      const writePromise = new Promise<void>((resolve, reject) => {
        const cleanup = async () => {
          try {
            writeStream.destroy();
            await unlinkAsync(tempPath);
          } catch (err) {}
        };
        
        fileStream.on('data', (chunk: Buffer) => {
          if (isAborted) return;
          fileSize += chunk.length;
          totalBytesReceived += chunk.length;
          
          if (totalSize > 0 && progressEmitter) {
            const percent = Math.min(45, Math.floor((totalBytesReceived / totalSize) * 45));
            progressEmitter.emit('progress', { type: 'progress', percent, stage: 'receiving' });
          }
        });
        
        fileStream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          if (isAborted) {
            cleanup().then(() => reject(new Error('Upload aborted')));
            return;
          }
          tempFiles.push({
            path: tempPath,
            filename,
            mimeType: mimeType || 'application/octet-stream',
            size: fileSize,
          });
          resolve();
        });
        
        writeStream.on('error', async (err) => {
          await cleanup();
          reject(err);
        });
        
        fileStream.on('error', async (err) => {
          await cleanup();
          reject(err);
        });
      });
      
      fileWritePromises.push(writePromise);
    });

    busboy.on('finish', async () => {
      if (isAborted) return;
      
      b2UploadInProgress = true;
      
      try {
        await Promise.all(fileWritePromises);
        
        const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;
        
        if (tempFiles.length === 0) {
          b2UploadInProgress = false;
          await cleanupAllTempFiles();
          if (progressEmitter) {
            progressEmitter.emit('progress', { type: 'error', error: 'No files uploaded' });
          }
          res.status(400).json({ error: 'No files uploaded' });
          return;
        }
        
        for (const file of tempFiles) {
          const validation = validateFile(file.filename, file.mimeType, file.size);
          if (!validation.valid) {
            b2UploadInProgress = false;
            await cleanupAllTempFiles();
            if (progressEmitter) {
              progressEmitter.emit('progress', { type: 'error', error: validation.error });
            }
            res.status(400).json({ error: validation.error });
            return;
          }
        }
        
        try {
          code = await generateUniqueCode();
        } catch (codeError) {
          b2UploadInProgress = false;
          await cleanupAllTempFiles();
          if (progressEmitter) {
            progressEmitter.emit('progress', { type: 'error', error: 'Failed to generate unique code' });
          }
          res.status(500).json({ error: 'Failed to generate unique code' });
          return;
        }

        const expiresInHours = validateExpirationHours(formFields.expiresIn);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);

        let finalStream: NodeJS.ReadableStream | null = null;
        let fileBuffer: Buffer | null = null;
        let finalFilename: string;
        let finalMimeType: string;
        let originalDisplayName: string;
        let fileSize: number;
        let tempZipPath: string | null = null;
        
        if (tempFiles.length > 1) {
          console.log(`[UPLOAD] Creating streaming ZIP archive for ${tempFiles.length} files`);
          
          if (progressEmitter) {
            progressEmitter.emit('progress', { type: 'progress', percent: 50, stage: 'compressing' });
          }
          
          tempZipPath = join(tmpdir(), `zip-${Date.now()}-${randomBytes(8).toString('hex')}.zip`);
          allTempPaths.push(tempZipPath);
          const zipWriteStream = createWriteStream(tempZipPath);
          const archive = archiver('zip', { zlib: { level: 6 } });
          
          await new Promise<void>((resolve, reject) => {
            archive.on('error', reject);
            archive.on('warning', (err: any) => {
              if (err.code !== 'ENOENT') {
                console.warn('[ZIP] Warning:', err);
              }
            });
            
            zipWriteStream.on('finish', resolve);
            zipWriteStream.on('error', reject);
            
            archive.pipe(zipWriteStream);
            
            for (const file of tempFiles) {
              archive.append(createReadStream(file.path), { name: file.filename });
            }
            
            archive.finalize();
          });
          
          await cleanupTempFiles(tempFiles);
          
          const zipStats = await statAsync(tempZipPath);
          fileSize = zipStats.size;
          
          originalDisplayName = `archive-${tempFiles.length}-files.zip`;
          finalFilename = `${Date.now()}-${randomBytes(8).toString('hex')}-${originalDisplayName}`;
          finalMimeType = 'application/zip';
          
          if (fileSize < LARGE_FILE_THRESHOLD) {
            fileBuffer = readFileSync(tempZipPath);
          } else {
            finalStream = createReadStream(tempZipPath);
          }
          
          console.log(`[UPLOAD] ZIP created: ${formatFileSize(fileSize)}`);
        } else {
          const file = tempFiles[0];
          fileSize = file.size;
          originalDisplayName = file.filename;
          finalFilename = `${Date.now()}-${randomBytes(8).toString('hex')}-${file.filename}`;
          finalMimeType = file.mimeType;
          
          if (fileSize < LARGE_FILE_THRESHOLD) {
            try {
              fileBuffer = readFileSync(file.path);
              console.log(`[UPLOAD] File read into memory: ${formatFileSize(fileBuffer.length)}`);
            } catch (readError: any) {
              console.error('[UPLOAD] Failed to read temp file:', readError.message);
              b2UploadInProgress = false;
              await cleanupAllTempFiles();
              if (code) releaseCode(code);
              if (progressEmitter) {
                progressEmitter.emit('progress', { type: 'error', error: 'Failed to read uploaded file' });
              }
              res.status(500).json({ error: 'Failed to read uploaded file' });
              return;
            }
          } else {
            finalStream = createReadStream(file.path);
          }
        }
        
        await cleanupAllTempFiles();
        
        console.log(`[UPLOAD] ${formatFileSize(fileSize)} | ${fileSize >= LARGE_FILE_THRESHOLD ? 'Large File API' : 'Standard'}`);
        
        let b2Upload;
        
        try {
          if (fileSize >= LARGE_FILE_THRESHOLD) {
            b2Upload = await backblazeService.uploadLargeFile(
              finalStream!,
              finalFilename,
              finalMimeType,
              fileSize,
              progressEmitter
            );
          } else {
            b2Upload = await backblazeService.uploadFile(
              fileBuffer!,
              finalFilename,
              finalMimeType,
              progressEmitter
            );
          }
        } catch (uploadError: any) {
          b2UploadInProgress = false;
          console.error('[UPLOAD] B2 upload failed:', uploadError.message);
          if (code) releaseCode(code);
          if (progressEmitter) {
            progressEmitter.emit('progress', { type: 'error', error: 'Failed to upload to storage' });
          }
          res.status(500).json({ error: 'Failed to upload to storage' });
          return;
        }
        
        b2UploadInProgress = false;

        console.log(`[UPLOAD] Complete: ${formatFileSize(b2Upload.uploadedBytes)}`);

        const { password, maxDownloads, isOneTime } = formFields;
        
        let passwordHash = null;
        let isPasswordProtected = 0;
        
        if (password && password.trim() !== "") {
          passwordHash = await bcrypt.hash(password, 10);
          isPasswordProtected = 1;
        }

        try {
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

          releaseCode(code);
          uploadComplete = true;
          
          res.json({
            code: dbFile.code,
            originalName: dbFile.originalName,
            size: dbFile.size,
            expiresAt: dbFile.expiresAt,
            isPasswordProtected: dbFile.isPasswordProtected,
            maxDownloads: dbFile.maxDownloads,
            isOneTime: dbFile.isOneTime,
            fileCount: tempFiles.length > 0 ? tempFiles.length : 1,
          });
        } catch (dbError: any) {
          console.error('[UPLOAD] Database error, cleaning up B2 file:', dbError.message);
          releaseCode(code);
          
          try {
            await backblazeService.deleteFile(finalFilename, b2Upload.fileId);
            console.log('[UPLOAD] Orphaned B2 file cleaned up');
          } catch (cleanupError) {
            console.error('[UPLOAD] Failed to cleanup orphaned B2 file:', cleanupError);
          }
          
          if (progressEmitter) {
            progressEmitter.emit('progress', { type: 'error', error: 'Failed to save file metadata' });
          }
          res.status(500).json({ error: 'Failed to save file metadata' });
        }
      } catch (error: any) {
        await cleanupAllTempFiles();
        if (code) releaseCode(code);
        
        if (!uploadComplete && !isAborted) {
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

    busboy.on('error', async (error: any) => {
      await cleanupAllTempFiles();
      if (code) releaseCode(code);
      console.error('[UPLOAD] Busboy error:', error);
      if (!uploadComplete && !isAborted) {
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

      return res.redirect(302, `/download/${code}`);
    } catch (error) {
      console.error("Direct download redirect error:", error);
      res.status(500).send("<h1>Error</h1><p>An error occurred while processing your request.</p>");
    }
  });

  app.post("/api/download/:code", downloadLimiter, async (req, res) => {
    const startTime = Date.now();
    let downloadCountIncremented = false;
    let fileRef: any = null;
    
    try {
      const { code } = req.params;
      const { password } = req.body;
      const rangeHeader = req.headers.range;
      
      const file = await storage.getFileByCode(code);
      fileRef = file;

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

      const currentDownloadCount = await storage.atomicIncrementDownloadCount(file.id);
      downloadCountIncremented = true;

      console.log(`[DOWNLOAD] ${formatFileSize(file.size)}`);
      
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
          
          if (start >= file.size || end >= file.size || start > end) {
            res.status(416).json({ error: "Range not satisfiable" });
            return;
          }
          
          try {
            const { stream: rangeStream, contentLength } = await backblazeService.downloadFileRange(
              file.filename,
              start,
              end
            );
            
            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Content-Length", contentLength);
            res.setHeader("Content-Type", file.mimetype);
            res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
            res.setHeader("Cache-Control", "no-cache");
            
            rangeStream.pipe(res);
            
            rangeStream.on('end', () => {
              const duration = Date.now() - startTime;
              console.log(`[DOWNLOAD] Range complete: bytes ${start}-${end} in ${(duration / 1000).toFixed(1)}s`);
            });
            
            rangeStream.on('error', async (error) => {
              console.error(`[DOWNLOAD] Range stream error:`, error);
              if (!res.headersSent) {
                res.status(500).json({ error: "Download stream failed" });
              }
            });
            
            return;
          } catch (rangeError) {
            console.error(`[DOWNLOAD] Range download failed:`, rangeError);
          }
        }
      }
      
      let fileStream;
      try {
        fileStream = await backblazeService.downloadFileStream(file.filename);
      } catch (streamError) {
        console.error(`[DOWNLOAD] Failed to get stream from Backblaze:`, streamError);
        if (downloadCountIncremented) {
          await storage.atomicIncrementDownloadCount(file.id, -1);
        }
        return res.status(500).json({ error: "Failed to retrieve file from storage" });
      }
      
      res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
      res.setHeader("Content-Type", file.mimetype);
      res.setHeader("Content-Length", file.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "no-cache");
      
      let streamCompleted = false;
      let bytesTransferred = 0;
      
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
        if (!streamCompleted && downloadCountIncremented) {
          try {
            await storage.atomicIncrementDownloadCount(file.id, -1);
            console.log(`[DOWNLOAD] Rolled back download count due to stream error`);
          } catch (rollbackError) {
            console.error(`[DOWNLOAD] Failed to rollback download count:`, rollbackError);
          }
        }
        res.destroy();
      });

      res.on('close', async () => {
        if (!streamCompleted && res.writableEnded === false && downloadCountIncremented) {
          console.log(`[DOWNLOAD] Client disconnected before completion`);
          try {
            await storage.atomicIncrementDownloadCount(file.id, -1);
            console.log(`[DOWNLOAD] Rolled back download count due to client disconnect`);
          } catch (rollbackError) {
            console.error(`[DOWNLOAD] Failed to rollback download count:`, rollbackError);
          }
        }
      });

      fileStream.pipe(res);

      res.on('finish', async () => {
        if (streamCompleted && fileRef && (fileRef.isOneTime || (fileRef.maxDownloads && currentDownloadCount >= fileRef.maxDownloads))) {
          try {
            await storage.deleteFile(fileRef.id);
            if (fileRef.b2FileId) {
              await backblazeService.deleteFile(fileRef.filename, fileRef.b2FileId);
            }
            console.log(`[DOWNLOAD] File deleted after download: ${fileRef.originalName}`);
          } catch (deleteError) {
            console.error("File cleanup error:", deleteError);
          }
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DOWNLOAD] Failed after ${duration}ms:`, error);
      
      if (downloadCountIncremented && fileRef) {
        try {
          await storage.atomicIncrementDownloadCount(fileRef.id, -1);
        } catch (rollbackError) {
          console.error(`[DOWNLOAD] Failed to rollback download count:`, rollbackError);
        }
      }
      
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
