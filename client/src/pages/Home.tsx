import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Upload, Download, Zap, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

type TransferStatus = 'idle' | 'waiting' | 'connected' | 'transferring' | 'complete';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState<string>("");
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const [statusText, setStatusText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [, navigate] = useLocation();

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  };

  const generateProgressBar = (percent: number): string => {
    const totalBlocks = 20;
    const filled = Math.round((percent / 100) * totalBlocks);
    const empty = totalBlocks - filled;
    return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
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
      setFile(e.dataTransfer.files[0]);
    }
  };

  const startSending = async () => {
    if (!file) return;

    setStatusText("Creating session...");

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

      if (!response.ok) throw new Error('Failed to create session');

      const data = await response.json();
      setCode(data.code);
      setStatus('waiting');
      setStatusText("Waiting for receiver...");

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-sender', code: data.code }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'peer-connected':
            setStatusText("Receiver connected! Starting transfer...");
            setStatus('transferring');
            await sendFile(ws);
            break;
          case 'progress':
            setProgress(message.percent);
            break;
          case 'transfer-complete':
            setStatusText("Transfer complete!");
            setStatus('complete');
            break;
          case 'peer-disconnected':
            setStatusText("Receiver disconnected");
            setStatus('idle');
            break;
          case 'error':
            setStatusText(`Error: ${message.error}`);
            setStatus('idle');
            break;
        }
      };

      ws.onerror = () => {
        setStatusText("Connection failed");
        setStatus('idle');
      };

    } catch (error: any) {
      setStatusText(`Error: ${error.message}`);
      setStatus('idle');
    }
  };

  const sendFile = async (ws: WebSocket) => {
    if (!file) return;

    const CHUNK_SIZE = 256 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const startTime = Date.now();

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
            for (let i = 0; i < uint8.byteLength; i++) {
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

    for (let i = 0; i < totalChunks; i++) {
      await sendChunk(i);
      
      const percent = Math.round(((i + 1) / totalChunks) * 100);
      setProgress(percent);
      
      const elapsed = (Date.now() - startTime) / 1000;
      const bytesSent = (i + 1) * CHUNK_SIZE;
      setSpeed(bytesSent / elapsed / 1024 / 1024);
    }
    
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
    setSpeed(0);
    setStatusText("");
  };

  const handleReceiveSubmit = () => {
    if (receiveCode.length === 6) {
      navigate(`/receive?code=${receiveCode}`);
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <RetroLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Zap className="w-6 h-6 text-accent animate-pulse-slow" />
            <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-accent">
              INSTANT FILE TRANSFER
            </h1>
            <Zap className="w-6 h-6 text-accent animate-pulse-slow" />
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            P2P transfer // No cloud storage // Direct connection
          </p>
        </div>

        {/* Main Content Area with smooth transitions */}
        <div className="panel-container">
          {status === 'idle' && (
            <div className="space-y-4 animate-fade-in">
              {/* File Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`tech-panel p-6 cursor-pointer transition-all duration-300 ${
                  isDragOver ? 'border-accent bg-accent/5 scale-[1.02]' : 'hover:border-accent/50'
                }`}
                data-testid="drop-zone"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`p-3 border border-current transition-all duration-300 ${
                    isDragOver ? 'text-accent scale-110' : 'text-muted-foreground'
                  }`}>
                    <Upload className="w-8 h-8" />
                  </div>
                  
                  {file ? (
                    <div className="text-center">
                      <div className="font-mono text-sm text-accent truncate max-w-xs">
                        {file.name}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mt-1">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="font-mono text-sm text-foreground">
                        DROP FILE HERE
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mt-1">
                        or click to browse
                      </div>
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

              {/* Action Button */}
              <button
                onClick={startSending}
                disabled={!file}
                className={`tech-button w-full py-3 font-mono text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                  file ? 'hover:scale-[1.02]' : 'opacity-40 cursor-not-allowed'
                }`}
                data-testid="button-send"
              >
                {file ? (
                  <>
                    <span>GENERATE CODE</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <span>SELECT FILE TO CONTINUE</span>
                )}
              </button>

              {/* Receive Section */}
              <div className="pt-4 border-t border-border/30">
                <div className="text-center mb-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    // RECEIVE MODE
                  </span>
                </div>
                <div className="tech-panel p-4">
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <input
                      type="text"
                      maxLength={6}
                      value={receiveCode}
                      onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="tech-input flex-1 text-center font-mono text-lg tracking-[0.3em] placeholder:tracking-[0.3em] placeholder:text-muted-foreground/30"
                      data-testid="input-receive-code-home"
                    />
                    <button
                      onClick={handleReceiveSubmit}
                      disabled={receiveCode.length !== 6}
                      className={`tech-button-sm font-mono text-xs px-4 py-2 transition-all duration-300 ${
                        receiveCode.length === 6 ? 'hover:scale-105' : 'opacity-40 cursor-not-allowed'
                      }`}
                      data-testid="button-receive-home"
                    >
                      GO
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'waiting' && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6 text-center">
                <div className="font-mono text-xs text-muted-foreground mb-2">
                  TRANSFER CODE
                </div>
                <div 
                  className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.2em] text-accent py-4 animate-glow"
                  data-testid="text-code"
                >
                  {code}
                </div>
                <div className="font-mono text-xs text-muted-foreground animate-pulse">
                  {statusText}
                </div>
              </div>
              
              <button
                onClick={resetSender}
                className="tech-button-outline w-full py-2 font-mono text-xs"
                data-testid="button-cancel"
              >
                CANCEL
              </button>
            </div>
          )}

          {(status === 'transferring' || status === 'connected') && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6">
                <div className="font-mono text-xs text-muted-foreground mb-2 text-center">
                  TRANSFERRING
                </div>
                <div className="font-mono text-sm text-accent truncate text-center mb-4">
                  {file?.name}
                </div>
                
                {/* Single Line Progress Bar */}
                <div className="tech-panel-inset p-3">
                  <div className="font-mono text-xs flex items-center justify-between gap-2">
                    <span className="text-muted-foreground w-12">{progress}%</span>
                    <span className="text-accent flex-1 text-center tracking-tight overflow-hidden">
                      [{generateProgressBar(progress)}]
                    </span>
                    <span className="text-muted-foreground w-16 text-right">
                      {speed.toFixed(1)}MB/s
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'complete' && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6 text-center">
                <div className="font-mono text-sm text-accent mb-2">
                  TRANSFER COMPLETE
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {file?.name} sent successfully
                </div>
              </div>
              
              <button
                onClick={resetSender}
                className="tech-button w-full py-3 font-mono text-sm"
                data-testid="button-send-another"
              >
                SEND ANOTHER FILE
              </button>
            </div>
          )}
        </div>
      </div>
    </RetroLayout>
  );
}
