import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { useTerminal } from "../context/TerminalContext";
import { useToast } from "@/hooks/use-toast";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";

export default function Home() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [isOneTime, setIsOneTime] = useState(false);
  const [expiresIn, setExpiresIn] = useState<"1" | "12" | "24" | "168">("24"); // hours - typed to prevent invalid values
  const [isUploading, setIsUploading] = useState(false);
  const { addLog, updateLastLog } = useTerminal();
  const { toast } = useToast();
  const lastProgressRef = useRef<number>(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cloudUploadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamingSpinnerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      addLog(`SELECTED_FILE: ${selectedFile.name}`);
      addLog(`SIZE: ${(selectedFile.size / 1024).toFixed(2)} KB`);
    }
  };

  const handleUpload = async () => {
    if (!file || isUploading) return;
    
    try {
      setIsUploading(true);
      lastProgressRef.current = 0;
      
      addLog(`INITIATING_UPLOAD: ${file.name}...`);
      addLog(`FILE_SIZE: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      
      const uploadId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const eventSource = new EventSource(`/api/upload-progress/${uploadId}`);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress' && data.percent !== undefined) {
            const spinnerChars = ['|', '/', '-', '\\'];
            const spinnerIndex = Math.floor(Date.now() / 150) % spinnerChars.length;
            updateLastLog(`UPLOADING TO BACKBLAZE  ${data.percent}% ${spinnerChars[spinnerIndex]}`);
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
      
      const spinnerChars = ['|', '/', '-', '\\'];
      let spinnerIndex = 0;
      addLog(`STREAMING_TO_SERVER  0%  ////////// ${spinnerChars[0]}`);
      
      streamingSpinnerRef.current = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
        const percentComplete = lastProgressRef.current;
        const dots = '.'.repeat(Math.floor(percentComplete / 10));
        const spaces = '/'.repeat(10 - Math.floor(percentComplete / 10));
        updateLastLog(`STREAMING_TO_SERVER  ${percentComplete}%  ${dots}${spaces} ${spinnerChars[spinnerIndex]}`);
      }, 150);

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
              const dots = '.'.repeat(10);
              updateLastLog(`STREAMING_TO_SERVER  ${percentComplete}%  ${dots}`);
              addLog(`UPLOADING TO BACKBLAZE  0% /`);
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
          <span style={{ color: 'var(--accent)' }}>Upload Files Now!</span>
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
                <input 
                  type="file" 
                  onChange={handleFileChange}
                  className="retro-input w-full"
                  data-testid="input-file"
                />
              </div>
              
              <div>
                <div className="font-bold mb-3">Step 2: Security Options (Optional)</div>
                <div className="space-y-3 retro-border-inset p-3">
                  <div>
                    <label className="block text-sm mb-1">Password Protection:</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank for no password"
                      className="retro-input w-full text-sm"
                      autoComplete="new-password"
                      data-testid="input-password"
                    />
                    <PasswordStrengthMeter password={password} />
                  </div>
                  
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
                      style={{ color: 'var(--text-primary)' }}
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
          <div className="space-y-4 md:border-l-2 md:pl-6 transition-colors duration-300" style={{ borderColor: 'var(--border-shadow)' }}>
            <div className="font-bold mb-3" style={{ color: 'var(--accent)' }}>Already have a code?</div>
            <form onSubmit={handleDownloadSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-semibold" style={{ color: 'var(--text-primary)' }}>Code:</label>
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
      
      <hr className="my-6 transition-colors duration-300" style={{ borderColor: 'var(--border-shadow)' }} />
      
      <div className="mt-6">
        <h3 className="text-xl font-bold mb-3">Why use RetroSend?</h3>
        <ul className="space-y-2 text-sm sm:text-base">
          <li>* Fast 56k modem optimization</li>
          <li>* Works in Netscape & IE</li>
          <li>* No annoying banners (yet)</li>
          <li>* Files deleted after 24 hours</li>
        </ul>
      </div>

    </RetroLayout>
  );
}
