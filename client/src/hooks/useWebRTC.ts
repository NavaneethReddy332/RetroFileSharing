import { useRef, useCallback, useState } from 'react';

interface WebRTCConfig {
  onProgress?: (percent: number, speed: number, bytesTransferred: number, totalBytes: number) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onLog?: (message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data') => void;
  onPauseStateChange?: (isPaused: boolean) => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const CHUNK_SIZE = 32 * 1024;
const MAX_BUFFER_SIZE = 16 * 1024 * 1024;
const LOW_BUFFER_THRESHOLD = MAX_BUFFER_SIZE / 2;

export function useWebRTC(config: WebRTCConfig) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const resolveReceiverRef = useRef<((value: { chunks: ArrayBuffer[], fileInfo: { name: string; size: number; mimeType: string } }) => void) | null>(null);
  const rejectReceiverRef = useRef<((reason: Error) => void) | null>(null);
  const fileRef = useRef<File | null>(null);
  const resolveSenderRef = useRef<(() => void) | null>(null);
  const rejectSenderRef = useRef<((reason: Error) => void) | null>(null);
  const pauseResolveRef = useRef<(() => void) | null>(null);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const transferStartTimeRef = useRef<number>(0);

  const log = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data' = 'info') => {
    config.onLog?.(message, type);
  }, [config]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    config.onPauseStateChange?.(true);
    log('transfer paused', 'warn');
  }, [config, log]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    config.onPauseStateChange?.(false);
    if (pauseResolveRef.current) {
      pauseResolveRef.current();
      pauseResolveRef.current = null;
    }
    log('transfer resumed', 'success');
  }, [config, log]);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    setIsCancelled(true);
    isPausedRef.current = false;
    setIsPaused(false);
    if (pauseResolveRef.current) {
      pauseResolveRef.current();
      pauseResolveRef.current = null;
    }
    log('transfer cancelled', 'error');
    
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
  }, [log]);

  const waitIfPaused = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!isPausedRef.current || isCancelledRef.current) {
        resolve();
        return;
      }
      pauseResolveRef.current = resolve;
    });
  }, []);

  const createPeerConnection = useCallback((isSender: boolean) => {
    const pc = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });
    
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          data: { type: 'candidate', candidate: event.candidate }
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsConnected(true);
        log('P2P connected', 'success');
      } else if (pc.connectionState === 'failed') {
        setIsConnected(false);
        log('P2P connection failed', 'error');
        config.onError?.('P2P connection failed');
      } else if (pc.connectionState === 'disconnected') {
        setIsConnected(false);
        log('P2P disconnected', 'warn');
      }
    };

    peerRef.current = pc;
    return pc;
  }, [log, config]);

  const streamFile = useCallback(async (channel: RTCDataChannel, file: File) => {
    const totalSize = file.size;
    let offset = 0;
    const startTime = Date.now();
    transferStartTimeRef.current = startTime;
    let lastSpeedUpdate = startTime;
    let bytesThisSecond = 0;
    let currentSpeed = 0;

    channel.bufferedAmountLowThreshold = LOW_BUFFER_THRESHOLD;

    channel.send(JSON.stringify({
      type: 'file-info',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    }));

    log(`streaming ${formatSize(totalSize)}...`, 'system');

    const waitForBuffer = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (isCancelledRef.current || channel.readyState !== 'open') {
          reject(new Error('Transfer cancelled or channel closed'));
          return;
        }
        if (channel.bufferedAmount < LOW_BUFFER_THRESHOLD) {
          resolve();
          return;
        }
        const handler = () => {
          channel.removeEventListener('bufferedamountlow', handler);
          if (isCancelledRef.current) {
            reject(new Error('Transfer cancelled'));
          } else {
            resolve();
          }
        };
        channel.addEventListener('bufferedamountlow', handler);
      });
    };

    const readChunk = (start: number, end: number): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const chunk = file.slice(start, end);
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as ArrayBuffer);
          } else {
            reject(new Error('Failed to read chunk'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(chunk);
      });
    };

    while (offset < totalSize) {
      if (isCancelledRef.current) {
        throw new Error('Transfer cancelled');
      }
      
      await waitIfPaused();
      
      if (isCancelledRef.current) {
        throw new Error('Transfer cancelled');
      }

      if (channel.bufferedAmount >= MAX_BUFFER_SIZE) {
        await waitForBuffer();
      }

      const chunkEnd = Math.min(offset + CHUNK_SIZE, totalSize);
      const arrayBuffer = await readChunk(offset, chunkEnd);
      
      channel.send(arrayBuffer);
      offset += arrayBuffer.byteLength;
      bytesThisSecond += arrayBuffer.byteLength;

      const now = Date.now();
      const elapsed = now - startTime;
      
      if (now - lastSpeedUpdate >= 200) {
        currentSpeed = (bytesThisSecond / ((now - lastSpeedUpdate) / 1000)) / (1024 * 1024);
        bytesThisSecond = 0;
        lastSpeedUpdate = now;
      }

      const percent = Math.round((offset / totalSize) * 100);
      config.onProgress?.(percent, currentSpeed, offset, totalSize);

      if (elapsed > 0 && elapsed % 1000 < 100) {
        log(`${percent}% @ ${currentSpeed.toFixed(1)} MB/s`, 'data');
      }
    }

    channel.send(JSON.stringify({ type: 'transfer-complete' }));
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgSpeed = totalSize / totalTime / 1024 / 1024;
    log(`${formatSize(totalSize)} in ${totalTime.toFixed(1)}s`, 'success');
    log(`avg: ${avgSpeed.toFixed(2)} MB/s`, 'data');
    
    config.onComplete?.();
    
    return { duration: totalTime, avgSpeed };
  }, [config, log, waitIfPaused]);

  const handleSignal = useCallback(async (signal: any) => {
    const pc = peerRef.current;
    if (!pc) return;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: signal.sdp
        }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current?.send(JSON.stringify({
          type: 'signal',
          data: { type: 'answer', sdp: answer.sdp }
        }));
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'candidate' && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err: any) {
      log(`signal error: ${err.message}`, 'error');
    }
  }, [log]);

  const initSender = useCallback(async (ws: WebSocket, file: File): Promise<{ duration: number; avgSpeed: number }> => {
    wsRef.current = ws;
    fileRef.current = file;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    setIsPaused(false);
    setIsCancelled(false);
    const pc = createPeerConnection(true);
    
    const channel = pc.createDataChannel('fileTransfer', {
      ordered: true,
    });
    
    channel.binaryType = 'arraybuffer';
    dataChannelRef.current = channel;

    return new Promise((resolve, reject) => {
      resolveSenderRef.current = () => resolve({ duration: 0, avgSpeed: 0 });
      rejectSenderRef.current = reject;

      channel.onopen = async () => {
        log('data channel open', 'success');
        try {
          const result = await streamFile(channel, file);
          resolve(result);
        } catch (err: any) {
          reject(err);
        }
      };

      channel.onerror = () => {
        log('channel error', 'error');
        reject(new Error('Data channel error'));
      };

      pc.createOffer().then(async (offer) => {
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({
          type: 'signal',
          data: { type: 'offer', sdp: offer.sdp }
        }));
      }).catch(reject);
    });
  }, [createPeerConnection, log, streamFile]);

  const initReceiver = useCallback(async (ws: WebSocket): Promise<{ chunks: ArrayBuffer[], fileInfo: { name: string; size: number; mimeType: string }, duration: number, avgSpeed: number }> => {
    wsRef.current = ws;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    setIsPaused(false);
    setIsCancelled(false);
    const pc = createPeerConnection(false);
    
    return new Promise((resolve, reject) => {
      const chunks: ArrayBuffer[] = [];
      let fileInfo: { name: string; size: number; mimeType: string } | null = null;
      let receivedBytes = 0;
      const startTime = Date.now();
      transferStartTimeRef.current = startTime;
      let lastSpeedUpdate = startTime;
      let bytesThisSecond = 0;
      let currentSpeed = 0;

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';
        dataChannelRef.current = channel;
        log('data channel received', 'success');

        channel.onmessage = async (e) => {
          if (isCancelledRef.current) {
            channel.close();
            reject(new Error('Transfer cancelled'));
            return;
          }

          if (typeof e.data === 'string') {
            const message = JSON.parse(e.data);
            
            if (message.type === 'file-info') {
              fileInfo = {
                name: message.name,
                size: message.size,
                mimeType: message.mimeType
              };
              log(`receiving: ${message.name}`, 'system');
              log(`${formatSize(message.size)}`, 'data');
            } else if (message.type === 'transfer-complete') {
              const totalTime = (Date.now() - startTime) / 1000;
              const avgSpeed = receivedBytes / totalTime / 1024 / 1024;
              log(`received in ${totalTime.toFixed(1)}s`, 'success');
              log(`avg: ${avgSpeed.toFixed(2)} MB/s`, 'data');
              
              if (fileInfo) {
                config.onComplete?.();
                resolve({ chunks, fileInfo, duration: totalTime, avgSpeed });
              }
            }
          } else {
            const arrayBuffer = e.data as ArrayBuffer;
            chunks.push(arrayBuffer);
            receivedBytes += arrayBuffer.byteLength;
            bytesThisSecond += arrayBuffer.byteLength;

            const now = Date.now();
            
            if (now - lastSpeedUpdate >= 200) {
              currentSpeed = (bytesThisSecond / ((now - lastSpeedUpdate) / 1000)) / (1024 * 1024);
              bytesThisSecond = 0;
              lastSpeedUpdate = now;
            }

            if (fileInfo) {
              const percent = Math.round((receivedBytes / fileInfo.size) * 100);
              config.onProgress?.(percent, currentSpeed, receivedBytes, fileInfo.size);
              
              const elapsed = now - startTime;
              if (elapsed > 0 && elapsed % 1000 < 100) {
                log(`${percent}% @ ${currentSpeed.toFixed(1)} MB/s`, 'data');
              }
            }
          }
        };

        channel.onerror = () => {
          log('channel error', 'error');
          reject(new Error('Data channel error'));
        };
      };

      rejectReceiverRef.current = reject;
    });
  }, [createPeerConnection, config, log]);

  const cleanup = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    wsRef.current = null;
    fileRef.current = null;
    resolveReceiverRef.current = null;
    rejectReceiverRef.current = null;
    resolveSenderRef.current = null;
    rejectSenderRef.current = null;
    pauseResolveRef.current = null;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    setIsConnected(false);
    setIsPaused(false);
    setIsCancelled(false);
  }, []);

  return {
    initSender,
    initReceiver,
    handleSignal,
    cleanup,
    isConnected,
    isPaused,
    isCancelled,
    pause,
    resume,
    cancel,
  };
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(2)} KB`;
}
