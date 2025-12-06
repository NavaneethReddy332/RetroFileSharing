import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: number;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'retro_send_auth_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const saveUserToStorage = (userData: User | null) => {
    try {
      if (userData) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save auth state to localStorage');
    }
  };

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        saveUserToStorage(userData);
      } else {
        setUser(null);
        saveUserToStorage(null);
      }
    } catch (error) {
      setUser(null);
      saveUserToStorage(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const response = await apiRequest('POST', '/api/auth/login', { email, password });
    const userData = await response.json();
    setUser(userData);
    saveUserToStorage(userData);
  };

  const register = async (username: string, email: string, password: string) => {
    const response = await apiRequest('POST', '/api/auth/register', { username, email, password });
    const userData = await response.json();
    setUser(userData);
    saveUserToStorage(userData);
  };

  const logout = async () => {
    await apiRequest('POST', '/api/auth/logout', {});
    setUser(null);
    saveUserToStorage(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
