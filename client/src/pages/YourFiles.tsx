import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useCallback } from 'react';
import { RetroLayout } from '@/components/RetroLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { FileText, Upload, Download, Cloud, Loader2, FolderOpen, Wifi, CheckCircle, XCircle, AlertCircle, ExternalLink, Copy, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { UserFile } from '@shared/schema';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isCloudFile(transferType: string): boolean {
  return transferType === 'cloud_upload' || transferType === 'cloud_download';
}

function getTransferIcon(transferType: string) {
  if (transferType === 'cloud_upload' || transferType === 'cloud_download') {
    return <Cloud size={16} style={{ color: 'hsl(var(--accent))' }} />;
  }
  if (transferType === 'p2p') {
    return <Wifi size={16} style={{ color: 'hsl(var(--text-secondary))' }} />;
  }
  return <FileText size={16} style={{ color: 'hsl(var(--text-dim))' }} />;
}

function getStatusBadge(status?: string) {
  if (!status) return null;
  
  switch (status) {
    case 'completed':
      return (
        <div 
          className="flex items-center gap-1 px-2 py-0.5 text-[9px] tracking-wider"
          style={{ 
            backgroundColor: 'hsl(142 76% 36% / 0.1)',
            color: 'hsl(142 76% 36%)',
          }}
        >
          <CheckCircle size={10} />
          COMPLETED
        </div>
      );
    case 'cancelled':
      return (
        <div 
          className="flex items-center gap-1 px-2 py-0.5 text-[9px] tracking-wider"
          style={{ 
            backgroundColor: 'hsl(0 84% 60% / 0.1)',
            color: 'hsl(0 84% 60%)',
          }}
        >
          <XCircle size={10} />
          CANCELLED
        </div>
      );
    case 'failed':
      return (
        <div 
          className="flex items-center gap-1 px-2 py-0.5 text-[9px] tracking-wider"
          style={{ 
            backgroundColor: 'hsl(0 84% 60% / 0.1)',
            color: 'hsl(0 84% 60%)',
          }}
        >
          <AlertCircle size={10} />
          FAILED
        </div>
      );
    default:
      return null;
  }
}

interface CloudFileModalProps {
  file: UserFile;
  onClose: () => void;
}

function CloudFileModal({ file, onClose }: CloudFileModalProps) {
  const [copied, setCopied] = useState(false);
  const baseUrl = window.location.origin;
  const shareLink = `${baseUrl}/?code=${file.code}`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      onClick={onClose}
    >
      <div 
        className="relative max-w-md w-full p-6"
        style={{ 
          backgroundColor: 'hsl(var(--background))',
          border: '1px solid hsl(var(--border-subtle))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover-elevate"
          style={{ color: 'hsl(var(--text-dim))' }}
          data-testid="button-close-modal"
        >
          <X size={16} />
        </button>

        <h2 
          className="text-sm tracking-[0.2em] font-medium mb-4"
          style={{ color: 'hsl(var(--accent))' }}
        >
          CLOUD FILE DETAILS
        </h2>

        <div className="space-y-4">
          <div>
            <label 
              className="text-[10px] tracking-wider mb-1 block"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              FILE NAME
            </label>
            <div 
              className="text-xs truncate"
              style={{ color: 'hsl(var(--text-primary))' }}
            >
              {file.fileName}
            </div>
          </div>

          <div>
            <label 
              className="text-[10px] tracking-wider mb-1 block"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              FILE SIZE
            </label>
            <div 
              className="text-xs"
              style={{ color: 'hsl(var(--text-primary))' }}
            >
              {formatFileSize(file.fileSize)}
            </div>
          </div>

          {file.code && (
            <>
              <div>
                <label 
                  className="text-[10px] tracking-wider mb-1 block"
                  style={{ color: 'hsl(var(--text-dim))' }}
                >
                  SHARE CODE
                </label>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-lg font-mono tracking-widest"
                    style={{ color: 'hsl(var(--accent))' }}
                  >
                    {file.code}
                  </span>
                  <button
                    onClick={() => copyToClipboard(file.code!)}
                    className="p-1 hover-elevate"
                    style={{ color: 'hsl(var(--text-dim))' }}
                    data-testid="button-copy-code"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label 
                  className="text-[10px] tracking-wider mb-1 block"
                  style={{ color: 'hsl(var(--text-dim))' }}
                >
                  SHARE LINK
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 text-[10px] font-mono p-2"
                    style={{ 
                      backgroundColor: 'hsl(var(--surface))',
                      border: '1px solid hsl(var(--border-subtle))',
                      color: 'hsl(var(--text-secondary))',
                    }}
                  />
                  <button
                    onClick={() => copyToClipboard(shareLink)}
                    className="p-2 hover-elevate"
                    style={{ 
                      border: '1px solid hsl(var(--border-subtle))',
                      color: 'hsl(var(--text-dim))' 
                    }}
                    data-testid="button-copy-link"
                  >
                    <Copy size={14} />
                  </button>
                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover-elevate"
                    style={{ 
                      border: '1px solid hsl(var(--border-subtle))',
                      color: 'hsl(var(--text-dim))' 
                    }}
                    data-testid="link-open-share"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              <div>
                <label 
                  className="text-[10px] tracking-wider mb-2 block"
                  style={{ color: 'hsl(var(--text-dim))' }}
                >
                  QR CODE
                </label>
                <div 
                  className="flex justify-center p-4"
                  style={{ backgroundColor: 'white' }}
                >
                  <QRCodeSVG 
                    value={shareLink} 
                    size={150}
                    level="M"
                  />
                </div>
              </div>
            </>
          )}

          {copied && (
            <div 
              className="text-center text-[10px] tracking-wider"
              style={{ color: 'hsl(142 76% 36%)' }}
            >
              COPIED TO CLIPBOARD
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function YourFiles() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedFile, setSelectedFile] = useState<UserFile | null>(null);
  const [highlightStyle, setHighlightStyle] = useState<{
    top: number;
    height: number;
    opacity: number;
  }>({ top: 0, height: 0, opacity: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: files, isLoading } = useQuery<UserFile[]>({
    queryKey: ['/api/user/files'],
    enabled: isAuthenticated,
  });

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    setHighlightStyle({
      top: targetRect.top - containerRect.top,
      height: targetRect.height,
      opacity: 1,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHighlightStyle(prev => ({ ...prev, opacity: 0 }));
  }, []);

  if (authLoading) {
    return (
      <RetroLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin" size={24} style={{ color: 'hsl(var(--accent))' }} />
        </div>
      </RetroLayout>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <RetroLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 
            className="text-sm tracking-[0.2em] font-medium flex items-center gap-2"
            style={{ color: 'hsl(var(--accent))' }}
          >
            <FolderOpen size={16} />
            YOUR FILES
          </h1>
          <p 
            className="text-[10px] mt-1"
            style={{ color: 'hsl(var(--text-dim))' }}
          >
            Your file transfer history
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" size={20} style={{ color: 'hsl(var(--accent))' }} />
          </div>
        ) : files && files.length > 0 ? (
          <div 
            ref={containerRef}
            className="relative space-y-2"
            onMouseLeave={handleMouseLeave}
          >
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                top: highlightStyle.top,
                height: highlightStyle.height,
                opacity: highlightStyle.opacity,
                backgroundColor: 'hsl(var(--accent) / 0.08)',
                borderLeft: '2px solid hsl(var(--accent))',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 0,
              }}
            />
            {files.map((file) => (
              <div
                key={file.id}
                className={`relative flex items-center gap-4 p-3 ${isCloudFile(file.transferType) && file.code ? 'cursor-pointer' : ''}`}
                style={{ 
                  border: '1px solid hsl(var(--border-subtle))',
                  zIndex: 1,
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={handleMouseEnter}
                onClick={() => {
                  if (isCloudFile(file.transferType) && file.code) {
                    setSelectedFile(file);
                  }
                }}
                data-testid={`file-item-${file.id}`}
              >
                <div 
                  className="flex-shrink-0 p-2"
                  style={{ backgroundColor: 'hsl(var(--surface))' }}
                >
                  {getTransferIcon(file.transferType)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div 
                    className="text-xs truncate"
                    style={{ color: 'hsl(var(--text-primary))' }}
                  >
                    {file.fileName}
                  </div>
                  <div 
                    className="text-[10px] flex items-center gap-2 mt-0.5 flex-wrap"
                    style={{ color: 'hsl(var(--text-dim))' }}
                  >
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span style={{ color: 'hsl(var(--border-dim))' }}>|</span>
                    <span>{formatDate(file.createdAt)}</span>
                    <span style={{ color: 'hsl(var(--border-dim))' }}>|</span>
                    <span className="uppercase">
                      {file.transferType === 'cloud_upload' ? 'CLOUD' : 
                       file.transferType === 'cloud_download' ? 'CLOUD' : 
                       file.transferType === 'p2p' ? 'P2P' : file.transferType}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {file.direction === 'sent' ? (
                    <div 
                      className="flex items-center gap-1 px-2 py-0.5 text-[9px] tracking-wider"
                      style={{ 
                        backgroundColor: 'hsl(var(--accent) / 0.1)',
                        color: 'hsl(var(--accent))',
                      }}
                    >
                      <Upload size={10} />
                      SENT
                    </div>
                  ) : (
                    <div 
                      className="flex items-center gap-1 px-2 py-0.5 text-[9px] tracking-wider"
                      style={{ 
                        backgroundColor: 'hsl(var(--text-dim) / 0.1)',
                        color: 'hsl(var(--text-secondary))',
                      }}
                    >
                      <Download size={10} />
                      RECEIVED
                    </div>
                  )}
                  
                  {file.transferType === 'p2p' && (file as any).status && getStatusBadge((file as any).status)}
                  
                  {file.code && (
                    <span 
                      className="text-[10px] font-mono"
                      style={{ color: 'hsl(var(--text-dim))' }}
                    >
                      {file.code}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div 
            className="text-center py-12"
            style={{ 
              border: '1px solid hsl(var(--border-subtle))',
            }}
          >
            <FolderOpen 
              size={32} 
              className="mx-auto mb-3"
              style={{ color: 'hsl(var(--text-dim))' }} 
            />
            <p 
              className="text-xs"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              No file transfers yet
            </p>
            <p 
              className="text-[10px] mt-1"
              style={{ color: 'hsl(var(--text-dim) / 0.6)' }}
            >
              Your transfer history will appear here
            </p>
          </div>
        )}
      </div>

      {selectedFile && (
        <CloudFileModal 
          file={selectedFile} 
          onClose={() => setSelectedFile(null)} 
        />
      )}
    </RetroLayout>
  );
}
