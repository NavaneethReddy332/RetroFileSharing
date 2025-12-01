import { Link } from 'wouter';
import { useState } from 'react';

interface RetroLayoutProps {
  children: React.ReactNode;
}

export function RetroLayout({ children }: RetroLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen p-2 sm:p-4 w-full" style={{ backgroundColor: 'hsl(var(--surface))' }}>
      <header className="mb-6">
        <div 
          className="border-2 p-3 sm:p-4 flex items-center justify-between font-bold shadow-md" 
          style={{ backgroundColor: 'hsl(var(--header-bg))', borderColor: 'hsl(var(--header-border))' }}
        >
          <Link href="/" className="no-underline">
            <span 
              className="text-lg sm:text-xl font-retro tracking-widest" 
              style={{ color: 'hsl(var(--header-text))' }}
            >
              QUICKSEND
            </span>
          </Link>
          
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex flex-col gap-1 p-2 hover:bg-white/10 transition-colors border-2"
            style={{ borderColor: 'hsl(var(--border-highlight))' }}
            aria-label="Toggle menu"
            data-testid="button-hamburger-menu"
          >
            <span
              className={`block w-6 h-0.5 transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`}
              style={{ backgroundColor: 'hsl(var(--header-text))' }}
            />
            <span
              className={`block w-6 h-0.5 transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}
              style={{ backgroundColor: 'hsl(var(--header-text))' }}
            />
            <span
              className={`block w-6 h-0.5 transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}
              style={{ backgroundColor: 'hsl(var(--header-text))' }}
            />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 backdrop-blur-sm z-50 transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ backgroundColor: 'color-mix(in srgb, hsl(var(--terminal-bg)) 80%, transparent)' }}
        onClick={() => setIsMenuOpen(false)}
        data-testid="menu-overlay"
      >
        <nav
          className={`fixed top-0 right-0 h-full w-64 border-l-4 shadow-2xl transition-transform duration-300 ease-out ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ 
            backgroundColor: 'hsl(var(--header-bg))',
            borderColor: 'hsl(var(--header-border))'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center mb-4">
              <span className="font-retro text-lg" style={{ color: 'hsl(var(--header-text))' }}>MENU</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="relative w-8 h-8 flex items-center justify-center hover:opacity-70 transition-all duration-300 group"
                data-testid="button-close-menu"
                aria-label="Close menu"
              >
                <span 
                  className="absolute block w-6 h-0.5 rotate-45 transition-all duration-300 group-hover:rotate-[60deg] group-hover:scale-110"
                  style={{ backgroundColor: '#ff5555' }}
                />
                <span 
                  className="absolute block w-6 h-0.5 -rotate-45 transition-all duration-300 group-hover:-rotate-[60deg] group-hover:scale-110"
                  style={{ backgroundColor: '#ff5555' }}
                />
                <span 
                  className="absolute w-8 h-8 border-2 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:rotate-12"
                  style={{ borderColor: '#ff5555' }}
                />
              </button>
            </div>
            
            <Link
              href="/"
              className="no-underline hover:underline text-lg font-sans py-2 hover:opacity-70 transition-all duration-200 hover:translate-x-2"
              style={{ color: 'hsl(var(--header-text))' }}
              onClick={() => setIsMenuOpen(false)}
              data-testid="link-home"
            >
              [ SEND ]
            </Link>
            <Link
              href="/receive"
              className="no-underline hover:underline text-lg font-sans py-2 hover:opacity-70 transition-all duration-200 hover:translate-x-2"
              style={{ color: 'hsl(var(--header-text))' }}
              onClick={() => setIsMenuOpen(false)}
              data-testid="link-receive"
            >
              [ RECEIVE ]
            </Link>
          </div>
        </nav>
      </div>

      <main 
        className="border-2 p-4 sm:p-6 min-h-[500px]" 
        style={{ backgroundColor: 'hsl(var(--input-bg))', borderColor: 'hsl(var(--border-shadow))' }}
      >
        {children}
      </main>
      
      <footer className="mt-6 text-center text-xs sm:text-sm font-mono" style={{ color: 'hsl(var(--text-secondary))' }}>
        <hr className="mb-3" style={{ borderColor: 'hsl(var(--border-shadow))' }} />
        <div>
          QuickSend - Fast & Secure P2P File Transfer
        </div>
      </footer>
    </div>
  );
}
