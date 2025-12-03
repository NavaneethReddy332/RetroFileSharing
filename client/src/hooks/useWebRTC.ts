import { useRef, useCallback, useState } from 'react';

interface WebRTCConfig {
  onProgress?: (percent: number, speed: number) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onLog?: (message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data') => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export function useWebRTC(config: WebRTCConfig) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const resolveReceiverRef = useRef<((value: { chunks: ArrayBuffer[], fileInfo: { name: string; size: number; mimeType: string } }) => void) | null>(null);
  const rejectReceiverRef = useRef<((reason: Error) => void) | null>(null);
  const fileRef = useRef<File | null>(null);
  const resolveSenderRef = useRef<(() => void) | null>(null);
  const rejectSenderRef = useRef<((reason: Error) => void) | null>(null);

  const log = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data' = 'info') => {
    config.onLog?.(message, type);
  }, [config]);

  const createPeerConnection = useCallback((isSender: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
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
    const CHUNK_SIZE = 64 * 1024;
    const totalSize = file.size;
    let offset = 0;
    const startTime = Date.now();
    let lastSpeedUpdate = startTime;
    let bytesThisSecond = 0;
    let currentSpeed = 0;

    channel.send(JSON.stringify({
      type: 'file-info',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    }));

    log(`streaming ${formatSize(totalSize)}...`, 'system');

    const sendNextChunk = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = async (e) => {
          if (!e.target?.result) {
            reject(new Error('Failed to read chunk'));
            return;
          }

          const arrayBuffer = e.target.result as ArrayBuffer;
          
          while (channel.bufferedAmount > 16 * 1024 * 1024) {
            await new Promise(r => setTimeout(r, 10));
          }

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
          config.onProgress?.(percent, currentSpeed);

          if (elapsed > 0 && elapsed % 1000 < 100) {
            log(`${percent}% @ ${currentSpeed.toFixed(1)} MB/s`, 'data');
          }

          resolve();
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(chunk);
      });
    };

    while (offset < totalSize) {
      await sendNextChunk();
    }

    channel.send(JSON.stringify({ type: 'transfer-complete' }));
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgSpeed = totalSize / totalTime / 1024 / 1024;
    log(`${formatSize(totalSize)} in ${totalTime.toFixed(1)}s`, 'success');
    log(`avg: ${avgSpeed.toFixed(2)} MB/s`, 'data');
    
    config.onComplete?.();
  }, [config, log]);

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

  const initSender = useCallback(async (ws: WebSocket, file: File): Promise<void> => {
    wsRef.current = ws;
    fileRef.current = file;
    const pc = createPeerConnection(true);
    
    const channel = pc.createDataChannel('fileTransfer', {
      ordered: true,
    });
    
    channel.binaryType = 'arraybuffer';
    dataChannelRef.current = channel;

    return new Promise((resolve, reject) => {
      resolveSenderRef.current = resolve;
      rejectSenderRef.current = reject;

      channel.onopen = async () => {
        log('data channel open', 'success');
        try {
          await streamFile(channel, file);
          resolveSenderRef.current?.();
        } catch (err: any) {
          rejectSenderRef.current?.(err);
        }
      };

      channel.onerror = () => {
        log('channel error', 'error');
        rejectSenderRef.current?.(new Error('Data channel error'));
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

  const initReceiver = useCallback(async (ws: WebSocket): Promise<{ chunks: ArrayBuffer[], fileInfo: { name: string; size: number; mimeType: string } }> => {
    wsRef.current = ws;
    const pc = createPeerConnection(false);
    
    return new Promise((resolve, reject) => {
      resolveReceiverRef.current = resolve;
      rejectReceiverRef.current = reject;
      
      const chunks: ArrayBuffer[] = [];
      let fileInfo: { name: string; size: number; mimeType: string } | null = null;
      let receivedBytes = 0;
      const startTime = Date.now();
      let lastSpeedUpdate = startTime;
      let bytesThisSecond = 0;
      let currentSpeed = 0;

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';
        dataChannelRef.current = channel;
        log('data channel received', 'success');

        channel.onmessage = (e) => {
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
                resolveReceiverRef.current?.({ chunks, fileInfo });
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
              config.onProgress?.(percent, currentSpeed);
              
              const elapsed = now - startTime;
              if (elapsed > 0 && elapsed % 1000 < 100) {
                log(`${percent}% @ ${currentSpeed.toFixed(1)} MB/s`, 'data');
              }
            }
          }
        };

        channel.onerror = () => {
          log('channel error', 'error');
          rejectReceiverRef.current?.(new Error('Data channel error'));
        };
      };
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
    setIsConnected(false);
  }, []);

  return {
    initSender,
    initReceiver,
    handleSignal,
    cleanup,
    isConnected,
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
