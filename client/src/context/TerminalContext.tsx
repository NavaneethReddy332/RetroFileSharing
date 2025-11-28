import React, { createContext, useContext, useState, useCallback } from "react";

type LogType = "info" | "success" | "warning" | "error" | "system";

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: LogType;
  isNew?: boolean;
}

interface TerminalContextType {
  logs: LogEntry[];
  addLog: (message: string, type?: LogType) => void;
  updateLastLog: (message: string) => void;
  clearLogs: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

// Maximum logs to keep (prevents memory issues and lag)
const MAX_LOGS = 25;

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      message: "RETROSEND OS v1.0 BOOTING...",
      type: "system",
    },
    {
      id: "init-2",
      timestamp: new Date().toLocaleTimeString(),
      message: "LOADING SYSTEM FILES... [OK]",
      type: "system",
    },
    {
      id: "init-3",
      timestamp: new Date().toLocaleTimeString(),
      message: "MOUNTING DRIVES... [OK]",
      type: "system",
    },
    {
      id: "init-4",
      timestamp: new Date().toLocaleTimeString(),
      message: "NETWORK: READY",
      type: "success",
    },
  ]);

  const addLog = useCallback((message: string, type: LogType = "info") => {
    setLogs((prev) => {
      const newLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        message,
        type,
        isNew: true,
      };
      
      // Keep only the last MAX_LOGS entries for smooth performance
      const updatedLogs = [...prev, newLog];
      if (updatedLogs.length > MAX_LOGS) {
        return updatedLogs.slice(updatedLogs.length - MAX_LOGS);
      }
      return updatedLogs;
    });
  }, []);

  const updateLastLog = useCallback((message: string) => {
    setLogs((prev) => {
      if (prev.length === 0) return prev;
      
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        message,
        timestamp: new Date().toLocaleTimeString(),
      };
      return updated;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <TerminalContext.Provider value={{ logs, addLog, updateLastLog, clearLogs }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (context === undefined) {
    throw new Error("useTerminal must be used within a TerminalProvider");
  }
  return context;
}
