import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Download } from "lucide-react";
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
      addLog('INVALID: Please enter a valid 6-digit code', 'error');
      return;
    }

    setLogs([]);
    setStatus('connecting');
    addLog('INIT: Connecting to session...', 'system');
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
      addLog(`FILE: ${session.fileName}`, 'success');
      addLog(`SIZE: ${formatFileSize(session.fileSize)} | TYPE: ${session.mimeType}`, 'data');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-receiver', code: activeCode }));
        addLog('WS: Socket connected', 'info');
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('WS: Joined room as receiver', 'info');
            setStatus('waiting');
            addLog('STATUS: Waiting for sender...', 'warn');
            break;

          case 'peer-connected':
            addLog('PEER: Sender connected!', 'success');
            addLog('TRANSFER: Ready to receive data...', 'system');
            setStatus('receiving');
            startTimeRef.current = Date.now();
            break;

          case 'chunk':
            chunksRef.current[message.index] = message.data;
            const percent = Math.round(((message.index + 1) / message.total) * 100);
            setProgress(percent);
            
            if ((message.index + 1) % 10 === 0 || message.index + 1 === message.total) {
              const elapsed = (Date.now() - startTimeRef.current) / 1000;
              const received = chunksRef.current.filter(Boolean).length;
              const avgSize = fileInfo ? fileInfo.size / message.total : 0;
              const speed = (received * avgSize) / elapsed / 1024 / 1024;
              addLog(`RECV: ${percent}% | ${speed.toFixed(2)} MB/s`, 'data');
            }
            
            ws.send(JSON.stringify({ type: 'progress', percent }));
            break;

          case 'transfer-complete':
            const totalTime = (Date.now() - startTimeRef.current) / 1000;
            addLog(`COMPLETE: Transfer finished in ${totalTime.toFixed(2)}s`, 'success');
            addLog('SAVE: Processing file...', 'system');
            saveFile();
            setStatus('complete');
            break;

          case 'peer-disconnected':
            addLog('ERROR: Sender disconnected', 'error');
            setStatus('idle');
            break;

          case 'error':
            addLog(`ERROR: ${message.error}`, 'error');
            setStatus('idle');
            break;
        }
      };

      ws.onerror = () => {
        addLog('WS_ERROR: Connection failed', 'error');
        setStatus('idle');
      };

      ws.onclose = () => {
        if (status !== 'complete') {
          addLog('WS: Connection closed', 'warn');
        }
      };

    } catch (error: any) {
      addLog(`FATAL: ${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const saveFile = () => {
    if (!fileInfo || chunksRef.current.length === 0) return;

    try {
      addLog('DECODE: Converting binary data...', 'system');
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

      addLog(`SAVED: ${fileInfo.name}`, 'success');
      addLog(`SIZE: ${formatFileSize(blob.size)}`, 'data');
    } catch (error: any) {
      addLog(`SAVE_ERROR: ${error.message}`, 'error');
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
      case 'error': return '#ff5555';
      case 'success': return '#50fa7b';
      case 'warn': return '#f1fa8c';
      case 'system': return '#bd93f9';
      case 'data': return '#8be9fd';
      default: return '#f8f8f2';
    }
  };

  const getLogPrefix = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return '[ERR]';
      case 'success': return '[OK!]';
      case 'warn': return '[WRN]';
      case 'system': return '[SYS]';
      case 'data': return '[DAT]';
      default: return '[INF]';
    }
  };

  return (
    <RetroLayout>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'hsl(var(--accent))' }}>
            Receive Files
          </h1>
          <p style={{ color: 'hsl(var(--text-secondary))' }}>
            Enter the 6-digit code from the sender to receive a file.
          </p>
        </div>

        {status === 'idle' && (
          <>
            <div className="retro-border p-6 mb-4 text-center">
              <Download
                size={48}
                className="mx-auto mb-4"
                style={{ color: 'hsl(var(--text-secondary))' }}
              />
              <div className="mb-4">
                <label className="block mb-2" style={{ color: 'hsl(var(--text-secondary))' }}>
                  Enter Code:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="retro-input text-center text-3xl font-mono tracking-widest w-48"
                  data-testid="input-code"
                />
              </div>
            </div>

            <button
              onClick={() => startReceiving()}
              disabled={code.length !== 6}
              className="retro-button w-full py-3 text-lg"
              style={{ opacity: code.length === 6 ? 1 : 0.5 }}
              data-testid="button-receive"
            >
              {code.length === 6 ? 'Connect >>' : 'Enter 6-digit code'}
            </button>
          </>
        )}

        {status === 'connecting' && (
          <div className="text-center">
            <div className="retro-border p-6">
              <div style={{ color: 'hsl(var(--text-secondary))' }}>
                Connecting...
              </div>
            </div>
          </div>
        )}

        {status === 'waiting' && (
          <div className="text-center">
            <div className="retro-border p-6 mb-4">
              {fileInfo && (
                <div className="mb-4">
                  <div style={{ color: 'hsl(var(--accent))' }}>File ready:</div>
                  <div className="font-bold text-lg">{fileInfo.name}</div>
                  <div style={{ color: 'hsl(var(--text-secondary))' }}>
                    {formatFileSize(fileInfo.size)}
                  </div>
                </div>
              )}
              <div style={{ color: 'hsl(var(--text-secondary))' }}>
                Waiting for sender to start transfer...
              </div>
            </div>
            <button
              onClick={resetReceiver}
              className="retro-button"
              data-testid="button-cancel"
            >
              Cancel
            </button>
          </div>
        )}

        {status === 'receiving' && (
          <div className="text-center">
            <div className="retro-border p-6 mb-4">
              <div className="mb-4" style={{ color: 'hsl(var(--accent))' }}>
                Receiving: {fileInfo?.name}
              </div>
              <div className="retro-border-inset p-2 mb-2">
                <div
                  className="h-6"
                  style={{
                    backgroundColor: 'hsl(var(--accent))',
                    width: `${progress}%`,
                    transition: 'width 0.1s linear'
                  }}
                />
              </div>
              <div className="font-mono" style={{ color: 'hsl(var(--text-secondary))' }}>
                {progress}%
              </div>
            </div>
          </div>
        )}

        {status === 'complete' && (
          <div className="text-center">
            <div className="retro-border p-6 mb-4">
              <div className="text-2xl font-bold mb-2" style={{ color: 'hsl(var(--accent))' }}>
                Download Complete!
              </div>
              <div style={{ color: 'hsl(var(--text-secondary))' }}>
                {fileInfo?.name} has been downloaded.
              </div>
            </div>
            <button
              onClick={resetReceiver}
              className="retro-button"
              data-testid="button-receive-another"
            >
              Receive Another File
            </button>
          </div>
        )}

        {logs.length > 0 && (
          <div 
            className="mt-6 retro-border-inset p-3 max-h-64 overflow-y-auto font-mono text-xs retro-terminal-scroll"
            style={{ backgroundColor: '#1e1e2e' }}
          >
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 py-0.5"
                style={{ fontFamily: 'Consolas, Monaco, monospace' }}
              >
                <span style={{ color: '#6272a4' }}>[{formatTime(log.timestamp)}]</span>
                <span style={{ color: getLogColor(log.type), fontWeight: 'bold' }}>
                  {getLogPrefix(log.type)}
                </span>
                <span style={{ color: getLogColor(log.type) }}>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </RetroLayout>
  );
}
