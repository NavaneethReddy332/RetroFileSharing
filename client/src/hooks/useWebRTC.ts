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
const FAST_CHUNK_SIZE = 64 * 1024;
const MAX_BUFFER_SIZE = 16 * 1024 * 1024;
const LOW_BUFFER_THRESHOLD = MAX_BUFFER_SIZE / 2;
const HEADER_SIZE = 12;
const MAX_RETRANSMIT_ROUNDS = 5;
const RETRANSMIT_TIMEOUT = 10000;

export function useWebRTC(config: WebRTCConfig) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
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
  const chunkCacheRef = useRef<Map<number, ArrayBuffer>>(new Map());
  const fastModeRef = useRef(false);

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
    if (controlChannelRef.current) {
      controlChannelRef.current.close();
      controlChannelRef.current = null;
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

  const computeCRC32 = (data: Uint8Array): number => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const createChunkWithHeader = (seqNum: number, data: ArrayBuffer): ArrayBuffer => {
    const dataBytes = new Uint8Array(data);
    const checksum = computeCRC32(dataBytes);
    
    const header = new ArrayBuffer(HEADER_SIZE);
    const headerView = new DataView(header);
    headerView.setUint32(0, seqNum, true);
    headerView.setUint32(4, data.byteLength, true);
    headerView.setUint32(8, checksum, true);
    
    const combined = new Uint8Array(HEADER_SIZE + data.byteLength);
    combined.set(new Uint8Array(header), 0);
    combined.set(dataBytes, HEADER_SIZE);
    
    return combined.buffer;
  };

  const parseChunkHeader = (data: ArrayBuffer): { seqNum: number; dataLength: number; checksum: number; payload: ArrayBuffer; valid: boolean } => {
    if (data.byteLength < HEADER_SIZE) {
      return { seqNum: -1, dataLength: 0, checksum: 0, payload: new ArrayBuffer(0), valid: false };
    }
    
    const view = new DataView(data);
    const seqNum = view.getUint32(0, true);
    const dataLength = view.getUint32(4, true);
    const checksum = view.getUint32(8, true);
    const payload = data.slice(HEADER_SIZE);
    
    const payloadBytes = new Uint8Array(payload);
    const computedChecksum = computeCRC32(payloadBytes);
    const valid = payloadBytes.byteLength === dataLength && checksum === computedChecksum;
    
    return { seqNum, dataLength, checksum, payload, valid };
  };

  const streamFile = useCallback(async (channel: RTCDataChannel, file: File, fastMode: boolean, controlChannel?: RTCDataChannel) => {
    const chunkSize = fastMode ? FAST_CHUNK_SIZE : CHUNK_SIZE;
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    let offset = 0;
    let chunkIndex = 0;
    const startTime = Date.now();
    transferStartTimeRef.current = startTime;
    let lastSpeedUpdate = startTime;
    let bytesThisSecond = 0;
    let currentSpeed = 0;

    chunkCacheRef.current.clear();

    channel.bufferedAmountLowThreshold = LOW_BUFFER_THRESHOLD;

    channel.send(JSON.stringify({
      type: 'file-info',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize,
      fastMode
    }));

    if (fastMode) {
      log(`FAST MODE: streaming ${formatSize(totalSize)}...`, 'system');
    } else {
      log(`streaming ${formatSize(totalSize)}...`, 'system');
    }

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

      const chunkEnd = Math.min(offset + chunkSize, totalSize);
      const arrayBuffer = await readChunk(offset, chunkEnd);
      
      if (fastMode) {
        chunkCacheRef.current.set(chunkIndex, arrayBuffer);
        const packetWithHeader = createChunkWithHeader(chunkIndex, arrayBuffer);
        channel.send(packetWithHeader);
      } else {
        channel.send(arrayBuffer);
      }
      
      offset += arrayBuffer.byteLength;
      bytesThisSecond += arrayBuffer.byteLength;
      chunkIndex++;

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

    channel.send(JSON.stringify({ type: 'transfer-complete', totalChunks }));

    if (fastMode && controlChannel) {
      let retransmitRound = 0;
      let verified = false;
      
      await new Promise<void>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        
        const resetTimeout = () => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            controlChannel.removeEventListener('message', handleRetransmit);
            if (!verified) {
              log('verification timeout - transfer may be incomplete', 'error');
              reject(new Error('Fast mode verification timeout'));
            }
          }, RETRANSMIT_TIMEOUT);
        };
        
        resetTimeout();

        const handleRetransmit = async (e: MessageEvent) => {
          if (typeof e.data === 'string') {
            const msg = JSON.parse(e.data);
            if (msg.type === 'request-chunks') {
              const missingChunks: number[] = msg.chunks;
              const invalidChunks: number[] = msg.invalidChunks || [];
              const combined = [...missingChunks, ...invalidChunks];
              const uniqueMap: { [key: number]: boolean } = {};
              combined.forEach(n => uniqueMap[n] = true);
              const allChunksToResend = Object.keys(uniqueMap).map(Number);
              
              if (allChunksToResend.length > 0) {
                retransmitRound++;
                
                if (retransmitRound > MAX_RETRANSMIT_ROUNDS) {
                  clearTimeout(timeoutId);
                  controlChannel.removeEventListener('message', handleRetransmit);
                  log('too many retransmissions - transfer failed', 'error');
                  reject(new Error('Fast mode exceeded max retransmit rounds'));
                  return;
                }
                
                log(`retransmitting ${allChunksToResend.length} chunks (round ${retransmitRound})...`, 'warn');
                resetTimeout();
                
                for (const seqNum of allChunksToResend) {
                  const cachedChunk = chunkCacheRef.current.get(seqNum);
                  if (cachedChunk) {
                    const packetWithHeader = createChunkWithHeader(seqNum, cachedChunk);
                    channel.send(packetWithHeader);
                  }
                }
                channel.send(JSON.stringify({ type: 'retransmit-complete' }));
              }
            } else if (msg.type === 'transfer-verified') {
              verified = true;
              clearTimeout(timeoutId);
              controlChannel.removeEventListener('message', handleRetransmit);
              log('transfer verified by receiver', 'success');
              resolve();
            }
          }
        };

        controlChannel.addEventListener('message', handleRetransmit);
      });
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgSpeed = totalSize / totalTime / 1024 / 1024;
    log(`${formatSize(totalSize)} in ${totalTime.toFixed(1)}s`, 'success');
    log(`avg: ${avgSpeed.toFixed(2)} MB/s`, 'data');
    
    chunkCacheRef.current.clear();
    config.onComplete?.();
    
    return { duration: totalTime, avgSpeed };
  }, [config, log, waitIfPaused, createChunkWithHeader]);

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

  const initSender = useCallback(async (ws: WebSocket, file: File, fastMode: boolean = false): Promise<{ duration: number; avgSpeed: number }> => {
    wsRef.current = ws;
    fileRef.current = file;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    fastModeRef.current = fastMode;
    setIsPaused(false);
    setIsCancelled(false);
    const pc = createPeerConnection(true);
    
    const channelOptions: RTCDataChannelInit = fastMode 
      ? { ordered: false, maxRetransmits: 0 }
      : { ordered: true };
    
    const channel = pc.createDataChannel('fileTransfer', channelOptions);
    channel.binaryType = 'arraybuffer';
    dataChannelRef.current = channel;

    let controlChannel: RTCDataChannel | undefined;
    if (fastMode) {
      controlChannel = pc.createDataChannel('control', { ordered: true });
      controlChannel.binaryType = 'arraybuffer';
      controlChannelRef.current = controlChannel;
    }

    return new Promise((resolve, reject) => {
      resolveSenderRef.current = () => resolve({ duration: 0, avgSpeed: 0 });
      rejectSenderRef.current = reject;

      const startTransfer = async () => {
        if (fastMode && controlChannel?.readyState !== 'open') {
          return;
        }
        
        log('data channel open', 'success');
        if (fastMode) {
          log('FAST MODE enabled with integrity checks', 'warn');
        }
        
        try {
          const result = await streamFile(channel, file, fastMode, controlChannel);
          resolve(result);
        } catch (err: any) {
          reject(err);
        }
      };

      channel.onopen = () => {
        if (!fastMode) {
          startTransfer();
        } else if (controlChannel?.readyState === 'open') {
          startTransfer();
        }
      };

      if (controlChannel) {
        controlChannel.onopen = () => {
          if (channel.readyState === 'open') {
            startTransfer();
          }
        };
      }

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
      const chunksMap = new Map<number, ArrayBuffer>();
      const invalidChunksSet: { [key: number]: boolean } = {};
      const chunksArray: ArrayBuffer[] = [];
      let fileInfo: { name: string; size: number; mimeType: string; totalChunks?: number; chunkSize?: number; fastMode?: boolean } | null = null;
      let receivedBytes = 0;
      const startTime = Date.now();
      transferStartTimeRef.current = startTime;
      let lastSpeedUpdate = startTime;
      let bytesThisSecond = 0;
      let currentSpeed = 0;
      let controlChannel: RTCDataChannel | null = null;
      let isFastMode = false;
      let expectedTotalChunks = 0;
      let transferComplete = false;
      let retransmitRequestCount = 0;
      let verificationTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const verifyAndComplete = () => {
        if (!fileInfo || !transferComplete) return;

        if (isFastMode && controlChannel) {
          const missingChunks: number[] = [];
          const invalidChunks: number[] = Object.keys(invalidChunksSet).map(Number);
          
          for (let i = 0; i < expectedTotalChunks; i++) {
            if (!chunksMap.has(i)) {
              missingChunks.push(i);
            }
          }

          if (missingChunks.length > 0 || invalidChunks.length > 0) {
            retransmitRequestCount++;
            
            if (retransmitRequestCount > MAX_RETRANSMIT_ROUNDS + 1) {
              if (verificationTimeoutId) clearTimeout(verificationTimeoutId);
              log(`transfer failed: exceeded max retransmit attempts`, 'error');
              log(`final state: ${missingChunks.length} missing, ${invalidChunks.length} invalid`, 'error');
              reject(new Error('Fast mode verification failed: exceeded max retransmit rounds'));
              return;
            }
            
            const total = missingChunks.length + invalidChunks.length;
            log(`requesting ${total} chunks (${missingChunks.length} missing, ${invalidChunks.length} invalid)...`, 'warn');
            
            if (verificationTimeoutId) clearTimeout(verificationTimeoutId);
            verificationTimeoutId = setTimeout(() => {
              log(`transfer failed: sender stopped responding`, 'error');
              reject(new Error('Fast mode verification timeout: sender not responding'));
            }, RETRANSMIT_TIMEOUT * 2);
            
            controlChannel.send(JSON.stringify({
              type: 'request-chunks',
              chunks: missingChunks,
              invalidChunks: invalidChunks
            }));
            return;
          }

          const orderedChunks: ArrayBuffer[] = [];
          for (let i = 0; i < expectedTotalChunks; i++) {
            const chunk = chunksMap.get(i);
            if (chunk) {
              orderedChunks.push(chunk);
            }
          }

          if (verificationTimeoutId) clearTimeout(verificationTimeoutId);
          controlChannel.send(JSON.stringify({ type: 'transfer-verified' }));

          const totalTime = (Date.now() - startTime) / 1000;
          const avgSpeed = receivedBytes / totalTime / 1024 / 1024;
          log(`verified ${expectedTotalChunks} chunks`, 'success');
          log(`received in ${totalTime.toFixed(1)}s`, 'success');
          log(`avg: ${avgSpeed.toFixed(2)} MB/s`, 'data');
          
          config.onComplete?.();
          resolve({ 
            chunks: orderedChunks, 
            fileInfo: { name: fileInfo.name, size: fileInfo.size, mimeType: fileInfo.mimeType }, 
            duration: totalTime, 
            avgSpeed 
          });
        } else {
          const totalTime = (Date.now() - startTime) / 1000;
          const avgSpeed = receivedBytes / totalTime / 1024 / 1024;
          log(`received in ${totalTime.toFixed(1)}s`, 'success');
          log(`avg: ${avgSpeed.toFixed(2)} MB/s`, 'data');
          
          config.onComplete?.();
          resolve({ 
            chunks: chunksArray, 
            fileInfo: { name: fileInfo.name, size: fileInfo.size, mimeType: fileInfo.mimeType }, 
            duration: totalTime, 
            avgSpeed 
          });
        }
      };

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';

        if (channel.label === 'control') {
          controlChannel = channel;
          controlChannelRef.current = channel;
          log('control channel received', 'info');
          
          channel.onmessage = (e) => {
            if (typeof e.data === 'string') {
              const msg = JSON.parse(e.data);
              if (msg.type === 'retransmit-complete') {
                verifyAndComplete();
              }
            }
          };
          return;
        }

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
                mimeType: message.mimeType,
                totalChunks: message.totalChunks,
                chunkSize: message.chunkSize,
                fastMode: message.fastMode
              };
              isFastMode = message.fastMode || false;
              expectedTotalChunks = message.totalChunks || 0;
              
              log(`receiving: ${message.name}`, 'system');
              log(`${formatSize(message.size)}`, 'data');
              if (isFastMode) {
                log('FAST MODE transfer', 'warn');
              }
            } else if (message.type === 'transfer-complete') {
              expectedTotalChunks = message.totalChunks || expectedTotalChunks;
              transferComplete = true;
              
              setTimeout(() => verifyAndComplete(), 100);
            }
          } else {
            const arrayBuffer = e.data as ArrayBuffer;
            
            if (isFastMode) {
              const { seqNum, payload, valid } = parseChunkHeader(arrayBuffer);
              if (valid) {
                chunksMap.set(seqNum, payload);
                delete invalidChunksSet[seqNum];
              } else {
                invalidChunksSet[seqNum] = true;
              }
              receivedBytes += payload.byteLength;
              bytesThisSecond += payload.byteLength;
            } else {
              chunksArray.push(arrayBuffer);
              receivedBytes += arrayBuffer.byteLength;
              bytesThisSecond += arrayBuffer.byteLength;
            }

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
  }, [createPeerConnection, config, log, parseChunkHeader]);

  const cleanup = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (controlChannelRef.current) {
      controlChannelRef.current.close();
      controlChannelRef.current = null;
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
    chunkCacheRef.current.clear();
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
