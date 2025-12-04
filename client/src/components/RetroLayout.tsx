import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { Send, Download, Info, X, ChevronLeft } from 'lucide-react';

interface RetroLayoutProps {
  children: React.ReactNode;
}

export function RetroLayout({ children }: RetroLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
  const [location] = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      if (e.key === ']' && e.ctrlKey) {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearCloseTimeout();
    };
  }, [isSidebarOpen, clearCloseTimeout]);

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

        {/* Powered by section */}
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
          <span className="text-[10px] tracking-wider">&</span>
          <a 
            href="https://render.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
            data-testid="link-render"
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M12.568 3h-1.136C6.199 3 2 7.199 2 12.432v1.136c0 1.49 1.01 2.432 2.5 2.432h1.932c1.49 0 2.5-.942 2.5-2.432v-.204c0-1.49 1.01-2.432 2.5-2.432h1.136c1.49 0 2.5.942 2.5 2.432v.204c0 1.49 1.01 2.432 2.5 2.432H19.5c1.49 0 2.5-.942 2.5-2.432v-1.136C22 7.199 17.801 3 12.568 3z" 
                fill="hsl(var(--accent))"
              />
              <rect x="2" y="18" width="4.5" height="4" rx="1.5" fill="hsl(var(--accent))" />
              <rect x="9.75" y="18" width="4.5" height="4" rx="1.5" fill="hsl(var(--accent))" />
              <rect x="17.5" y="18" width="4.5" height="4" rx="1.5" fill="hsl(var(--accent))" />
            </svg>
            <span 
              className="text-[11px] font-medium tracking-wider"
              style={{ color: 'hsl(var(--accent))' }}
            >
              RENDER
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

        <div className="mt-auto pt-4 border-t" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
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
    </div>
  );
}
