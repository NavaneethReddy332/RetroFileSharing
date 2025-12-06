import { RetroLayout } from '@/components/RetroLayout';
import { Sparkles, Zap, Shield, Globe, Rocket, Code, Users } from 'lucide-react';

export default function About() {
  return (
    <RetroLayout>
      <div className="max-w-4xl mx-auto">
        <div className="relative overflow-hidden mb-8 p-8" style={{ border: '1px solid hsl(var(--border-subtle))' }}>
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              background: 'radial-gradient(circle at 20% 50%, hsl(var(--accent)) 0%, transparent 50%), radial-gradient(circle at 80% 50%, hsl(180, 70%, 55%) 0%, transparent 50%)',
            }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="animate-pulse" size={24} style={{ color: 'hsl(var(--accent))' }} />
              <h1 
                className="text-xl tracking-[0.2em] font-medium"
                style={{ color: 'hsl(var(--accent))' }}
              >
                ABOUT AEROSEND
              </h1>
            </div>
            <p 
              className="text-sm leading-relaxed max-w-2xl"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              Born from the belief that sharing files should be as simple as breathing, 
              AeroSend cuts through the noise of modern file sharing with pure, 
              unadulterated peer-to-peer magic.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div 
            className="group p-6 transition-all duration-300"
            style={{ 
              border: '1px solid hsl(var(--border-subtle))',
              background: 'linear-gradient(135deg, transparent 0%, hsl(var(--accent) / 0.03) 100%)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="p-2"
                style={{ backgroundColor: 'hsl(var(--accent) / 0.1)' }}
              >
                <Zap size={18} style={{ color: 'hsl(var(--accent))' }} />
              </div>
              <h3 className="text-xs tracking-[0.15em]" style={{ color: 'hsl(var(--text-primary))' }}>
                LIGHTNING FAST
              </h3>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              Direct peer-to-peer transfers mean your files travel at the speed of your connection, 
              not limited by server bandwidth. No middleman, no delays.
            </p>
          </div>

          <div 
            className="group p-6 transition-all duration-300"
            style={{ 
              border: '1px solid hsl(var(--border-subtle))',
              background: 'linear-gradient(135deg, transparent 0%, hsl(var(--accent) / 0.03) 100%)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="p-2"
                style={{ backgroundColor: 'hsl(var(--accent) / 0.1)' }}
              >
                <Shield size={18} style={{ color: 'hsl(var(--accent))' }} />
              </div>
              <h3 className="text-xs tracking-[0.15em]" style={{ color: 'hsl(var(--text-primary))' }}>
                PRIVACY FIRST
              </h3>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              Your files never touch our servers. They flow directly from sender to receiver, 
              encrypted and ephemeral. We can't see what you share, because we literally can't.
            </p>
          </div>

          <div 
            className="group p-6 transition-all duration-300"
            style={{ 
              border: '1px solid hsl(var(--border-subtle))',
              background: 'linear-gradient(135deg, transparent 0%, hsl(var(--accent) / 0.03) 100%)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="p-2"
                style={{ backgroundColor: 'hsl(var(--accent) / 0.1)' }}
              >
                <Globe size={18} style={{ color: 'hsl(var(--accent))' }} />
              </div>
              <h3 className="text-xs tracking-[0.15em]" style={{ color: 'hsl(var(--text-primary))' }}>
                WORKS EVERYWHERE
              </h3>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              No apps to install, no accounts required. Just open your browser, 
              share a code, and let the magic happen. Any device, any platform.
            </p>
          </div>

          <div 
            className="group p-6 transition-all duration-300"
            style={{ 
              border: '1px solid hsl(var(--border-subtle))',
              background: 'linear-gradient(135deg, transparent 0%, hsl(var(--accent) / 0.03) 100%)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="p-2"
                style={{ backgroundColor: 'hsl(var(--accent) / 0.1)' }}
              >
                <Rocket size={18} style={{ color: 'hsl(var(--accent))' }} />
              </div>
              <h3 className="text-xs tracking-[0.15em]" style={{ color: 'hsl(var(--text-primary))' }}>
                ZERO LIMITS
              </h3>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
              No file size caps for P2P transfers. Send that 50GB project folder. 
              Share that entire photo library. We won't stop you.
            </p>
          </div>
        </div>

        <div 
          className="p-6 mb-8"
          style={{ 
            border: '1px solid hsl(var(--border-subtle))',
            background: 'hsl(var(--surface))',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Code size={18} style={{ color: 'hsl(var(--accent))' }} />
            <h2 className="text-sm tracking-[0.15em]" style={{ color: 'hsl(var(--text-primary))' }}>
              THE TECH BEHIND THE MAGIC
            </h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div 
                className="w-1 h-1 mt-2 flex-shrink-0"
                style={{ backgroundColor: 'hsl(var(--accent))' }}
              />
              <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
                <span style={{ color: 'hsl(var(--accent))' }}>WebRTC</span> enables direct browser-to-browser connections, 
                bypassing traditional server infrastructure entirely.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div 
                className="w-1 h-1 mt-2 flex-shrink-0"
                style={{ backgroundColor: 'hsl(var(--accent))' }}
              />
              <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
                <span style={{ color: 'hsl(var(--accent))' }}>Chunked transfers</span> with intelligent buffering 
                ensure smooth delivery even for massive files.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div 
                className="w-1 h-1 mt-2 flex-shrink-0"
                style={{ backgroundColor: 'hsl(var(--accent))' }}
              />
              <p className="text-[11px] leading-relaxed" style={{ color: 'hsl(var(--text-dim))' }}>
                <span style={{ color: 'hsl(var(--accent))' }}>End-to-end encryption</span> means your data 
                stays your data, from the moment it leaves your device.
              </p>
            </div>
          </div>
        </div>

        <div 
          className="p-6 mb-8"
          style={{ 
            border: '1px solid hsl(var(--accent) / 0.3)',
            background: 'linear-gradient(135deg, hsl(var(--accent) / 0.05) 0%, transparent 100%)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Users size={18} style={{ color: 'hsl(var(--accent))' }} />
            <h2 className="text-sm tracking-[0.15em]" style={{ color: 'hsl(var(--text-primary))' }}>
              THE CREW
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-4">
              <div 
                className="w-12 h-12 flex items-center justify-center text-lg font-bold"
                style={{ 
                  backgroundColor: 'hsl(var(--accent) / 0.2)',
                  color: 'hsl(var(--accent))',
                }}
              >
                R
              </div>
              <div>
                <div className="text-xs tracking-wider" style={{ color: 'hsl(var(--text-primary))' }}>
                  RONINN
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  Creator & Developer
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div 
                className="w-12 h-12 flex items-center justify-center"
                style={{ backgroundColor: 'hsl(var(--accent) / 0.2)' }}
              >
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M7 5.5C7 4.67157 7.67157 4 8.5 4H15.5C16.3284 4 17 4.67157 17 5.5V12H8.5C7.67157 12 7 11.3284 7 10.5V5.5Z" fill="hsl(var(--accent))"/>
                  <path d="M17 12H25.5C26.3284 12 27 12.6716 27 13.5V18.5C27 19.3284 26.3284 20 25.5 20H17V12Z" fill="hsl(var(--accent))"/>
                  <path d="M7 21.5C7 20.6716 7.67157 20 8.5 20H17V28H8.5C7.67157 28 7 27.3284 7 26.5V21.5Z" fill="hsl(var(--accent))"/>
                </svg>
              </div>
              <div>
                <div className="text-xs tracking-wider" style={{ color: 'hsl(var(--text-primary))' }}>
                  REPLIT
                </div>
                <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  Platform & Infrastructure
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RetroLayout>
  );
}
