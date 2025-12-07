import { useRef, useCallback, useState } from 'react';

interface MultiWebRTCConfig {
  onProgress?: (receiverId: string, percent: number, speed: number, bytesTransferred: number, totalBytes: number) => void;
  onReceiverComplete?: (receiverId: string) => void;
  onError?: (error: string, receiverId?: string) => void;
  onLog?: (message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data') => void;
}

interface PeerConnection {
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  controlChannel: RTCDataChannel | null;
  isConnected: boolean;
  transferComplete: boolean;
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    const cleanUrl = turnUrl.split('?')[0].replace(/:\d+$/, '');
    servers.push(
      { urls: `${cleanUrl}:3478?transport=udp`, username: turnUsername, credential: turnCredential },
      { urls: `${cleanUrl}:443?transport=udp`, username: turnUsername, credential: turnCredential },
      { urls: `${cleanUrl}:80`, username: turnUsername, credential: turnCredential },
      { urls: `${cleanUrl}:80?transport=tcp`, username: turnUsername, credential: turnCredential },
      { urls: `${cleanUrl}:443?transport=tcp`, username: turnUsername, credential: turnCredential },
      { urls: `${cleanUrl.replace('turn:', 'turns:')}:443?transport=tcp`, username: turnUsername, credential: turnCredential },
    );
  }

  return servers;
}

const BASE_CHUNK_SIZE = 64 * 1024;
const LOW_BUFFER_THRESHOLD = 256 * 1024;
const HIGH_BUFFER_THRESHOLD = 1 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function useMultiWebRTC(config: MultiWebRTCConfig) {
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const fileRef = useRef<File | null>(null);
  const [activeReceivers, setActiveReceivers] = useState<string[]>([]);
  const [isStopped, setIsStopped] = useState(false);
  const isStoppedRef = useRef(false);

  const log = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data' = 'info') => {
    config.onLog?.(message, type);
  }, [config]);

  const createPeerConnection = useCallback((receiverId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ 
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
    });
    
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          targetReceiverId: receiverId,
          data: { type: 'candidate', candidate: event.candidate }
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = peersRef.current.get(receiverId);
      if (peer) {
        if (pc.connectionState === 'connected') {
          peer.isConnected = true;
          log(`receiver ${receiverId.slice(-4)} connected`, 'success');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          peer.isConnected = false;
          log(`receiver ${receiverId.slice(-4)} disconnected`, 'warn');
        }
      }
    };

    return pc;
  }, [log]);

  const streamFileToReceiver = useCallback(async (receiverId: string, channel: RTCDataChannel, file: File) => {
    const chunkSize = BASE_CHUNK_SIZE;
    const totalSize = file.size;
    let offset = 0;
    const startTime = Date.now();
    let lastSpeedUpdate = startTime;
    let bytesThisSecond = 0;
    let currentSpeed = 0;

    channel.bufferedAmountLowThreshold = LOW_BUFFER_THRESHOLD;

    channel.send(JSON.stringify({
      type: 'file-info',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks: Math.ceil(totalSize / chunkSize),
      chunkSize,
      fastMode: false
    }));

    log(`streaming to receiver ${receiverId.slice(-4)}...`, 'system');

    const waitForBuffer = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (isStoppedRef.current || channel.readyState !== 'open') {
          reject(new Error('Transfer stopped or channel closed'));
          return;
        }
        if (channel.bufferedAmount < LOW_BUFFER_THRESHOLD) {
          resolve();
          return;
        }
        const handler = () => {
          channel.removeEventListener('bufferedamountlow', handler);
          if (isStoppedRef.current) {
            reject(new Error('Transfer stopped'));
          } else {
            resolve();
          }
        };
        channel.addEventListener('bufferedamountlow', handler);
      });
    };

    const BATCH_SIZE = 8;
    
    while (offset < totalSize) {
      if (isStoppedRef.current) {
        throw new Error('Transfer stopped');
      }

      if (channel.bufferedAmount >= HIGH_BUFFER_THRESHOLD) {
        await waitForBuffer();
      }

      const chunksToSend = Math.min(BATCH_SIZE, Math.ceil((totalSize - offset) / chunkSize));
      const readPromises: Promise<ArrayBuffer>[] = [];
      
      for (let i = 0; i < chunksToSend; i++) {
        const chunkStart = offset + (i * chunkSize);
        if (chunkStart >= totalSize) break;
        const chunkEnd = Math.min(chunkStart + chunkSize, totalSize);
        readPromises.push(file.slice(chunkStart, chunkEnd).arrayBuffer());
      }

      const buffers = await Promise.all(readPromises);
      
      for (const arrayBuffer of buffers) {
        channel.send(arrayBuffer);
        bytesThisSecond += arrayBuffer.byteLength;
      }
      
      const totalBytesRead = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      offset += totalBytesRead;

      const now = Date.now();
      
      if (now - lastSpeedUpdate >= 100) {
        currentSpeed = (bytesThisSecond / ((now - lastSpeedUpdate) / 1000)) / (1024 * 1024);
        bytesThisSecond = 0;
        lastSpeedUpdate = now;
      }

      const percent = Math.round((offset / totalSize) * 100);
      config.onProgress?.(receiverId, percent, currentSpeed, offset, totalSize);
    }

    channel.send(JSON.stringify({ type: 'transfer-complete', totalChunks: Math.ceil(totalSize / chunkSize) }));
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgSpeed = totalSize / totalTime / 1024 / 1024;
    log(`sent to ${receiverId.slice(-4)}: ${formatSize(totalSize)} in ${totalTime.toFixed(1)}s (${avgSpeed.toFixed(2)} MB/s)`, 'success');
    
    config.onReceiverComplete?.(receiverId);
    
    const peer = peersRef.current.get(receiverId);
    if (peer) {
      peer.transferComplete = true;
    }
    
    return { duration: totalTime, avgSpeed };
  }, [config, log]);

  const handleNewReceiver = useCallback(async (receiverId: string) => {
    if (!wsRef.current || !fileRef.current) return;
    
    const file = fileRef.current;
    const pc = createPeerConnection(receiverId);
    
    const channel = pc.createDataChannel('fileTransfer', { ordered: true });
    channel.binaryType = 'arraybuffer';

    const peerInfo: PeerConnection = {
      pc,
      dataChannel: channel,
      controlChannel: null,
      isConnected: false,
      transferComplete: false,
    };
    peersRef.current.set(receiverId, peerInfo);
    setActiveReceivers(prev => [...prev, receiverId]);

    channel.onopen = async () => {
      log(`data channel open for ${receiverId.slice(-4)}`, 'success');
      try {
        await streamFileToReceiver(receiverId, channel, file);
      } catch (err: any) {
        if (!err.message?.includes('stopped')) {
          log(`transfer error for ${receiverId.slice(-4)}: ${err.message}`, 'error');
          config.onError?.(err.message, receiverId);
        }
      }
    };

    channel.onerror = () => {
      log(`channel error for ${receiverId.slice(-4)}`, 'error');
      config.onError?.('Data channel error', receiverId);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current.send(JSON.stringify({
      type: 'signal',
      targetReceiverId: receiverId,
      data: { type: 'offer', sdp: offer.sdp }
    }));
  }, [createPeerConnection, log, streamFileToReceiver, config]);

  const handleSignal = useCallback(async (signal: any, fromReceiverId: string) => {
    const peer = peersRef.current.get(fromReceiverId);
    if (!peer) return;

    try {
      if (signal.type === 'answer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'candidate' && signal.candidate) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err: any) {
      log(`signal error for ${fromReceiverId.slice(-4)}: ${err.message}`, 'error');
    }
  }, [log]);

  const initMultiSender = useCallback((ws: WebSocket, file: File) => {
    wsRef.current = ws;
    fileRef.current = file;
    isStoppedRef.current = false;
    setIsStopped(false);
    peersRef.current.clear();
    setActiveReceivers([]);
    
    log('multi-share mode initialized', 'system');
    log(`ready to send: ${file.name} (${formatSize(file.size)})`, 'info');
  }, [log]);

  const stopMultiShare = useCallback(() => {
    isStoppedRef.current = true;
    setIsStopped(true);
    
    for (const [id, peer] of Array.from(peersRef.current.entries())) {
      if (peer.dataChannel) peer.dataChannel.close();
      if (peer.controlChannel) peer.controlChannel.close();
      peer.pc.close();
    }
    peersRef.current.clear();
    setActiveReceivers([]);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop-multi-share' }));
    }
    
    log('multi-share stopped', 'warn');
  }, [log]);

  const cleanup = useCallback(() => {
    isStoppedRef.current = true;
    setIsStopped(true);
    
    for (const [id, peer] of Array.from(peersRef.current.entries())) {
      if (peer.dataChannel) peer.dataChannel.close();
      if (peer.controlChannel) peer.controlChannel.close();
      peer.pc.close();
    }
    peersRef.current.clear();
    setActiveReceivers([]);
    fileRef.current = null;
  }, []);

  const removeReceiver = useCallback((receiverId: string) => {
    const peer = peersRef.current.get(receiverId);
    if (peer) {
      if (peer.dataChannel) peer.dataChannel.close();
      if (peer.controlChannel) peer.controlChannel.close();
      peer.pc.close();
      peersRef.current.delete(receiverId);
      setActiveReceivers(prev => prev.filter(id => id !== receiverId));
    }
  }, []);

  return {
    initMultiSender,
    handleNewReceiver,
    handleSignal,
    stopMultiShare,
    cleanup,
    removeReceiver,
    activeReceivers,
    isStopped,
  };
}
