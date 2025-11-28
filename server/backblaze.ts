import B2 from 'backblaze-b2';
import { Readable } from 'stream';
import { EventEmitter } from 'events';

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

class BackblazeService {
  private b2: B2;
  private config: B2Config;
  private authorizationToken: string | null = null;
  private downloadUrl: string | null = null;
  private apiUrl: string | null = null;

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
    } catch (error) {
      console.error('Backblaze authorization error:', error);
      throw new Error('Failed to authorize with Backblaze');
    }
  }

  async ensureAuthorized(): Promise<void> {
    if (!this.authorizationToken) {
      await this.authorize();
    }
  }

  async getUploadUrlForBrowser(): Promise<{ uploadUrl: string; authToken: string; bucketId: string }> {
    await this.ensureAuthorized();

    try {
      const uploadUrlResponse = await this.b2.getUploadUrl({
        bucketId: this.config.bucketId,
      });

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
  ): Promise<{ fileId: string; fileName: string }> {
    await this.ensureAuthorized();

    try {
      const uploadUrlResponse = await this.b2.getUploadUrl({
        bucketId: this.config.bucketId,
      });

      const totalSize = fileBuffer.length;
      const startTime = Date.now();

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 0 });
      }

      const progressInterval = setInterval(() => {
        const currentProgress = Math.min(95, (Date.now() - startTime) / 100);
        if (progressEmitter) {
          progressEmitter.emit('progress', { type: 'progress', percent: Math.floor(currentProgress) });
        }
      }, 200);

      const headers: Record<string, string> = {
        'Authorization': uploadUrlResponse.data.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': totalSize.toString(),
        'X-Bz-Content-Sha1': 'do_not_verify',
      };

      const response = await fetch(uploadUrlResponse.data.uploadUrl, {
        method: 'POST',
        headers: headers,
        body: fileBuffer,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`B2 upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 100 });
        progressEmitter.emit('progress', { type: 'complete' });
      }

      return {
        fileId: result.fileId,
        fileName: result.fileName,
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

  async uploadFileStream(
    fileStream: NodeJS.ReadableStream,
    fileName: string,
    contentType: string,
    fileSize: number,
    progressEmitter?: EventEmitter
  ): Promise<{ fileId: string; fileName: string }> {
    await this.ensureAuthorized();

    try {
      const uploadUrlResponse = await this.b2.getUploadUrl({
        bucketId: this.config.bucketId,
      });

      const headers: Record<string, string> = {
        'Authorization': uploadUrlResponse.data.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': 'do_not_verify',
      };

      if (fileSize > 0) {
        headers['Content-Length'] = fileSize.toString();
      }

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 0 });
      }

      let uploadedBytes = 0;
      const progressStream = new Readable({
        read() {}
      });

      fileStream.on('data', (chunk: Buffer) => {
        uploadedBytes += chunk.length;
        if (progressEmitter && fileSize > 0) {
          const percent = Math.min(95, Math.floor((uploadedBytes / fileSize) * 100));
          progressEmitter.emit('progress', { type: 'progress', percent });
        }
        progressStream.push(chunk);
      });

      fileStream.on('end', () => {
        progressStream.push(null);
      });

      fileStream.on('error', (error) => {
        progressStream.destroy(error);
      });

      const response = await fetch(uploadUrlResponse.data.uploadUrl, {
        method: 'POST',
        headers: headers,
        body: progressStream as any,
        duplex: 'half' as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`B2 upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 100 });
        progressEmitter.emit('progress', { type: 'complete' });
      }
      
      return {
        fileId: result.fileId,
        fileName: result.fileName,
        uploadedBytes: uploadedBytes,
      };
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.message?.includes('unauthorized')) {
        this.authorizationToken = null;
        await this.ensureAuthorized();
        return this.uploadFileStream(fileStream, fileName, contentType, fileSize, progressEmitter);
      }
      console.error('Backblaze upload stream error:', error);
      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'error', error: 'Failed to upload file stream to Backblaze' });
      }
      throw new Error('Failed to upload file stream to Backblaze');
    }
  }

  async uploadLargeFile(
    fileStream: NodeJS.ReadableStream,
    fileName: string,
    contentType: string,
    fileSize: number,
    progressEmitter?: EventEmitter
  ): Promise<{ fileId: string; fileName: string }> {
    await this.ensureAuthorized();

    try {
      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 0 });
      }

      // Start large file upload
      const startResponse = await this.b2.startLargeFile({
        bucketId: this.config.bucketId,
        fileName: fileName,
        contentType: contentType || 'application/octet-stream',
      });

      const fileId = startResponse.data.fileId;
      const partSize = 100 * 1024 * 1024; // 100MB parts (minimum for B2)
      const parts: Buffer[] = [];
      let currentPart: Buffer[] = [];
      let currentPartSize = 0;
      let partNumber = 1;
      const sha1Array: string[] = [];
      let totalUploaded = 0;

      // Collect data into parts
      for await (const chunk of fileStream as any) {
        currentPart.push(chunk);
        currentPartSize += chunk.length;
        totalUploaded += chunk.length;

        // When we have a full part, upload it
        if (currentPartSize >= partSize) {
          const partBuffer = Buffer.concat(currentPart);
          const uploadUrlResponse = await this.b2.getUploadPartUrl({
            fileId: fileId,
          });

          const crypto = await import('crypto');
          const sha1 = crypto.createHash('sha1').update(partBuffer).digest('hex');

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
            await this.b2.cancelLargeFile({ fileId });
            throw new Error(`B2 part upload failed: ${partResponse.status} ${errorText}`);
          }

          sha1Array.push(sha1);
          partNumber++;
          currentPart = [];
          currentPartSize = 0;

          if (progressEmitter) {
            const percent = Math.min(95, Math.floor((totalUploaded / fileSize) * 100));
            progressEmitter.emit('progress', { type: 'progress', percent });
          }
        }
      }

      // Upload remaining data as final part
      if (currentPart.length > 0) {
        const partBuffer = Buffer.concat(currentPart);
        const uploadUrlResponse = await this.b2.getUploadPartUrl({
          fileId: fileId,
        });

        const crypto = await import('crypto');
        const sha1 = crypto.createHash('sha1').update(partBuffer).digest('hex');

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
          await this.b2.cancelLargeFile({ fileId });
          throw new Error(`B2 final part upload failed: ${partResponse.status} ${errorText}`);
        }

        sha1Array.push(sha1);
      }

      // Finish the large file upload
      const finishResponse = await this.b2.finishLargeFile({
        fileId: fileId,
        partSha1Array: sha1Array,
      });

      if (progressEmitter) {
        progressEmitter.emit('progress', { type: 'progress', percent: 100 });
        progressEmitter.emit('progress', { type: 'complete' });
      }

      return {
        fileId: finishResponse.data.fileId,
        fileName: finishResponse.data.fileName,
        uploadedBytes: totalUploaded,
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
      const response = await this.b2.downloadFileByName({
        bucketName: this.config.bucketName,
        fileName: fileName,
      });

      return Buffer.from(response.data);
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
      const response = await this.b2.downloadFileByName({
        bucketName: this.config.bucketName,
        fileName: fileName,
        responseType: 'stream',
      });

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

  async deleteFile(fileName: string, fileId: string): Promise<void> {
    await this.ensureAuthorized();

    try {
      await this.b2.deleteFileVersion({
        fileId: fileId,
        fileName: fileName,
      });
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
      const response = await this.b2.getFileInfo({
        fileId: fileId,
      });
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
      const response = await fetch(`${this.apiUrl}/b2api/v2/b2_get_download_authorization`, {
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`B2 download authorization failed: ${errorText}`);
      }

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
