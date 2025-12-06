import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
const UPDATE_INTERVAL = 250;
const GRAPH_WIDTH = 280;
const GRAPH_HEIGHT = 100;
const PADDING = 4;
const GRID_COLS = 10;
const GRID_ROWS = 4;

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
  const [displaySpeed, setDisplaySpeed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const totalBytesRef = useRef<number>(0);
  const hasCalculatedStats = useRef(false);
  const currentSpeedRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    currentSpeedRef.current = currentSpeed;
  }, [currentSpeed]);

  const smoothUpdateSpeed = useCallback(() => {
    setDisplaySpeed(prev => {
      const target = currentSpeedRef.current;
      const diff = target - prev;
      if (Math.abs(diff) < 0.1) return target;
      return prev + diff * 0.3;
    });
    animationFrameRef.current = requestAnimationFrame(smoothUpdateSpeed);
  }, []);

  useEffect(() => {
    if (isTransferring) {
      animationFrameRef.current = requestAnimationFrame(smoothUpdateSpeed);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isTransferring, smoothUpdateSpeed]);

  useEffect(() => {
    if (isTransferring && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      hasCalculatedStats.current = false;
      setSpeedHistory([]);
      setStats(null);
      setDisplaySpeed(0);
    }
  }, [isTransferring]);

  useEffect(() => {
    if (!isTransferring) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const speed = currentSpeedRef.current;
      setSpeedHistory(prev => {
        const newPoint = { time: now, speed };
        const updated = [...prev, newPoint].slice(-MAX_DATA_POINTS);
        return updated;
      });
      
      if (speed > 0) {
        totalBytesRef.current += speed * (UPDATE_INTERVAL / 1000);
      }
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [isTransferring]);

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
      setDisplaySpeed(0);
    }
  }, [isTransferring, isComplete]);

  const { graphPath, linePath, lastPoint, maxSpeed } = useMemo(() => {
    if (speedHistory.length < 2) {
      return { graphPath: '', linePath: '', lastPoint: null, maxSpeed: 1 };
    }
    
    const maxSpd = Math.max(...speedHistory.map(p => p.speed), 1);
    const usableWidth = GRAPH_WIDTH - PADDING * 2;
    const usableHeight = GRAPH_HEIGHT - PADDING * 2;
    
    const points = speedHistory.map((point, index) => {
      const x = PADDING + (index / (MAX_DATA_POINTS - 1)) * usableWidth;
      const y = GRAPH_HEIGHT - PADDING - (point.speed / maxSpd) * usableHeight;
      return { x, y };
    });

    let areaPath = `M ${points[0].x} ${GRAPH_HEIGHT - PADDING}`;
    areaPath += ` L ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const tension = 0.3;
      const cpx1 = prev.x + (curr.x - prev.x) * tension;
      const cpx2 = curr.x - (curr.x - prev.x) * tension;
      areaPath += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    
    areaPath += ` L ${points[points.length - 1].x} ${GRAPH_HEIGHT - PADDING}`;
    areaPath += ' Z';

    let strokePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const tension = 0.3;
      const cpx1 = prev.x + (curr.x - prev.x) * tension;
      const cpx2 = curr.x - (curr.x - prev.x) * tension;
      strokePath += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    
    return { 
      graphPath: areaPath, 
      linePath: strokePath, 
      lastPoint: points[points.length - 1],
      maxSpeed: maxSpd
    };
  }, [speedHistory]);

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; isVertical: boolean }[] = [];
    const usableWidth = GRAPH_WIDTH - PADDING * 2;
    const usableHeight = GRAPH_HEIGHT - PADDING * 2;
    
    for (let i = 0; i <= GRID_COLS; i++) {
      const x = PADDING + (i / GRID_COLS) * usableWidth;
      lines.push({ x1: x, y1: PADDING, x2: x, y2: GRAPH_HEIGHT - PADDING, isVertical: true });
    }
    
    for (let i = 0; i <= GRID_ROWS; i++) {
      const y = PADDING + (i / GRID_ROWS) * usableHeight;
      lines.push({ x1: PADDING, y1: y, x2: GRAPH_WIDTH - PADDING, y2: y, isVertical: false });
    }
    
    return lines;
  }, []);

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
          {formatSpeed(displaySpeed)}
        </span>
      </div>
      <div 
        className="minimal-border overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--surface) / 0.3)' }}
      >
        <svg 
          width="100%" 
          height="100" 
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.5" />
              <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="0.2" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          {gridLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="hsl(var(--accent))"
              strokeWidth="0.5"
              opacity={line.isVertical ? 0.08 : 0.12}
            />
          ))}
          
          {graphPath && (
            <>
              <path
                d={graphPath}
                fill="url(#speedGradient)"
              />
              <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                opacity="0.9"
              />
              {lastPoint && (
                <>
                  <circle
                    cx={lastPoint.x}
                    cy={lastPoint.y}
                    r="6"
                    fill="hsl(var(--accent))"
                    opacity="0.3"
                  >
                    <animate
                      attributeName="r"
                      values="4;8;4"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.4;0.1;0.4"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle
                    cx={lastPoint.x}
                    cy={lastPoint.y}
                    r="3"
                    fill="hsl(var(--accent))"
                    filter="url(#glow)"
                  />
                </>
              )}
            </>
          )}
          
          {speedHistory.length < 2 && (
            <text
              x={GRAPH_WIDTH / 2}
              y={GRAPH_HEIGHT / 2 + 4}
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
