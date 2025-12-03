import JSZip from 'jszip';

interface FileInfo {
  name: string;
  data: ArrayBuffer;
}

interface WorkerMessage {
  type: 'start' | 'cancel' | 'add-file';
  files?: FileInfo[];
  zipFileName?: string;
}

interface ProgressMessage {
  type: 'progress';
  percent: number;
  phase: 'reading' | 'compressing';
}

interface CompleteMessage {
  type: 'complete';
  blob: Blob;
  fileName: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

interface CancelledMessage {
  type: 'cancelled';
}

type OutMessage = ProgressMessage | CompleteMessage | ErrorMessage | CancelledMessage;

let cancelled = false;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, files, zipFileName } = e.data;

  if (type === 'cancel') {
    cancelled = true;
    self.postMessage({ type: 'cancelled' } as CancelledMessage);
    return;
  }

  if (type === 'start' && files && zipFileName) {
    cancelled = false;
    
    try {
      const zip = new JSZip();
      const totalFiles = files.length;
      
      for (let i = 0; i < files.length; i++) {
        if (cancelled) {
          self.postMessage({ type: 'cancelled' } as CancelledMessage);
          return;
        }
        
        const file = files[i];
        zip.file(file.name, file.data);
        
        const readProgress = Math.round(((i + 1) / totalFiles) * 30);
        self.postMessage({ type: 'progress', percent: readProgress, phase: 'reading' } as ProgressMessage);
      }

      if (cancelled) {
        self.postMessage({ type: 'cancelled' } as CancelledMessage);
        return;
      }

      let lastProgressTime = 0;
      const THROTTLE_MS = 200;

      const zipBlob = await zip.generateAsync(
        { 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 1 }
        },
        (metadata) => {
          if (cancelled) return;
          
          const now = Date.now();
          if (now - lastProgressTime >= THROTTLE_MS || metadata.percent >= 100) {
            lastProgressTime = now;
            const compressProgress = 30 + Math.round(metadata.percent * 0.7);
            self.postMessage({ type: 'progress', percent: compressProgress, phase: 'compressing' } as ProgressMessage);
          }
        }
      );

      if (cancelled) {
        self.postMessage({ type: 'cancelled' } as CancelledMessage);
        return;
      }

      self.postMessage({ 
        type: 'complete', 
        blob: zipBlob, 
        fileName: zipFileName 
      } as CompleteMessage);
      
    } catch (error: any) {
      if (!cancelled) {
        self.postMessage({ 
          type: 'error', 
          message: error.message || 'ZIP creation failed' 
        } as ErrorMessage);
      }
    }
  }
};
