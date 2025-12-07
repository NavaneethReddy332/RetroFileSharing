import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = '/api/tempmail';

interface Domain {
  id: string;
  domain: string;
}

interface TempMailAccount {
  id: string;
  address: string;
  password: string;
  token: string;
}

interface MailMessage {
  id: string;
  from: {
    address: string;
    name: string;
  };
  to: Array<{
    address: string;
    name: string;
  }>;
  subject: string;
  intro: string;
  text?: string;
  html?: string[];
  hasAttachments: boolean;
  size: number;
  createdAt: string;
  seen: boolean;
}

interface MessageDetail extends MailMessage {
  text: string;
  html: string[];
}

export function useTempMail() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<TempMailAccount | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateRandomString = (length: number): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const fetchDomains = useCallback(async (): Promise<Domain[]> => {
    try {
      const response = await fetch(`${API_BASE}/domains`);
      if (!response.ok) throw new Error('Failed to fetch domains');
      const data = await response.json();
      const domainList = data['hydra:member'] || data;
      setDomains(domainList);
      return domainList;
    } catch (err) {
      setError('Failed to fetch mail domains');
      return [];
    }
  }, []);

  const createAccount = useCallback(async (): Promise<TempMailAccount | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      let availableDomains = domains;
      if (availableDomains.length === 0) {
        availableDomains = await fetchDomains();
      }
      
      if (availableDomains.length === 0) {
        throw new Error('No mail domains available');
      }

      const domain = availableDomains[0].domain;
      const username = generateRandomString(10);
      const password = generateRandomString(12);
      const address = `${username}@${domain}`;

      const createResponse = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.message || 'Failed to create account');
      }

      const accountData = await createResponse.json();

      const tokenResponse = await fetch(`${API_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get auth token');
      }

      const tokenData = await tokenResponse.json();

      const newAccount: TempMailAccount = {
        id: accountData.id,
        address,
        password,
        token: tokenData.token,
      };

      setAccount(newAccount);
      setMessages([]);
      return newAccount;
    } catch (err: any) {
      setError(err.message || 'Failed to create temp mail account');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [domains, fetchDomains]);

  const fetchMessages = useCallback(async (): Promise<MailMessage[]> => {
    if (!account?.token) return [];

    try {
      const response = await fetch(`${API_BASE}/messages`, {
        headers: {
          'Authorization': `Bearer ${account.token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expired. Please generate a new email.');
          stopAutoRefresh();
          return [];
        }
        throw new Error('Failed to fetch messages');
      }

      const data = await response.json();
      const messageList = data['hydra:member'] || data || [];
      setMessages(messageList);
      return messageList;
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      return [];
    }
  }, [account?.token]);

  const fetchMessageDetail = useCallback(async (messageId: string): Promise<MessageDetail | null> => {
    if (!account?.token) return null;

    try {
      const response = await fetch(`${API_BASE}/messages/${messageId}`, {
        headers: {
          'Authorization': `Bearer ${account.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch message detail');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError('Failed to load email content');
      return null;
    }
  }, [account?.token]);

  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    if (!account?.token) return false;

    try {
      const response = await fetch(`${API_BASE}/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${account.token}`,
        },
      });

      if (response.ok || response.status === 204) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        return true;
      }
      return false;
    } catch (err) {
      setError('Failed to delete message');
      return false;
    }
  }, [account?.token]);

  const startAutoRefresh = useCallback((intervalMs: number = 10000) => {
    stopAutoRefresh();
    fetchMessages();
    refreshIntervalRef.current = setInterval(() => {
      fetchMessages();
    }, intervalMs);
  }, [fetchMessages]);

  const stopAutoRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    stopAutoRefresh();
    setAccount(null);
    setMessages([]);
    setError(null);
  }, [stopAutoRefresh]);

  useEffect(() => {
    return () => {
      stopAutoRefresh();
    };
  }, [stopAutoRefresh]);

  return {
    isLoading,
    error,
    account,
    messages,
    domains,
    createAccount,
    fetchMessages,
    fetchMessageDetail,
    deleteMessage,
    startAutoRefresh,
    stopAutoRefresh,
    copyToClipboard,
    reset,
    clearError: () => setError(null),
  };
}
