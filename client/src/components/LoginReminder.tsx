import { useState, useEffect } from 'react';
import { X, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface LoginReminderProps {
  onLoginClick: () => void;
}

export function LoginReminder({ onLoginClick }: LoginReminderProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    const hasSeenReminder = sessionStorage.getItem('hasSeenLoginReminder');
    if (hasSeenReminder) return;

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('hasSeenLoginReminder', 'true');
  };

  const handleLogin = () => {
    handleDismiss();
    onLoginClick();
  };

  if (!isVisible || isAuthenticated) return null;

  return (
    <div 
      className="fixed bottom-4 left-4 z-50 max-w-xs animate-in slide-in-from-left-5 fade-in duration-300"
      style={{ 
        backgroundColor: 'hsl(var(--surface))',
        border: '1px solid hsl(var(--border-subtle))',
      }}
      data-testid="login-reminder"
    >
      <div className="flex items-start gap-3 p-3">
        <LogIn 
          size={14} 
          className="mt-0.5 flex-shrink-0"
          style={{ color: 'hsl(var(--accent))' }} 
        />
        <div className="flex-1">
          <p 
            className="text-[10px] leading-relaxed"
            style={{ color: 'hsl(var(--text-secondary))' }}
          >
            Sign in to track your file transfers and access them later.
          </p>
          <button
            onClick={handleLogin}
            className="mt-2 text-[9px] tracking-wider transition-colors"
            style={{ color: 'hsl(var(--accent))' }}
            data-testid="button-login-reminder"
          >
            LOGIN NOW
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 transition-opacity hover:opacity-70"
          style={{ color: 'hsl(var(--text-dim))' }}
          data-testid="button-dismiss-reminder"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
