import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, Activity } from 'lucide-react';

interface SpeedIndicatorProps {
  currentSpeed?: number;
}

export function SpeedIndicator({ currentSpeed }: SpeedIndicatorProps) {
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
  const [isTestingDownload, setIsTestingDownload] = useState(false);
  const [isTestingUpload, setIsTestingUpload] = useState(false);
  const [displaySpeed, setDisplaySpeed] = useState(0);
  const animationRef = useRef<number | null>(null);
  const targetSpeedRef = useRef(0);

  useEffect(() => {
    if (currentSpeed !== undefined) {
      targetSpeedRef.current = currentSpeed;
    }
  }, [currentSpeed]);

  useEffect(() => {
    const animate = () => {
      setDisplaySpeed(prev => {
        const diff = targetSpeedRef.current - prev;
        if (Math.abs(diff) < 0.01) return targetSpeedRef.current;
        return prev + diff * 0.15;
      });
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const testInternetSpeed = async () => {
    setIsTestingDownload(true);
    setIsTestingUpload(true);
    
    try {
      const testSize = 5 * 1024 * 1024;
      const startDownload = performance.now();
      
      const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${testSize}`, {
        cache: 'no-store'
      });
      await response.arrayBuffer();
      
      const downloadTime = (performance.now() - startDownload) / 1000;
      const downloadMbps = (testSize * 8) / downloadTime / 1000000;
      setDownloadSpeed(downloadMbps);
      setIsTestingDownload(false);

      const uploadData = new ArrayBuffer(1024 * 1024);
      const startUpload = performance.now();
      
      await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body: uploadData,
        cache: 'no-store'
      });
      
      const uploadTime = (performance.now() - startUpload) / 1000;
      const uploadMbps = (uploadData.byteLength * 8) / uploadTime / 1000000;
      setUploadSpeed(uploadMbps);
      setIsTestingUpload(false);
    } catch (error) {
      setDownloadSpeed(null);
      setUploadSpeed(null);
      setIsTestingDownload(false);
      setIsTestingUpload(false);
    }
  };

  useEffect(() => {
    testInternetSpeed();
    const interval = setInterval(testInternetSpeed, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatSpeed = (speed: number | null, testing: boolean): string => {
    if (testing) return '...';
    if (speed === null) return '--';
    if (speed >= 1000) return `${(speed / 1000).toFixed(1)} Gbps`;
    return `${speed.toFixed(1)} Mbps`;
  };

  return (
    <div 
      className="fixed bottom-3 right-3 flex items-center gap-3 px-3 py-2 rounded-md z-50"
      style={{ 
        backgroundColor: 'hsl(var(--surface) / 0.9)',
        backdropFilter: 'blur(8px)',
        border: '1px solid hsl(var(--border-subtle))'
      }}
      data-testid="speed-indicator"
    >
      {currentSpeed !== undefined && currentSpeed > 0 ? (
        <div className="flex items-center gap-2">
          <div 
            className="relative"
            style={{ color: 'hsl(var(--accent))' }}
          >
            <Activity size={14} className="animate-pulse" />
            <span 
              className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full animate-ping"
              style={{ backgroundColor: 'hsl(var(--accent))' }}
            />
          </div>
          <div className="flex flex-col">
            <span 
              className="text-[10px] tracking-wider"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              TRANSFER
            </span>
            <span 
              className="text-xs font-mono tabular-nums glow-text"
              style={{ 
                color: 'hsl(var(--accent))',
                transition: 'all 0.2s ease-out'
              }}
              data-testid="text-transfer-speed"
            >
              {displaySpeed.toFixed(1)} MB/s
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {downloadSpeed !== null || isTestingDownload ? (
              <Wifi size={12} style={{ color: 'hsl(var(--accent))' }} />
            ) : (
              <WifiOff size={12} style={{ color: 'hsl(var(--text-dim))' }} />
            )}
            <div className="flex flex-col">
              <span 
                className="text-[8px] tracking-wider"
                style={{ color: 'hsl(var(--text-dim))' }}
              >
                DOWN
              </span>
              <span 
                className={`text-[10px] font-mono tabular-nums ${isTestingDownload ? 'animate-pulse' : ''}`}
                style={{ color: 'hsl(var(--text-secondary))' }}
                data-testid="text-download-speed"
              >
                {formatSpeed(downloadSpeed, isTestingDownload)}
              </span>
            </div>
          </div>
          <div 
            className="w-px h-6"
            style={{ backgroundColor: 'hsl(var(--border-subtle))' }}
          />
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span 
                className="text-[8px] tracking-wider"
                style={{ color: 'hsl(var(--text-dim))' }}
              >
                UP
              </span>
              <span 
                className={`text-[10px] font-mono tabular-nums ${isTestingUpload ? 'animate-pulse' : ''}`}
                style={{ color: 'hsl(var(--text-secondary))' }}
                data-testid="text-upload-speed"
              >
                {formatSpeed(uploadSpeed, isTestingUpload)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
