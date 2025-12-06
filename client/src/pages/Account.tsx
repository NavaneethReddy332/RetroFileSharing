import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, Link } from 'wouter';
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
  const [hoveredTab, setHoveredTab] = useState<TabId | null>(null);
  const [hoverStyle, setHoverStyle] = useState({ top: 0, height: 0, opacity: 0 });
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

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

  useEffect(() => {
    if (hoveredTab && tabRefs.current[hoveredTab] && navRef.current) {
      const tab = tabRefs.current[hoveredTab];
      const nav = navRef.current;
      if (tab) {
        const navRect = nav.getBoundingClientRect();
        const tabRect = tab.getBoundingClientRect();
        setHoverStyle({
          top: tabRect.top - navRect.top,
          height: tabRect.height,
          opacity: 1
        });
      }
    } else {
      setHoverStyle(prev => ({ ...prev, opacity: 0 }));
    }
  }, [hoveredTab]);

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

  const contentVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <motion.div 
      className="h-screen flex" 
      style={{ backgroundColor: 'hsl(var(--background))' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
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
          <motion.button 
            onClick={handleBack}
            className="flex items-center gap-2 text-xs no-underline transition-colors mb-4"
            style={{ color: 'hsl(var(--text-dim))' }}
            data-testid="button-back-home"
            whileHover={{ x: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={14} />
            <span className="uppercase tracking-wider">Back</span>
          </motion.button>
          
          <div className="flex items-center gap-3">
            <motion.div 
              className="w-10 h-10 flex items-center justify-center flex-shrink-0"
              style={{ 
                backgroundColor: 'hsl(var(--panel))',
                border: '1px solid hsl(var(--border-dim))'
              }}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <User size={16} style={{ color: 'hsl(var(--accent))' }} />
            </motion.div>
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

        {/* Navigation with cursor-following hover */}
        <nav className="flex-1 p-3" ref={navRef}>
          <div className="text-[9px] uppercase tracking-wider px-2 mb-2" style={{ color: 'hsl(var(--text-dim))' }}>
            Settings
          </div>
          <div className="space-y-1 relative">
            {/* Hover indicator */}
            <motion.div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                backgroundColor: 'hsl(var(--accent) / 0.08)',
                border: '1px solid hsl(var(--accent) / 0.2)',
              }}
              animate={{
                top: hoverStyle.top,
                height: hoverStyle.height,
                opacity: hoverStyle.opacity
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
            
            {sidebarItems.map((item, index) => (
              <motion.button
                key={item.id}
                ref={(el) => { tabRefs.current[item.id] = el; }}
                onClick={() => setActiveTab(item.id)}
                onMouseEnter={() => setHoveredTab(item.id)}
                onMouseLeave={() => setHoveredTab(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors text-left relative z-10"
                style={{ 
                  color: activeTab === item.id ? 'hsl(var(--accent))' : 'hsl(var(--text-secondary))',
                  backgroundColor: activeTab === item.id ? 'hsl(var(--accent) / 0.1)' : 'transparent',
                  border: activeTab === item.id ? '1px solid hsl(var(--accent) / 0.3)' : '1px solid transparent'
                }}
                data-testid={`tab-${item.id}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <item.icon size={14} />
                <span className="uppercase tracking-wider">{item.label}</span>
              </motion.button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
          <motion.button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors text-left"
            style={{ color: 'hsl(0, 65%, 55%)' }}
            data-testid="button-logout-sidebar"
            whileHover={{ x: 3 }}
            whileTap={{ scale: 0.98 }}
          >
            <LogOut size={14} />
            <span className="uppercase tracking-wider">Sign Out</span>
          </motion.button>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-base font-medium mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
                  {activeTab === 'profile' && 'Profile Settings'}
                  {activeTab === 'security' && 'Security Settings'}
                  {activeTab === 'storage' && 'Storage & Usage'}
                </h1>
                <p className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  {activeTab === 'profile' && 'Manage your personal information and preferences'}
                  {activeTab === 'security' && 'Protect your account with password and session management'}
                  {activeTab === 'storage' && 'Monitor your cloud storage and transfer statistics'}
                </p>
              </div>

              {/* Profile Tab Content */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
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
                      
                      <motion.button
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isPending}
                        className="minimal-btn minimal-btn-accent flex items-center gap-1.5"
                        data-testid="button-save-profile"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Save size={12} />
                        {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                      </motion.button>
                    </div>
                  </motion.div>

                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
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
                          <motion.button 
                            onClick={copyUserId}
                            className="p-1 transition-colors"
                            style={{ color: 'hsl(var(--text-dim))' }}
                            data-testid="button-copy-user-id"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            {copied ? <Check size={12} style={{ color: 'hsl(var(--accent))' }} /> : <Copy size={12} />}
                          </motion.button>
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
                  </motion.div>

                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
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
                          <motion.div 
                            className="w-8 h-4 relative"
                            style={{
                              backgroundColor: emailNotifications ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--border-dim))',
                              border: emailNotifications ? '1px solid hsl(var(--accent) / 0.5)' : '1px solid hsl(var(--border-dim))',
                            }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <motion.span 
                              className="absolute w-3 h-3 top-0.5"
                              style={{
                                backgroundColor: emailNotifications ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
                                boxShadow: emailNotifications ? '0 0 8px hsl(var(--accent))' : 'none',
                              }}
                              animate={{ left: emailNotifications ? 17 : 2 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          </motion.div>
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
                          <motion.div 
                            className="w-8 h-4 relative"
                            style={{
                              backgroundColor: securityAlerts ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--border-dim))',
                              border: securityAlerts ? '1px solid hsl(var(--accent) / 0.5)' : '1px solid hsl(var(--border-dim))',
                            }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <motion.span 
                              className="absolute w-3 h-3 top-0.5"
                              style={{
                                backgroundColor: securityAlerts ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
                                boxShadow: securityAlerts ? '0 0 8px hsl(var(--accent))' : 'none',
                              }}
                              animate={{ left: securityAlerts ? 17 : 2 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          </motion.div>
                        </label>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Security Tab Content */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
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
                      
                      <motion.button
                        onClick={handleChangePassword}
                        disabled={changePasswordMutation.isPending}
                        className="minimal-btn minimal-btn-accent flex items-center gap-1.5"
                        data-testid="button-change-password"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Lock size={12} />
                        {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                      </motion.button>
                    </div>
                  </motion.div>

                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
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
                          <motion.button
                            onClick={() => revokeSessionMutation.mutate(session.id)}
                            className="text-[10px] px-2 py-1 transition-colors"
                            style={{ 
                              color: 'hsl(0, 65%, 55%)',
                              border: '1px solid hsl(0, 65%, 55% / 0.3)'
                            }}
                            data-testid={`button-revoke-session-${session.id}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Revoke
                          </motion.button>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h3 className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: 'hsl(0, 65%, 55%)' }}>
                      <AlertTriangle size={14} />
                      Danger Zone
                    </h3>
                    <p className="text-[11px] mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <motion.button
                      className="minimal-btn flex items-center gap-1.5"
                      style={{ 
                        color: 'hsl(0, 65%, 55%)',
                        borderColor: 'hsl(0, 65%, 55% / 0.5)'
                      }}
                      data-testid="button-delete-account"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Trash2 size={12} />
                      Delete Account
                    </motion.button>
                  </motion.div>
                </div>
              )}

              {/* Storage Tab Content */}
              {activeTab === 'storage' && (
                <div className="space-y-4">
                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
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
                  </motion.div>

                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <h3 className="text-xs font-medium mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
                      Transfer Statistics
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <motion.div 
                        className="p-3 text-center"
                        style={{ 
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border-dim))'
                        }}
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="text-lg font-medium" style={{ color: 'hsl(var(--accent))' }}>
                          {accountStats?.totalTransfers ?? 0}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                          Total Transfers
                        </div>
                      </motion.div>
                      <motion.div 
                        className="p-3 text-center"
                        style={{ 
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border-dim))'
                        }}
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="text-lg font-medium" style={{ color: 'hsl(var(--accent))' }}>
                          {formatBytes(accountStats?.totalBytesTransferred ?? 0)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(var(--text-dim))' }}>
                          Data Transferred
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>

                  <motion.div 
                    className="minimal-border p-4" 
                    style={{ backgroundColor: 'hsl(var(--panel))' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h3 className="text-xs font-medium mb-3" style={{ color: 'hsl(var(--text-primary))' }}>
                      Storage Upgrade
                    </h3>
                    <p className="text-[11px] mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
                      Need more space? Upgrade your plan to get additional storage and features.
                    </p>
                    <motion.button
                      className="minimal-btn minimal-btn-accent flex items-center gap-1.5"
                      data-testid="button-upgrade-storage"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Send size={12} />
                      View Plans
                    </motion.button>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
