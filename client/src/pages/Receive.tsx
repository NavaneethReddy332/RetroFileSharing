import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { ArrowRight } from "lucide-react";
import { useSearch } from "wouter";

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data';
  timestamp: Date;
}

export default function Receive() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialCode = urlParams.get('code') || '';
  
  const [code, setCode] = useState(initialCode);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'waiting' | 'receiving' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<string[]>([]);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: logIdRef.current++, message, type, timestamp: new Date() }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (initialCode.length === 6) {
      startReceiving(initialCode);
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const startReceiving = async (codeToUse?: string) => {
    const activeCode = codeToUse || code;
    if (activeCode.length !== 6) {
      addLog('invalid code', 'error');
      return;
    }

    setLogs([]);
    setStatus('connecting');
    addLog('connecting...', 'system');
    chunksRef.current = [];
    startTimeRef.current = Date.now();

    try {
      const response = await fetch(`/api/session/${activeCode}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Session not found');
      }

      const session = await response.json();
      setFileInfo({ name: session.fileName, size: session.fileSize });
      addLog(`file: ${session.fileName}`, 'success');
      addLog(`${formatFileSize(session.fileSize)}`, 'data');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-receiver', code: activeCode }));
        addLog('connected', 'info');
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('joined as receiver', 'info');
            setStatus('waiting');
            addLog('waiting for sender...', 'warn');
            break;

          case 'peer-connected':
            addLog('sender connected', 'success');
            setStatus('receiving');
            startTimeRef.current = Date.now();
            break;

          case 'chunk':
            chunksRef.current[message.index] = message.data;
            const percent = Math.round(((message.index + 1) / message.total) * 100);
            setProgress(percent);
            
            if ((message.index + 1) % 20 === 0 || message.index + 1 === message.total) {
              const elapsed = (Date.now() - startTimeRef.current) / 1000;
              const received = chunksRef.current.filter(Boolean).length;
              const avgSize = fileInfo ? fileInfo.size / message.total : 0;
              const speed = (received * avgSize) / elapsed / 1024 / 1024;
              addLog(`${percent}% @ ${speed.toFixed(1)} MB/s`, 'data');
            }
            
            ws.send(JSON.stringify({ type: 'progress', percent }));
            break;

          case 'transfer-complete':
            const totalTime = (Date.now() - startTimeRef.current) / 1000;
            addLog(`done in ${totalTime.toFixed(1)}s`, 'success');
            saveFile();
            setStatus('complete');
            break;

          case 'peer-disconnected':
            addLog('sender disconnected', 'error');
            setStatus('idle');
            break;

          case 'error':
            addLog(`${message.error}`, 'error');
            setStatus('idle');
            break;
        }
      };

      ws.onerror = () => {
        addLog('connection failed', 'error');
        setStatus('idle');
      };

      ws.onclose = () => {
        if (status !== 'complete') {
          addLog('disconnected', 'warn');
        }
      };

    } catch (error: any) {
      addLog(`${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const saveFile = () => {
    if (!fileInfo || chunksRef.current.length === 0) return;

    try {
      addLog('processing...', 'system');
      const binaryChunks = chunksRef.current.map(base64 => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      });

      const blob = new Blob(binaryChunks);
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileInfo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog(`saved: ${fileInfo.name}`, 'success');
    } catch (error: any) {
      addLog(`${error.message}`, 'error');
    }
  };

  const resetReceiver = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCode("");
    setStatus('idle');
    setProgress(0);
    setFileInfo(null);
    setLogs([]);
    chunksRef.current = [];
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'hsl(0 65% 55%)';
      case 'success': return 'hsl(var(--accent))';
      case 'warn': return 'hsl(45 80% 55%)';
      case 'system': return 'hsl(270 50% 60%)';
      case 'data': return 'hsl(200 60% 55%)';
      default: return 'hsl(var(--text-secondary))';
    }
  };

  return (
    <RetroLayout>
      <div className="h-full flex items-start justify-start gap-6 pl-4">
        {/* Main panels - left side */}
        <div className="w-72 flex flex-col gap-4">
          {status === 'idle' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                RECEIVE
              </div>
              <div className="minimal-border p-4">
                <div className="text-[10px] mb-2" style={{ color: 'hsl(var(--text-dim))' }}>
                  enter 6-digit code
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="minimal-input flex-1 text-center tracking-[0.3em] text-sm"
                    data-testid="input-code"
                  />
                  <button
                    onClick={() => startReceiving()}
                    disabled={code.length !== 6}
                    className={`minimal-btn px-3 ${code.length === 6 ? 'minimal-btn-accent' : ''}`}
                    data-testid="button-receive"
                  >
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === 'connecting' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CONNECTING
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="text-xs animate-pulse-subtle" style={{ color: 'hsl(var(--text-secondary))' }}>
                  connecting...
                </div>
              </div>
            </div>
          )}

          {status === 'waiting' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                READY
              </div>
              <div className="minimal-border-accent p-4">
                {fileInfo && (
                  <div className="mb-3">
                    <div className="text-xs truncate" style={{ color: 'hsl(var(--accent))' }}>
                      {fileInfo.name}
                    </div>
                    <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                      {formatFileSize(fileInfo.size)}
                    </div>
                  </div>
                )}
                <div className="text-[10px] animate-pulse-subtle" style={{ color: 'hsl(var(--text-dim))' }}>
                  waiting for sender
                </div>
              </div>
              <button
                onClick={resetReceiver}
                className="minimal-btn w-full mt-2"
                data-testid="button-cancel"
              >
                cancel
              </button>
            </div>
          )}

          {status === 'receiving' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                RECEIVING
              </div>
              <div className="minimal-border p-4">
                <div className="text-xs truncate mb-3" style={{ color: 'hsl(var(--accent))' }}>
                  {fileInfo?.name}
                </div>
                <div className="progress-track mb-2">
                  <div 
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[10px] text-right" style={{ color: 'hsl(var(--text-dim))' }}>
                  {progress}%
                </div>
              </div>
            </div>
          )}

          {status === 'complete' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                COMPLETE
              </div>
              <div className="minimal-border-accent p-4 text-center">
                <div className="text-xs mb-1 glow-text" style={{ color: 'hsl(var(--accent))' }}>
                  download complete
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  {fileInfo?.name}
                </div>
              </div>
              <button
                onClick={resetReceiver}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-receive-another"
              >
                receive another
              </button>
            </div>
          )}
        </div>

        {/* Log terminal - right side */}
        {logs.length > 0 && (
          <div className="flex-1 max-w-md h-[400px]">
            <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
              LOG
            </div>
            <div 
              className="terminal-log p-3 h-full overflow-y-auto"
            >
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex gap-2 py-0.5"
                >
                  <span style={{ color: 'hsl(var(--text-dim))' }}>{formatTime(log.timestamp)}</span>
                  <span style={{ color: getLogColor(log.type) }}>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>
    </RetroLayout>
  );
}
