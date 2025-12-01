import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Download, Check, AlertCircle } from "lucide-react";
import { useSearch } from "wouter";

type ReceiveStatus = 'idle' | 'connecting' | 'connected' | 'receiving' | 'complete' | 'error';

export default function Receive() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialCode = urlParams.get('code') || '';
  
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<ReceiveStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [statusText, setStatusText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<string[]>([]);
  const startTimeRef = useRef<number>(0);

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

  useEffect(() => {
    if (initialCode.length === 6) {
      startReceiving(initialCode);
    }
  }, []);

  const startReceiving = async (codeToUse?: string) => {
    const activeCode = codeToUse || code;
    if (activeCode.length !== 6) return;

    setStatus('connecting');
    setStatusText("Connecting...");
    chunksRef.current = [];

    try {
      const response = await fetch(`/api/session/${activeCode}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Session not found');
      }

      const session = await response.json();
      setFileName(session.fileName);
      setFileSize(session.fileSize);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-receiver', code: activeCode }));
        setStatusText("Waiting for sender...");
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            setStatus('connected');
            setFileName(message.fileName);
            setFileSize(message.fileSize);
            break;

          case 'peer-connected':
            setStatus('receiving');
            setStatusText("Receiving...");
            startTimeRef.current = Date.now();
            break;

          case 'chunk':
            chunksRef.current[message.index] = message.data;
            const percent = Math.round(((message.index + 1) / message.total) * 100);
            setProgress(percent);
            
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            if (elapsed > 0) {
              const bytesReceived = (message.index + 1) * 256 * 1024;
              setSpeed(bytesReceived / elapsed / 1024 / 1024);
            }
            
            ws.send(JSON.stringify({ type: 'progress', percent }));
            break;

          case 'transfer-complete':
            setStatusText("Processing...");
            saveFile();
            setStatus('complete');
            break;

          case 'peer-disconnected':
            setStatusText("Sender disconnected");
            setStatus('error');
            break;

          case 'error':
            setStatusText(message.error);
            setStatus('error');
            break;
        }
      };

      ws.onerror = () => {
        setStatusText("Connection failed");
        setStatus('error');
      };

    } catch (error: any) {
      setStatusText(error.message);
      setStatus('error');
    }
  };

  const saveFile = () => {
    if (!fileName || chunksRef.current.length === 0) return;

    try {
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
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusText("Download complete!");
    } catch (error: any) {
      setStatusText("Failed to save file");
      setStatus('error');
    }
  };

  const reset = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCode("");
    setStatus('idle');
    setProgress(0);
    setSpeed(0);
    setFileName("");
    setFileSize(0);
    setStatusText("");
    chunksRef.current = [];
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
            <Download className="w-6 h-6 text-accent" />
            <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-accent">
              RECEIVE FILE
            </h1>
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            Enter the 6-digit code from sender
          </p>
        </div>

        {/* Main Content */}
        <div className="panel-container">
          {status === 'idle' && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6">
                <div className="font-mono text-xs text-muted-foreground mb-3 text-center">
                  ENTER TRANSFER CODE
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="tech-input w-full text-center font-mono text-3xl tracking-[0.4em] py-4 placeholder:tracking-[0.4em] placeholder:text-muted-foreground/30"
                  data-testid="input-code"
                />
              </div>

              <button
                onClick={() => startReceiving()}
                disabled={code.length !== 6}
                className={`tech-button w-full py-3 font-mono text-sm transition-all duration-300 ${
                  code.length === 6 ? 'hover:scale-[1.02]' : 'opacity-40 cursor-not-allowed'
                }`}
                data-testid="button-receive"
              >
                CONNECT
              </button>
            </div>
          )}

          {(status === 'connecting' || status === 'connected') && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6 text-center">
                <div className="font-mono text-xs text-muted-foreground mb-4">
                  {statusText}
                </div>
                {fileName && (
                  <div className="tech-panel-inset p-3">
                    <div className="font-mono text-sm text-accent truncate">
                      {fileName}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground mt-1">
                      {formatFileSize(fileSize)}
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <div className="inline-block w-4 h-4 border-2 border-accent border-t-transparent animate-spin" />
                </div>
              </div>

              <button
                onClick={reset}
                className="tech-button-outline w-full py-2 font-mono text-xs"
                data-testid="button-cancel"
              >
                CANCEL
              </button>
            </div>
          )}

          {status === 'receiving' && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6">
                <div className="font-mono text-xs text-muted-foreground mb-2 text-center">
                  DOWNLOADING
                </div>
                <div className="font-mono text-sm text-accent truncate text-center mb-4">
                  {fileName}
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
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="font-mono text-sm text-green-500">
                    DOWNLOAD COMPLETE
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {fileName}
                </div>
              </div>

              <button
                onClick={reset}
                className="tech-button w-full py-3 font-mono text-sm"
                data-testid="button-receive-another"
              >
                RECEIVE ANOTHER FILE
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 animate-fade-in">
              <div className="tech-panel p-6 text-center border-red-500/50">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="font-mono text-sm text-red-500">
                    ERROR
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {statusText}
                </div>
              </div>

              <button
                onClick={reset}
                className="tech-button w-full py-3 font-mono text-sm"
                data-testid="button-try-again"
              >
                TRY AGAIN
              </button>
            </div>
          )}
        </div>
      </div>
    </RetroLayout>
  );
}
