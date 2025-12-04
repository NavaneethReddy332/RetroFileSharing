import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatTimeRemaining(bytesRemaining: number, speedMBps: number): string {
  if (speedMBps <= 0) return 'calculating...';
  const bytesPerSecond = speedMBps * 1024 * 1024;
  const seconds = bytesRemaining / bytesPerSecond;
  
  if (seconds < 60) {
    return `~${Math.ceil(seconds)}s left`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `~${mins}m ${secs}s left`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.ceil((seconds % 3600) / 60);
    return `~${hours}h ${mins}m left`;
  }
}

export function formatHistoryDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getLogColor(type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data'): string {
  switch (type) {
    case 'error': return 'hsl(0 65% 55%)';
    case 'success': return 'hsl(var(--accent))';
    case 'warn': return 'hsl(45 80% 55%)';
    case 'system': return 'hsl(270 50% 60%)';
    case 'data': return 'hsl(200 60% 55%)';
    default: return 'hsl(var(--text-secondary))';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'hsl(var(--accent))';
    case 'cancelled': return 'hsl(45 80% 55%)';
    case 'failed': return 'hsl(0 65% 55%)';
    default: return 'hsl(var(--text-dim))';
  }
}

export const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024;
export const MAX_FILE_SIZE_DISPLAY = '4 GB';

export const ALLOWED_MIME_TYPES: string[] = [];

export function validateFileSize(size: number): { valid: boolean; message?: string } {
  if (size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      message: `File too large. Maximum size is ${MAX_FILE_SIZE_DISPLAY}.` 
    };
  }
  return { valid: true };
}

export function validateFiles(files: File[]): { valid: boolean; message?: string } {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  
  if (totalSize > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      message: `Total size (${formatFileSize(totalSize)}) exceeds maximum of ${MAX_FILE_SIZE_DISPLAY}.` 
    };
  }
  
  return { valid: true };
}
