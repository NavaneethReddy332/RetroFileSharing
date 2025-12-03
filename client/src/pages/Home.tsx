import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Upload, ArrowRight, Copy, Check, Pause, Play, X, Clock, FileArchive, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { useWebRTC } from "../hooks/useWebRTC";
import { useTransferHistory, TransferRecord } from "../hooks/useTransferHistory";
import { SpeedIndicator } from "../components/SpeedIndicator";
import ZipWorker from "../workers/zipWorker?worker";

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data';
  timestamp: Date;
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [code, setCode] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'zipping' | 'waiting' | 'connected' | 'transferring' | 'complete' | 'cancelled'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [bytesTransferred, setBytesTransferred] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [transferStartTime, setTransferStartTime] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const zipWorkerRef = useRef<Worker | null>(null);
  const [zipProgress, setZipProgress] = useState(0);
  const [, navigate] = useLocation();
  const statusRef = useRef(status);
  const { history, addRecord, clearHistory, getRecentSends } = useTransferHistory();

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
      setStatus('complete');
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

  const formatTimeRemaining = (bytesRemaining: number, speedMBps: number): string => {
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
  };

  const formatHistoryDate = (date: Date): string => {
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
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
      setZipFile(null);
      if (selectedFiles.length === 1) {
        addLog(`selected: ${selectedFiles[0].name}`, 'system');
        addLog(`${formatFileSize(selectedFiles[0].size)}`, 'data');
      } else {
        addLog(`selected: ${selectedFiles.length} files`, 'system');
        const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
        addLog(`${formatFileSize(totalSize)} total`, 'data');
      }
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles(droppedFiles);
      setZipFile(null);
      if (droppedFiles.length === 1) {
        addLog(`dropped: ${droppedFiles[0].name}`, 'system');
        addLog(`${formatFileSize(droppedFiles[0].size)}`, 'data');
      } else {
        addLog(`dropped: ${droppedFiles.length} files`, 'system');
        const totalSize = droppedFiles.reduce((sum, f) => sum + f.size, 0);
        addLog(`${formatFileSize(totalSize)} total`, 'data');
      }
    }
  };

  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

  const createZipFile = async (filesToZip: File[]): Promise<File> => {
    return new Promise(async (resolve, reject) => {
      const worker = new ZipWorker();
      zipWorkerRef.current = worker;
      
      const zipFileName = filesToZip.length > 1 
        ? `retrosend_${Date.now()}.zip`
        : `${filesToZip[0].name.replace(/\.[^/.]+$/, '')}.zip`;

      const fileDataArray: { name: string; data: ArrayBuffer }[] = [];
      
      addLog('reading files...', 'data');
      
      for (let i = 0; i < filesToZip.length; i++) {
        const file = filesToZip[i];
        const arrayBuffer = await file.arrayBuffer();
        fileDataArray.push({ name: file.name, data: arrayBuffer });
        
        const readPercent = Math.round(((i + 1) / filesToZip.length) * 15);
        setZipProgress(readPercent);
        
        await yieldToMain();
      }

      worker.onmessage = (e) => {
        const { type, percent, blob, fileName, message, phase } = e.data;
        
        if (type === 'progress') {
          const adjustedPercent = 15 + Math.round(percent * 0.85);
          setZipProgress(Math.min(adjustedPercent, 100));
        } else if (type === 'complete') {
          worker.terminate();
          zipWorkerRef.current = null;
          setZipProgress(0);
          const zipFile = new File([blob], fileName, { type: 'application/zip' });
          resolve(zipFile);
        } else if (type === 'error') {
          worker.terminate();
          zipWorkerRef.current = null;
          setZipProgress(0);
          reject(new Error(message));
        } else if (type === 'cancelled') {
          worker.terminate();
          zipWorkerRef.current = null;
          setZipProgress(0);
          reject(new Error('cancelled'));
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        zipWorkerRef.current = null;
        setZipProgress(0);
        reject(new Error('Worker error: ' + error.message));
      };

      worker.postMessage({
        type: 'start',
        files: fileDataArray,
        zipFileName
      });
    });
  };

  const cancelZipping = () => {
    if (zipWorkerRef.current) {
      zipWorkerRef.current.postMessage({ type: 'cancel' });
    }
  };

  const startSending = async () => {
    if (files.length === 0) return;

    setLogs([]);
    let fileToSend: File;

    if (files.length > 1) {
      setStatus('zipping');
      setIsZipping(true);
      addLog(`creating zip of ${files.length} files...`, 'system');
      
      try {
        fileToSend = await createZipFile(files);
        setZipFile(fileToSend);
        setIsZipping(false);
        addLog(`zip created: ${fileToSend.name}`, 'success');
        addLog(`${formatFileSize(fileToSend.size)}`, 'data');
      } catch (error: any) {
        addLog(`zip failed: ${error.message}`, 'error');
        setIsZipping(false);
        setStatus('idle');
        return;
      }
    } else {
      fileToSend = files[0];
    }

    addLog('creating session...', 'system');

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileToSend.name,
          fileSize: fileToSend.size,
          mimeType: fileToSend.type || 'application/octet-stream',
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
            setTransferStartTime(Date.now());
            setTotalBytes(fileToSend.size);
            setBytesTransferred(0);
            try {
              const result = await webrtc.initSender(ws, fileToSend);
              ws.send(JSON.stringify({ type: 'transfer-complete' }));
              
              addRecord({
                type: 'send',
                fileName: fileToSend.name,
                fileSize: fileToSend.size,
                code: data.code,
                status: 'completed',
                duration: result.duration,
                avgSpeed: result.avgSpeed
              });
            } catch (err: any) {
              if (err.message?.includes('cancelled')) {
                addLog('transfer cancelled', 'error');
                setStatus('cancelled');
                addRecord({
                  type: 'send',
                  fileName: fileToSend.name,
                  fileSize: fileToSend.size,
                  code: data.code,
                  status: 'cancelled'
                });
              } else {
                addLog(err.message || 'Transfer failed', 'error');
                setStatus('idle');
                addRecord({
                  type: 'send',
                  fileName: fileToSend.name,
                  fileSize: fileToSend.size,
                  code: data.code,
                  status: 'failed'
                });
              }
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
        if (statusRef.current !== 'complete' && statusRef.current !== 'cancelled') {
          addLog('disconnected', 'warn');
        }
      };

    } catch (error: any) {
      addLog(`${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      addLog('code copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      addLog('failed to copy code', 'error');
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

  const resetSender = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (zipWorkerRef.current) {
      zipWorkerRef.current.postMessage({ type: 'cancel' });
      zipWorkerRef.current.terminate();
      zipWorkerRef.current = null;
    }
    webrtc.cleanup();
    setFiles([]);
    setZipFile(null);
    setCode("");
    setStatus('idle');
    setProgress(0);
    setZipProgress(0);
    setCurrentSpeed(0);
    setBytesTransferred(0);
    setTotalBytes(0);
    setLogs([]);
    setCopied(false);
  };

  const handleReceiveSubmit = () => {
    if (receiveCode.length === 6) {
      navigate(`/receive?code=${receiveCode}`);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (zipWorkerRef.current) {
        zipWorkerRef.current.terminate();
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

  const getStatusColor = (recordStatus: string) => {
    switch (recordStatus) {
      case 'completed': return 'hsl(var(--accent))';
      case 'cancelled': return 'hsl(45 80% 55%)';
      case 'failed': return 'hsl(0 65% 55%)';
      default: return 'hsl(var(--text-dim))';
    }
  };

  const activeFile = zipFile || (files.length === 1 ? files[0] : null);
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
                    SEND
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
                    {files.length > 0 ? (
                      <div className="min-w-0 flex-1">
                        {files.length === 1 ? (
                          <>
                            <div className="text-xs truncate" style={{ color: 'hsl(var(--accent))' }}>
                              {files[0].name}
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatFileSize(files[0].size)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--accent))' }}>
                              <FileArchive size={12} />
                              {files.length} files
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))} total
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                        drop or click (multi-select)
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-file"
                />

                {files.length > 1 && (
                  <div className="mt-2 max-h-24 overflow-y-auto minimal-border p-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between py-1 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] truncate" style={{ color: 'hsl(var(--text-secondary))' }}>
                            {file.name}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                          className="p-0.5 transition-colors"
                          style={{ color: 'hsl(var(--text-dim))' }}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={startSending}
                  disabled={files.length === 0}
                  className={`minimal-btn w-full mt-2 flex items-center justify-center gap-2 ${files.length > 0 ? 'minimal-btn-accent' : ''}`}
                  data-testid="button-send"
                >
                  {files.length > 1 ? 'zip & generate code' : files.length === 1 ? 'generate code' : 'select file(s)'}
                  {files.length > 0 && <ArrowRight size={12} />}
                </button>
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

          {status === 'zipping' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CREATING ZIP
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <FileArchive size={16} style={{ color: 'hsl(var(--accent))' }} />
                </div>
                <div className="text-xs mb-2" style={{ color: 'hsl(var(--text-secondary))' }}>
                  compressing {files.length} files... {zipProgress > 0 ? `${zipProgress}%` : ''}
                </div>
                {zipProgress > 0 && (
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                    <div 
                      className="h-full transition-all duration-200" 
                      style={{ 
                        width: `${zipProgress}%`, 
                        background: 'hsl(var(--accent))' 
                      }} 
                    />
                  </div>
                )}
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn w-full mt-2"
                data-testid="button-cancel-zip"
              >
                cancel
              </button>
            </div>
          )}

          {status === 'waiting' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CODE
              </div>
              <div className="minimal-border-accent p-4">
                <div className="flex items-center justify-center gap-3">
                  <div 
                    className="text-2xl font-medium tracking-[0.4em] glow-text"
                    style={{ color: 'hsl(var(--accent))' }}
                    data-testid="text-code"
                  >
                    {code}
                  </div>
                  <button
                    onClick={copyCode}
                    className="p-2 transition-colors minimal-border"
                    style={{ color: copied ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}
                    title="Copy code"
                    data-testid="button-copy-code"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="text-[10px] mt-2 text-center animate-pulse-subtle" style={{ color: 'hsl(var(--text-dim))' }}>
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
                TRANSFER {webrtc.isPaused && '(PAUSED)'}
              </div>
              <div className="minimal-border p-4">
                <div className="text-xs truncate mb-3" style={{ color: 'hsl(var(--accent))' }}>
                  {activeFile?.name || `${files.length} files (zipped)`}
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
                  transfer complete
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  {activeFile?.name || `${files.length} files`}
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

          {status === 'cancelled' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CANCELLED
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="text-xs mb-1" style={{ color: 'hsl(45 80% 55%)' }}>
                  transfer cancelled
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  {activeFile?.name || `${files.length} files`}
                </div>
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-try-again"
              >
                try again
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
      <SpeedIndicator currentSpeed={status === 'transferring' && !webrtc.isPaused ? currentSpeed : undefined} />
    </RetroLayout>
  );
}
