import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { Send, Download, Info, X, ChevronLeft, User, Users, Zap, Code, LogIn, LogOut, FolderOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { LoginReminder } from './LoginReminder';

interface RetroLayoutProps {
  children: React.ReactNode;
}

export function RetroLayout({ children }: RetroLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [location] = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTrigger && !isHoveringSidebar) {
        setIsSidebarOpen(false);
      }
    }, 300);
  }, [isHoveringTrigger, isHoveringSidebar, clearCloseTimeout]);

  useEffect(() => {
    if (isHoveringTrigger || isHoveringSidebar) {
      clearCloseTimeout();
      setIsSidebarOpen(true);
    } else {
      scheduleClose();
    }
  }, [isHoveringTrigger, isHoveringSidebar, scheduleClose, clearCloseTimeout]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
      if (e.key === 'Escape' && isUserMenuOpen) {
        setIsUserMenuOpen(false);
      }
      if (e.key === ']' && e.ctrlKey) {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      clearCloseTimeout();
    };
  }, [isSidebarOpen, isUserMenuOpen, clearCloseTimeout]);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
  };

  return (
    <div className="h-screen w-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--surface))' }}>
      {/* Main content */}
      <div className="h-full flex flex-col">
        {/* Minimal header */}
        <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
          <Link href="/" className="no-underline">
            <span 
              className="text-sm tracking-[0.3em] font-medium glow-text"
              style={{ color: 'hsl(var(--accent))' }}
            >
              RETRO SEND
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className={`text-xs no-underline transition-colors ${location === '/' || location === '/send' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-dim))] hover:text-[hsl(var(--text-secondary))]'}`}
              data-testid="link-send"
            >
              SEND
            </Link>
            <span style={{ color: 'hsl(var(--border-dim))' }}>/</span>
            <Link 
              href="/receive" 
              className={`text-xs no-underline transition-colors ${location === '/receive' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-dim))] hover:text-[hsl(var(--text-secondary))]'}`}
              data-testid="link-receive"
            >
              RECEIVE
            </Link>
            
            {!isLoading && (
              <>
                {isAuthenticated && user ? (
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="flex items-center gap-2 px-2 py-1 text-xs transition-colors"
                      style={{ 
                        color: 'hsl(var(--accent))',
                        border: '1px solid hsl(var(--border-subtle))',
                      }}
                      data-testid="button-user-menu"
                    >
                      <User size={12} />
                      <span className="uppercase tracking-wider">{user.username}</span>
                    </button>
                    
                    {isUserMenuOpen && (
                      <div 
                        className="absolute right-0 top-full mt-1 min-w-[140px] py-1 z-50"
                        style={{ 
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border-subtle))',
                        }}
                      >
                        <Link
                          href="/your-files"
                          className="flex items-center gap-2 px-3 py-2 text-[10px] tracking-wider no-underline transition-colors"
                          style={{ color: 'hsl(var(--text-secondary))' }}
                          onClick={() => setIsUserMenuOpen(false)}
                          data-testid="link-your-files"
                        >
                          <FolderOpen size={12} />
                          YOUR FILES
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[10px] tracking-wider transition-colors text-left"
                          style={{ color: 'hsl(var(--text-dim))' }}
                          data-testid="button-logout"
                        >
                          <LogOut size={12} />
                          LOGOUT
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider transition-colors"
                    style={{ 
                      color: 'hsl(var(--text-dim))',
                      border: '1px solid hsl(var(--border-subtle))',
                    }}
                    data-testid="button-login"
                  >
                    <LogIn size={12} />
                    LOGIN
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="ml-2 p-1 transition-colors"
              style={{ color: 'hsl(var(--text-dim))' }}
              title="Toggle sidebar (Ctrl+])"
              data-testid="button-toggle-sidebar"
              aria-label="Toggle sidebar"
            >
              <ChevronLeft size={14} className={`transform transition-transform ${isSidebarOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-auto p-5">
          {children}
        </main>

        {/* Powered by Replit section */}
        <div 
          className="px-5 py-3 flex items-center justify-center gap-2"
          style={{ color: 'hsl(var(--text-dim))' }}
        >
          <span className="text-[10px] tracking-wider">POWERED BY</span>
          <a 
            href="https://replit.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
            data-testid="link-replit"
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 32 32" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M7 5.5C7 4.67157 7.67157 4 8.5 4H15.5C16.3284 4 17 4.67157 17 5.5V12H8.5C7.67157 12 7 11.3284 7 10.5V5.5Z" 
                fill="hsl(var(--accent))"
              />
              <path 
                d="M17 12H25.5C26.3284 12 27 12.6716 27 13.5V18.5C27 19.3284 26.3284 20 25.5 20H17V12Z" 
                fill="hsl(var(--accent))"
              />
              <path 
                d="M7 21.5C7 20.6716 7.67157 20 8.5 20H17V28H8.5C7.67157 28 7 27.3284 7 26.5V21.5Z" 
                fill="hsl(var(--accent))"
              />
            </svg>
            <span 
              className="text-[11px] font-medium tracking-wider"
              style={{ color: 'hsl(var(--accent))' }}
            >
              REPLIT
            </span>
          </a>
        </div>

        {/* Minimal footer */}
        <footer 
          className="px-5 py-2 text-center border-t" 
          style={{ 
            borderColor: 'hsl(var(--border-subtle))',
            color: 'hsl(var(--text-dim))'
          }}
        >
          <span className="text-[10px] tracking-wider">P2P FILE TRANSFER</span>
        </footer>
      </div>

      {/* Sidebar trigger area - invisible but larger hit zone */}
      <div 
        className="sidebar-trigger"
        onMouseEnter={() => setIsHoveringTrigger(true)}
        onMouseLeave={() => setIsHoveringTrigger(false)}
        aria-hidden="true"
      />

      {/* Auto-hide sidebar */}
      <div 
        ref={sidebarRef}
        className={`sidebar-panel ${isSidebarOpen ? 'open' : ''}`}
        onMouseEnter={() => setIsHoveringSidebar(true)}
        onMouseLeave={() => setIsHoveringSidebar(false)}
        role="complementary"
        aria-label="Quick actions sidebar"
      >
        <div className="flex items-center justify-between mb-4">
          <span 
            className="text-[10px] tracking-[0.2em]" 
            style={{ color: 'hsl(var(--text-dim))' }}
          >
            QUICK ACTIONS
          </span>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 transition-colors hover:opacity-70"
            style={{ color: 'hsl(var(--text-dim))' }}
            data-testid="button-close-sidebar"
            aria-label="Close sidebar"
          >
            <X size={12} />
          </button>
        </div>

        <Link
          href="/"
          className="flex items-center gap-3 p-3 minimal-border transition-all hover:border-[hsl(var(--accent)/0.4)] no-underline"
          onClick={() => setIsSidebarOpen(false)}
          data-testid="sidebar-link-send"
        >
          <Send size={14} style={{ color: 'hsl(var(--accent))' }} />
          <div>
            <div className="text-xs" style={{ color: 'hsl(var(--text-primary))' }}>Send File</div>
            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>Share instantly</div>
          </div>
        </Link>

        <Link
          href="/receive"
          className="flex items-center gap-3 p-3 minimal-border transition-all hover:border-[hsl(var(--accent)/0.4)] no-underline"
          onClick={() => setIsSidebarOpen(false)}
          data-testid="sidebar-link-receive"
        >
          <Download size={14} style={{ color: 'hsl(var(--accent))' }} />
          <div>
            <div className="text-xs" style={{ color: 'hsl(var(--text-primary))' }}>Receive File</div>
            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>Enter code to download</div>
          </div>
        </Link>

        {/* About Section */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
          <div className="text-[10px] tracking-[0.2em] mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
            ABOUT
          </div>
          
          {/* Developer */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <User size={10} style={{ color: 'hsl(var(--accent))' }} />
              <span className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>DEVELOPER</span>
            </div>
            <div className="text-xs font-medium pl-4" style={{ color: 'hsl(var(--accent))' }}>
              RONINN
            </div>
          </div>

          {/* Team */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users size={10} style={{ color: 'hsl(var(--accent))' }} />
              <span className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>TEAM</span>
            </div>
            <div className="text-[10px] pl-4 space-y-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>
              <div>RONINN</div>
              <div style={{ color: 'hsl(var(--accent))' }}>REPLIT</div>
            </div>
          </div>

          {/* App Info */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Code size={10} style={{ color: 'hsl(var(--accent))' }} />
              <span className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>APP INFO</span>
            </div>
            <div className="text-[9px] pl-4 leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              RETRO SEND is a peer-to-peer file transfer application with a retro terminal aesthetic. Transfer files directly between devices without storing data on servers.
            </div>
          </div>

          {/* Powered By */}
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={10} style={{ color: 'hsl(var(--accent))' }} />
              <span className="text-[9px] tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>POWERED BY</span>
            </div>
            <a 
              href="https://replit.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 pl-4 transition-opacity hover:opacity-80 no-underline"
              data-testid="sidebar-link-replit"
            >
              <svg 
                width="14" 
                height="14" 
                viewBox="0 0 32 32" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path 
                  d="M7 5.5C7 4.67157 7.67157 4 8.5 4H15.5C16.3284 4 17 4.67157 17 5.5V12H8.5C7.67157 12 7 11.3284 7 10.5V5.5Z" 
                  fill="hsl(var(--accent))"
                />
                <path 
                  d="M17 12H25.5C26.3284 12 27 12.6716 27 13.5V18.5C27 19.3284 26.3284 20 25.5 20H17V12Z" 
                  fill="hsl(var(--accent))"
                />
                <path 
                  d="M7 21.5C7 20.6716 7.67157 20 8.5 20H17V28H8.5C7.67157 28 7 27.3284 7 26.5V21.5Z" 
                  fill="hsl(var(--accent))"
                />
              </svg>
              <span className="text-[10px] font-medium" style={{ color: 'hsl(var(--accent))' }}>
                REPLIT
              </span>
            </a>
            <div className="text-[8px] pl-4 mt-1 leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              Built and deployed with Replit - the collaborative browser-based IDE for building software.
            </div>
          </div>
        </div>

        <div className="mt-auto pt-3 border-t" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
          <div className="flex items-start gap-2 p-2" style={{ backgroundColor: 'hsl(var(--surface))' }}>
            <Info size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'hsl(var(--text-dim))' }} />
            <p className="text-[9px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              Files are transferred directly between devices. No data is stored on servers.
            </p>
          </div>
          <div className="mt-2 text-center">
            <span className="text-[8px]" style={{ color: 'hsl(var(--text-dim) / 0.5)' }}>
              Ctrl+] to toggle
            </span>
          </div>
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <LoginReminder onLoginClick={() => setIsAuthModalOpen(true)} />
    </div>
  );
}
