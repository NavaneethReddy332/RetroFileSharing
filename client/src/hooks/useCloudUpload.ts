import { useState, useCallback, useRef } from 'react';

interface CloudUploadProgress {
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
}

interface CloudUploadResult {
  success: boolean;
  fileName?: string;
  fileId?: string;
  error?: string;
}

interface UseCloudUploadOptions {
  onProgress?: (progress: CloudUploadProgress) => void;
  onComplete?: (result: CloudUploadResult) => void;
  onError?: (error: string) => void;
  onLog?: (message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data') => void;
}

export function useCloudUpload(options: UseCloudUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cloudEnabled, setCloudEnabled] = useState<boolean | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const checkCloudStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/cloud/status');
      if (response.ok) {
        const data = await response.json();
        setCloudEnabled(data.enabled);
        return data.enabled;
      }
      setCloudEnabled(false);
      return false;
    } catch (error) {
      setCloudEnabled(false);
      return false;
    }
  }, []);

  const uploadToCloud = useCallback(async (file: File): Promise<CloudUploadResult> => {
    const { onProgress, onComplete, onError, onLog } = options;

    try {
      setIsUploading(true);
      setUploadProgress(0);

      onLog?.('uploading to cloud via server...', 'system');

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      
      const uploadPromise = new Promise<CloudUploadResult>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
            onProgress?.({
              percent,
              bytesUploaded: e.loaded,
              totalBytes: e.total,
            });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const responseData = JSON.parse(xhr.responseText);
              const result: CloudUploadResult = {
                success: true,
                fileName: responseData.fileName,
                fileId: responseData.fileId,
              };
              onLog?.('cloud upload complete', 'success');
              onComplete?.(result);
              resolve(result);
            } catch {
              const result: CloudUploadResult = {
                success: true,
                fileName: file.name,
              };
              onComplete?.(result);
              resolve(result);
            }
          } else {
            let errorMessage = 'Upload failed';
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {}
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        // Upload to server endpoint (which proxies to B2)
        xhr.open('POST', '/api/cloud/upload');
        xhr.send(formData);
      });

      return await uploadPromise;
    } catch (error: any) {
      const errorMessage = error.message || 'Cloud upload failed';
      onLog?.(errorMessage, 'error');
      onError?.(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsUploading(false);
      xhrRef.current = null;
    }
  }, [options]);

  const cancelUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
  }, []);

  return {
    uploadToCloud,
    cancelUpload,
    checkCloudStatus,
    isUploading,
    uploadProgress,
    cloudEnabled,
  };
}
