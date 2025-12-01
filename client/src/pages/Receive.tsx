import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Download } from "lucide-react";

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function Receive() {
  const [code, setCode] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'waiting' | 'receiving' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<string[]>([]);
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

  const startReceiving = async () => {
    if (code.length !== 6) {
      addLog('Please enter a valid 6-digit code', 'error');
      return;
    }

    setLogs([]);
    setStatus('connecting');
    addLog('Connecting...');
    chunksRef.current = [];

    try {
      const response = await fetch(`/api/session/${code}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Session not found');
      }

      const session = await response.json();
      setFileInfo({ name: session.fileName, size: session.fileSize });
      addLog(`Found: ${session.fileName} (${formatFileSize(session.fileSize)})`);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-receiver', code }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('Connected to server');
            setStatus('waiting');
            addLog('Waiting for sender...');
            break;

          case 'peer-connected':
            addLog('Sender connected! Ready to receive...', 'success');
            setStatus('receiving');
            break;

          case 'chunk':
            chunksRef.current[message.index] = message.data;
            const percent = Math.round(((message.index + 1) / message.total) * 100);
            setProgress(percent);
            
            ws.send(JSON.stringify({ type: 'progress', percent }));
            break;

          case 'transfer-complete':
            addLog('Download complete! Saving file...', 'success');
            saveFile();
            setStatus('complete');
            break;

          case 'peer-disconnected':
            addLog('Sender disconnected', 'error');
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

  const saveFile = () => {
    if (!fileInfo || chunksRef.current.length === 0) return;

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
      a.download = fileInfo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog('File saved!', 'success');
    } catch (error: any) {
      addLog(`Save error: ${error.message}`, 'error');
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
              onClick={startReceiving}
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
