import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Upload } from "lucide-react";

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connected' | 'transferring' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: logIdRef.current++, message, type }]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      addLog(`Selected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`);
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
      addLog(`Selected: ${droppedFile.name} (${formatFileSize(droppedFile.size)})`);
    }
  };

  const startSending = async () => {
    if (!file) return;

    setLogs([]);
    addLog('Creating transfer session...');

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
      addLog(`Your code: ${data.code}`, 'success');
      addLog('Waiting for receiver to connect...');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-sender', code: data.code }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('Connected to server');
            break;

          case 'peer-connected':
            addLog('Receiver connected! Starting transfer...', 'success');
            setStatus('transferring');
            await sendFile(ws);
            break;

          case 'progress':
            setProgress(message.percent);
            break;

          case 'transfer-complete':
            addLog('Transfer complete!', 'success');
            setStatus('complete');
            break;

          case 'peer-disconnected':
            addLog('Receiver disconnected', 'error');
            setStatus('idle');
            break;

          case 'error':
            addLog(`Error: ${message.error}`, 'error');
            setStatus('idle');
            break;
        }
      };

      ws.onerror = () => {
        addLog('Connection error', 'error');
        setStatus('idle');
      };

      ws.onclose = () => {
        if (status !== 'complete') {
          addLog('Connection closed');
        }
      };

    } catch (error: any) {
      addLog(`Error: ${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const sendFile = async (ws: WebSocket) => {
    if (!file) return;

    const CHUNK_SIZE = 64 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    addLog(`Sending ${totalChunks} chunks...`);

    const reader = new FileReader();
    let currentChunk = 0;

    const sendNextChunk = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      reader.onload = (e) => {
        if (e.target?.result && ws.readyState === WebSocket.OPEN) {
          const base64 = (e.target.result as string).split(',')[1];
          
          ws.send(JSON.stringify({
            type: 'chunk',
            data: base64,
            index: currentChunk,
            total: totalChunks,
          }));

          currentChunk++;
          const percent = Math.round((currentChunk / totalChunks) * 100);
          setProgress(percent);

          if (currentChunk < totalChunks) {
            setTimeout(sendNextChunk, 10);
          } else {
            ws.send(JSON.stringify({ type: 'transfer-complete' }));
          }
        }
      };

      reader.readAsDataURL(blob);
    };

    sendNextChunk();
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

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

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
                    transition: 'width 0.3s ease'
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
          <div className="mt-6 retro-border-inset p-3 max-h-48 overflow-y-auto font-mono text-sm">
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  color: log.type === 'error' ? 'hsl(var(--destructive))' :
                         log.type === 'success' ? 'hsl(var(--accent))' :
                         'hsl(var(--text-secondary))'
                }}
              >
                {'>'} {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </RetroLayout>
  );
}
