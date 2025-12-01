import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Upload, Download } from "lucide-react";
import { useLocation } from "wouter";

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data';
  timestamp: Date;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connected' | 'transferring' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: logIdRef.current++, message, type, timestamp: new Date() }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      addLog(`FILE_SELECT: ${selectedFile.name}`, 'system');
      addLog(`SIZE: ${formatFileSize(selectedFile.size)} | TYPE: ${selectedFile.type || 'unknown'}`, 'data');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      addLog(`FILE_DROP: ${droppedFile.name}`, 'system');
      addLog(`SIZE: ${formatFileSize(droppedFile.size)} | TYPE: ${droppedFile.type || 'unknown'}`, 'data');
    }
  };

  const startSending = async () => {
    if (!file) return;

    setLogs([]);
    addLog('INIT: Creating transfer session...', 'system');

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      setCode(data.code);
      setStatus('waiting');
      addLog(`SESSION_ID: ${data.code}`, 'success');
      addLog('STATUS: Waiting for receiver connection...', 'warn');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-sender', code: data.code }));
        addLog('WS: Socket connected', 'info');
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('WS: Joined room as sender', 'info');
            break;

          case 'peer-connected':
            addLog('PEER: Receiver connected!', 'success');
            addLog('TRANSFER: Initiating high-speed transfer...', 'system');
            setStatus('transferring');
            await sendFile(ws);
            break;

          case 'progress':
            setProgress(message.percent);
            break;

          case 'transfer-complete':
            addLog('COMPLETE: Transfer successful!', 'success');
            setStatus('complete');
            break;

          case 'peer-disconnected':
            addLog('ERROR: Receiver disconnected', 'error');
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

  const sendFile = async (ws: WebSocket) => {
    if (!file) return;

    const CHUNK_SIZE = 256 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const startTime = Date.now();
    
    addLog(`CHUNKS: ${totalChunks} x ${formatFileSize(CHUNK_SIZE)}`, 'data');
    addLog('TRANSFER: High-speed streaming...', 'system');

    const sendChunk = (chunkIndex: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);
        
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result && ws.readyState === WebSocket.OPEN) {
            const arrayBuffer = e.target.result as ArrayBuffer;
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = '';
            const len = uint8.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(uint8[i]);
            }
            const base64 = btoa(binary);
            
            ws.send(JSON.stringify({
              type: 'chunk',
              data: base64,
              index: chunkIndex,
              total: totalChunks,
            }));
            resolve();
          } else {
            reject(new Error('WebSocket closed'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });
    };

    let lastLogTime = startTime;
    
    for (let i = 0; i < totalChunks; i++) {
      await sendChunk(i);
      
      const percent = Math.round(((i + 1) / totalChunks) * 100);
      setProgress(percent);
      
      const now = Date.now();
      if (now - lastLogTime > 500 || i === totalChunks - 1) {
        const elapsed = (now - startTime) / 1000;
        const bytesSent = (i + 1) * CHUNK_SIZE;
        const speed = bytesSent / elapsed / 1024 / 1024;
        addLog(`STREAM: ${percent}% @ ${speed.toFixed(1)} MB/s`, 'data');
        lastLogTime = now;
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgSpeed = file.size / totalTime / 1024 / 1024;
    addLog(`COMPLETE: ${formatFileSize(file.size)} in ${totalTime.toFixed(2)}s`, 'success');
    addLog(`THROUGHPUT: ${avgSpeed.toFixed(2)} MB/s`, 'data');
    
    ws.send(JSON.stringify({ type: 'transfer-complete' }));
  };

  const resetSender = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setFile(null);
    setCode("");
    setStatus('idle');
    setProgress(0);
    setLogs([]);
  };

  const handleReceiveSubmit = () => {
    if (receiveCode.length === 6) {
      navigate(`/receive?code=${receiveCode}`);
    }
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
            Send Files Instantly
          </h1>
          <p style={{ color: 'hsl(var(--text-secondary))' }}>
            Select a file, share the code, and transfer directly to the receiver.
          </p>
        </div>

        {status === 'idle' && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="retro-border-inset p-8 text-center cursor-pointer mb-4"
              style={{
                borderColor: isDragOver ? 'hsl(var(--accent))' : undefined,
                backgroundColor: isDragOver ? 'hsl(var(--panel-light))' : undefined
              }}
              data-testid="drop-zone"
            >
              <Upload
                size={48}
                className="mx-auto mb-4"
                style={{ color: isDragOver ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))' }}
              />
              {file ? (
                <div>
                  <div className="font-bold text-lg" style={{ color: 'hsl(var(--accent))' }}>
                    {file.name}
                  </div>
                  <div style={{ color: 'hsl(var(--text-secondary))' }}>
                    {formatFileSize(file.size)}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'hsl(var(--text-secondary))' }}>
                  <div className="font-bold text-lg">Drop file here</div>
                  <div>or click to browse</div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              data-testid="input-file"
            />

            <button
              onClick={startSending}
              disabled={!file}
              className="retro-button w-full py-3 text-lg"
              style={{ opacity: file ? 1 : 0.5 }}
              data-testid="button-send"
            >
              {file ? 'Generate Code >>' : 'Select a file first'}
            </button>

            <div className="mt-8 pt-6" style={{ borderTop: '2px solid hsl(var(--border-shadow))' }}>
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--text-secondary))' }}>
                  or Receive a File
                </h2>
              </div>
              <div className="retro-border p-4 flex flex-col sm:flex-row gap-3 items-center justify-center">
                <Download size={24} style={{ color: 'hsl(var(--text-secondary))' }} />
                <input
                  type="text"
                  maxLength={6}
                  value={receiveCode}
                  onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter code"
                  className="retro-input text-center text-xl font-mono tracking-widest w-36"
                  data-testid="input-receive-code-home"
                />
                <button
                  onClick={handleReceiveSubmit}
                  disabled={receiveCode.length !== 6}
                  className="retro-button px-4 py-2"
                  style={{ opacity: receiveCode.length === 6 ? 1 : 0.5 }}
                  data-testid="button-receive-home"
                >
                  Receive
                </button>
              </div>
            </div>
          </>
        )}

        {status === 'waiting' && (
          <div className="text-center">
            <div className="retro-border p-6 mb-4">
              <div className="mb-2" style={{ color: 'hsl(var(--text-secondary))' }}>Share this code:</div>
              <div 
                className="text-4xl sm:text-5xl font-mono font-bold tracking-widest py-4"
                style={{ color: 'hsl(var(--accent))' }}
                data-testid="text-code"
              >
                {code}
              </div>
              <div style={{ color: 'hsl(var(--text-secondary))' }}>
                Waiting for receiver...
              </div>
            </div>
            <button
              onClick={resetSender}
              className="retro-button"
              data-testid="button-cancel"
            >
              Cancel
            </button>
          </div>
        )}

        {(status === 'transferring' || status === 'connected') && (
          <div className="text-center">
            <div className="retro-border p-6 mb-4">
              <div className="mb-4" style={{ color: 'hsl(var(--accent))' }}>
                Transferring: {file?.name}
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
                Transfer Complete!
              </div>
              <div style={{ color: 'hsl(var(--text-secondary))' }}>
                {file?.name} has been sent successfully.
              </div>
            </div>
            <button
              onClick={resetSender}
              className="retro-button"
              data-testid="button-send-another"
            >
              Send Another File
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
