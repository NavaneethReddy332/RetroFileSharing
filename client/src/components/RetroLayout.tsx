import { Link } from 'wouter';
import { useState } from 'react';
import { Zap } from 'lucide-react';

interface RetroLayoutProps {
  children: React.ReactNode;
}

export function RetroLayout({ children }: RetroLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'hsl(var(--surface))' }}>
      {/* Header */}
      <header className="border-b-2 border-accent/30 bg-black/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="no-underline flex items-center gap-2 group">
            <Zap className="w-5 h-5 text-accent transition-transform duration-300 group-hover:scale-110" />
            <span className="font-mono text-sm sm:text-base font-bold tracking-wider text-foreground">
              QUICKSEND
            </span>
          </Link>
          
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex flex-col gap-1.5 p-2 transition-all duration-300 hover:bg-accent/10"
            aria-label="Toggle menu"
            data-testid="button-hamburger-menu"
          >
            <span
              className={`block w-5 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}
            />
            <span
              className={`block w-5 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block w-5 h-0.5 bg-foreground transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}
            />
          </button>
        </div>
      </header>

      {/* Slide-out Menu */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMenuOpen(false)}
        data-testid="menu-overlay"
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <nav
          className={`fixed top-0 right-0 h-full w-64 bg-black border-l border-accent/30 transition-transform duration-300 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <span className="font-mono text-xs text-muted-foreground">// NAVIGATION</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center transition-all duration-300 hover:bg-red-500/20 group"
                data-testid="button-close-menu"
                aria-label="Close menu"
              >
                <span className="absolute block w-4 h-0.5 bg-red-500 rotate-45 transition-transform group-hover:scale-110" />
                <span className="absolute block w-4 h-0.5 bg-red-500 -rotate-45 transition-transform group-hover:scale-110" />
              </button>
            </div>
            
            <div className="space-y-2">
              <Link
                href="/"
                className="block font-mono text-sm py-3 px-4 text-foreground hover:bg-accent/10 hover:text-accent transition-all duration-200 border border-transparent hover:border-accent/30"
                onClick={() => setIsMenuOpen(false)}
                data-testid="link-home"
              >
                SEND FILE
              </Link>
              <Link
                href="/receive"
                className="block font-mono text-sm py-3 px-4 text-foreground hover:bg-accent/10 hover:text-accent transition-all duration-200 border border-transparent hover:border-accent/30"
                onClick={() => setIsMenuOpen(false)}
                data-testid="link-receive"
              >
                RECEIVE FILE
              </Link>
            </div>

            <div className="pt-6 border-t border-accent/20">
              <div className="font-mono text-xs text-muted-foreground space-y-1">
                <div>// P2P FILE TRANSFER</div>
                <div>// NO CLOUD STORAGE</div>
                <div>// DIRECT CONNECTION</div>
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-accent/20 py-4 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <span className="font-mono text-xs text-muted-foreground">
            QuickSend // Peer-to-Peer File Transfer
          </span>
        </div>
      </footer>
    </div>
  );
}
