import { useLocation, useRoute } from "wouter";
import { useState, useEffect, useRef } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { useTerminal } from "../context/TerminalContext";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FileText, Lock, AlertTriangle, Copy, Eye, EyeOff } from "lucide-react";

interface FileInfo {
  code: string;
  originalName: string;
  size: number;
  mimetype: string;
  uploadedAt: string;
  expiresAt: string;
  isPasswordProtected: number;
  downloadCount: number;
  maxDownloads: number | null;
  remainingDownloads: number | null;
  isOneTime: number;
}

export default function Download() {
  const [, params] = useRoute("/download/:code");
  const code = params?.code;
  const [, setLocation] = useLocation();
  const { addLog, updateLastLog } = useTerminal();
  const { toast } = useToast();
  
  const [inputCode, setInputCode] = useState("");

  const { data: fileInfo, isLoading, isError, error } = useQuery<FileInfo>({
    queryKey: ['/api/file', code],
    enabled: !!code,
    retry: false,
  });

  const status = !code ? 'input' : isLoading ? 'searching' : isError ? 'error' : 'found';

  useEffect(() => {
    if (code) {
      addLog(`CONNECTING_TO_DB...`);
      addLog(`QUERY: SELECT * FROM FILES WHERE CODE='${code}'`);
    }
  }, [code, addLog]);

  useEffect(() => {
    if (fileInfo) {
      addLog(`SUCCESS: FILE_LOCATED`);
      addLog(`DECRYPTING_METADATA... OK`);
    } else if (isError && code) {
      addLog(`ERROR: FILE_NOT_FOUND_OR_EXPIRED`, 'error');
    }
  }, [fileInfo, isError, code, addLog]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addLog(`USER_INPUT: ${inputCode}`);
    setLocation(`/download/${inputCode}`);
  };

  const [downloadPassword, setDownloadPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (fileInfo?.isPasswordProtected) {
      setShowPasswordInput(true);
    }
  }, [fileInfo]);

  const handleGetDownloadLink = async () => {
    if (!code || !fileInfo) return;
    
    if (fileInfo.isPasswordProtected && !showPasswordInput) {
      setShowPasswordInput(true);
      addLog(`PASSWORD_REQUIRED`);
      return;
    }
    
    setIsGeneratingLink(true);
    addLog(`GENERATING_DOWNLOAD_LINK...`);
    
    try {
      const response = await fetch(`/api/file/${code}/get-download-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: fileInfo.isPasswordProtected ? downloadPassword : undefined })
      });

      if (!response.ok) {
        const error = await response.json();
        addLog(`ERROR: ${error.error}`, 'error');
        toast({
          title: "Error",
          description: error.error || "Failed to generate download link",
          variant: "destructive",
        });
        setIsGeneratingLink(false);
        return;
      }

      const data = await response.json();
      setDownloadLink(data.downloadUrl);
      
      if (data.requiresPassword) {
        addLog(`LINK_GENERATED_SUCCESSFULLY`);
        addLog(`PASSWORD_REQUIRED_AT_DOWNLOAD`);
      } else {
        addLog(`LINK_GENERATED_SUCCESSFULLY`);
        addLog(`LINK_VALID_UNTIL_FILE_EXPIRES`);
      }
      
      setIsGeneratingLink(false);
      
      toast({
        title: "Download Link Ready",
        description: data.requiresPassword 
          ? "Recipients will need to enter the password to download"
          : "Your shareable download link has been generated!",
      });
    } catch (error) {
      addLog(`ERROR: ${error instanceof Error ? error.message : 'Failed to generate link'}`, 'error');
      setIsGeneratingLink(false);
    }
  };

  const animationFrameRef = useRef<number | null>(null);
  const spinnerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const displayedPercentRef = useRef<number>(0);
  const targetPercentRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (spinnerIntervalRef.current) {
        clearInterval(spinnerIntervalRef.current);
      }
    };
  }, []);

  const handleDownload = async () => {
    if (!fileInfo || !code) return;

    if (fileInfo.isPasswordProtected && !downloadPassword) {
      toast({
        title: "Password Required",
        description: "Please enter the password to download this file.",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    addLog(`INITIATING_DOWNLOAD`);
    addLog(`CONNECTING  [..........] [    ]`);

    const spinnerFrames = ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]'];
    let spinnerIndex = 0;
    let isConnecting = true;
    let downloadComplete = false;

    displayedPercentRef.current = 0;
    targetPercentRef.current = 0;

    spinnerIntervalRef.current = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      
      if (downloadComplete) {
        return;
      }
      
      if (isConnecting) {
        updateLastLog(`CONNECTING  [..........] ${spinnerFrames[spinnerIndex]}`);
      } else {
        const displayPercent = Math.floor(displayedPercentRef.current);
        const filled = Math.floor(displayPercent / 10);
        const empty = 10 - filled;
        const progressBar = '#'.repeat(filled) + '-'.repeat(empty);
        updateLastLog(`DOWNLOADING  ${displayPercent}%  [${progressBar}] ${spinnerFrames[spinnerIndex]}`);
      }
    }, 80);

    const animateProgress = () => {
      if (downloadComplete) {
        return;
      }

      const target = targetPercentRef.current;
      const current = displayedPercentRef.current;
      
      if (current < target) {
        const diff = target - current;
        const step = Math.max(0.5, diff * 0.15);
        displayedPercentRef.current = Math.min(target, current + step);
      }
      
      animationFrameRef.current = requestAnimationFrame(animateProgress);
    };

    animationFrameRef.current = requestAnimationFrame(animateProgress);

    try {
      const response = await fetch(`/api/download/${code}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: downloadPassword || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Download failed");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      isConnecting = false;
      
      const reader = response.body.getReader();
      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      let receivedLength = 0;
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        if (total > 0) {
          const actualPercent = Math.round((receivedLength / total) * 100);
          targetPercentRef.current = actualPercent;
        } else {
          const receivedMB = receivedLength / (1024 * 1024);
          targetPercentRef.current = Math.min(99, receivedMB * 10);
        }
      }

      downloadComplete = true;
      targetPercentRef.current = 100;
      displayedPercentRef.current = 100;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (spinnerIntervalRef.current) {
        clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }

      updateLastLog(`DOWNLOADING  100%  [##########] DONE`);

      const blob = new Blob(chunks);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileInfo.originalName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addLog(`DOWNLOAD_COMPLETE`, 'success');
      toast({
        title: "Download Complete",
        description: "Your file has been downloaded successfully.",
      });
    } catch (error) {
      downloadComplete = true;
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (spinnerIntervalRef.current) {
        clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }

      addLog(
        `ERROR: ${error instanceof Error ? error.message : "Download failed"}`,
        "error"
      );
      toast({
        title: "Download Failed",
        description:
          error instanceof Error ? error.message : "Failed to download file",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = async () => {
    if (downloadLink) {
      try {
        await navigator.clipboard.writeText(downloadLink);
        toast({
          title: "Copied!",
          description: "Download link copied to clipboard",
        });
        addLog(`LINK_COPIED_TO_CLIPBOARD`);
      } catch (error) {
        toast({
          title: "Copy Failed",
          description: "Please copy the link manually",
          variant: "destructive",
        });
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return hours > 0 ? `in ${hours} hours` : 'soon';
  };

  return (
    <RetroLayout>
      <center>
        <h2>Download Center</h2>
      </center>

      {status === 'input' && (
         <center>
           <p>Please enter the 6-digit code to retrieve your file.</p>
           <form onSubmit={handleManualSubmit} className="p-8 border-2 shadow-md inline-block" style={{ backgroundColor: 'hsl(var(--panel))', borderColor: 'hsl(var(--border-highlight))' }}>
             Code: <input 
               type="text" 
               value={inputCode}
               onChange={(e) => setInputCode(e.target.value)}
               className="retro-input" 
              placeholder="123456"
               size={10}
               maxLength={6}
               data-testid="input-download-code"
             />
             <br /><br />
             <button type="submit" className="retro-button" data-testid="button-find-file">Find File</button>
           </form>
         </center>
      )}

      {status === 'searching' && (
        <center>
          <p>Connecting to server...</p>
          <div className="w-64 h-4 border-2 p-0.5 relative" style={{ borderColor: 'hsl(var(--border-highlight))', backgroundColor: 'hsl(var(--input-bg))' }}>
             <div className="h-full animate-[width_2s_ease-in-out_infinite]" style={{ width: '50%', backgroundColor: 'hsl(var(--accent))' }}></div>
          </div>
          <p><small>Please wait...</small></p>
        </center>
      )}

      {status === 'found' && fileInfo && (
        <div className="border-2 p-4" style={{ borderColor: 'hsl(var(--accent))', backgroundColor: 'hsl(var(--panel))' }} data-testid="file-info">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex-shrink-0">
              <FileText size={48} style={{ color: 'hsl(var(--accent))' }} aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-bold text-lg" style={{ color: 'hsl(var(--accent))' }}>File Found!</div>
              <div>
                <span className="font-semibold">Filename:</span>{' '}
                <code data-testid="text-filename" className="break-all">{fileInfo.originalName}</code>
              </div>
              <div><span className="font-semibold">Size:</span> {formatFileSize(fileInfo.size)}</div>
              <div><span className="font-semibold">Expires:</span> {getTimeRemaining(fileInfo.expiresAt)}</div>
              {fileInfo.isPasswordProtected === 1 && (
                <div className="flex items-center gap-1">
                  <Lock size={16} style={{ color: 'hsl(var(--accent))' }} aria-hidden="true" />
                  <span>Password Protected</span>
                </div>
              )}
              {fileInfo.isOneTime === 1 && (
                <div className="flex items-center gap-1 font-bold" style={{ color: 'hsl(var(--accent))' }}>
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>One-time download only</span>
                </div>
              )}
              <div>
                <span className="font-semibold">Downloads:</span>{' '}
                <span data-testid="text-download-count">{fileInfo.downloadCount}</span>
                {fileInfo.maxDownloads && (
                  <span> / {fileInfo.maxDownloads} <span className="text-sm opacity-80">(Remaining: {fileInfo.remainingDownloads})</span></span>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-4" />
          
          {showPasswordInput && (
            <div className="mb-4 border-2 p-3" style={{ backgroundColor: 'hsl(var(--panel-light))', borderColor: 'hsl(var(--accent))' }}>
              <label htmlFor="download-password" className="block mb-2 font-bold">Enter Password:</label>
              <div className="relative">
                <input 
                  id="download-password"
                  type={showPassword ? "text" : "password"}
                  value={downloadPassword}
                  onChange={(e) => setDownloadPassword(e.target.value)}
                  className="retro-input w-full pr-10"
                  placeholder="Enter file password"
                  autoComplete="off"
                  aria-label="File download password"
                  data-testid="input-download-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'hsl(var(--text-secondary))' }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-password-visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}
          
          {downloadLink && (
            <div className="mb-4 border-2 p-3" style={{ backgroundColor: 'hsl(var(--panel-light))', borderColor: 'hsl(var(--accent))' }}>
              <label className="block mb-2 font-bold">Your Shareable Download Link:</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={downloadLink}
                  readOnly
                  className="retro-input flex-1 text-xs"
                  aria-label="Shareable download link"
                  data-testid="text-download-link"
                />
                <button 
                  onClick={copyToClipboard} 
                  className="retro-button text-sm px-4 flex items-center gap-1" 
                  data-testid="button-copy-link"
                  aria-label="Copy download link to clipboard"
                >
                  <Copy size={14} aria-hidden="true" /> Copy
                </button>
              </div>
              <small className="block mt-2">
                {fileInfo?.isPasswordProtected 
                  ? "This link works on any device. Recipients will need the password to download."
                  : "This link works on any device/browser. Share it anywhere!"}
              </small>
            </div>
          )}
          
          <center>
            <button 
              onClick={handleDownload} 
              disabled={isDownloading}
              className="retro-button font-bold text-lg py-2 px-8" 
              data-testid="button-download"
            >
              {isDownloading ? "DOWNLOADING..." : "DOWNLOAD NOW"}
            </button>
            {' '}
            <button 
              onClick={handleGetDownloadLink} 
              disabled={isGeneratingLink}
              className="retro-button text-sm py-1 px-4" 
              data-testid="button-get-shareable-link"
            >
              {isGeneratingLink ? "Generating..." : "Get Shareable Link"}
            </button>
            <br /><br />
            <small>Checked by Norton AntiVirus</small>
          </center>
        </div>
      )}

      {status === 'error' && (
        <center>
          <AlertTriangle size={64} style={{ color: 'hsl(var(--accent))' }} aria-hidden="true" />
          <h3 className="mt-4" style={{ color: 'hsl(var(--text-primary))' }}>Error 404: File Not Found</h3>
          <p>The file you are looking for has expired or does not exist.</p>
          <br />
          <button onClick={() => setLocation("/")} className="retro-button" data-testid="button-back-home">Back to Home</button>
        </center>
      )}
    </RetroLayout>
  );
}
