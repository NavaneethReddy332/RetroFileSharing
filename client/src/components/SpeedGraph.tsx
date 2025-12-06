import { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, Clock, TrendingUp, Award } from 'lucide-react';

interface SpeedDataPoint {
  time: number;
  speed: number;
}

interface TransferStats {
  timeTaken: number;
  highestSpeed: number;
  averageSpeed: number;
  totalBytes: number;
}

interface SpeedGraphProps {
  currentSpeed: number;
  isTransferring: boolean;
  isComplete: boolean;
  onStatsCalculated?: (stats: TransferStats) => void;
}

const MAX_DATA_POINTS = 60;
const UPDATE_INTERVAL = 500;

function formatSpeed(speed: number): string {
  if (speed >= 1000) {
    return `${(speed / 1000).toFixed(1)} GB/s`;
  }
  return `${speed.toFixed(1)} MB/s`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function getSpeedBadge(avgSpeed: number): { label: string; color: string; icon: 'fast' | 'normal' | 'slow' } {
  if (avgSpeed >= 50) {
    return { label: 'BLAZING FAST', color: 'hsl(var(--accent))', icon: 'fast' };
  }
  if (avgSpeed >= 20) {
    return { label: 'HIGH SPEED', color: 'hsl(142 76% 36%)', icon: 'fast' };
  }
  if (avgSpeed >= 5) {
    return { label: 'NORMAL', color: 'hsl(var(--text-secondary))', icon: 'normal' };
  }
  return { label: 'LOW SPEED', color: 'hsl(0 84% 60%)', icon: 'slow' };
}

export function SpeedGraph({ currentSpeed, isTransferring, isComplete, onStatsCalculated }: SpeedGraphProps) {
  const [speedHistory, setSpeedHistory] = useState<SpeedDataPoint[]>([]);
  const [stats, setStats] = useState<TransferStats | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalBytesRef = useRef<number>(0);
  const hasCalculatedStats = useRef(false);

  useEffect(() => {
    if (isTransferring && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      hasCalculatedStats.current = false;
      setSpeedHistory([]);
      setStats(null);
    }
  }, [isTransferring]);

  useEffect(() => {
    if (!isTransferring) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setSpeedHistory(prev => {
        const newPoint = { time: now, speed: currentSpeed };
        const updated = [...prev, newPoint].slice(-MAX_DATA_POINTS);
        return updated;
      });
      
      if (currentSpeed > 0) {
        totalBytesRef.current += currentSpeed * (UPDATE_INTERVAL / 1000);
      }
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [isTransferring, currentSpeed]);

  useEffect(() => {
    if (isComplete && !hasCalculatedStats.current && speedHistory.length > 0) {
      hasCalculatedStats.current = true;
      
      const timeTaken = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      const speeds = speedHistory.map(p => p.speed).filter(s => s > 0);
      const highestSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
      const averageSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
      
      const calculatedStats: TransferStats = {
        timeTaken,
        highestSpeed,
        averageSpeed,
        totalBytes: totalBytesRef.current
      };
      
      setStats(calculatedStats);
      onStatsCalculated?.(calculatedStats);
    }
  }, [isComplete, speedHistory, onStatsCalculated]);

  useEffect(() => {
    if (!isTransferring && !isComplete) {
      startTimeRef.current = 0;
      totalBytesRef.current = 0;
      hasCalculatedStats.current = false;
      setSpeedHistory([]);
      setStats(null);
    }
  }, [isTransferring, isComplete]);

  const graphPath = useMemo(() => {
    if (speedHistory.length < 2) return '';
    
    const maxSpeed = Math.max(...speedHistory.map(p => p.speed), 1);
    const width = 280;
    const height = 100;
    const padding = 4;
    
    const points = speedHistory.map((point, index) => {
      const x = padding + (index / (MAX_DATA_POINTS - 1)) * (width - padding * 2);
      const y = height - padding - (point.speed / maxSpeed) * (height - padding * 2);
      return { x, y };
    });

    let path = `M ${points[0].x} ${height}`;
    path += ` L ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      path += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    
    path += ` L ${points[points.length - 1].x} ${height}`;
    path += ' Z';
    
    return path;
  }, [speedHistory]);

  const linePath = useMemo(() => {
    if (speedHistory.length < 2) return '';
    
    const maxSpeed = Math.max(...speedHistory.map(p => p.speed), 1);
    const width = 280;
    const height = 100;
    const padding = 4;
    
    const points = speedHistory.map((point, index) => {
      const x = padding + (index / (MAX_DATA_POINTS - 1)) * (width - padding * 2);
      const y = height - padding - (point.speed / maxSpeed) * (height - padding * 2);
      return { x, y };
    });

    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      path += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    
    return path;
  }, [speedHistory]);

  const badge = stats ? getSpeedBadge(stats.averageSpeed) : null;

  if (!isTransferring && !isComplete) {
    return null;
  }

  if (isComplete && stats) {
    return (
      <div className="w-full" data-testid="speed-graph-stats">
        <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
          TRANSFER STATS
        </div>
        <div 
          className="minimal-border p-4"
          style={{ backgroundColor: 'hsl(var(--surface) / 0.5)' }}
        >
          {badge && (
            <div className="flex items-center justify-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
              <Award size={16} style={{ color: badge.color }} />
              <span 
                className="text-xs font-bold tracking-wider"
                style={{ color: badge.color }}
                data-testid="text-speed-badge"
              >
                {badge.label}
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Clock size={12} style={{ color: 'hsl(var(--text-dim))' }} />
              </div>
              <div 
                className="text-sm font-mono tabular-nums"
                style={{ color: 'hsl(var(--text-secondary))' }}
                data-testid="text-time-taken"
              >
                {formatDuration(stats.timeTaken)}
              </div>
              <div className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                TIME
              </div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Zap size={12} style={{ color: 'hsl(var(--accent))' }} />
              </div>
              <div 
                className="text-sm font-mono tabular-nums"
                style={{ color: 'hsl(var(--accent))' }}
                data-testid="text-highest-speed"
              >
                {formatSpeed(stats.highestSpeed)}
              </div>
              <div className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                PEAK
              </div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp size={12} style={{ color: 'hsl(var(--text-dim))' }} />
              </div>
              <div 
                className="text-sm font-mono tabular-nums"
                style={{ color: 'hsl(var(--text-secondary))' }}
                data-testid="text-average-speed"
              >
                {formatSpeed(stats.averageSpeed)}
              </div>
              <div className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                AVG
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="speed-graph">
      <div className="text-[10px] mb-2 tracking-wider flex items-center justify-between">
        <span style={{ color: 'hsl(var(--text-dim))' }}>SPEED</span>
        <span 
          className="font-mono tabular-nums"
          style={{ color: 'hsl(var(--accent))' }}
          data-testid="text-current-speed"
        >
          {formatSpeed(currentSpeed)}
        </span>
      </div>
      <div 
        className="minimal-border overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--surface) / 0.3)' }}
      >
        <svg 
          width="100%" 
          height="100" 
          viewBox="0 0 280 100" 
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.6" />
              <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.5" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="1" />
            </linearGradient>
          </defs>
          
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="4"
              y1={100 - ratio * 92}
              x2="276"
              y2={100 - ratio * 92}
              stroke="hsl(var(--border-subtle))"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              opacity="0.3"
            />
          ))}
          
          {graphPath && (
            <>
              <path
                d={graphPath}
                fill="url(#speedGradient)"
                className="transition-all duration-300"
              />
              <path
                d={linePath}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-300"
              />
              {speedHistory.length > 0 && (
                <circle
                  cx={4 + ((speedHistory.length - 1) / (MAX_DATA_POINTS - 1)) * 272}
                  cy={100 - 4 - (speedHistory[speedHistory.length - 1].speed / Math.max(...speedHistory.map(p => p.speed), 1)) * 92}
                  r="4"
                  fill="hsl(var(--accent))"
                  className="animate-pulse"
                />
              )}
            </>
          )}
          
          {speedHistory.length < 2 && (
            <text
              x="140"
              y="55"
              textAnchor="middle"
              fill="hsl(var(--text-dim))"
              fontSize="10"
              fontFamily="monospace"
            >
              collecting data...
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
