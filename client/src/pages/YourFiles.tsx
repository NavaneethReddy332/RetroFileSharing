import { useQuery } from '@tanstack/react-query';
import { RetroLayout } from '@/components/RetroLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { FileText, Upload, Download, Cloud, Loader2, FolderOpen } from 'lucide-react';
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

export default function YourFiles() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: files, isLoading } = useQuery<UserFile[]>({
    queryKey: ['/api/user/files'],
    enabled: isAuthenticated,
  });

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
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-4 p-3"
                style={{ 
                  border: '1px solid hsl(var(--border-subtle))',
                }}
                data-testid={`file-item-${file.id}`}
              >
                <div 
                  className="flex-shrink-0 p-2"
                  style={{ backgroundColor: 'hsl(var(--surface))' }}
                >
                  {file.transferType === 'cloud' ? (
                    <Cloud size={16} style={{ color: 'hsl(var(--accent))' }} />
                  ) : (
                    <FileText size={16} style={{ color: 'hsl(var(--text-dim))' }} />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div 
                    className="text-xs truncate"
                    style={{ color: 'hsl(var(--text-primary))' }}
                  >
                    {file.fileName}
                  </div>
                  <div 
                    className="text-[10px] flex items-center gap-2 mt-0.5"
                    style={{ color: 'hsl(var(--text-dim))' }}
                  >
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span style={{ color: 'hsl(var(--border-dim))' }}>|</span>
                    <span>{formatDate(file.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {file.direction === 'send' ? (
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
    </RetroLayout>
  );
}
