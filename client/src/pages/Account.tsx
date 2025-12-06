import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'wouter';
import { 
  User, 
  Lock, 
  Shield, 
  Monitor, 
  HardDrive, 
  LogOut,
  Save,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft,
  Send
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

interface StorageUsage {
  used: number;
  total: number;
  fileCount: number;
}

interface AccountStats {
  totalTransfers: number;
  totalBytesTransferred: number;
  joinedDate: string;
}

type TabId = 'profile' | 'security' | 'storage';

export default function Account() {
  const { user, isAuthenticated, isLoading: authLoading, logout, checkAuth } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [highlightStyle, setHighlightStyle] = useState<{top: number; height: number; opacity: number}>({ top: 0, height: 0, opacity: 0 });
  const navContainerRef = useRef<HTMLDivElement>(null);

  const handleNavMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;
    const container = navContainerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setHighlightStyle({
      top: targetRect.top - containerRect.top,
      height: targetRect.height,
      opacity: 1,
    });
  }, []);

  const handleNavMouseLeave = useCallback(() => {
    setHighlightStyle(prev => ({ ...prev, opacity: 0 }));
  }, []);

  useEffect(() => {
    if (user) {
      setDisplayName(user.username);
      setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [authLoading, isAuthenticated, navigate]);

  const { data: storageUsage } = useQuery<StorageUsage>({
    queryKey: ['/api/account/storage'],
    enabled: isAuthenticated,
  });

  const { data: accountStats } = useQuery<AccountStats>({
    queryKey: ['/api/account/stats'],
    enabled: isAuthenticated,
  });

  const { data: sessions } = useQuery<Session[]>({
    queryKey: ['/api/account/sessions'],
    enabled: isAuthenticated,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { username: string; email: string }) => {
      const response = await apiRequest('PATCH', '/api/account/profile', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Profile updated successfully' });
      checkAuth();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update profile', description: error.message, variant: 'destructive' });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest('POST', '/api/account/change-password', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to change password', description: error.message, variant: 'destructive' });
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('DELETE', `/api/account/sessions/${sessionId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Session revoked' });
      queryClient.invalidateQueries({ queryKey: ['/api/account/sessions'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to revoke session', description: error.message, variant: 'destructive' });
    },
  });

  const handleSaveProfile = () => {
    if (!displayName.trim() || !email.trim()) {
      toast({ title: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    updateProfileMutation.mutate({ username: displayName, email });
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Please fill in all password fields', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'New passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleBack = () => {
    navigate('/');
  };

  const copyUserId = () => {
    if (user) {
      navigator.clipboard.writeText(String(user.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="text-xs" style={{ color: 'hsl(var(--text-dim))' }}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const storagePercent = storageUsage ? Math.round((storageUsage.used / storageUsage.total) * 100) : 0;

  const sidebarItems: { id: TabId; label: string; icon: typeof User }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'storage', label: 'Storage', icon: HardDrive },
  ];

  return (
    <motion.div 
      className="h-screen flex" 
      style={{ backgroundColor: 'hsl(var(--background))' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Fixed Sidebar */}
      <div 
        className="w-56 flex-shrink-0 flex flex-col h-full"
        style={{ 
          backgroundColor: 'hsl(var(--surface))',
          borderRight: '1px solid hsl(var(--border-subtle))'
        }}
      >
        {/* Sidebar Header */}
        <div className="p-4" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
          <button 
            onClick={handleBack}
            className="flex items-center gap-2 text-xs transition-colors mb-4 hover:opacity-70"
            style={{ color: 'hsl(var(--text-dim))' }}
            data-testid="button-back-home"
          >
            <ArrowLeft size={14} />
            <span className="uppercase tracking-wider">Back</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 flex items-center justify-center flex-shrink-0"
              style={{ 
                backgroundColor: 'hsl(var(--panel))',
                border: '1px solid hsl(var(--border-dim))'
              }}
            >
              <User size={16} style={{ color: 'hsl(var(--accent))' }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>
                {user.username}
              </div>
              <div className="text-[10px] truncate" style={{ color: 'hsl(var(--text-dim))' }}>
                {user.email}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation with cursor-following hover - matching main sidebar */}
        <nav className="flex-1 p-3">
          <div className="text-[9px] uppercase tracking-wider px-2 mb-2" style={{ color: 'hsl(var(--text-dim))' }}>
            Settings
          </div>
          <div 
            ref={navContainerRef}
            className="relative space-y-1"
            onMouseLeave={handleNavMouseLeave}
          >
            {/* Hover highlight - using CSS transition like main sidebar */}
            <div
              className="sidebar-highlight"
              style={{
                top: highlightStyle.top,
                height: highlightStyle.height,
                opacity: highlightStyle.opacity,
              }}
            />
            
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                onMouseEnter={handleNavMouseEnter}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors text-left relative z-10"
                style={{ 
                  color: activeTab === item.id ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))',
                  backgroundColor: activeTab === item.id ? 'hsl(var(--accent) / 0.1)' : 'transparent',
                  border: activeTab === item.id ? '1px solid hsl(var(--accent) / 0.3)' : '1px solid transparent'
                }}
                data-testid={`tab-${item.id}`}
              >
                <item.icon size={14} />
                <span className="uppercase tracking-wider">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors text-left hover:opacity-70"
            style={{ color: 'hsl(0, 65%, 55%)' }}
            data-testid="button-logout-sidebar"
          >
            <LogOut size={14} />
            <span className="uppercase tracking-wider">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl p-6">
          <AnimatePresence mode="wait">
            {/* Profile Tab Content */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <div className="mb-6">
                  <h1 className="text-base font-medium mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
                    Profile Settings
                  </h1>
                  <p className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    Manage your personal information and preferences
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
                      Personal Information
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--text-dim))' }}>
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="minimal-input w-full"
                          data-testid="input-display-name"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--text-dim))' }}>
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="minimal-input w-full"
                          data-testid="input-email"
                        />
                      </div>
                      
                      <button
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isPending}
                        className="minimal-btn minimal-btn-accent flex items-center gap-1.5"
                        data-testid="button-save-profile"
                      >
                        <Save size={12} />
                        {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>

                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-3 flex items-center justify-between gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
                      Account Info
                      <span 
                        className="text-[10px] px-2 py-0.5"
                        style={{ 
                          color: 'hsl(var(--accent))',
                          border: '1px solid hsl(var(--accent) / 0.3)',
                        }}
                      >
                        Free
                      </span>
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>User ID</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono" style={{ color: 'hsl(var(--text-secondary))' }}>
                            #{user.id}
                          </span>
                          <button 
                            onClick={copyUserId}
                            className="p-1 transition-colors hover:opacity-70"
                            style={{ color: 'hsl(var(--text-dim))' }}
                            data-testid="button-copy-user-id"
                          >
                            {copied ? <Check size={12} style={{ color: 'hsl(var(--accent))' }} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>Member Since</span>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                          {accountStats?.joinedDate ? formatDate(accountStats.joinedDate) : 'Recently'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 py-2">
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>Total Transfers</span>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                          {accountStats?.totalTransfers ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-3" style={{ color: 'hsl(var(--text-primary))' }}>
                      Notifications
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                        <div>
                          <div className="text-[11px]" style={{ color: 'hsl(var(--text-primary))' }}>Email Notifications</div>
                          <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>Receive updates about transfers</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emailNotifications}
                            onChange={(e) => setEmailNotifications(e.target.checked)}
                            className="sr-only peer"
                            data-testid="toggle-email-notifications"
                          />
                          <div 
                            className="w-8 h-4 relative"
                            style={{
                              backgroundColor: emailNotifications ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--border-dim))',
                              border: emailNotifications ? '1px solid hsl(var(--accent) / 0.5)' : '1px solid hsl(var(--border-dim))',
                            }}
                          >
                            <span 
                              className="absolute w-3 h-3 top-0.5 transition-all duration-200"
                              style={{
                                backgroundColor: emailNotifications ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
                                left: emailNotifications ? '17px' : '2px',
                                boxShadow: emailNotifications ? '0 0 8px hsl(var(--accent))' : 'none',
                              }}
                            />
                          </div>
                        </label>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 py-2">
                        <div>
                          <div className="text-[11px]" style={{ color: 'hsl(var(--text-primary))' }}>Security Alerts</div>
                          <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>Get notified of suspicious activity</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={securityAlerts}
                            onChange={(e) => setSecurityAlerts(e.target.checked)}
                            className="sr-only peer"
                            data-testid="toggle-security-alerts"
                          />
                          <div 
                            className="w-8 h-4 relative"
                            style={{
                              backgroundColor: securityAlerts ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--border-dim))',
                              border: securityAlerts ? '1px solid hsl(var(--accent) / 0.5)' : '1px solid hsl(var(--border-dim))',
                            }}
                          >
                            <span 
                              className="absolute w-3 h-3 top-0.5 transition-all duration-200"
                              style={{
                                backgroundColor: securityAlerts ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
                                left: securityAlerts ? '17px' : '2px',
                                boxShadow: securityAlerts ? '0 0 8px hsl(var(--accent))' : 'none',
                              }}
                            />
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Security Tab Content */}
            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <div className="mb-6">
                  <h1 className="text-base font-medium mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
                    Security Settings
                  </h1>
                  <p className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    Protect your account with password and session management
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
                      Change Password
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--text-dim))' }}>
                          Current Password
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="minimal-input w-full pr-8"
                            data-testid="input-current-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            style={{ color: 'hsl(var(--text-dim))' }}
                          >
                            {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--text-dim))' }}>
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="minimal-input w-full pr-8"
                            data-testid="input-new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            style={{ color: 'hsl(var(--text-dim))' }}
                          >
                            {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--text-dim))' }}>
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="minimal-input w-full"
                          data-testid="input-confirm-password"
                        />
                      </div>
                      
                      <button
                        onClick={handleChangePassword}
                        disabled={changePasswordMutation.isPending}
                        className="minimal-btn minimal-btn-accent flex items-center gap-1.5"
                        data-testid="button-change-password"
                      >
                        <Lock size={12} />
                        {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                      </button>
                    </div>
                  </div>

                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-3 flex items-center justify-between gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
                      Active Sessions
                      <span 
                        className="text-[10px] px-2 py-0.5"
                        style={{ 
                          color: 'hsl(var(--accent))',
                          border: '1px solid hsl(var(--accent) / 0.3)',
                        }}
                      >
                        {sessions?.length ?? 1} Active
                      </span>
                    </h3>
                    
                    <div className="space-y-0">
                      <div className="flex items-center justify-between gap-2 py-3" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 flex items-center justify-center"
                            style={{ 
                              backgroundColor: 'hsl(var(--surface))',
                              border: '1px solid hsl(var(--border-dim))'
                            }}
                          >
                            <Monitor size={14} style={{ color: 'hsl(var(--text-dim))' }} />
                          </div>
                          <div>
                            <div className="text-[11px] flex items-center gap-2 flex-wrap" style={{ color: 'hsl(var(--text-primary))' }}>
                              Current Browser
                              <span 
                                className="text-[9px] px-1.5 py-0.5"
                                style={{ 
                                  color: 'hsl(var(--accent))',
                                  backgroundColor: 'hsl(var(--accent) / 0.1)',
                                }}
                              >
                                This Device
                              </span>
                            </div>
                            <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                              Active now
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {sessions && sessions.filter(s => !s.isCurrent).map((session) => (
                        <div 
                          key={session.id}
                          className="flex items-center justify-between gap-2 py-3" 
                          style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-8 h-8 flex items-center justify-center"
                              style={{ 
                                backgroundColor: 'hsl(var(--surface))',
                                border: '1px solid hsl(var(--border-dim))'
                              }}
                            >
                              <Monitor size={14} style={{ color: 'hsl(var(--text-dim))' }} />
                            </div>
                            <div>
                              <div className="text-[11px]" style={{ color: 'hsl(var(--text-primary))' }}>
                                {session.browser} - {session.device}
                              </div>
                              <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                                {session.location} - {session.lastActive}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => revokeSessionMutation.mutate(session.id)}
                            className="text-[10px] px-2 py-1 transition-colors hover:opacity-70"
                            style={{ 
                              color: 'hsl(0, 65%, 55%)',
                              border: '1px solid hsl(0, 65%, 55% / 0.3)'
                            }}
                            data-testid={`button-revoke-session-${session.id}`}
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: 'hsl(0, 65%, 55%)' }}>
                      <AlertTriangle size={14} />
                      Danger Zone
                    </h3>
                    <p className="text-[11px] mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      className="minimal-btn flex items-center gap-1.5"
                      style={{ 
                        color: 'hsl(0, 65%, 55%)',
                        borderColor: 'hsl(0, 65%, 55% / 0.5)'
                      }}
                      data-testid="button-delete-account"
                    >
                      <Trash2 size={12} />
                      Delete Account
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Storage Tab Content */}
            {activeTab === 'storage' && (
              <motion.div
                key="storage"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <div className="mb-6">
                  <h1 className="text-base font-medium mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
                    Storage & Usage
                  </h1>
                  <p className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    Monitor your cloud storage and transfer statistics
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-4 flex items-center justify-between gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
                      Cloud Storage
                      <span 
                        className="text-[10px] px-2 py-0.5"
                        style={{ 
                          color: storagePercent > 80 ? 'hsl(0, 65%, 55%)' : 'hsl(var(--accent))',
                          border: `1px solid ${storagePercent > 80 ? 'hsl(0, 65%, 55% / 0.3)' : 'hsl(var(--accent) / 0.3)'}`,
                        }}
                      >
                        {storagePercent}% Used
                      </span>
                    </h3>
                    
                    <div className="mb-4">
                      <div 
                        className="h-2 w-full mb-2 overflow-hidden"
                        style={{ backgroundColor: 'hsl(var(--border-dim))' }}
                      >
                        <motion.div 
                          className="h-full"
                          style={{ 
                            backgroundColor: storagePercent > 80 ? 'hsl(0, 65%, 55%)' : 'hsl(var(--accent))',
                            boxShadow: `0 0 10px ${storagePercent > 80 ? 'hsl(0, 65%, 55%)' : 'hsl(var(--accent))'}`
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${storagePercent}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                        <span>{formatBytes(storageUsage?.used ?? 0)} used</span>
                        <span>{formatBytes(storageUsage?.total ?? 1073741824)} total</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>Files Stored</span>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                          {storageUsage?.fileCount ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 py-2">
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>Available</span>
                        <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                          {formatBytes((storageUsage?.total ?? 1073741824) - (storageUsage?.used ?? 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
                      Transfer Statistics
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div 
                        className="p-3 text-center"
                        style={{ 
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border-dim))'
                        }}
                      >
                        <div className="text-lg font-medium" style={{ color: 'hsl(var(--accent))' }}>
                          {accountStats?.totalTransfers ?? 0}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                          Total Transfers
                        </div>
                      </div>
                      <div 
                        className="p-3 text-center"
                        style={{ 
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border-dim))'
                        }}
                      >
                        <div className="text-lg font-medium" style={{ color: 'hsl(var(--accent))' }}>
                          {formatBytes(accountStats?.totalBytesTransferred ?? 0)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                          Data Transferred
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
                    <h3 className="text-xs font-medium mb-3" style={{ color: 'hsl(var(--text-primary))' }}>
                      Storage Upgrade
                    </h3>
                    <p className="text-[11px] mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
                      Need more space? Upgrade your plan to get additional storage and features.
                    </p>
                    <button
                      className="minimal-btn minimal-btn-accent flex items-center gap-1.5"
                      data-testid="button-upgrade-storage"
                    >
                      <Send size={12} />
                      View Plans
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
