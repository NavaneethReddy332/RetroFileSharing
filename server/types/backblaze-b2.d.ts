declare module 'backblaze-b2' {
  interface B2Config {
    applicationKeyId: string;
    applicationKey: string;
  }

  interface AuthorizeResponse {
    data: {
      authorizationToken: string;
      downloadUrl: string;
      apiUrl: string;
    };
  }

  interface UploadUrlResponse {
    data: {
      uploadUrl: string;
      authorizationToken: string;
    };
  }

  interface StartLargeFileResponse {
    data: {
      fileId: string;
    };
  }

  interface FinishLargeFileResponse {
    data: {
      fileId: string;
      fileName: string;
    };
  }

  interface DownloadResponse {
    data: Buffer | NodeJS.ReadableStream;
  }

  class B2 {
    constructor(config: B2Config);
    authorize(): Promise<AuthorizeResponse>;
    getUploadUrl(params: { bucketId: string }): Promise<UploadUrlResponse>;
    getUploadPartUrl(params: { fileId: string }): Promise<UploadUrlResponse>;
    startLargeFile(params: { bucketId: string; fileName: string; contentType: string }): Promise<StartLargeFileResponse>;
    finishLargeFile(params: { fileId: string; partSha1Array: string[] }): Promise<FinishLargeFileResponse>;
    cancelLargeFile(params: { fileId: string }): Promise<void>;
    downloadFileByName(params: { bucketName: string; fileName: string; responseType?: string }): Promise<DownloadResponse>;
    deleteFileVersion(params: { fileId: string; fileName: string }): Promise<void>;
    getFileInfo(params: { fileId: string }): Promise<{ data: any }>;
  }

  export default B2;
}
