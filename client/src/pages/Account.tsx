import { useState, useEffect } from 'react';
import { RetroLayout } from '../components/RetroLayout';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'wouter';
import { 
  User, 
  Mail, 
  Lock, 
  Shield, 
  Monitor, 
  Smartphone, 
  HardDrive, 
  Bell, 
  LogOut,
  Save,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'storage'>('profile');

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
      <RetroLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-xs" style={{ color: 'hsl(var(--text-dim))' }}>Loading...</div>
        </div>
      </RetroLayout>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const storagePercent = storageUsage ? Math.round((storageUsage.used / storageUsage.total) * 100) : 0;

  return (
    <RetroLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-base font-medium mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
            Account Settings
          </h1>
          <p className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>
            Manage your profile and security preferences
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
              activeTab === 'profile' ? 'minimal-border-accent' : 'minimal-border'
            }`}
            style={{ 
              color: activeTab === 'profile' ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
              backgroundColor: activeTab === 'profile' ? 'hsl(var(--accent) / 0.1)' : 'transparent'
            }}
            data-testid="tab-profile"
          >
            <User size={12} className="inline mr-1.5" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
              activeTab === 'security' ? 'minimal-border-accent' : 'minimal-border'
            }`}
            style={{ 
              color: activeTab === 'security' ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
              backgroundColor: activeTab === 'security' ? 'hsl(var(--accent) / 0.1)' : 'transparent'
            }}
            data-testid="tab-security"
          >
            <Shield size={12} className="inline mr-1.5" />
            Security
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
              activeTab === 'storage' ? 'minimal-border-accent' : 'minimal-border'
            }`}
            style={{ 
              color: activeTab === 'storage' ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
              backgroundColor: activeTab === 'storage' ? 'hsl(var(--accent) / 0.1)' : 'transparent'
            }}
            data-testid="tab-storage"
          >
            <HardDrive size={12} className="inline mr-1.5" />
            Storage
          </button>
        </div>

        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
              <div className="flex gap-5 items-start">
                <div 
                  className="w-16 h-16 flex items-center justify-center flex-shrink-0"
                  style={{ 
                    backgroundColor: 'hsl(var(--surface))',
                    border: '1px solid hsl(var(--border-dim))'
                  }}
                >
                  <User size={24} style={{ color: 'hsl(var(--accent))' }} />
                </div>
                
                <div className="flex-1 space-y-4">
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
            </div>

            <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
              <h3 className="text-xs font-medium mb-3 flex items-center justify-between" style={{ color: 'hsl(var(--text-primary))' }}>
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
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                  <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>User ID</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono" style={{ color: 'hsl(var(--text-secondary))' }}>
                      #{user.id}
                    </span>
                    <button 
                      onClick={copyUserId}
                      className="p-1 transition-colors"
                      style={{ color: 'hsl(var(--text-dim))' }}
                      data-testid="button-copy-user-id"
                    >
                      {copied ? <Check size={12} style={{ color: 'hsl(var(--accent))' }} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                  <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>Member Since</span>
                  <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                    {accountStats?.joinedDate ? formatDate(accountStats.joinedDate) : 'Recently'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between py-2">
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
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
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
                      className="w-8 h-4 peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:transition-all after:w-3 after:h-3"
                      style={{
                        backgroundColor: emailNotifications ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--border-dim))',
                        border: emailNotifications ? '1px solid hsl(var(--accent) / 0.5)' : '1px solid hsl(var(--border-dim))',
                      }}
                    >
                      <span 
                        className="absolute w-3 h-3 top-0.5 transition-all"
                        style={{
                          backgroundColor: emailNotifications ? 'hsl(var(--accent))' : 'hsl(var(--text-dim))',
                          left: emailNotifications ? '17px' : '2px',
                          boxShadow: emailNotifications ? '0 0 8px hsl(var(--accent))' : 'none',
                        }}
                      />
                    </div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between py-2">
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
                      className="w-8 h-4 peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:transition-all after:w-3 after:h-3"
                      style={{
                        backgroundColor: securityAlerts ? 'hsl(var(--accent) / 0.2)' : 'hsl(var(--border-dim))',
                        border: securityAlerts ? '1px solid hsl(var(--accent) / 0.5)' : '1px solid hsl(var(--border-dim))',
                      }}
                    >
                      <span 
                        className="absolute w-3 h-3 top-0.5 transition-all"
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

            <button
              onClick={handleLogout}
              className="w-full minimal-btn flex items-center justify-center gap-1.5"
              style={{ color: 'hsl(0, 65%, 55%)' }}
              data-testid="button-logout-account"
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        )}

        {activeTab === 'security' && (
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
              <h3 className="text-xs font-medium mb-3 flex items-center justify-between" style={{ color: 'hsl(var(--text-primary))' }}>
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
                <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
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
                      <div className="text-[11px] flex items-center gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
                        Current Browser
                        <span 
                          className="text-[9px] px-1.5 py-0.5"
                          style={{ 
                            color: 'hsl(var(--accent))',
                            backgroundColor: 'hsl(var(--accent) / 0.1)',
                          }}
                        >
                          THIS DEVICE
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                        Active now
                      </div>
                    </div>
                  </div>
                  <div 
                    className="w-1.5 h-1.5"
                    style={{ 
                      backgroundColor: 'hsl(var(--accent))',
                      boxShadow: '0 0 8px hsl(var(--accent))',
                    }}
                  />
                </div>
                
                {sessions?.filter(s => !s.isCurrent).map((session) => (
                  <div key={session.id} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 flex items-center justify-center"
                        style={{ 
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border-dim))'
                        }}
                      >
                        <Smartphone size={14} style={{ color: 'hsl(var(--text-dim))' }} />
                      </div>
                      <div>
                        <div className="text-[11px]" style={{ color: 'hsl(var(--text-primary))' }}>
                          {session.device}
                        </div>
                        <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                          {session.location} - {session.lastActive}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => revokeSessionMutation.mutate(session.id)}
                      className="minimal-btn text-[10px] px-2 py-1"
                      style={{ color: 'hsl(var(--text-dim))' }}
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
              <p className="text-[10px] mb-3" style={{ color: 'hsl(var(--text-dim))' }}>
                Once you delete your account, there is no going back. Please be certain.
              </p>
              <button
                className="minimal-btn flex items-center gap-1.5"
                style={{ 
                  color: 'hsl(0, 65%, 55%)',
                  borderColor: 'hsl(0, 65%, 55% / 0.3)',
                }}
                data-testid="button-delete-account"
              >
                <Trash2 size={12} />
                Delete Account
              </button>
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
              <h3 className="text-xs font-medium mb-4 flex items-center justify-between" style={{ color: 'hsl(var(--text-primary))' }}>
                Cloud Storage
                <span 
                  className="text-[10px] px-2 py-0.5"
                  style={{ 
                    color: 'hsl(var(--text-secondary))',
                    border: '1px solid hsl(var(--border-dim))',
                  }}
                >
                  {storagePercent}%
                </span>
              </h3>
              
              <div className="mb-4">
                <div 
                  className="w-full h-1"
                  style={{ backgroundColor: 'hsl(var(--border-dim))' }}
                >
                  <div 
                    className="h-full transition-all duration-1000"
                    style={{ 
                      width: `${storagePercent}%`,
                      backgroundColor: 'hsl(var(--accent))',
                      boxShadow: '0 0 10px hsl(var(--accent) / 0.4)',
                    }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  <span>{formatBytes(storageUsage?.used ?? 0)} Used</span>
                  <span>{formatBytes(storageUsage?.total ?? 500 * 1024 * 1024)} Total</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between py-2" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
                <span className="text-[11px]" style={{ color: 'hsl(var(--text-dim))' }}>Files Stored</span>
                <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                  {storageUsage?.fileCount ?? 0} files
                </span>
              </div>
            </div>

            <div className="minimal-border p-4" style={{ backgroundColor: 'hsl(var(--panel))' }}>
              <h3 className="text-xs font-medium mb-3 flex items-center justify-between" style={{ color: 'hsl(var(--text-primary))' }}>
                Transfer Statistics
                <Clock size={14} style={{ color: 'hsl(var(--text-dim))' }} />
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div 
                  className="p-3"
                  style={{ 
                    backgroundColor: 'hsl(var(--surface))',
                    border: '1px solid hsl(var(--border-subtle))',
                  }}
                >
                  <div className="text-lg font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                    {accountStats?.totalTransfers ?? 0}
                  </div>
                  <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    Total Transfers
                  </div>
                </div>
                
                <div 
                  className="p-3"
                  style={{ 
                    backgroundColor: 'hsl(var(--surface))',
                    border: '1px solid hsl(var(--border-subtle))',
                  }}
                >
                  <div className="text-lg font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                    {formatBytes(accountStats?.totalBytesTransferred ?? 0)}
                  </div>
                  <div className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                    Data Transferred
                  </div>
                </div>
              </div>
            </div>

            <div 
              className="p-3 flex items-start gap-2"
              style={{ 
                backgroundColor: 'hsl(var(--accent) / 0.05)',
                border: '1px solid hsl(var(--accent) / 0.2)',
              }}
            >
              <HardDrive size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'hsl(var(--accent))' }} />
              <div>
                <div className="text-[11px] mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
                  Need more storage?
                </div>
                <p className="text-[10px]" style={{ color: 'hsl(var(--text-dim))' }}>
                  Upgrade to Pro for 10GB of cloud storage and unlimited P2P transfers.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </RetroLayout>
  );
}
