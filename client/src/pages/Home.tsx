import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Upload, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useWebRTC } from "../hooks/useWebRTC";
import { SpeedIndicator } from "../components/SpeedIndicator";

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
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: logIdRef.current++, message, type, timestamp: new Date() }]);
  };

  const webrtc = useWebRTC({
    onProgress: (percent, speed) => {
      setProgress(percent);
      setCurrentSpeed(speed);
    },
    onComplete: () => {
      setStatus('complete');
      setCurrentSpeed(0);
    },
    onError: (error) => {
      addLog(error, 'error');
      setStatus('idle');
      setCurrentSpeed(0);
    },
    onLog: addLog
  });

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
      addLog(`selected: ${selectedFile.name}`, 'system');
      addLog(`${formatFileSize(selectedFile.size)}`, 'data');
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
      addLog(`dropped: ${droppedFile.name}`, 'system');
      addLog(`${formatFileSize(droppedFile.size)}`, 'data');
    }
  };

  const startSending = async () => {
    if (!file) return;

    setLogs([]);
    addLog('creating session...', 'system');

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
      addLog(`code: ${data.code}`, 'success');
      addLog('waiting for receiver...', 'warn');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-sender', code: data.code }));
        addLog('connected to server', 'info');
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('joined as sender', 'info');
            break;

          case 'peer-connected':
            addLog('receiver connected', 'success');
            addLog('establishing P2P...', 'system');
            setStatus('transferring');
            try {
              await webrtc.initSender(ws, file);
              ws.send(JSON.stringify({ type: 'transfer-complete' }));
            } catch (err: any) {
              addLog(err.message || 'Transfer failed', 'error');
              setStatus('idle');
            }
            break;

          case 'signal':
            webrtc.handleSignal(message.data);
            break;

          case 'transfer-complete':
            addLog('transfer verified', 'success');
            setStatus('complete');
            break;

          case 'peer-disconnected':
            addLog('receiver disconnected', 'error');
            setStatus('idle');
            webrtc.cleanup();
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
        if (statusRef.current !== 'complete') {
          addLog('disconnected', 'warn');
        }
      };

    } catch (error: any) {
      addLog(`${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const resetSender = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    webrtc.cleanup();
    setFile(null);
    setCode("");
    setStatus('idle');
    setProgress(0);
    setCurrentSpeed(0);
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
      webrtc.cleanup();
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
        <div className="w-72 flex flex-col gap-4">
          {status === 'idle' && (
            <>
              <div>
                <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                  SEND
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`drop-zone p-4 cursor-pointer ${isDragOver ? 'active' : ''}`}
                  data-testid="drop-zone"
                >
                  <div className="flex items-center gap-3">
                    <Upload
                      size={16}
                      style={{ color: isDragOver ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}
                    />
                    {file ? (
                      <div className="min-w-0 flex-1">
                        <div className="text-xs truncate" style={{ color: 'hsl(var(--accent))' }}>
                          {file.name}
                        </div>
                        <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                        drop or click
                      </div>
                    )}
                  </div>
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
                  className={`minimal-btn w-full mt-2 flex items-center justify-center gap-2 ${file ? 'minimal-btn-accent' : ''}`}
                  data-testid="button-send"
                >
                  {file ? 'generate code' : 'select file'}
                  {file && <ArrowRight size={12} />}
                </button>
              </div>

              <div>
                <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                  RECEIVE
                </div>
                <div className="minimal-border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={receiveCode}
                      onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="minimal-input flex-1 text-center tracking-[0.3em] text-sm"
                      data-testid="input-receive-code-home"
                    />
                    <button
                      onClick={handleReceiveSubmit}
                      disabled={receiveCode.length !== 6}
                      className={`minimal-btn px-3 ${receiveCode.length === 6 ? 'minimal-btn-accent' : ''}`}
                      data-testid="button-receive-home"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {status === 'waiting' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CODE
              </div>
              <div className="minimal-border-accent p-4 text-center">
                <div 
                  className="text-2xl font-medium tracking-[0.4em] glow-text"
                  style={{ color: 'hsl(var(--accent))' }}
                  data-testid="text-code"
                >
                  {code}
                </div>
                <div className="text-[10px] mt-2 animate-pulse-subtle" style={{ color: 'hsl(var(--text-dim))' }}>
                  waiting for receiver
                </div>
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn w-full mt-2"
                data-testid="button-cancel"
              >
                cancel
              </button>
            </div>
          )}

          {(status === 'transferring' || status === 'connected') && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                TRANSFER
              </div>
              <div className="minimal-border p-4">
                <div className="text-xs truncate mb-3" style={{ color: 'hsl(var(--accent))' }}>
                  {file?.name}
                </div>
                <div className="progress-track mb-2">
                  <div 
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  <span>{progress}%</span>
                  {currentSpeed > 0 && (
                    <span style={{ color: 'hsl(var(--accent))' }}>
                      {currentSpeed.toFixed(1)} MB/s
                    </span>
                  )}
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
                  transfer complete
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  {file?.name}
                </div>
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-send-another"
              >
                send another
              </button>
            </div>
          )}
        </div>

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
      <SpeedIndicator currentSpeed={status === 'transferring' ? currentSpeed : undefined} />
    </RetroLayout>
  );
}
