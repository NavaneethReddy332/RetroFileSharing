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
