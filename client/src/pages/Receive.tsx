import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { ArrowRight, CheckCircle, Clock, Pause, Play, X, Trash2 } from "lucide-react";
import { useSearch } from "wouter";
import { useWebRTC } from "../hooks/useWebRTC";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { SpeedIndicator } from "../components/SpeedIndicator";
import { formatFileSize, formatTime, formatTimeRemaining, formatHistoryDate, getLogColor, getStatusColor } from "../lib/utils";

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data';
  timestamp: Date;
}

interface CompletedSessionInfo {
  fileName: string;
  fileSize: number;
  completedAt: string;
  message: string;
}

export default function Receive() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialCode = urlParams.get('code') || '';
  
  const [code, setCode] = useState(initialCode);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'waiting' | 'receiving' | 'complete' | 'already-completed' | 'expired' | 'cancelled'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [bytesTransferred, setBytesTransferred] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [receivedData, setReceivedData] = useState<{ chunks: ArrayBuffer[], fileInfo: { name: string; size: number; mimeType: string } } | null>(null);
  const [completedSession, setCompletedSession] = useState<CompletedSessionInfo | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  const currentCodeRef = useRef<string>('');
  const { history, addRecord, clearHistory, getRecentReceives } = useTransferHistory();

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: logIdRef.current++, message, type, timestamp: new Date() }]);
  };

  const webrtc = useWebRTC({
    onProgress: (percent, speed, transferred, total) => {
      setProgress(percent);
      setCurrentSpeed(speed);
      setBytesTransferred(transferred);
      setTotalBytes(total);
    },
    onComplete: () => {
      setCurrentSpeed(0);
    },
    onError: (error) => {
      addLog(error, 'error');
      if (error.includes('cancelled')) {
        setStatus('cancelled');
      } else {
        setStatus('idle');
      }
      setCurrentSpeed(0);
    },
    onLog: addLog
  });

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (initialCode.length === 6) {
      startReceiving(initialCode);
    }
  }, []);

  const formatCompletedDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const startReceiving = async (codeToUse?: string) => {
    const activeCode = codeToUse || code;
    if (activeCode.length !== 6) {
      addLog('invalid code', 'error');
      return;
    }

    currentCodeRef.current = activeCode;
    setLogs([]);
    setStatus('connecting');
    setCompletedSession(null);
    addLog('connecting...', 'system');

    try {
      const response = await fetch(`/api/session/${activeCode}`);
      
      if (response.status === 410) {
        const data = await response.json();
        
        if (data.status === 'completed') {
          setCompletedSession({
            fileName: data.fileName,
            fileSize: data.fileSize,
            completedAt: data.completedAt,
            message: data.message
          });
          setStatus('already-completed');
          addLog('transfer already completed', 'warn');
          return;
        }
        
        if (data.status === 'expired') {
          setStatus('expired');
          addLog('session expired', 'error');
          return;
        }
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Session not found');
      }

      const session = await response.json();
      const sessionToken = session.token;
      setFileInfo({ name: session.fileName, size: session.fileSize });
      setTotalBytes(session.fileSize);
      addLog(`file: ${session.fileName}`, 'success');
      addLog(`${formatFileSize(session.fileSize)}`, 'data');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-receiver', code: activeCode, token: sessionToken }));
        addLog('connected to server', 'info');
      };

      let isMultiShareSession = false;
      let multiShareReceiverPromise: Promise<any> | null = null;

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('joined as receiver', 'info');
            if (message.isMultiShare) {
              isMultiShareSession = true;
              addLog('multi-share session', 'system');
              setStatus('receiving');
              addLog('connecting to sender...', 'system');
              multiShareReceiverPromise = webrtc.initReceiver(ws);
              multiShareReceiverPromise.then((result) => {
                setReceivedData(result);
                saveFile(result.chunks, result.fileInfo);
                setStatus('complete');
                ws.send(JSON.stringify({ type: 'transfer-complete' }));
                
                addRecord({
                  type: 'receive',
                  fileName: result.fileInfo.name,
                  fileSize: result.fileInfo.size,
                  code: currentCodeRef.current,
                  status: 'completed',
                  duration: result.duration,
                  avgSpeed: result.avgSpeed
                });
              }).catch((err: any) => {
                if (err.message?.includes('cancelled')) {
                  addLog('transfer cancelled', 'error');
                  setStatus('cancelled');
                  if (fileInfo) {
                    addRecord({
                      type: 'receive',
                      fileName: fileInfo.name,
                      fileSize: fileInfo.size,
                      code: currentCodeRef.current,
                      status: 'cancelled'
                    });
                  }
                } else {
                  addLog(err.message || 'Transfer failed', 'error');
                  setStatus('idle');
                  if (fileInfo) {
                    addRecord({
                      type: 'receive',
                      fileName: fileInfo.name,
                      fileSize: fileInfo.size,
                      code: currentCodeRef.current,
                      status: 'failed'
                    });
                  }
                }
              });
            } else {
              setStatus('waiting');
              addLog('waiting for sender...', 'warn');
            }
            break;

          case 'peer-connected':
            if (!isMultiShareSession) {
              addLog('sender connected', 'success');
              addLog('establishing P2P...', 'system');
              setStatus('receiving');
              try {
                const result = await webrtc.initReceiver(ws);
                setReceivedData(result);
                saveFile(result.chunks, result.fileInfo);
                setStatus('complete');
                ws.send(JSON.stringify({ type: 'transfer-complete' }));
                
                addRecord({
                  type: 'receive',
                  fileName: result.fileInfo.name,
                  fileSize: result.fileInfo.size,
                  code: currentCodeRef.current,
                  status: 'completed',
                  duration: result.duration,
                  avgSpeed: result.avgSpeed
                });
              } catch (err: any) {
                if (err.message?.includes('cancelled')) {
                  addLog('transfer cancelled', 'error');
                  setStatus('cancelled');
                  if (fileInfo) {
                    addRecord({
                      type: 'receive',
                      fileName: fileInfo.name,
                      fileSize: fileInfo.size,
                      code: currentCodeRef.current,
                      status: 'cancelled'
                    });
                  }
                } else {
                  addLog(err.message || 'Transfer failed', 'error');
                  setStatus('idle');
                  if (fileInfo) {
                    addRecord({
                      type: 'receive',
                      fileName: fileInfo.name,
                      fileSize: fileInfo.size,
                      code: currentCodeRef.current,
                      status: 'failed'
                    });
                  }
                }
              }
            }
            break;

          case 'signal':
            webrtc.handleSignal(message.data);
            break;

          case 'session-stopped':
            addLog('session ended by sender', 'warn');
            setStatus('idle');
            webrtc.cleanup();
            break;

          case 'transfer-complete':
            break;

          case 'peer-disconnected':
            addLog('sender disconnected', 'error');
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
        if (statusRef.current !== 'complete' && statusRef.current !== 'cancelled') {
          addLog('disconnected', 'warn');
        }
      };

    } catch (error: any) {
      addLog(`${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const saveFile = (chunks: ArrayBuffer[], info: { name: string; size: number; mimeType: string }) => {
    try {
      addLog('processing...', 'system');
      const blob = new Blob(chunks, { type: info.mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = info.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog(`saved: ${info.name}`, 'success');
    } catch (error: any) {
      addLog(`${error.message}`, 'error');
    }
  };

  const handlePauseResume = () => {
    if (webrtc.isPaused) {
      webrtc.resume();
    } else {
      webrtc.pause();
    }
  };

  const handleCancel = () => {
    webrtc.cancel();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const resetReceiver = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    webrtc.cleanup();
    setCode("");
    setStatus('idle');
    setProgress(0);
    setCurrentSpeed(0);
    setBytesTransferred(0);
    setTotalBytes(0);
    setFileInfo(null);
    setReceivedData(null);
    setCompletedSession(null);
    setLogs([]);
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      webrtc.cleanup();
    };
  }, []);

  const bytesRemaining = totalBytes - bytesTransferred;

  return (
    <RetroLayout>
      <div className="h-full flex items-start justify-start gap-6 pl-4">
        <div className="w-72 flex flex-col gap-4">
          {status === 'idle' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                    RECEIVE
                  </div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-[9px] tracking-wider transition-colors"
                    style={{ color: showHistory ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}
                    data-testid="button-toggle-history"
                  >
                    {showHistory ? 'HIDE HISTORY' : 'HISTORY'}
                  </button>
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

              {showHistory && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                      RECENT TRANSFERS
                    </div>
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-[9px] transition-colors"
                        style={{ color: 'hsl(0 65% 55%)' }}
                        data-testid="button-clear-history"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                  <div className="minimal-border p-2 max-h-40 overflow-y-auto">
                    {history.length === 0 ? (
                      <div className="text-[10px] text-center py-2" style={{ color: 'hsl(var(--text-dim))' }}>
                        no transfers yet
                      </div>
                    ) : (
                      history.slice(0, 10).map((record) => (
                        <div key={record.id} className="py-1.5 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] truncate" style={{ color: 'hsl(var(--text-secondary))' }}>
                                {record.fileName}
                              </div>
                              <div className="flex items-center gap-2 text-[9px]" style={{ color: 'hsl(var(--text-dim))' }}>
                                <span>{record.type === 'send' ? 'sent' : 'received'}</span>
                                <span>{formatFileSize(record.fileSize)}</span>
                                <span style={{ color: getStatusColor(record.status) }}>{record.status}</span>
                              </div>
                            </div>
                            <div className="text-[9px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatHistoryDate(record.timestamp)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
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

          {status === 'already-completed' && completedSession && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                ALREADY COMPLETED
              </div>
              <div className="minimal-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={16} style={{ color: 'hsl(var(--accent))' }} />
                  <div className="text-xs" style={{ color: 'hsl(var(--accent))' }}>
                    Transfer completed
                  </div>
                </div>
                <div className="text-xs truncate mb-1" style={{ color: 'hsl(var(--text-secondary))' }}>
                  {completedSession.fileName}
                </div>
                <div className="text-[10px] mb-2" style={{ color: 'hsl(var(--text-dim))' }}>
                  {formatFileSize(completedSession.fileSize)}
                </div>
                <div className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  <Clock size={10} />
                  <span>{formatCompletedDate(completedSession.completedAt)}</span>
                </div>
                <div className="mt-3 pt-3 border-t text-[10px] text-center" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--text-dim))' }}>
                  This transfer was completed long ago
                </div>
              </div>
              <button
                onClick={resetReceiver}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-try-another"
              >
                try another code
              </button>
            </div>
          )}

          {status === 'expired' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                EXPIRED
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="text-xs mb-2" style={{ color: 'hsl(0 65% 55%)' }}>
                  Session expired
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  This transfer session has expired
                </div>
              </div>
              <button
                onClick={resetReceiver}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-try-another-expired"
              >
                try another code
              </button>
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
                RECEIVING {webrtc.isPaused && '(PAUSED)'}
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
                <div className="flex justify-between text-[10px] mb-2" style={{ color: 'hsl(var(--text-dim))' }}>
                  <span>{progress}%</span>
                  {currentSpeed > 0 && !webrtc.isPaused && (
                    <span style={{ color: 'hsl(var(--accent))' }}>
                      {currentSpeed.toFixed(1)} MB/s
                    </span>
                  )}
                </div>
                {currentSpeed > 0 && bytesRemaining > 0 && !webrtc.isPaused && (
                  <div className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    <Clock size={10} />
                    <span>{formatTimeRemaining(bytesRemaining, currentSpeed)}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handlePauseResume}
                  className="minimal-btn flex-1 flex items-center justify-center gap-2 minimal-btn-accent"
                  data-testid="button-pause-resume"
                >
                  {webrtc.isPaused ? <Play size={12} /> : <Pause size={12} />}
                  {webrtc.isPaused ? 'resume' : 'pause'}
                </button>
                <button
                  onClick={handleCancel}
                  className="minimal-btn flex-1 flex items-center justify-center gap-2"
                  style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 55%)' }}
                  data-testid="button-cancel-transfer"
                >
                  <X size={12} />
                  cancel
                </button>
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
                  {fileInfo?.name || receivedData?.fileInfo.name}
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

          {status === 'cancelled' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CANCELLED
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="text-xs" style={{ color: 'hsl(0 65% 55%)' }}>
                  transfer cancelled
                </div>
              </div>
              <button
                onClick={resetReceiver}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-try-again"
              >
                try another code
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
      <SpeedIndicator currentSpeed={status === 'receiving' && !webrtc.isPaused ? currentSpeed : undefined} />
    </RetroLayout>
  );
}
