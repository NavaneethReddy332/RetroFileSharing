import { useState, useEffect, useRef, useCallback } from 'react';
import { X, User, Mail, Lock, AlertCircle, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              type?: 'standard' | 'icon';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { login, register, loginWithGoogle } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const handleGoogleCallback = useCallback(async (response: { credential: string }) => {
    setError('');
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle(response.credential);
      setIsGoogleLoading(false);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 1500);
    } catch (err: any) {
      setIsGoogleLoading(false);
      if (err instanceof Response) {
        try {
          const errorData = await err.json();
          setError(errorData.error || 'Google sign-in failed');
        } catch {
          setError(`Google sign-in failed: ${err.statusText || 'Unknown error'}`);
        }
      } else if (typeof err?.json === 'function') {
        try {
          const errorData = await err.json();
          setError(errorData.error || 'Google sign-in failed');
        } catch {
          setError('Google sign-in failed');
        }
      } else {
        setError(err?.message || 'Google sign-in failed');
      }
    }
  }, [loginWithGoogle, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setShowSuccess(false);
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && googleButtonRef.current && window.google?.accounts?.id) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
        });
        
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'filled_black',
          size: 'large',
          type: 'standard',
          text: 'continue_with',
          shape: 'rectangular',
          width: 280,
        });
      }
    }
  }, [isOpen, handleGoogleCallback]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
      setIsLoading(false);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        setEmail('');
        setPassword('');
        setUsername('');
        setShowSuccess(false);
      }, 1500);
    } catch (err: any) {
      setIsLoading(false);
      if (err instanceof Response) {
        try {
          const errorData = await err.json();
          setError(errorData.error || 'An error occurred');
        } catch {
          setError(`Request failed: ${err.statusText || 'Unknown error'}`);
        }
      } else if (typeof err?.json === 'function') {
        try {
          const errorData = await err.json();
          setError(errorData.error || 'An error occurred');
        } catch {
          setError('An error occurred');
        }
      } else {
        setError(err?.message || 'An error occurred');
      }
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div 
            className="relative w-full max-w-sm mx-4 p-6"
            style={{ 
              backgroundColor: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border-subtle))',
            }}
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
        {showSuccess ? (
          <div className="flex flex-col items-center justify-center py-8">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ 
                type: "spring",
                stiffness: 260,
                damping: 20,
                duration: 0.5 
              }}
              className="w-16 h-16 flex items-center justify-center rounded-full mb-4"
              style={{ 
                backgroundColor: 'hsl(var(--accent) / 0.15)',
                border: '2px solid hsl(var(--accent))'
              }}
            >
              <motion.div
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
              >
                <Check 
                  size={32} 
                  strokeWidth={3}
                  style={{ color: 'hsl(var(--accent))' }} 
                />
              </motion.div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="text-center"
            >
              <div 
                className="text-sm font-medium tracking-wider"
                style={{ color: 'hsl(var(--accent))' }}
              >
                {mode === 'login' ? 'SIGNED IN' : 'ACCOUNT CREATED'}
              </div>
              <div 
                className="text-[10px] mt-1"
                style={{ color: 'hsl(var(--text-dim))' }}
              >
                {mode === 'login' ? 'Welcome back!' : 'Welcome to AeroSend!'}
              </div>
            </motion.div>
          </div>
        ) : (
          <>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 transition-colors"
          style={{ color: 'hsl(var(--text-dim))' }}
          data-testid="button-close-auth-modal"
        >
          <X size={16} />
        </button>

        <div className="mb-6">
          <h2 
            className="text-sm tracking-[0.2em] font-medium"
            style={{ color: 'hsl(var(--accent))' }}
          >
            {mode === 'login' ? 'LOGIN' : 'REGISTER'}
          </h2>
          <p 
            className="text-[10px] mt-1"
            style={{ color: 'hsl(var(--text-dim))' }}
          >
            {mode === 'login' 
              ? 'Sign in to track your file transfers' 
              : 'Create an account to track your files'}
          </p>
        </div>

        {error && (
          <div 
            className="flex items-center gap-2 p-3 mb-4 text-xs"
            style={{ 
              backgroundColor: 'hsl(var(--destructive) / 0.1)',
              border: '1px solid hsl(var(--destructive) / 0.3)',
              color: 'hsl(var(--destructive))'
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label 
                className="block text-[10px] tracking-wider mb-1"
                style={{ color: 'hsl(var(--text-dim))' }}
              >
                USERNAME
              </label>
              <div className="relative">
                <User 
                  size={14} 
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'hsl(var(--text-dim))' }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className="w-full pl-9 pr-3 py-2 text-xs"
                  style={{ 
                    backgroundColor: 'transparent',
                    border: '1px solid hsl(var(--border-subtle))',
                    color: 'hsl(var(--text-primary))',
                    outline: 'none',
                  }}
                  placeholder="your_username"
                  data-testid="input-username"
                />
              </div>
            </div>
          )}

          <div>
            <label 
              className="block text-[10px] tracking-wider mb-1"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              EMAIL
            </label>
            <div className="relative">
              <Mail 
                size={14} 
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'hsl(var(--text-dim))' }}
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 text-xs"
                style={{ 
                  backgroundColor: 'transparent',
                  border: '1px solid hsl(var(--border-subtle))',
                  color: 'hsl(var(--text-primary))',
                  outline: 'none',
                }}
                placeholder="you@example.com"
                data-testid="input-email"
              />
            </div>
          </div>

          <div>
            <label 
              className="block text-[10px] tracking-wider mb-1"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              PASSWORD
            </label>
            <div className="relative">
              <Lock 
                size={14} 
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'hsl(var(--text-dim))' }}
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-9 pr-3 py-2 text-xs"
                style={{ 
                  backgroundColor: 'transparent',
                  border: '1px solid hsl(var(--border-subtle))',
                  color: 'hsl(var(--text-primary))',
                  outline: 'none',
                }}
                placeholder="min 6 characters"
                data-testid="input-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 text-xs tracking-wider font-medium transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ 
              backgroundColor: 'hsl(var(--accent))',
              color: 'hsl(var(--surface))',
            }}
            data-testid="button-auth-submit"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {mode === 'login' ? 'SIGNING IN...' : 'CREATING ACCOUNT...'}
              </>
            ) : (
              mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border-subtle))' }} />
          <span className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>OR</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border-subtle))' }} />
        </div>

        <div className="flex justify-center">
          {isGoogleLoading ? (
            <div 
              className="w-full py-2 text-xs tracking-wider font-medium flex items-center justify-center gap-2"
              style={{ 
                backgroundColor: 'hsl(var(--surface-elevated))',
                border: '1px solid hsl(var(--border-subtle))',
                color: 'hsl(var(--text-dim))'
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              SIGNING IN WITH GOOGLE...
            </div>
          ) : (
            <div 
              ref={googleButtonRef} 
              data-testid="button-google-signin"
              className="flex justify-center"
            />
          )}
        </div>

        <div 
          className="mt-4 pt-4 text-center border-t"
          style={{ borderColor: 'hsl(var(--border-subtle))' }}
        >
          <button
            onClick={toggleMode}
            className="text-[10px] transition-colors"
            style={{ color: 'hsl(var(--text-dim))' }}
            data-testid="button-toggle-auth-mode"
          >
            {mode === 'login' 
              ? "Don't have an account? " 
              : 'Already have an account? '}
            <span style={{ color: 'hsl(var(--accent))' }}>
              {mode === 'login' ? 'Register' : 'Login'}
            </span>
          </button>
        </div>
          </>
        )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
