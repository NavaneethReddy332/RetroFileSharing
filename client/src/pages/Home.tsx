import { useState, useRef, useEffect, useCallback } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { Upload, ArrowRight, Copy, Check, Pause, Play, X, Clock, FileArchive, Trash2, Zap, AlertTriangle, FolderOpen, Users, Square, Cloud, Radio, HardDrive, Link2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation } from "wouter";
import { useWebRTC } from "../hooks/useWebRTC";
import { useMultiWebRTC } from "../hooks/useMultiWebRTC";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { useCloudUpload } from "../hooks/useCloudUpload";
import { SpeedIndicator } from "../components/SpeedIndicator";
import { SpeedGraph } from "../components/SpeedGraph";
import { formatFileSize, formatTime, formatTimeRemaining, formatHistoryDate, getLogColor, getStatusColor, validateFiles, MAX_FILE_SIZE_DISPLAY } from "../lib/utils";
import ZipWorker from "../workers/zipWorker?worker";
import { useAuth } from "../contexts/AuthContext";

type TransferMode = 'p2p' | 'cloud';

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn' | 'system' | 'data';
  timestamp: Date;
}

export default function Home() {
  const { user } = useAuth();
  const [transferMode, setTransferMode] = useState<TransferMode>('p2p');
  const [files, setFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [code, setCode] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'zipping' | 'waiting' | 'connected' | 'transferring' | 'complete' | 'cancelled'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [bytesTransferred, setBytesTransferred] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [transferStartTime, setTransferStartTime] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cloudFileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const zipWorkerRef = useRef<Worker | null>(null);
  const fileToUploadRef = useRef<File | null>(null);
  const saveToCloudRef = useRef(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [fastMode, setFastMode] = useState(false);
  const [showFastModeWarning, setShowFastModeWarning] = useState(false);
  const [multiShareMode, setMultiShareMode] = useState(false);
  const [receiverCount, setReceiverCount] = useState(0);
  const [maxReceivers] = useState(4);
  const [multiShareStatus, setMultiShareStatus] = useState<'idle' | 'waiting' | 'active'>('idle');
  const [receiverProgress, setReceiverProgress] = useState<Map<string, { percent: number; speed: number }>>(new Map());
  const [completedReceivers, setCompletedReceivers] = useState<Set<string>>(new Set());
  const [saveToCloud, setSaveToCloud] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(0);
  const [cloudUploadStatus, setCloudUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'failed'>('idle');
  const [cloudFileName, setCloudFileName] = useState<string>('');
  const [cloudCode, setCloudCode] = useState<string>('');
  const [cloudFiles, setCloudFiles] = useState<File[]>([]);
  const [, navigate] = useLocation();
  const statusRef = useRef(status);
  const { history, addRecord, clearHistory, getRecentSends } = useTransferHistory();

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: logIdRef.current++, message, type, timestamp: new Date() }]);
  };
  
  const cloudUpload = useCloudUpload({
    onProgress: (progress) => {
      setCloudUploadProgress(progress.percent);
      setCloudUploadStatus('uploading');
    },
    onComplete: (result) => {
      if (result.success) {
        addLog(`saved to cloud: ${result.fileName}`, 'success');
        setCloudUploadStatus('success');
        if (result.code) {
          setCloudCode(result.code);
          addLog(`permanent code: ${result.code}`, 'success');
        }
      } else {
        setCloudUploadStatus('failed');
      }
    },
    onError: (error) => {
      addLog(`cloud error: ${error}`, 'error');
      setCloudUploadStatus('failed');
    },
    onLog: addLog,
  });

  useEffect(() => {
    cloudUpload.checkCloudStatus();
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    saveToCloudRef.current = saveToCloud;
  }, [saveToCloud]);

  const webrtc = useWebRTC({
    onProgress: (percent, speed, transferred, total) => {
      setProgress(percent);
      setCurrentSpeed(speed);
      setBytesTransferred(transferred);
      setTotalBytes(total);
    },
    onComplete: () => {
      setStatus('complete');
      setCurrentSpeed(0);
    },
    onError: (error) => {
      addLog(error, 'error');
      if (error.includes('cancelled')) {
        setStatus('cancelled');
      } else {
        setStatus('idle');
      }
      setCurrentSpeed(0);
    },
    onLog: addLog
  });

  const multiWebrtc = useMultiWebRTC({
    onProgress: (receiverId, percent, speed, transferred, total) => {
      setReceiverProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(receiverId, { percent, speed });
        
        const activeProgress = Array.from(newMap.entries())
          .filter(([id]) => !completedReceivers.has(id))
          .map(([_, progress]) => progress);
        
        if (activeProgress.length > 0) {
          const avgPercent = activeProgress.reduce((sum, p) => sum + p.percent, 0) / activeProgress.length;
          const maxSpeed = Math.max(...activeProgress.map(p => p.speed));
          setProgress(Math.round(avgPercent));
          setCurrentSpeed(maxSpeed);
        }
        
        return newMap;
      });
    },
    onReceiverComplete: (receiverId) => {
      addLog(`receiver ${receiverId.slice(-4)} complete`, 'success');
      setCompletedReceivers(prev => new Set(prev).add(receiverId));
      setReceiverProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(receiverId);
        return newMap;
      });
    },
    onError: (error, receiverId) => {
      if (receiverId) {
        addLog(`error for ${receiverId.slice(-4)}: ${error}`, 'error');
      } else {
        addLog(error, 'error');
      }
    },
    onLog: addLog
  });

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      
      const validation = validateFiles(selectedFiles);
      if (!validation.valid) {
        addLog(validation.message || 'File validation failed', 'error');
        return;
      }
      
      cloudUpload.cancelUpload();
      setCloudUploadStatus('idle');
      setCloudUploadProgress(0);
      setCloudFileName('');
      
      setFiles(selectedFiles);
      setZipFile(null);
      setMultiShareMode(false);
      setFastMode(false);
      if (selectedFiles.length === 1) {
        addLog(`selected: ${selectedFiles[0].name}`, 'system');
        addLog(`${formatFileSize(selectedFiles[0].size)}`, 'data');
      } else {
        addLog(`selected: ${selectedFiles.length} files`, 'system');
        const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
        addLog(`${formatFileSize(totalSize)} total`, 'data');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      
      const validation = validateFiles(droppedFiles);
      if (!validation.valid) {
        addLog(validation.message || 'File validation failed', 'error');
        return;
      }
      
      cloudUpload.cancelUpload();
      setCloudUploadStatus('idle');
      setCloudUploadProgress(0);
      setCloudFileName('');
      
      setFiles(droppedFiles);
      setZipFile(null);
      setMultiShareMode(false);
      setFastMode(false);
      if (droppedFiles.length === 1) {
        addLog(`dropped: ${droppedFiles[0].name}`, 'system');
        addLog(`${formatFileSize(droppedFiles[0].size)}`, 'data');
      } else {
        addLog(`dropped: ${droppedFiles.length} files`, 'system');
        const totalSize = droppedFiles.reduce((sum, f) => sum + f.size, 0);
        addLog(`${formatFileSize(totalSize)} total`, 'data');
      }
    }
  };

  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

  const createZipFile = async (filesToZip: File[]): Promise<File> => {
    return new Promise(async (resolve, reject) => {
      const worker = new ZipWorker();
      zipWorkerRef.current = worker;
      
      const zipFileName = filesToZip.length > 1 
        ? `retrosend_${Date.now()}.zip`
        : `${filesToZip[0].name.replace(/\.[^/.]+$/, '')}.zip`;

      const fileDataArray: { name: string; data: ArrayBuffer }[] = [];
      
      addLog('reading files...', 'data');
      
      for (let i = 0; i < filesToZip.length; i++) {
        const file = filesToZip[i];
        const arrayBuffer = await file.arrayBuffer();
        fileDataArray.push({ name: file.name, data: arrayBuffer });
        
        const readPercent = Math.round(((i + 1) / filesToZip.length) * 15);
        setZipProgress(readPercent);
        
        await yieldToMain();
      }

      worker.onmessage = (e) => {
        const { type, percent, blob, fileName, message, phase } = e.data;
        
        if (type === 'progress') {
          const adjustedPercent = 15 + Math.round(percent * 0.85);
          setZipProgress(Math.min(adjustedPercent, 100));
        } else if (type === 'complete') {
          worker.terminate();
          zipWorkerRef.current = null;
          setZipProgress(0);
          const zipFile = new File([blob], fileName, { type: 'application/zip' });
          resolve(zipFile);
        } else if (type === 'error') {
          worker.terminate();
          zipWorkerRef.current = null;
          setZipProgress(0);
          reject(new Error(message));
        } else if (type === 'cancelled') {
          worker.terminate();
          zipWorkerRef.current = null;
          setZipProgress(0);
          reject(new Error('cancelled'));
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        zipWorkerRef.current = null;
        setZipProgress(0);
        reject(new Error('Worker error: ' + error.message));
      };

      worker.postMessage({
        type: 'start',
        files: fileDataArray,
        zipFileName
      });
    });
  };

  const cancelZipping = () => {
    if (zipWorkerRef.current) {
      zipWorkerRef.current.postMessage({ type: 'cancel' });
    }
  };

  const startSending = async () => {
    if (files.length === 0) return;

    setLogs([]);
    let fileToSend: File;

    if (files.length > 1) {
      setStatus('zipping');
      setIsZipping(true);
      addLog(`creating zip of ${files.length} files...`, 'system');
      
      try {
        fileToSend = await createZipFile(files);
        setZipFile(fileToSend);
        setIsZipping(false);
        addLog(`zip created: ${fileToSend.name}`, 'success');
        addLog(`${formatFileSize(fileToSend.size)}`, 'data');
      } catch (error: any) {
        addLog(`zip failed: ${error.message}`, 'error');
        setIsZipping(false);
        setStatus('idle');
        return;
      }
    } else {
      fileToSend = files[0];
    }

    fileToUploadRef.current = fileToSend;
    addLog('creating session...', 'system');

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileToSend.name,
          fileSize: fileToSend.size,
          mimeType: fileToSend.type || 'application/octet-stream',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      const sessionToken = data.token;
      setCode(data.code);
      setStatus('waiting');
      addLog(`code: ${data.code}`, 'success');
      addLog('waiting for receiver...', 'warn');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join-sender', code: data.code, token: sessionToken, isMultiShare: multiShareMode, userId: user?.id }));
        addLog('connected to server', 'info');
        if (multiShareMode) {
          multiWebrtc.initMultiSender(ws, fileToSend);
          setMultiShareStatus('waiting');
          addLog('multi-share mode active', 'system');
        }
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'joined':
            addLog('joined as sender', 'info');
            if (message.isMultiShare) {
              addLog('waiting for receivers (0/4)...', 'warn');
            }
            break;

          case 'peer-connected':
            if (!multiShareMode) {
              addLog('receiver connected', 'success');
              addLog('establishing P2P...', 'system');
              setStatus('transferring');
              setTransferStartTime(Date.now());
              setTotalBytes(fileToSend.size);
              setBytesTransferred(0);
              try {
                const result = await webrtc.initSender(ws, fileToSend, fastMode);
                ws.send(JSON.stringify({ type: 'transfer-complete' }));
                
                addRecord({
                  type: 'send',
                  fileName: fileToSend.name,
                  fileSize: fileToSend.size,
                  code: data.code,
                  status: 'completed',
                  duration: result.duration,
                  avgSpeed: result.avgSpeed
                });
              } catch (err: any) {
                if (err.message?.includes('cancelled')) {
                  addLog('transfer cancelled', 'error');
                  setStatus('cancelled');
                  addRecord({
                    type: 'send',
                    fileName: fileToSend.name,
                    fileSize: fileToSend.size,
                    code: data.code,
                    status: 'cancelled'
                  });
                } else {
                  addLog(err.message || 'Transfer failed', 'error');
                  setStatus('idle');
                  addRecord({
                    type: 'send',
                    fileName: fileToSend.name,
                    fileSize: fileToSend.size,
                    code: data.code,
                    status: 'failed'
                  });
                }
              }
            }
            break;

          case 'multi-peer-connected':
            if (multiShareMode && message.receiverId) {
              addLog(`receiver ${message.receiverId.slice(-4)} joined`, 'success');
              setMultiShareStatus('active');
              setStatus('transferring');
              multiWebrtc.handleNewReceiver(message.receiverId);
            }
            break;

          case 'multi-peer-disconnected':
            if (multiShareMode && message.receiverId) {
              addLog(`receiver ${message.receiverId.slice(-4)} left`, 'warn');
              multiWebrtc.removeReceiver(message.receiverId);
            }
            break;

          case 'receiver-count-update':
            setReceiverCount(message.count);
            if (message.count === 0 && multiShareStatus === 'active') {
              addLog('all receivers done, waiting for more...', 'warn');
            }
            break;

          case 'signal':
            if (multiShareMode && message.fromReceiverId) {
              multiWebrtc.handleSignal(message.data, message.fromReceiverId);
            } else {
              webrtc.handleSignal(message.data);
            }
            break;

          case 'transfer-complete':
            if (!multiShareMode) {
              addLog('transfer verified', 'success');
              setStatus('complete');
            }
            break;

          case 'multi-share-stopped':
            addLog('multi-share session ended', 'success');
            setStatus('complete');
            setMultiShareStatus('idle');
            setReceiverCount(0);
            setReceiverProgress(new Map());
            setProgress(0);
            setCurrentSpeed(0);
            multiWebrtc.cleanup();
            break;

          case 'peer-disconnected':
            if (!multiShareMode) {
              addLog('receiver disconnected', 'error');
              setStatus('idle');
              webrtc.cleanup();
            }
            break;

          case 'error':
            addLog(`${message.error}`, 'error');
            if (!multiShareMode) {
              setStatus('idle');
            }
            break;
        }
      };

      ws.onerror = () => {
        addLog('connection failed', 'error');
        setStatus('idle');
      };

      ws.onclose = () => {
        if (statusRef.current !== 'complete' && statusRef.current !== 'cancelled') {
          addLog('disconnected', 'warn');
        }
      };

    } catch (error: any) {
      addLog(`${error.message}`, 'error');
      setStatus('idle');
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      addLog('code copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      addLog('failed to copy code', 'error');
    }
  };

  const copyLink = async () => {
    try {
      const link = `${window.location.origin}/receive?code=${code}`;
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      addLog('link copied to clipboard', 'success');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      addLog('failed to copy link', 'error');
    }
  };

  const handlePauseResume = () => {
    if (webrtc.isPaused) {
      webrtc.resume();
    } else {
      webrtc.pause();
    }
  };

  const handleCancel = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'sender-cancelled' }));
    }
    webrtc.cancel();
    setStatus('cancelled');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleStopMultiShare = () => {
    multiWebrtc.stopMultiShare();
    setMultiShareStatus('idle');
    setReceiverCount(0);
    setReceiverProgress(new Map());
    setCompletedReceivers(new Set());
    setProgress(0);
    setCurrentSpeed(0);
  };

  const resetSender = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (zipWorkerRef.current) {
      zipWorkerRef.current.postMessage({ type: 'cancel' });
      zipWorkerRef.current.terminate();
      zipWorkerRef.current = null;
    }
    webrtc.cleanup();
    multiWebrtc.cleanup();
    cloudUpload.cancelUpload();
    fileToUploadRef.current = null;
    setFiles([]);
    setZipFile(null);
    setCode("");
    setStatus('idle');
    setProgress(0);
    setZipProgress(0);
    setCloudUploadProgress(0);
    setCloudUploadStatus('idle');
    setCurrentSpeed(0);
    setBytesTransferred(0);
    setTotalBytes(0);
    setLogs([]);
    setCopied(false);
    setMultiShareMode(false);
    setFastMode(false);
    setSaveToCloud(false);
    setMultiShareStatus('idle');
    setReceiverCount(0);
    setReceiverProgress(new Map());
    setCompletedReceivers(new Set());
  };

  const handleReceiveSubmit = () => {
    if (receiveCode.length === 6) {
      navigate(`/receive?code=${receiveCode}`);
    } else if (receiveCode.length === 8) {
      navigate(`/receive?code=${receiveCode}&type=cloud`);
    }
  };

  const handleCloudFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      
      const validation = validateFiles(selectedFiles);
      if (!validation.valid) {
        addLog(validation.message || 'File validation failed', 'error');
        return;
      }
      
      cloudUpload.cancelUpload();
      setCloudUploadStatus('idle');
      setCloudUploadProgress(0);
      setCloudCode('');
      setCloudFileName('');
      setCloudFiles(selectedFiles);
      
      if (selectedFiles.length === 1) {
        addLog(`selected for cloud: ${selectedFiles[0].name}`, 'system');
        addLog(`${formatFileSize(selectedFiles[0].size)}`, 'data');
      } else {
        addLog(`selected for cloud: ${selectedFiles.length} files`, 'system');
        const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
        addLog(`${formatFileSize(totalSize)} total`, 'data');
      }
    }
  };

  const startCloudUpload = async () => {
    if (cloudFiles.length === 0) return;
    
    setLogs([]);
    setCloudUploadStatus('uploading');
    setCloudCode('');
    
    let fileToUpload: File;
    
    if (cloudFiles.length > 1) {
      addLog(`creating zip of ${cloudFiles.length} files...`, 'system');
      try {
        fileToUpload = await createZipFile(cloudFiles);
        addLog(`zip created: ${fileToUpload.name}`, 'success');
      } catch (error: any) {
        addLog(`zip failed: ${error.message}`, 'error');
        setCloudUploadStatus('failed');
        return;
      }
    } else {
      fileToUpload = cloudFiles[0];
    }
    
    setCloudFileName(fileToUpload.name);
    addLog(`uploading to cloud...`, 'system');
    
    const result = await cloudUpload.uploadToCloud(fileToUpload);
    
    if (result.success && result.code) {
      addRecord({
        type: 'send',
        fileName: fileToUpload.name,
        fileSize: fileToUpload.size,
        code: result.code,
        status: 'completed',
      });
    }
  };

  const resetCloudUpload = () => {
    cloudUpload.cancelUpload();
    setCloudFiles([]);
    setCloudCode('');
    setCloudFileName('');
    setCloudUploadStatus('idle');
    setCloudUploadProgress(0);
    setLogs([]);
  };

  const copyCloudCode = async () => {
    try {
      await navigator.clipboard.writeText(cloudCode);
      setCopied(true);
      addLog('code copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      addLog('failed to copy code', 'error');
    }
  };

  const copyCloudLink = async () => {
    try {
      const link = `${window.location.origin}/receive?code=${cloudCode}&type=cloud`;
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      addLog('link copied to clipboard', 'success');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      addLog('failed to copy link', 'error');
    }
  };

  const handleFastModeToggle = () => {
    if (!fastMode) {
      setShowFastModeWarning(true);
    } else {
      setFastMode(false);
    }
  };

  const confirmFastMode = () => {
    setFastMode(true);
    setShowFastModeWarning(false);
    addLog('FAST MODE enabled', 'warn');
  };

  const handleSaveToCloudToggle = () => {
    if (!saveToCloud) {
      // Enabling save to cloud - disable other modes
      setFastMode(false);
      setMultiShareMode(false);
      setSaveToCloud(true);
      addLog('SAVE TO CLOUD enabled', 'system');
    } else {
      setSaveToCloud(false);
      cloudUpload.cancelUpload();
      setCloudUploadStatus('idle');
      setCloudUploadProgress(0);
      setCloudFileName('');
    }
  };

  const triggerCloudUpload = useCallback(async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;
    
    cloudUpload.cancelUpload();
    setCloudUploadStatus('uploading');
    
    if (filesToUpload.length === 1) {
      setCloudFileName(filesToUpload[0].name);
      cloudUpload.uploadToCloud(filesToUpload[0]);
    } else {
      setCloudFileName(`${filesToUpload.length} files.zip`);
      addLog('creating zip for cloud upload...', 'system');
      
      try {
        const zip = await createZipFile(filesToUpload);
        if (zip) {
          setCloudFileName(zip.name);
          cloudUpload.uploadToCloud(zip);
        } else {
          setCloudUploadStatus('failed');
          addLog('failed to create zip for cloud upload', 'error');
        }
      } catch (error) {
        setCloudUploadStatus('failed');
        addLog('cloud zip creation error', 'error');
      }
    }
  }, [cloudUpload, addLog]);

  useEffect(() => {
    if (saveToCloud && files.length > 0 && cloudUploadStatus === 'idle' && cloudUpload.cloudEnabled) {
      triggerCloudUpload(files);
    }
  }, [saveToCloud, files, cloudUploadStatus, triggerCloudUpload, cloudUpload.cloudEnabled]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (zipWorkerRef.current) {
        zipWorkerRef.current.terminate();
      }
      webrtc.cleanup();
    };
  }, []);


  const activeFile = zipFile || (files.length === 1 ? files[0] : null);
  const bytesRemaining = totalBytes - bytesTransferred;

  return (
    <RetroLayout>
      <div className="h-full flex items-start justify-start gap-6 pl-4">
        <div className="w-72 flex flex-col gap-4">
          {/* Mode Toggle */}
          <div className="flex gap-1 p-1 rounded" style={{ background: 'hsl(var(--border-subtle))' }}>
            <button
              onClick={() => { setTransferMode('p2p'); resetCloudUpload(); }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-[10px] font-medium tracking-wider transition-all"
              style={{ 
                background: transferMode === 'p2p' ? 'hsl(var(--bg))' : 'transparent',
                color: transferMode === 'p2p' ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
                boxShadow: transferMode === 'p2p' ? '0 0 10px hsl(var(--accent) / 0.2)' : 'none'
              }}
              data-testid="button-mode-p2p"
            >
              <Radio size={12} />
              P2P
            </button>
            <button
              onClick={() => { setTransferMode('cloud'); resetSender(); }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-[10px] font-medium tracking-wider transition-all"
              style={{ 
                background: transferMode === 'cloud' ? 'hsl(var(--bg))' : 'transparent',
                color: transferMode === 'cloud' ? 'hsl(200 80% 55%)' : 'hsl(var(--text-dim))',
                boxShadow: transferMode === 'cloud' ? '0 0 10px hsl(200 80% 55% / 0.2)' : 'none'
              }}
              disabled={!cloudUpload.cloudEnabled}
              data-testid="button-mode-cloud"
            >
              <HardDrive size={12} />
              CLOUD
            </button>
          </div>

          {/* P2P Mode */}
          {transferMode === 'p2p' && status === 'idle' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                    SEND
                  </div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-[9px] tracking-wider transition-colors"
                    style={{ color: showHistory ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}
                    data-testid="button-toggle-history"
                  >
                    {showHistory ? 'HIDE HISTORY' : 'HISTORY'}
                  </button>
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`drop-zone p-4 cursor-pointer ${isDragOver ? 'active' : ''}`}
                  data-testid="drop-zone"
                >
                  <div className="flex items-center gap-3">
                    <Upload
                      size={16}
                      style={{ color: isDragOver ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}
                    />
                    {files.length > 0 ? (
                      <div className="min-w-0 flex-1">
                        {files.length === 1 ? (
                          <>
                            <div className="text-xs truncate" style={{ color: 'hsl(var(--accent))' }}>
                              {files[0].name}
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatFileSize(files[0].size)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--accent))' }}>
                              <FileArchive size={12} />
                              {files.length} files
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))} total
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                        drop or click (files/folders)
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-file"
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  {...{ webkitdirectory: "", directory: "" } as any}
                  data-testid="input-folder"
                />

                {files.length > 1 && (
                  <div className="mt-2 max-h-24 overflow-y-auto minimal-border p-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between py-1 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] truncate" style={{ color: 'hsl(var(--text-secondary))' }}>
                            {file.name}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                          className="p-0.5 transition-colors"
                          style={{ color: 'hsl(var(--text-dim))' }}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between minimal-border p-2">
                      <div className="flex items-center gap-2">
                        <Users 
                          size={12} 
                          style={{ color: multiShareMode ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }} 
                        />
                        <span className="text-[10px]" style={{ color: multiShareMode ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}>
                          MULTI-SHARE
                        </span>
                      </div>
                      <button
                        onClick={() => setMultiShareMode(!multiShareMode)}
                        className="w-8 h-4 rounded-full transition-all relative"
                        style={{ 
                          background: multiShareMode ? 'hsl(var(--accent))' : 'hsl(var(--border))',
                          boxShadow: multiShareMode ? '0 0 8px hsl(var(--accent) / 0.5)' : 'none'
                        }}
                        data-testid="toggle-multi-share"
                      >
                        <div 
                          className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                          style={{ 
                            background: multiShareMode ? 'hsl(var(--bg))' : 'hsl(var(--text-dim))',
                            left: multiShareMode ? '16px' : '2px'
                          }}
                        />
                      </button>
                    </div>
                    {!multiShareMode && (
                      <div className="flex items-center justify-between minimal-border p-2">
                        <div className="flex items-center gap-2">
                          <Zap 
                            size={12} 
                            style={{ color: fastMode ? 'hsl(45 100% 50%)' : 'hsl(var(--text-dim))' }} 
                          />
                          <span className="text-[10px]" style={{ color: fastMode ? 'hsl(45 100% 50%)' : 'hsl(var(--text-dim))' }}>
                            FAST MODE
                          </span>
                        </div>
                        <button
                          onClick={handleFastModeToggle}
                          className="w-8 h-4 rounded-full transition-all relative"
                          style={{ 
                            background: fastMode ? 'hsl(45 100% 50%)' : 'hsl(var(--border))',
                            boxShadow: fastMode ? '0 0 8px hsl(45 100% 50% / 0.5)' : 'none'
                          }}
                          data-testid="toggle-fast-mode"
                        >
                          <div 
                            className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                            style={{ 
                              background: fastMode ? 'hsl(var(--bg))' : 'hsl(var(--text-dim))',
                              left: fastMode ? '16px' : '2px'
                            }}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="minimal-btn flex items-center justify-center gap-1 px-3"
                    title="Select folder"
                    data-testid="button-select-folder"
                  >
                    <FolderOpen size={12} />
                  </button>
                  <button
                    onClick={startSending}
                    disabled={files.length === 0}
                    className={`minimal-btn flex-1 flex items-center justify-center gap-2 ${files.length > 0 ? 'minimal-btn-accent' : ''}`}
                    data-testid="button-send"
                  >
                    {files.length > 1 ? 'zip & generate code' : files.length === 1 ? 'generate code' : 'select file(s)'}
                    {files.length > 0 && <ArrowRight size={12} />}
                  </button>
                </div>
              </div>

              {showHistory && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                      RECENT TRANSFERS
                    </div>
                    {history.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-[9px] transition-colors"
                        style={{ color: 'hsl(0 65% 55%)' }}
                        data-testid="button-clear-history"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                  <div className="minimal-border p-2 max-h-40 overflow-y-auto">
                    {history.length === 0 ? (
                      <div className="text-[10px] text-center py-2" style={{ color: 'hsl(var(--text-dim))' }}>
                        no transfers yet
                      </div>
                    ) : (
                      history.slice(0, 10).map((record) => (
                        <div key={record.id} className="py-1.5 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] truncate" style={{ color: 'hsl(var(--text-secondary))' }}>
                                {record.fileName}
                              </div>
                              <div className="flex items-center gap-2 text-[9px]" style={{ color: 'hsl(var(--text-dim))' }}>
                                <span>{record.type === 'send' ? 'sent' : 'received'}</span>
                                <span>{formatFileSize(record.fileSize)}</span>
                                <span style={{ color: getStatusColor(record.status) }}>{record.status}</span>
                              </div>
                            </div>
                            <div className="text-[9px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatHistoryDate(record.timestamp)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                  RECEIVE
                </div>
                <div className="minimal-border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={receiveCode}
                      onChange={(e) => setReceiveCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      placeholder="6/8 digit code"
                      className="minimal-input flex-1 text-center tracking-[0.2em] text-sm"
                      data-testid="input-receive-code-home"
                    />
                    <button
                      onClick={handleReceiveSubmit}
                      disabled={receiveCode.length !== 6 && receiveCode.length !== 8}
                      className={`minimal-btn px-3 ${(receiveCode.length === 6 || receiveCode.length === 8) ? 'minimal-btn-accent' : ''}`}
                      data-testid="button-receive-home"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cloud Mode */}
          {transferMode === 'cloud' && cloudUploadStatus === 'idle' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] tracking-wider" style={{ color: 'hsl(200 80% 55%)' }}>
                    UPLOAD TO CLOUD
                  </div>
                  <div className="flex items-center gap-1 text-[9px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    <HardDrive size={10} />
                    permanent storage
                  </div>
                </div>
                <div
                  onClick={() => cloudFileInputRef.current?.click()}
                  className={`drop-zone p-4 cursor-pointer ${isDragOver ? 'active' : ''}`}
                  style={{ borderColor: 'hsl(200 80% 55% / 0.3)' }}
                  data-testid="cloud-drop-zone"
                >
                  <div className="flex items-center gap-3">
                    <Cloud
                      size={16}
                      style={{ color: isDragOver ? 'hsl(200 80% 55%)' : 'hsl(var(--text-dim))' }}
                    />
                    {cloudFiles.length > 0 ? (
                      <div className="min-w-0 flex-1">
                        {cloudFiles.length === 1 ? (
                          <>
                            <div className="text-xs truncate" style={{ color: 'hsl(200 80% 55%)' }}>
                              {cloudFiles[0].name}
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatFileSize(cloudFiles[0].size)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs flex items-center gap-1" style={{ color: 'hsl(200 80% 55%)' }}>
                              <FileArchive size={12} />
                              {cloudFiles.length} files
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              {formatFileSize(cloudFiles.reduce((sum, f) => sum + f.size, 0))} total
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                        drop or click to select files
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={cloudFileInputRef}
                  type="file"
                  multiple
                  onChange={handleCloudFileChange}
                  className="hidden"
                  data-testid="cloud-input-file"
                />

                {cloudFiles.length > 1 && (
                  <div className="mt-2 max-h-24 overflow-y-auto minimal-border p-2">
                    {cloudFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between py-1 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] truncate" style={{ color: 'hsl(var(--text-secondary))' }}>
                            {file.name}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setCloudFiles(prev => prev.filter((_, i) => i !== index)); 
                          }}
                          className="p-0.5 transition-colors"
                          style={{ color: 'hsl(var(--text-dim))' }}
                          data-testid={`button-remove-cloud-file-${index}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={startCloudUpload}
                  disabled={cloudFiles.length === 0}
                  className="minimal-btn w-full mt-2 flex items-center justify-center gap-2"
                  style={{ 
                    borderColor: cloudFiles.length > 0 ? 'hsl(200 80% 55%)' : 'hsl(var(--border))',
                    color: cloudFiles.length > 0 ? 'hsl(200 80% 55%)' : 'hsl(var(--text-dim))'
                  }}
                  data-testid="button-cloud-upload"
                >
                  <Cloud size={12} />
                  {cloudFiles.length > 1 ? 'zip & upload to cloud' : cloudFiles.length === 1 ? 'upload to cloud' : 'select file(s)'}
                  {cloudFiles.length > 0 && <ArrowRight size={12} />}
                </button>
              </div>

              <div>
                <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                  RECEIVE
                </div>
                <div className="minimal-border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={receiveCode}
                      onChange={(e) => setReceiveCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      placeholder="8-char code"
                      className="minimal-input flex-1 text-center tracking-[0.2em] text-sm"
                      data-testid="input-cloud-receive-code"
                    />
                    <button
                      onClick={() => {
                        if (receiveCode.length === 8) {
                          navigate(`/receive?code=${receiveCode}&type=cloud`);
                        } else if (receiveCode.length === 6) {
                          navigate(`/receive?code=${receiveCode}`);
                        }
                      }}
                      disabled={receiveCode.length !== 6 && receiveCode.length !== 8}
                      className={`minimal-btn px-3 ${(receiveCode.length === 6 || receiveCode.length === 8) ? 'minimal-btn-accent' : ''}`}
                      style={{ 
                        borderColor: receiveCode.length === 8 ? 'hsl(200 80% 55%)' : undefined,
                        color: receiveCode.length === 8 ? 'hsl(200 80% 55%)' : undefined
                      }}
                      data-testid="button-cloud-receive"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cloud Upload Progress */}
          {transferMode === 'cloud' && cloudUploadStatus === 'uploading' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(200 80% 55%)' }}>
                UPLOADING
              </div>
              <div className="minimal-border p-4" style={{ borderColor: 'hsl(200 80% 55% / 0.3)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Cloud size={14} style={{ color: 'hsl(200 80% 55%)' }} className="animate-pulse" />
                  <div className="text-xs truncate" style={{ color: 'hsl(200 80% 55%)' }}>
                    {cloudFileName || 'uploading...'}
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                  <div 
                    className="h-full transition-all duration-200" 
                    style={{ 
                      width: `${cloudUploadProgress}%`, 
                      background: 'hsl(200 80% 55%)',
                      boxShadow: '0 0 8px hsl(200 80% 55% / 0.5)'
                    }} 
                  />
                </div>
                <div className="text-[10px] mt-2 text-center" style={{ color: 'hsl(var(--text-dim))' }}>
                  {cloudUploadProgress}%
                </div>
              </div>
              <button
                onClick={resetCloudUpload}
                className="minimal-btn w-full mt-2"
                style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 55%)' }}
                data-testid="button-cancel-cloud"
              >
                cancel
              </button>
            </div>
          )}

          {/* Cloud Upload Success */}
          {transferMode === 'cloud' && cloudUploadStatus === 'success' && cloudCode && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(200 80% 55%)' }}>
                UPLOAD COMPLETE
              </div>
              <div 
                className="p-4 rounded"
                style={{ 
                  border: '1px solid hsl(200 80% 55%)',
                  boxShadow: '0 0 20px hsl(200 80% 55% / 0.2)'
                }}
              >
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div 
                    className="text-xl font-medium tracking-[0.3em]"
                    style={{ color: 'hsl(200 80% 55%)' }}
                    data-testid="text-cloud-code"
                  >
                    {cloudCode}
                  </div>
                  <button
                    onClick={copyCloudCode}
                    className="p-2 transition-colors minimal-border"
                    style={{ 
                      color: copied ? 'hsl(200 80% 55%)' : 'hsl(var(--text-dim))',
                      borderColor: 'hsl(200 80% 55% / 0.3)'
                    }}
                    title="Copy code"
                    data-testid="button-copy-cloud-code"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="text-[10px] text-center mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
                  permanent code - share anytime
                </div>
                <div className="text-xs truncate mb-3 text-center" style={{ color: 'hsl(var(--text-secondary))' }}>
                  {cloudFileName}
                </div>
                <button
                  onClick={copyCloudLink}
                  className="minimal-btn w-full flex items-center justify-center gap-2"
                  style={{ 
                    borderColor: 'hsl(200 80% 55% / 0.5)',
                    color: linkCopied ? 'hsl(200 80% 55%)' : 'hsl(var(--text-secondary))'
                  }}
                  data-testid="button-copy-cloud-link"
                >
                  {linkCopied ? <Check size={12} /> : <Link2 size={12} />}
                  {linkCopied ? 'link copied!' : 'copy download link'}
                </button>
              </div>
              <button
                onClick={resetCloudUpload}
                className="minimal-btn w-full mt-2"
                style={{ borderColor: 'hsl(200 80% 55%)', color: 'hsl(200 80% 55%)' }}
                data-testid="button-upload-another"
              >
                upload another
              </button>
            </div>
          )}

          {/* Cloud Upload Failed */}
          {transferMode === 'cloud' && cloudUploadStatus === 'failed' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(0 65% 55%)' }}>
                UPLOAD FAILED
              </div>
              <div className="minimal-border p-4 text-center" style={{ borderColor: 'hsl(0 65% 55% / 0.3)' }}>
                <div className="text-xs" style={{ color: 'hsl(0 65% 55%)' }}>
                  cloud upload failed
                </div>
              </div>
              <button
                onClick={resetCloudUpload}
                className="minimal-btn w-full mt-2"
                style={{ borderColor: 'hsl(200 80% 55%)', color: 'hsl(200 80% 55%)' }}
                data-testid="button-try-again-cloud"
              >
                try again
              </button>
            </div>
          )}

          {transferMode === 'p2p' && status === 'zipping' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CREATING ZIP
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <FileArchive size={16} style={{ color: 'hsl(var(--accent))' }} />
                </div>
                <div className="text-xs mb-2" style={{ color: 'hsl(var(--text-secondary))' }}>
                  compressing {files.length} files... {zipProgress > 0 ? `${zipProgress}%` : ''}
                </div>
                {zipProgress > 0 && (
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                    <div 
                      className="h-full transition-all duration-200" 
                      style={{ 
                        width: `${zipProgress}%`, 
                        background: 'hsl(var(--accent))' 
                      }} 
                    />
                  </div>
                )}
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn w-full mt-2"
                data-testid="button-cancel-zip"
              >
                cancel
              </button>
            </div>
          )}

          {transferMode === 'p2p' && status === 'waiting' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                {multiShareMode ? 'MULTI-SHARE' : 'CODE'}
              </div>
              <div className="minimal-border-accent p-4">
                <div className="flex items-center justify-center gap-3">
                  <div 
                    className="text-2xl font-medium tracking-[0.4em] glow-text"
                    style={{ color: 'hsl(var(--accent))' }}
                    data-testid="text-code"
                  >
                    {code}
                  </div>
                  <button
                    onClick={copyCode}
                    className="p-2 transition-colors minimal-border"
                    style={{ color: copied ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))' }}
                    title="Copy code"
                    data-testid="button-copy-code"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                {multiShareMode ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'hsl(var(--accent))' }}>
                      <Users size={14} />
                      <span data-testid="text-receiver-count">Receivers: {receiverCount}/{maxReceivers}</span>
                    </div>
                    <div className="text-[10px] mt-2 text-center animate-pulse-subtle" style={{ color: 'hsl(var(--text-dim))' }}>
                      waiting for receivers...
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] mt-2 text-center animate-pulse-subtle" style={{ color: 'hsl(var(--text-dim))' }}>
                    waiting for receiver
                  </div>
                )}
              </div>
              {multiShareMode ? (
                <button
                  onClick={handleStopMultiShare}
                  className="minimal-btn w-full mt-2 flex items-center justify-center gap-2"
                  style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 55%)' }}
                  data-testid="button-stop-multi-share"
                >
                  <Square size={12} />
                  stop sharing
                </button>
              ) : (
                <button
                  onClick={resetSender}
                  className="minimal-btn w-full mt-2"
                  data-testid="button-cancel"
                >
                  cancel
                </button>
              )}
            </div>
          )}

          {transferMode === 'p2p' && (status === 'transferring' || status === 'connected') && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                {multiShareMode ? 'MULTI-SHARE TRANSFER' : 'TRANSFER'} {webrtc.isPaused && '(PAUSED)'}
              </div>
              <div className="minimal-border p-4">
                <div className="text-xs truncate mb-3" style={{ color: 'hsl(var(--accent))' }}>
                  {activeFile?.name || `${files.length} files (zipped)`}
                </div>
                {multiShareMode && (
                  <div className="flex items-center justify-between mb-3 text-sm" style={{ color: 'hsl(var(--accent))' }}>
                    <div className="flex items-center gap-2">
                      <Users size={14} />
                      <span data-testid="text-receiver-count-active">Receivers: {receiverCount}/{maxReceivers}</span>
                    </div>
                    {receiverCount === 0 && (
                      <span className="text-[10px] animate-pulse-subtle" style={{ color: 'hsl(var(--text-dim))' }}>
                        Waiting for more...
                      </span>
                    )}
                  </div>
                )}
                <div className="progress-track mb-2">
                  <div 
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] mb-2" style={{ color: 'hsl(var(--text-dim))' }}>
                  <span>{progress}%</span>
                  {currentSpeed > 0 && !webrtc.isPaused && (
                    <span style={{ color: 'hsl(var(--accent))' }}>
                      {currentSpeed.toFixed(1)} MB/s
                    </span>
                  )}
                </div>
                {!multiShareMode && currentSpeed > 0 && bytesRemaining > 0 && !webrtc.isPaused && (
                  <div className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    <Clock size={10} />
                    <span>{formatTimeRemaining(bytesRemaining, currentSpeed)}</span>
                  </div>
                )}
              </div>
              {multiShareMode ? (
                <button
                  onClick={handleStopMultiShare}
                  className="minimal-btn w-full mt-2 flex items-center justify-center gap-2"
                  style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 55%)' }}
                  data-testid="button-stop-multi-share-active"
                >
                  <Square size={12} />
                  stop sharing
                </button>
              ) : (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handlePauseResume}
                    className="minimal-btn flex-1 flex items-center justify-center gap-2 minimal-btn-accent"
                    data-testid="button-pause-resume"
                  >
                    {webrtc.isPaused ? <Play size={12} /> : <Pause size={12} />}
                    {webrtc.isPaused ? 'resume' : 'pause'}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="minimal-btn flex-1 flex items-center justify-center gap-2"
                    style={{ borderColor: 'hsl(0 65% 55% / 0.5)', color: 'hsl(0 65% 55%)' }}
                    data-testid="button-cancel-transfer"
                  >
                    <X size={12} />
                    cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {transferMode === 'p2p' && status === 'complete' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                COMPLETE
              </div>
              <div className="minimal-border-accent p-4 text-center">
                <div className="text-xs mb-1 glow-text" style={{ color: 'hsl(var(--accent))' }}>
                  transfer complete
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  {activeFile?.name || `${files.length} files`}
                </div>
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn w-full mt-2 minimal-btn-accent"
                data-testid="button-send-another"
              >
                send another
              </button>
            </div>
          )}

          {transferMode === 'p2p' && status === 'cancelled' && (
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                CANCELLED
              </div>
              <div className="minimal-border p-4 text-center">
                <div className="text-xs" style={{ color: 'hsl(0 65% 55%)' }}>
                  transfer cancelled
                </div>
              </div>
              <button
                onClick={resetSender}
                className="minimal-btn minimal-btn-accent w-full mt-2"
                data-testid="button-try-again"
              >
                try another code
              </button>
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <div className="flex-1 max-w-md h-[400px]">
            <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
              LOG
            </div>
            <div 
              className="terminal-log p-3 h-full overflow-y-auto"
            >
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex gap-2 py-0.5"
                >
                  <span style={{ color: 'hsl(var(--text-dim))' }}>{formatTime(log.timestamp)}</span>
                  <span style={{ color: getLogColor(log.type) }}>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {code && (status === 'waiting' || status === 'transferring' || status === 'connected' || status === 'complete') && (
          <div className="w-72 flex flex-col gap-4">
            <div>
              <div className="text-[10px] mb-2 tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                QR CODE
              </div>
              <div 
                className="minimal-border p-3 flex flex-col items-center"
                style={{ background: 'hsl(var(--bg))' }}
              >
                <div 
                  className="p-2 rounded"
                  style={{ background: '#ffffff' }}
                >
                  <QRCodeSVG 
                    value={typeof window !== 'undefined' ? `${window.location.origin}/receive?code=${code}` : `/receive?code=${code}`}
                    size={120}
                    level="M"
                    fgColor="#000000"
                    bgColor="#ffffff"
                    data-testid="qr-code"
                  />
                </div>
                <div className="text-[9px] mt-2 text-center" style={{ color: 'hsl(var(--text-dim))' }}>
                  scan to receive
                </div>
                <button
                  onClick={copyLink}
                  className="mt-3 w-full minimal-btn flex items-center justify-center gap-2 text-[10px]"
                  data-testid="button-copy-link"
                >
                  {linkCopied ? (
                    <>
                      <Check size={12} style={{ color: 'hsl(var(--accent))' }} />
                      <span style={{ color: 'hsl(var(--accent))' }}>copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>copy link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            
            <SpeedGraph 
              currentSpeed={currentSpeed}
              isTransferring={status === 'transferring' || status === 'connected'}
              isComplete={status === 'complete'}
            />
          </div>
        )}
      </div>
      <SpeedIndicator currentSpeed={status === 'transferring' && !webrtc.isPaused ? currentSpeed : undefined} />
      
      {showFastModeWarning && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0, 0, 0, 0.8)' }}
        >
          <div 
            className="p-4 minimal-border"
            style={{ 
              background: 'hsl(var(--bg))',
              borderColor: 'hsl(0 65% 55% / 0.5)'
            }}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} style={{ color: 'hsl(0 65% 55%)' }} />
              <span className="text-xs" style={{ color: 'hsl(0 65% 55%)' }}>
                Fast mode may cause data loss on unstable networks
              </span>
              <div className="flex gap-2 ml-2">
                <button
                  onClick={() => setShowFastModeWarning(false)}
                  className="minimal-btn text-[10px] px-3 py-1"
                  data-testid="button-cancel-fast-mode"
                >
                  cancel
                </button>
                <button
                  onClick={confirmFastMode}
                  className="minimal-btn text-[10px] px-3 py-1 flex items-center gap-1"
                  style={{ 
                    borderColor: 'hsl(0 65% 55%)',
                    color: 'hsl(0 65% 55%)'
                  }}
                  data-testid="button-confirm-fast-mode"
                >
                  <Zap size={10} />
                  enable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </RetroLayout>
  );
}
