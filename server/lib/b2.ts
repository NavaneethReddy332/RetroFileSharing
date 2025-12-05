import B2 from 'backblaze-b2';

interface UploadUrlResponse {
  uploadUrl: string;
  authorizationToken: string;
  bucketId: string;
  fileName: string;
}

interface DownloadAuthResponse {
  downloadUrl: string;
  fileId: string;
  fileName: string;
}

class B2Service {
  private b2: B2 | null = null;
  private authorized: boolean = false;
  private authorizationData: any = null;
  private uploadUrlCache: { url: string; token: string; expiry: number } | null = null;
  private corsConfigured: boolean = false;

  constructor() {
    this.initializeB2();
  }

  private initializeB2() {
    const keyId = process.env.B2_APPLICATION_KEY_ID;
    const key = process.env.B2_APPLICATION_KEY;
    
    if (!keyId || !key) {
      console.log('B2 credentials not configured - cloud storage disabled');
      return;
    }

    this.b2 = new B2({
      applicationKeyId: keyId,
      applicationKey: key,
    });
  }

  async authorize(): Promise<boolean> {
    if (!this.b2) {
      return false;
    }

    try {
      const response = await this.b2.authorize();
      this.authorizationData = response.data;
      this.authorized = true;
      
      // Configure CORS after authorization
      if (!this.corsConfigured) {
        await this.configureCors();
      }
      
      return true;
    } catch (error) {
      console.error('B2 authorization failed:', error);
      this.authorized = false;
      return false;
    }
  }

  private async configureCors(): Promise<void> {
    if (!this.b2 || !this.authorized) {
      return;
    }

    try {
      const bucketId = process.env.B2_BUCKET_ID;
      const bucketName = process.env.B2_BUCKET_NAME;
      
      if (!bucketId || !bucketName) {
        console.log('B2 bucket not configured - skipping CORS setup');
        return;
      }

      // First, get the current bucket configuration to preserve the bucket type
      // accountId is required for listBuckets API
      const accountId = this.authorizationData?.accountId;
      if (!accountId) {
        console.error('B2 accountId not available - skipping CORS setup');
        return;
      }

      const listBucketsResponse = await (this.b2 as any).listBuckets({
        accountId: accountId,
        bucketId: bucketId
      });

      const bucket = listBucketsResponse.data.buckets.find((b: any) => b.bucketId === bucketId);
      if (!bucket) {
        console.error('B2 bucket not found - skipping CORS setup');
        return;
      }

      // Check if CORS is already configured with our rules
      const existingCorsRules = bucket.corsRules || [];
      const hasOurRule = existingCorsRules.some((rule: any) => rule.corsRuleName === 'allowBrowserUploads');
      
      if (hasOurRule) {
        this.corsConfigured = true;
        console.log('B2 CORS rules already configured');
        return;
      }

      // Configure CORS rules to allow browser uploads from any origin
      const corsRules = [
        ...existingCorsRules,
        {
          corsRuleName: 'allowBrowserUploads',
          allowedOrigins: ['*'],
          allowedOperations: ['b2_upload_file', 'b2_download_file_by_name', 'b2_download_file_by_id'],
          allowedHeaders: [
            'Authorization',
            'Content-Type',
            'Content-Length',
            'X-Bz-File-Name',
            'X-Bz-Content-Sha1',
            'X-Bz-Info-*',
            'Range'
          ],
          exposeHeaders: [
            'X-Bz-File-Name',
            'X-Bz-File-Id',
            'X-Bz-Content-Sha1',
            'X-Bz-Upload-Timestamp',
            'Content-Length',
            'Content-Type'
          ],
          maxAgeSeconds: 86400
        }
      ];

      // Use type assertion since the B2 types don't include corsRules but the API supports it
      // Preserve the existing bucket type instead of forcing allPrivate
      await (this.b2 as any).updateBucket({
        bucketId,
        bucketType: bucket.bucketType,
        corsRules
      });

      this.corsConfigured = true;
      console.log('B2 CORS rules configured successfully');
    } catch (error: any) {
      // Log but don't fail - CORS might already be configured or we might not have permission
      console.error('Failed to configure B2 CORS (may already be configured):', error.message || error);
    }
  }

  isEnabled(): boolean {
    return this.b2 !== null && 
           !!process.env.B2_APPLICATION_KEY_ID && 
           !!process.env.B2_APPLICATION_KEY &&
           !!process.env.B2_BUCKET_ID &&
           !!process.env.B2_BUCKET_NAME;
  }

  async ensureCorsConfigured(): Promise<boolean> {
    if (this.corsConfigured) {
      return true;
    }

    if (!this.authorized) {
      const success = await this.authorize();
      if (!success) {
        return false;
      }
    }

    await this.configureCors();
    return this.corsConfigured;
  }

  isCorsConfigured(): boolean {
    return this.corsConfigured;
  }

  async getUploadUrl(fileName: string): Promise<UploadUrlResponse | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      if (!this.authorized) {
        const success = await this.authorize();
        if (!success) {
          throw new Error('Failed to authorize with B2');
        }
      }

      const bucketId = process.env.B2_BUCKET_ID!;
      
      const response = await this.b2!.getUploadUrl({ bucketId });
      
      const timestamp = Date.now();
      const safeFileName = `${timestamp}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      return {
        uploadUrl: response.data.uploadUrl,
        authorizationToken: response.data.authorizationToken,
        bucketId: bucketId,
        fileName: safeFileName,
      };
    } catch (error: any) {
      console.error('Failed to get upload URL:', error);
      
      if (error.response?.status === 401) {
        this.authorized = false;
        return this.getUploadUrl(fileName);
      }
      
      return null;
    }
  }

  async getDownloadAuthorization(fileId: string, fileName: string, validDurationInSeconds: number = 86400): Promise<DownloadAuthResponse | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      if (!this.authorized) {
        const success = await this.authorize();
        if (!success) {
          throw new Error('Failed to authorize with B2');
        }
      }

      const bucketName = process.env.B2_BUCKET_NAME!;
      
      const response = await this.b2!.getDownloadAuthorization({
        bucketId: process.env.B2_BUCKET_ID!,
        fileNamePrefix: fileName,
        validDurationInSeconds,
      });

      const downloadUrl = `${this.authorizationData.downloadUrl}/file/${bucketName}/${fileName}?Authorization=${response.data.authorizationToken}`;

      return {
        downloadUrl,
        fileId,
        fileName,
      };
    } catch (error: any) {
      console.error('Failed to get download authorization:', error);
      
      if (error.response?.status === 401) {
        this.authorized = false;
        return this.getDownloadAuthorization(fileId, fileName, validDurationInSeconds);
      }
      
      return null;
    }
  }

  async deleteFile(fileId: string, fileName: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      if (!this.authorized) {
        const success = await this.authorize();
        if (!success) {
          throw new Error('Failed to authorize with B2');
        }
      }

      await this.b2!.deleteFileVersion({
        fileId,
        fileName,
      });

      return true;
    } catch (error: any) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }
}

export const b2Service = new B2Service();
