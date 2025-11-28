import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useTerminal } from '../context/TerminalContext';
import generatedVideo from '@assets/Cinematic_Tech_Startup_Intro_Animation_1764007246565.mp4';

interface RetroLayoutProps {
  children: React.ReactNode;
}

export function RetroLayout({ children }: RetroLayoutProps) {
  const { logs } = useTerminal();
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="min-h-screen p-2 sm:p-4 w-full" style={{ backgroundColor: 'var(--surface)' }}>
      {/* Header */}
      <header className="mb-4">
        <div className="border-2 p-3 sm:p-4 flex items-center justify-between font-bold shadow-md transition-colors duration-300" style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--header-border)' }}>
          <div className="flex items-center flex-1">
            <span className="text-lg sm:text-xl font-retro tracking-widest transition-colors duration-300" style={{ color: 'var(--header-text)' }}>RETROSEND_V1.0</span>
          </div>
          
          {/* Backblaze Logo Center */}
          <div className="hidden md:flex items-center justify-center flex-1">
            <img 
              src="/backblaze_logo.png"
              alt="Backblaze"
              className="h-8 sm:h-10 object-contain max-w-xs"
              data-testid="img-backblaze-logo"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-1 justify-end">
            {/* Hamburger Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex flex-col gap-1 p-2 hover:bg-white/10 transition-colors border-2"
              style={{ borderColor: 'var(--border-highlight)' }}
              aria-label="Toggle menu"
              data-testid="button-hamburger-menu"
            >
              <span
                className={`block w-6 h-0.5 transition-all duration-300 ${
                  isMenuOpen ? 'rotate-45 translate-y-1.5' : ''
                }`}
                style={{ backgroundColor: 'var(--header-text)' }}
              ></span>
              <span
                className={`block w-6 h-0.5 transition-all duration-300 ${
                  isMenuOpen ? 'opacity-0' : ''
                }`}
                style={{ backgroundColor: 'var(--header-text)' }}
              ></span>
              <span
                className={`block w-6 h-0.5 transition-all duration-300 ${
                  isMenuOpen ? '-rotate-45 -translate-y-1.5' : ''
                }`}
                style={{ backgroundColor: 'var(--header-text)' }}
              ></span>
            </button>
          </div>
        </div>
      </header>

      {/* Animated Menu Overlay */}
      <div
        className={`fixed inset-0 backdrop-blur-sm z-50 transition-all duration-300 ${
          isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        style={{ backgroundColor: 'color-mix(in srgb, var(--terminal-bg) 80%, transparent)' }}
        onClick={() => setIsMenuOpen(false)}
        data-testid="menu-overlay"
      >
        <nav
          className={`fixed top-0 right-0 h-full w-64 border-l-4 shadow-2xl transform transition-all duration-300 ${
            isMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{ 
            backgroundColor: 'var(--header-bg)',
            borderColor: 'var(--header-border)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center mb-4">
              <span className="font-retro text-lg transition-colors duration-300" style={{ color: 'var(--header-text)' }}>MENU</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-2xl transition-colors duration-300 hover:opacity-70"
                style={{ color: 'var(--header-text)' }}
                data-testid="button-close-menu"
              >
                ×
              </button>
            </div>
            
            <Link
              href="/"
              className="no-underline hover:underline text-lg font-sans py-2 transition-opacity duration-300 hover:opacity-70"
              style={{ color: 'var(--header-text)' }}
              onClick={() => setIsMenuOpen(false)}
              data-testid="link-home"
            >
              [ HOME ]
            </Link>
            <Link
              href="/upload"
              className="no-underline hover:underline text-lg font-sans py-2 transition-opacity duration-300 hover:opacity-70"
              style={{ color: 'var(--header-text)' }}
              onClick={() => setIsMenuOpen(false)}
              data-testid="link-upload"
            >
              [ UPLOAD ]
            </Link>
            <Link
              href="/download"
              className="no-underline hover:underline text-lg font-sans py-2 transition-opacity duration-300 hover:opacity-70"
              style={{ color: 'var(--header-text)' }}
              onClick={() => setIsMenuOpen(false)}
              data-testid="link-download"
            >
              [ DOWNLOAD ]
            </Link>
            <Link
              href="/guestbook"
              className="no-underline hover:underline text-lg font-sans py-2 transition-opacity duration-300 hover:opacity-70"
              style={{ color: 'var(--header-text)' }}
              onClick={() => setIsMenuOpen(false)}
              data-testid="link-guestbook"
            >
              [ GUESTBOOK ]
            </Link>
          </div>
        </nav>
      </div>

      {/* Marquee Banner */}
      <div className="mb-4">
        <div className="p-2 font-bold font-sans text-center marquee-container border-2 text-xs sm:text-sm transition-colors duration-300" style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--header-border)', color: 'var(--header-text)' }}>
          <div className="marquee-content">
            WELCOME TO RETROSEND *** UPLOAD FILES FAST *** NO LOGS *** 100% FREE *** BEST VIEWED IN NETSCAPE NAVIGATOR 4.0
          </div>
        </div>
      </div>
      
      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(320px,400px)_1fr] gap-4">
        {/* Main Content - appears first on mobile */}
        <main className="border-2 p-4 sm:p-6 min-h-[400px] order-1 md:order-2 transition-colors duration-300" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-shadow)' }}>
          {children}
        </main>

        {/* Sidebar - appears second on mobile, first on desktop */}
        <aside className="space-y-4 order-2 md:order-1">
          {/* Video Feed */}
          <div className="border-2 relative overflow-hidden h-[120px] sm:h-[140px] transition-colors duration-300" style={{ borderColor: 'var(--border-shadow)', backgroundColor: 'var(--terminal-bg)' }}>
            <video 
              src={generatedVideo} 
              autoPlay 
              loop 
              muted 
              playsInline
              className="w-full h-full object-cover opacity-80"
            />
          </div>

          {/* Terminal Section with CRT Effects */}
          <div 
            className="relative h-64 sm:h-80 overflow-hidden"
          >
            {/* CRT Scanlines Effect */}
            <div 
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.08) 0px, rgba(0, 0, 0, 0.08) 1px, transparent 1px, transparent 2px)',
                animation: 'scanline 8s linear infinite',
              }}
            />
            
            {/* CRT Flicker Effect */}
            <div 
              className="absolute inset-0 pointer-events-none z-10 opacity-5"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                animation: 'flicker 0.15s infinite',
              }}
            />
            
            {/* Terminal Content */}
            <div 
              ref={terminalScrollRef}
              className="retro-terminal-scroll relative h-full overflow-y-auto p-3 font-mono text-[10px] sm:text-xs font-light"
            >
              {/* Header Bar */}
              <div className="pb-2 mb-3 text-center sticky top-0 z-20" style={{ color: 'color-mix(in srgb, var(--terminal-text) 70%, transparent)' }}>
                <span className="tracking-widest text-[9px] sm:text-[10px]">
                  ◆ SYSTEM TERMINAL ◆
                </span>
              </div>
              
              {/* Log Lines */}
              <div className="space-y-1 leading-tight">
                {logs.map((log, index) => {
                  const getColorClass = () => {
                    switch (log.type) {
                      case 'error': return 'text-red-500';
                      case 'warning': return 'text-yellow-400';
                      case 'success': return 'text-cyan-400';
                      case 'system': return 'text-blue-400';
                      default: return '';
                    }
                  };

                  const getInlineColor = () => {
                    if (log.type !== 'info' && log.type !== undefined) {
                      return undefined;
                    }
                    return { color: 'var(--terminal-text)' };
                  };
                  
                  const getPrefix = () => {
                    switch (log.type) {
                      case 'error': return '[ERR]';
                      case 'warning': return '[WRN]';
                      case 'success': return '[OK!]';
                      case 'system': return '[SYS]';
                      default: return '[>>>]';
                    }
                  };
                  
                  return (
                    <div 
                      key={log.id} 
                      className={`break-all ${getColorClass()} transition-all duration-300`}
                      style={{
                        ...getInlineColor(),
                        textShadow: `0 0 3px currentColor`,
                        animation: log.isNew ? 'typeIn 0.3s ease-out' : 'none',
                      }}
                    >
                      <span className="text-[8px] opacity-50">{log.timestamp}</span>
                      <span className="mx-1">{getPrefix()}</span>
                      <span className="opacity-80">{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Visitor Counter */}
          <div className="text-center border-2 p-2 font-retro text-xs sm:text-sm transition-colors duration-300" style={{ borderColor: 'var(--border-shadow)', backgroundColor: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
            VISITORS: 003482
          </div>
        </aside>
      </div>
      
      {/* Footer */}
      <footer className="mt-6 text-center text-xs sm:text-sm font-mono transition-colors duration-300" style={{ color: 'var(--text-secondary)' }}>
        <hr className="mb-3" style={{ borderColor: 'var(--border-shadow)' }} />
        <div>
          (c) 1998 RetroSend Inc. All rights reserved.<br />
          Made with Notepad.
        </div>
      </footer>
    </div>
  );
}
