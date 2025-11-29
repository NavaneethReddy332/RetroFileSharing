import B2 from 'backblaze-b2';
import { Readable, PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

interface B2Config {
  applicationKeyId: string;
  applicationKey: string;
  bucketId: string;
  bucketName: string;
}

export interface UploadProgressEvent {
  type: 'progress' | 'complete' | 'error';
  percent?: number;
  message?: string;
  error?: string;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  uploadedBytes: number;
  sha1?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        throw error;
      }
      
      if (attempt < retries) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        console.log(`[B2] Retry ${attempt + 1}/${retries} after ${backoffDelay}ms`);
        await sleep(backoffDelay);
      }
    }
  }
  
  throw lastError;
}

class BackblazeService {
  private b2: B2;
  private config: B2Config;
  private authorizationToken: string | null = null;
  private downloadUrl: string | null = null;
  private apiUrl: string | null = null;
  private authExpiresAt: number = 0;

  constructor(config: B2Config) {
    this.config = config;
    this.b2 = new B2({
      applicationKeyId: config.applicationKeyId,
      applicationKey: config.applicationKey,
    });
  }

  async authorize(): Promise<void> {
    try {
      const response = await this.b2.authorize();
      this.authorizationToken = response.data.authorizationToken;
      this.downloadUrl = response.data.downloadUrl;
      this.apiUrl = response.data.apiUrl;
      this.authExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    } catch (error) {
      console.error('Backblaze authorization error:', error);
      throw new Error('Failed to authorize with Backblaze');
    }
  }

  async ensureAuthorized(): Promise<void> {
    if (!this.authorizationToken || Date.now() >= this.authExpiresAt) {
      await this.authorize();
    }
  }

  async getUploadUrlForBrowser(): Promise<{ uploadUrl: string; authToken: string; bucketId: string }> {
    await this.ensureAuthorized();

    try {
      const uploadUrlResponse = await withRetry(() => 
        this.b2.getUploadUrl({ bucketId: this.config.bucketId })
      );

      return {
        uploadUrl: uploadUrlResponse.data.uploadUrl,
        authToken: uploadUrlResponse.data.authorizationToken,
        bucketId: this.config.bucketId,
      };
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.getUploadUrlForBrowser();
      }
      console.error('Backblaze get upload URL error:', error);
      throw new Error('Failed to get upload URL from Backblaze');
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    contentType: string,
    progressEmitter?: EventEmitter
  ): Promise<UploadResult> {
    await this.ensureAuthorized();

    try {
      const sha1Hash = createHash('sha1').update(fileBuffer).digest('hex');
      const totalSize = fileBuffer.length;

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 50 });
      }

      const uploadUrlResponse = await withRetry(() => 
        this.b2.getUploadUrl({ bucketId: this.config.bucketId })
      );

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 55 });
      }

      const headers: Record<string, string> = {
        'Authorization': uploadUrlResponse.data.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': totalSize.toString(),
        'X-Bz-Content-Sha1': sha1Hash,
      };

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 60 });
      }

      const response = await withRetry(async () => {
        const res = await fetch(uploadUrlResponse.data.uploadUrl, {
          method: 'POST',
          headers: headers,
          body: fileBuffer,
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`B2 upload failed: ${res.status} ${errorText}`);
        }
        
        return res;
      });

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 90 });
      }

      const result = await response.json();

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 100 });
        progressEmitter.emit('progress', { type: 'complete' });
      }

      return {
        fileId: result.fileId,
        fileName: result.fileName,
        uploadedBytes: totalSize,
        sha1: sha1Hash,
      };
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.uploadFile(fileBuffer, fileName, contentType, progressEmitter);
      }
      console.error('Backblaze upload error:', error);
      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'error', error: 'Failed to upload file to Backblaze' });
      }
      throw new Error('Failed to upload file to Backblaze');
    }
  }

  async uploadLargeFile(
    fileStream: NodeJS.ReadableStream,
    fileName: string,
    contentType: string,
    fileSize: number,
    progressEmitter?: EventEmitter
  ): Promise<UploadResult> {
    await this.ensureAuthorized();

    try {
      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 0 });
      }

      const startResponse = await withRetry(() => 
        this.b2.startLargeFile({
          bucketId: this.config.bucketId,
          fileName: fileName,
          contentType: contentType || 'application/octet-stream',
        })
      );

      const fileId = startResponse.data.fileId;
      const partSize = 10 * 1024 * 1024;
      const maxConcurrentUploads = 6;
      
      let currentPart: Buffer[] = [];
      let currentPartSize = 0;
      let totalRead = 0;
      let totalUploaded = 0;
      
      const partsToUpload: { partNumber: number; buffer: Buffer }[] = [];
      const uploadedParts: { partNumber: number; sha1: string }[] = [];
      let nextPartNumber = 1;

      let uploadCancelled = false;

      const cancelUpload = async () => {
        if (!uploadCancelled) {
          uploadCancelled = true;
          try {
            await this.b2.cancelLargeFile({ fileId });
          } catch (cancelError) {
            console.error('Failed to cancel large file upload:', cancelError);
          }
        }
      };

      const uploadPart = async (partNumber: number, partBuffer: Buffer): Promise<{ partNumber: number; sha1: string }> => {
        return await withRetry(async () => {
          const uploadUrlResponse = await this.b2.getUploadPartUrl({ fileId });
          const sha1 = createHash('sha1').update(partBuffer).digest('hex');

          const partResponse = await fetch(uploadUrlResponse.data.uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization': uploadUrlResponse.data.authorizationToken,
              'X-Bz-Part-Number': partNumber.toString(),
              'Content-Length': partBuffer.length.toString(),
              'X-Bz-Content-Sha1': sha1,
            },
            body: partBuffer,
          });

          if (!partResponse.ok) {
            const errorText = await partResponse.text();
            throw new Error(`B2 part ${partNumber} upload failed: ${partResponse.status} ${errorText}`);
          }

          totalUploaded += partBuffer.length;
          if (progressEmitter) {
            const percent = Math.min(99, Math.floor((totalUploaded / fileSize) * 100));
            progressEmitter.emit('progress', { type: 'progress', percent });
          }

          return { partNumber, sha1 };
        });
      };

      const uploadBatch = async (parts: { partNumber: number; buffer: Buffer }[]): Promise<void> => {
        try {
          const results = await Promise.all(
            parts.map(p => uploadPart(p.partNumber, p.buffer))
          );
          uploadedParts.push(...results);
        } catch (batchError) {
          await cancelUpload();
          throw batchError;
        }
      };

      for await (const chunk of fileStream as any) {
        currentPart.push(chunk);
        currentPartSize += chunk.length;
        totalRead += chunk.length;

        if (currentPartSize >= partSize) {
          const partBuffer = Buffer.concat(currentPart);
          partsToUpload.push({ partNumber: nextPartNumber, buffer: partBuffer });
          nextPartNumber++;
          currentPart = [];
          currentPartSize = 0;

          if (partsToUpload.length >= maxConcurrentUploads) {
            const batch = partsToUpload.splice(0, maxConcurrentUploads);
            await uploadBatch(batch);
          }
        }
      }

      if (currentPart.length > 0) {
        const partBuffer = Buffer.concat(currentPart);
        partsToUpload.push({ partNumber: nextPartNumber, buffer: partBuffer });
      }

      while (partsToUpload.length > 0) {
        const batch = partsToUpload.splice(0, maxConcurrentUploads);
        await uploadBatch(batch);
      }

      uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
      const sha1Array = uploadedParts.map(p => p.sha1);

      const finishResponse = await withRetry(() => 
        this.b2.finishLargeFile({
          fileId: fileId,
          partSha1Array: sha1Array,
        })
      );

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 100 });
        progressEmitter.emit('progress', { type: 'complete' });
      }

      return {
        fileId: finishResponse.data.fileId,
        fileName: finishResponse.data.fileName,
        uploadedBytes: totalRead,
      };
    } catch (error: any) {
      console.error('Backblaze large file upload error:', error);
      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'error', error: 'Failed to upload large file to Backblaze' });
      }
      throw new Error('Failed to upload large file to Backblaze');
    }
  }

  async downloadFile(fileName: string): Promise<Buffer> {
    await this.ensureAuthorized();

    try {
      const response = await withRetry(() => 
        this.b2.downloadFileByName({
          bucketName: this.config.bucketName,
          fileName: fileName,
        })
      );

      return Buffer.from(response.data as ArrayBuffer);
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.downloadFile(fileName);
      }
      console.error('Backblaze download error:', error);
      throw new Error('Failed to download file from Backblaze');
    }
  }

  async downloadFileStream(fileName: string): Promise<NodeJS.ReadableStream> {
    await this.ensureAuthorized();

    try {
      const response = await withRetry(() => 
        this.b2.downloadFileByName({
          bucketName: this.config.bucketName,
          fileName: fileName,
          responseType: 'stream',
        })
      );

      return response.data as any;
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.downloadFileStream(fileName);
      }
      console.error('Backblaze download stream error:', error);
      throw new Error('Failed to download file stream from Backblaze');
    }
  }

  async downloadFileRange(fileName: string, start: number, end: number): Promise<{ stream: NodeJS.ReadableStream; contentLength: number }> {
    await this.ensureAuthorized();

    if (!this.downloadUrl) {
      throw new Error('Not authorized with Backblaze');
    }

    const url = `${this.downloadUrl}/file/${this.config.bucketName}/${encodeURIComponent(fileName)}`;
    
    try {
      const response = await withRetry(async () => {
        const res = await fetch(url, {
          headers: {
            'Authorization': this.authorizationToken!,
            'Range': `bytes=${start}-${end}`,
          },
        });
        
        if (!res.ok && res.status !== 206) {
          throw new Error(`B2 range download failed: ${res.status}`);
        }
        
        return res;
      });

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      
      const nodeStream = new PassThrough();
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('No response body');
      }

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              nodeStream.end();
              break;
            }
            nodeStream.write(Buffer.from(value));
          }
        } catch (error) {
          nodeStream.destroy(error as Error);
        }
      })();

      return { stream: nodeStream, contentLength };
    } catch (error: any) {
      if (error?.message?.includes('401') || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.downloadFileRange(fileName, start, end);
      }
      console.error('Backblaze range download error:', error);
      throw new Error('Failed to download file range from Backblaze');
    }
  }

  async deleteFile(fileName: string, fileId: string): Promise<void> {
    await this.ensureAuthorized();

    try {
      await withRetry(() => 
        this.b2.deleteFileVersion({
          fileId: fileId,
          fileName: fileName,
        })
      );
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.deleteFile(fileName, fileId);
      }
      console.error('Backblaze delete error:', error);
      throw new Error('Failed to delete file from Backblaze');
    }
  }

  async getFileInfo(fileId: string): Promise<any> {
    await this.ensureAuthorized();

    try {
      const response = await withRetry(() => 
        this.b2.getFileInfo({ fileId })
      );
      return response.data;
    } catch (error) {
      console.error('Backblaze file info error:', error);
      throw new Error('Failed to get file info from Backblaze');
    }
  }

  getDownloadUrl(fileName: string): string {
    if (!this.downloadUrl) {
      throw new Error('Not authorized with Backblaze');
    }
    return `${this.downloadUrl}/file/${this.config.bucketName}/${fileName}`;
  }

  async getDownloadAuthorization(fileName: string, validDurationInSeconds: number = 3600): Promise<string> {
    await this.ensureAuthorized();

    if (!this.apiUrl) {
      throw new Error('Not authorized with Backblaze');
    }

    try {
      const response = await withRetry(async () => {
        const res = await fetch(`${this.apiUrl}/b2api/v2/b2_get_download_authorization`, {
          method: 'POST',
          headers: {
            'Authorization': this.authorizationToken!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bucketId: this.config.bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: validDurationInSeconds,
          }),
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`B2 download authorization failed: ${errorText}`);
        }
        
        return res;
      });

      const data = await response.json();
      return data.authorizationToken;
    } catch (error: any) {
      console.error('Backblaze download authorization error:', error);
      throw new Error('Failed to get download authorization from Backblaze');
    }
  }

  getAuthorizedDownloadUrl(fileName: string, authToken: string): string {
    if (!this.downloadUrl) {
      throw new Error('Not authorized with Backblaze');
    }
    return `${this.downloadUrl}/file/${this.config.bucketName}/${fileName}?Authorization=${authToken}`;
  }
}

const backblazeConfig: B2Config = {
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID || '',
  applicationKey: process.env.B2_APPLICATION_KEY || '',
  bucketId: process.env.B2_BUCKET_ID || '',
  bucketName: process.env.B2_BUCKET_NAME || '',
};

if (!backblazeConfig.applicationKeyId || !backblazeConfig.applicationKey || 
    !backblazeConfig.bucketId || !backblazeConfig.bucketName) {
  console.warn('Backblaze credentials not configured. File uploads will fail.');
}

export const backblazeService = new BackblazeService(backblazeConfig);
