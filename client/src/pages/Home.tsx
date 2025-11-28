import { useLocation } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { useTerminal } from "../context/TerminalContext";
import { useToast } from "@/hooks/use-toast";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { Upload, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState("");
  const [isOneTime, setIsOneTime] = useState(false);
  const [expiresIn, setExpiresIn] = useState<"1" | "12" | "24" | "168">("24");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { addLog, updateLastLog } = useTerminal();
  const { toast } = useToast();
  const lastProgressRef = useRef<number>(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cloudUploadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamingSpinnerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (cloudUploadIntervalRef.current) {
        clearInterval(cloudUploadIntervalRef.current);
        cloudUploadIntervalRef.current = null;
      }
      if (streamingSpinnerRef.current) {
        clearInterval(streamingSpinnerRef.current);
        streamingSpinnerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      addLog(`SELECTED_FILE: ${selectedFile.name}`);
      addLog(`SIZE: ${formatFileSize(selectedFile.size)}`);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles[0]) {
      const droppedFile = droppedFiles[0];
      setFile(droppedFile);
      addLog(`DROPPED_FILE: ${droppedFile.name}`);
      addLog(`SIZE: ${formatFileSize(droppedFile.size)}`);
    }
  }, [addLog, formatFileSize]);

  const handleUpload = async () => {
    if (!file || isUploading) return;
    
    if (password && password !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "The passwords you entered do not match. Please try again.",
        variant: "destructive",
      });
      addLog(`ERROR: PASSWORD_MISMATCH`, 'error');
      return;
    }
    
    try {
      setIsUploading(true);
      lastProgressRef.current = 0;
      
      addLog(`INITIATING_UPLOAD: ${file.name}`);
      addLog(`FILE_SIZE: ${formatFileSize(file.size)}`);
      
      const uploadId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const eventSource = new EventSource(`/api/upload-progress/${uploadId}`);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress' && data.percent !== undefined) {
            const filled = Math.floor(data.percent / 10);
            const empty = 10 - filled;
            const progressBar = '#'.repeat(filled) + '.'.repeat(empty);
            const spinnerFrames = ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]'];
            const spinnerIndex = Math.floor(Date.now() / 100) % spinnerFrames.length;
            updateLastLog(`UPLOADING TO BACKBLAZE  ${data.percent}%  [${progressBar}] ${spinnerFrames[spinnerIndex]}`);
          } else if (data.type === 'complete') {
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          } else if (data.type === 'error') {
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };
      
      const spinnerFrames = ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]'];
      let spinnerIndex = 0;
      addLog(`STREAMING_TO_SERVER  0%  [..........] `);
      
      streamingSpinnerRef.current = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        const percentComplete = lastProgressRef.current;
        const filled = Math.floor(percentComplete / 10);
        const empty = 10 - filled;
        const progressBar = '#'.repeat(filled) + '.'.repeat(empty);
        updateLastLog(`STREAMING_TO_SERVER  ${percentComplete}%  [${progressBar}] ${spinnerFrames[spinnerIndex]}`);
      }, 100);

      const formData = new FormData();
      formData.append('fileSize', file.size.toString());
      if (password) formData.append('password', password);
      if (maxDownloads) formData.append('maxDownloads', maxDownloads);
      if (isOneTime) formData.append('isOneTime', 'true');
      formData.append('expiresIn', expiresIn); // hours
      formData.append('file', file);

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            
            if (percentComplete !== lastProgressRef.current) {
              lastProgressRef.current = percentComplete;
            }
            
            if (percentComplete === 100) {
              if (streamingSpinnerRef.current) {
                clearInterval(streamingSpinnerRef.current);
                streamingSpinnerRef.current = null;
              }
              updateLastLog(`STREAMING_TO_SERVER  100%  [##########] DONE`);
              addLog(`UPLOADING TO BACKBLAZE  0%  [..........] [    ]`);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (cloudUploadIntervalRef.current) {
            clearInterval(cloudUploadIntervalRef.current);
            cloudUploadIntervalRef.current = null;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              updateLastLog(`UPLOAD_COMPLETE: 100%`);
              console.log('Upload successful, response:', response);
              resolve(response);
            } catch (error) {
              console.error('Error parsing response:', error, 'Response:', xhr.responseText);
              reject(new Error('Invalid server response'));
            }
          } else {
            console.error('Upload failed:', xhr.status, xhr.responseText);
            addLog(`ERROR: UPLOAD_FAILED - ${xhr.status}`, 'error');
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || `Upload failed: ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', (e) => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (cloudUploadIntervalRef.current) {
            clearInterval(cloudUploadIntervalRef.current);
            cloudUploadIntervalRef.current = null;
          }
          console.error('Upload network error:', e);
          reject(new Error('Network error'));
        });

        xhr.addEventListener('abort', () => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (cloudUploadIntervalRef.current) {
            clearInterval(cloudUploadIntervalRef.current);
            cloudUploadIntervalRef.current = null;
          }
          reject(new Error('Upload cancelled'));
        });

        xhr.addEventListener('timeout', () => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (cloudUploadIntervalRef.current) {
            clearInterval(cloudUploadIntervalRef.current);
            cloudUploadIntervalRef.current = null;
          }
          reject(new Error('Upload timeout'));
        });

        xhr.open('POST', `/api/upload?uploadId=${uploadId}`);
        xhr.timeout = 600000;
        xhr.send(formData);
      });

      addLog(`PROCESSING_COMPLETE`);
      if (password) addLog(`PASSWORD_PROTECTED`);
      if (maxDownloads) addLog(`LIMIT: ${maxDownloads}`);
      if (isOneTime) addLog(`ONE_TIME_MODE`);
      addLog(`SECURE_CODE: ${data.code}`);
      
      setIsUploading(false);
      
      setTimeout(() => {
        console.log('Navigating to result page:', `/result/${data.code}`);
        setLocation(`/result/${data.code}`);
      }, 800);
    } catch (error: any) {
      console.error('Upload error:', error);
      setIsUploading(false);
      xhrRef.current = null;
      
      if (error.message?.includes('cancelled')) {
        addLog(`UPLOAD_CANCELLED`, 'error');
        toast({
          title: "Upload Cancelled",
          description: "The file upload has been stopped.",
        });
      } else {
        addLog(`ERROR: ${error.message || error}`, 'error');
        toast({
          title: "Upload Failed",
          description: error.message || "An error occurred during upload",
          variant: "destructive",
        });
      }
    }
  };

  const handleCancelUpload = () => {
    if (xhrRef.current && isUploading) {
      xhrRef.current.abort();
      toast({
        title: "Upload Cancelled",
        description: "The file upload has been stopped.",
      });
    }
  };

  const [downloadCode, setDownloadCode] = useState("");
  
  const handleDownloadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (downloadCode.length === 6) {
      addLog(`SEARCH_REQUEST: ${downloadCode}`);
      setLocation(`/download/${downloadCode}`);
    } else {
      addLog(`ERROR: INVALID_CODE_FORMAT`, "error");
      toast({
        title: "Invalid Code Format",
        description: "Please enter a valid 6-digit code.",
        variant: "destructive",
      });
    }
  };

  return (
    <RetroLayout>
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">
          <span style={{ color: 'hsl(var(--accent))' }}>Upload Files Now!</span>
        </h2>
        <p className="text-sm sm:text-base">Share files with your friends easily. No registration required.</p>
      </div>
      
      <div className="retro-border p-4 sm:p-6 md:p-8 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Upload Section */}
          <div className="space-y-4">
            <form onSubmit={(e) => e.preventDefault()} autoComplete="off" className="space-y-4">
              <div>
                <div className="font-bold mb-3">Step 1: Select File</div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`retro-border-inset p-6 text-center cursor-pointer transition-all duration-200 ${
                    isDragOver ? 'border-2' : ''
                  }`}
                  style={{ 
                    borderColor: isDragOver ? 'hsl(var(--accent))' : undefined,
                    backgroundColor: isDragOver ? 'hsl(var(--panel-light))' : undefined
                  }}
                  data-testid="drop-zone"
                >
                  <Upload 
                    size={32} 
                    className="mx-auto mb-2" 
                    style={{ color: isDragOver ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))' }} 
                    aria-hidden="true"
                  />
                  {file ? (
                    <div>
                      <div className="font-bold" style={{ color: 'hsl(var(--accent))' }}>{file.name}</div>
                      <div className="text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>{formatFileSize(file.size)}</div>
                    </div>
                  ) : (
                    <div style={{ color: 'hsl(var(--text-secondary))' }}>
                      <div className="font-bold">Drag & drop a file here</div>
                      <div className="text-sm">or click to browse</div>
                    </div>
                  )}
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="File upload input"
                  data-testid="input-file"
                />
              </div>
              
              <div>
                <div className="font-bold mb-3">Step 2: Security Options (Optional)</div>
                <div className="space-y-3 retro-border-inset p-3">
                  <div>
                    <label htmlFor="upload-password" className="block text-sm mb-1">Password Protection:</label>
                    <div className="relative">
                      <input 
                        id="upload-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Leave blank for no password"
                        className="retro-input w-full text-sm pr-10"
                        autoComplete="new-password"
                        aria-label="Password to protect the file"
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                        style={{ color: 'hsl(var(--text-secondary))' }}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <PasswordStrengthMeter password={password} />
                  </div>
                  
                  {password && (
                    <div>
                      <label htmlFor="confirm-password" className="block text-sm mb-1">Confirm Password:</label>
                      <div className="relative">
                        <input 
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className={`retro-input w-full text-sm pr-10 ${
                            confirmPassword && password !== confirmPassword ? 'border-2' : ''
                          }`}
                          style={confirmPassword && password !== confirmPassword ? { borderColor: 'hsl(var(--destructive))' } : {}}
                          autoComplete="new-password"
                          aria-label="Confirm password"
                          data-testid="input-confirm-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                          style={{ color: 'hsl(var(--text-secondary))' }}
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          data-testid="button-toggle-confirm-password"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {confirmPassword && password !== confirmPassword && (
                        <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                          <AlertCircle size={12} aria-hidden="true" />
                          <span>Passwords do not match</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm mb-1">Expires In:</label>
                    <select 
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value as "1" | "12" | "24" | "168")}
                      className="retro-input w-full text-sm"
                      data-testid="select-expires-in"
                    >
                      <option value="1">1 Hour</option>
                      <option value="12">12 Hours</option>
                      <option value="24">24 Hours (Default)</option>
                      <option value="168">7 Days</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm mb-1">Max Downloads:</label>
                    <input 
                      type="number" 
                      min="1"
                      value={maxDownloads}
                      onChange={(e) => setMaxDownloads(e.target.value)}
                      placeholder="Unlimited"
                      className="retro-input w-full text-sm"
                      data-testid="input-max-downloads"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="oneTime"
                      checked={isOneTime}
                      onChange={(e) => setIsOneTime(e.target.checked)}
                      className="w-4 h-4"
                      data-testid="checkbox-one-time"
                    />
                    <label htmlFor="oneTime" className="text-sm cursor-pointer">
                      Delete after first download
                    </label>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="font-bold mb-3">Step 3: Upload</div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleUpload}
                    disabled={!file || isUploading}
                    className="retro-button"
                    data-testid="button-upload"
                  >
                    {isUploading ? "Uploading..." : "Upload Now >>"}
                  </button>
                  {isUploading && (
                    <button 
                      onClick={handleCancelUpload}
                      className="retro-button"
                      style={{ color: 'hsl(var(--text-primary))' }}
                      data-testid="button-cancel-upload"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Download Section */}
          <div className="space-y-4 md:border-l-2 md:pl-6 transition-colors duration-300" style={{ borderColor: 'hsl(var(--border-shadow))' }}>
            <div className="font-bold mb-3" style={{ color: 'hsl(var(--accent))' }}>Already have a code?</div>
            <form onSubmit={handleDownloadSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Code:</label>
                <input 
                  type="text" 
                  maxLength={6}
                  value={downloadCode}
                  onChange={(e) => setDownloadCode(e.target.value)}
                  className="retro-input sm:flex-1" 
                  placeholder="123456"
                  data-testid="input-code"
                />
              </div>
              <button type="submit" className="retro-button" data-testid="button-download">
                Download File
              </button>
            </form>
          </div>
        </div>
      </div>
      
      <hr className="my-6 transition-colors duration-300" style={{ borderColor: 'hsl(var(--border-shadow))' }} />
      
      <div className="mt-6">
        <h3 className="text-xl font-bold mb-3">Why use RetroSend?</h3>
        <ul className="space-y-2 text-sm sm:text-base">
          <li>* Fast & secure cloud storage (Backblaze B2)</li>
          <li>* No account required - just upload and share</li>
          <li>* Password protection available</li>
          <li>* Files auto-delete after your chosen time</li>
          <li>* Retro aesthetic, modern technology</li>
        </ul>
      </div>

    </RetroLayout>
  );
}
