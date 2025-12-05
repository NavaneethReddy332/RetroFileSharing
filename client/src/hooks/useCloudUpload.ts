import { useState, useCallback, useRef } from 'react';

interface CloudUploadProgress {
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
}

interface CloudUploadResult {
  success: boolean;
  fileName?: string;
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
  const abortControllerRef = useRef<AbortController | null>(null);

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
      abortControllerRef.current = new AbortController();

      onLog?.('requesting cloud upload URL...', 'system');

      const urlResponse = await fetch('/api/cloud/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!urlResponse.ok) {
        const errorData = await urlResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, authorizationToken, fileName } = await urlResponse.json();

      onLog?.('uploading to cloud...', 'data');

      const xhr = new XMLHttpRequest();
      
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
            const result: CloudUploadResult = {
              success: true,
              fileName,
            };
            onLog?.('cloud upload complete', 'success');
            onComplete?.(result);
            resolve(result);
          } else {
            let errorMessage = 'Upload failed';
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.message || errorData.error || errorMessage;
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

        abortControllerRef.current?.signal.addEventListener('abort', () => {
          xhr.abort();
        });

        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Authorization', authorizationToken);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(fileName));
        xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify');
        xhr.send(file);
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
      abortControllerRef.current = null;
    }
  }, [options]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
