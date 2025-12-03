import { useState, useEffect, useCallback } from 'react';

export interface TransferRecord {
  id: string;
  type: 'send' | 'receive';
  fileName: string;
  fileSize: number;
  code: string;
  timestamp: Date;
  status: 'completed' | 'cancelled' | 'failed';
  duration?: number;
  avgSpeed?: number;
}

const STORAGE_KEY = 'retrosend_transfer_history';
const MAX_RECORDS = 50;

export function useTransferHistory() {
  const [history, setHistory] = useState<TransferRecord[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const records = parsed.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        }));
        setHistory(records);
      }
    } catch (error) {
      console.error('Failed to load transfer history:', error);
    }
  }, []);

  const saveToStorage = useCallback((records: TransferRecord[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      console.error('Failed to save transfer history:', error);
    }
  }, []);

  const addRecord = useCallback((record: Omit<TransferRecord, 'id' | 'timestamp'>) => {
    const newRecord: TransferRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    setHistory(prev => {
      const updated = [newRecord, ...prev].slice(0, MAX_RECORDS);
      saveToStorage(updated);
      return updated;
    });

    return newRecord;
  }, [saveToStorage]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getRecentSends = useCallback(() => {
    return history.filter(r => r.type === 'send').slice(0, 10);
  }, [history]);

  const getRecentReceives = useCallback(() => {
    return history.filter(r => r.type === 'receive').slice(0, 10);
  }, [history]);

  return {
    history,
    addRecord,
    clearHistory,
    getRecentSends,
    getRecentReceives
  };
}
