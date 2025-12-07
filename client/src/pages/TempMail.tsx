import { useState, useEffect } from 'react';
import { RetroLayout } from '../components/RetroLayout';
import { useTempMail } from '../hooks/useTempMail';
import { useAuth } from '@/contexts/AuthContext';
import DOMPurify from 'dompurify';
import { 
  Mail, 
  Copy, 
  Check, 
  RefreshCw, 
  Trash2, 
  Inbox, 
  Clock, 
  ArrowLeft,
  AlertCircle,
  Loader2,
  Plus,
  Eye,
  X,
  Download,
  Paperclip,
  Save,
  Archive,
  ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';

const TEMP_MAIL_STORAGE_KEY = 'aerosend_temp_mail';

const THEME = {
  primary: '#1A73E8',
  primaryLight: 'rgba(26, 115, 232, 0.1)',
  primaryBorder: 'rgba(26, 115, 232, 0.3)',
  accent: '#00E5FF',
  accentLight: 'rgba(0, 229, 255, 0.1)',
  accentBorder: 'rgba(0, 229, 255, 0.3)',
  surface: '#0a0f1a',
  surfaceElevated: '#111827',
  border: 'rgba(0, 229, 255, 0.15)',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.8)',
  textDim: 'rgba(255, 255, 255, 0.5)',
};

interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

interface MessageDetail {
  id: string;
  from: { address: string; name: string };
  to: Array<{ address: string; name: string }>;
  subject: string;
  intro: string;
  text?: string;
  html?: string[];
  hasAttachments: boolean;
  attachments?: Attachment[];
  size: number;
  createdAt: string;
  seen: boolean;
}

export default function TempMail() {
  const {
    isLoading,
    error,
    account,
    messages,
    domains,
    savedEmails,
    createAccount,
    fetchDomains,
    fetchMessages,
    fetchMessageDetail,
    deleteMessage,
    downloadAttachment,
    saveEmail,
    fetchSavedEmails,
    deleteSavedEmail,
    getTimeRemaining,
    startAutoRefresh,
    stopAutoRefresh,
    copyToClipboard,
    reset,
    clearError,
    setAccountFromStorage,
  } = useTempMail();

  const { user, isAuthenticated } = useAuth();
  const [copied, setCopied] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showSavedEmails, setShowSavedEmails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSavedEmail, setSelectedSavedEmail] = useState<any>(null);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    if (domains.length > 0 && !selectedDomain) {
      setSelectedDomain(domains[0].domain);
    }
  }, [domains, selectedDomain]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const storageKey = `${TEMP_MAIL_STORAGE_KEY}_${user.id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const savedAccount = JSON.parse(saved);
          setAccountFromStorage(savedAccount);
        } catch (e) {
          console.warn('Failed to restore temp mail account');
        }
      }
      fetchSavedEmails();
    }
  }, [isAuthenticated, user, setAccountFromStorage, fetchSavedEmails]);

  useEffect(() => {
    if (isAuthenticated && user && account) {
      const storageKey = `${TEMP_MAIL_STORAGE_KEY}_${user.id}`;
      localStorage.setItem(storageKey, JSON.stringify(account));
    }
  }, [account, isAuthenticated, user]);

  useEffect(() => {
    if (account && autoRefreshEnabled) {
      startAutoRefresh(10000);
    }
    return () => stopAutoRefresh();
  }, [account, autoRefreshEnabled, startAutoRefresh, stopAutoRefresh]);

  useEffect(() => {
    if (!account) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      setTimeRemaining(getTimeRemaining());
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [account, getTimeRemaining]);

  const handleCreateEmail = async () => {
    await createAccount(selectedDomain);
  };

  const handleCopyEmail = async () => {
    if (account?.address) {
      const success = await copyToClipboard(account.address);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchMessages();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleNewEmailWithClear = () => {
    if (isAuthenticated && user) {
      const storageKey = `${TEMP_MAIL_STORAGE_KEY}_${user.id}`;
      localStorage.removeItem(storageKey);
    }
    reset();
  };

  const handleViewMessage = async (messageId: string) => {
    setIsLoadingMessage(true);
    const detail = await fetchMessageDetail(messageId);
    if (detail) {
      setSelectedMessage(detail);
    }
    setIsLoadingMessage(false);
  };

  const handleDeleteMessage = async (messageId: string) => {
    const success = await deleteMessage(messageId);
    if (success && selectedMessage?.id === messageId) {
      setSelectedMessage(null);
    }
  };

  const handleDownloadAttachment = async (attachment: Attachment) => {
    if (selectedMessage) {
      await downloadAttachment(selectedMessage.id, attachment);
    }
  };

  const handleSaveEmail = async () => {
    if (!selectedMessage || !isAuthenticated) return;
    setIsSaving(true);
    await saveEmail(selectedMessage);
    setIsSaving(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return 'Expired';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderEmailContent = (message: MessageDetail | { htmlContent?: string | null; textContent?: string | null }) => {
    const htmlArray = 'html' in message ? message.html : null;
    const htmlContent = 'htmlContent' in message ? message.htmlContent : null;
    const textContent = 'text' in message ? message.text : ('textContent' in message ? message.textContent : null);
    const intro = 'intro' in message ? message.intro : '';
    
    const hasHtml = (htmlArray && htmlArray.length > 0 && htmlArray.some(h => h && h.trim().length > 0)) || 
                   (htmlContent && htmlContent.trim().length > 0);
    
    if (hasHtml) {
      const rawHtml = htmlArray ? htmlArray.join('') : (htmlContent || '');
      
      const cleanHtml = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ['style'],
        ADD_ATTR: ['target', 'rel'],
        ALLOW_DATA_ATTR: false,
      });
      
      return (
        <div 
          className="prose prose-sm max-w-none dark:prose-invert"
          style={{ 
            color: 'hsl(var(--text-secondary))',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
      );
    }
    
    return (
      <pre 
        className="whitespace-pre-wrap text-xs font-mono"
        style={{ color: 'hsl(var(--text-secondary))' }}
      >
        {textContent || intro || 'No content'}
      </pre>
    );
  };

  const renderSavedEmailView = () => {
    if (!selectedSavedEmail) return null;

    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(10, 15, 26, 0.95)' }}
        onClick={() => setSelectedSavedEmail(null)}
      >
        <div 
          className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
          style={{ 
            backgroundColor: THEME.surfaceElevated,
            border: `1px solid ${THEME.border}`,
            boxShadow: `0 0 40px ${THEME.primaryLight}`
          }}
          onClick={(e) => e.stopPropagation()}
          data-testid="modal-saved-email-detail"
        >
          <div 
            className="flex items-center justify-between gap-4 p-4 border-b"
            style={{ borderColor: THEME.border }}
          >
            <button
              onClick={() => setSelectedSavedEmail(null)}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ color: THEME.textDim }}
              data-testid="button-close-saved-modal"
            >
              <ArrowLeft size={14} />
              BACK
            </button>
            <button
              onClick={() => {
                deleteSavedEmail(selectedSavedEmail.id);
                setSelectedSavedEmail(null);
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider transition-all"
              style={{ 
                border: '1px solid hsl(var(--error) / 0.3)',
                color: 'hsl(var(--error))'
              }}
              data-testid="button-delete-saved"
            >
              <Trash2 size={10} />
              DELETE
            </button>
          </div>
          
          <div className="p-4 border-b" style={{ borderColor: THEME.border }}>
            <h2 
              className="text-sm font-medium mb-3"
              style={{ color: THEME.textPrimary }}
            >
              {selectedSavedEmail.subject || '(No subject)'}
            </h2>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: THEME.textDim }}>From:</span>
                <span style={{ color: THEME.textSecondary }}>
                  {selectedSavedEmail.fromName} &lt;{selectedSavedEmail.fromAddress}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: THEME.textDim }}>To:</span>
                <span style={{ color: THEME.textSecondary }}>
                  {selectedSavedEmail.toAddress}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: THEME.textDim }}>Saved:</span>
                <span style={{ color: THEME.textSecondary }}>
                  {formatDate(selectedSavedEmail.savedAt)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            {renderEmailContent(selectedSavedEmail)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <RetroLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 
            className="text-lg font-medium mb-1"
            style={{ color: THEME.accent, textShadow: `0 0 15px ${THEME.accentLight}` }}
          >
            Temp Mail
          </h1>
          <p 
            className="text-xs"
            style={{ color: THEME.textDim }}
          >
            Generate a temporary email address. Emails are deleted after 1 hour.
          </p>
        </div>

        {error && (
          <div 
            className="flex items-center gap-2 p-3 mb-4 text-xs"
            style={{ 
              backgroundColor: 'hsl(var(--error) / 0.1)', 
              border: '1px solid hsl(var(--error) / 0.3)',
              color: 'hsl(var(--error))'
            }}
            data-testid="alert-error"
          >
            <AlertCircle size={14} />
            <span>{error}</span>
            <button 
              onClick={clearError}
              className="ml-auto p-1 transition-opacity hover:opacity-70"
              data-testid="button-clear-error"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {isAuthenticated && savedEmails.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowSavedEmails(!showSavedEmails)}
              className="flex items-center gap-2 px-3 py-2 text-xs transition-all w-full"
              style={{ 
                border: `1px solid ${showSavedEmails ? THEME.accent : THEME.border}`,
                backgroundColor: showSavedEmails ? THEME.surfaceElevated : 'transparent',
                color: showSavedEmails ? THEME.accent : THEME.textSecondary
              }}
              data-testid="button-toggle-saved"
            >
              <Archive size={14} />
              Saved Emails ({savedEmails.length})
              <ChevronDown 
                size={14} 
                className={`ml-auto transition-transform ${showSavedEmails ? 'rotate-180' : ''}`}
              />
            </button>
            
            {showSavedEmails && (
              <div 
                className="mt-2 divide-y"
                style={{ 
                  border: `1px solid ${THEME.border}`,
                  borderColor: THEME.border
                }}
              >
                {savedEmails.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-start gap-3 p-3 transition-colors cursor-pointer hover:opacity-90"
                    style={{ backgroundColor: THEME.surfaceElevated }}
                    onClick={() => setSelectedSavedEmail(email)}
                    data-testid={`saved-email-item-${email.id}`}
                  >
                    <Save 
                      size={14} 
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: THEME.primary }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span 
                          className="text-xs font-medium truncate"
                          style={{ color: THEME.textPrimary }}
                        >
                          {email.fromName || email.fromAddress}
                        </span>
                        <span 
                          className="text-[10px] flex-shrink-0"
                          style={{ color: THEME.textDim }}
                        >
                          {formatDate(email.savedAt)}
                        </span>
                      </div>
                      <div 
                        className="text-xs truncate"
                        style={{ color: THEME.textSecondary }}
                      >
                        {email.subject || '(No subject)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!account ? (
          <div 
            className="flex flex-col items-center justify-center p-12 text-center"
            style={{ 
              border: `1px dashed ${THEME.border}`,
              backgroundColor: THEME.surfaceElevated,
              boxShadow: `0 0 30px ${THEME.accentLight}`
            }}
          >
            <Mail 
              size={48} 
              className="mb-4"
              style={{ color: THEME.accent, filter: `drop-shadow(0 0 10px ${THEME.accent})` }}
            />
            <h2 
              className="text-sm font-medium mb-2"
              style={{ color: THEME.textPrimary }}
            >
              Generate Temporary Email
            </h2>
            <p 
              className="text-xs mb-4 max-w-sm"
              style={{ color: THEME.textDim }}
            >
              Create a disposable email address to receive emails. 
              Perfect for signups, verifications, and testing.
            </p>

            {domains.length > 1 && (
              <div className="mb-4 relative">
                <button
                  onClick={() => setShowDomainDropdown(!showDomainDropdown)}
                  className="flex items-center gap-2 px-3 py-2 text-xs"
                  style={{ 
                    border: `1px solid ${THEME.border}`,
                    backgroundColor: THEME.surface,
                    color: THEME.textSecondary
                  }}
                  data-testid="button-domain-dropdown"
                >
                  @{selectedDomain}
                  <ChevronDown size={12} />
                </button>
                
                {showDomainDropdown && (
                  <div 
                    className="absolute top-full left-0 mt-1 w-full z-10"
                    style={{ 
                      border: `1px solid ${THEME.border}`,
                      backgroundColor: THEME.surfaceElevated
                    }}
                  >
                    {domains.map((domain) => (
                      <button
                        key={domain.id}
                        onClick={() => {
                          setSelectedDomain(domain.domain);
                          setShowDomainDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-xs text-left transition-colors hover:opacity-70"
                        style={{ 
                          color: domain.domain === selectedDomain 
                            ? THEME.accent 
                            : THEME.textSecondary
                        }}
                        data-testid={`domain-option-${domain.id}`}
                      >
                        @{domain.domain}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleCreateEmail}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3 text-xs font-medium transition-all"
              style={{ 
                backgroundColor: THEME.primary,
                color: '#ffffff',
                opacity: isLoading ? 0.7 : 1,
                boxShadow: `0 0 20px ${THEME.primaryLight}`,
                border: `1px solid ${THEME.primaryBorder}`
              }}
              data-testid="button-generate-email"
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {isLoading ? 'Generating...' : 'Generate Email'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div 
              className="p-4"
              style={{ 
                border: `1px solid ${THEME.border}`,
                backgroundColor: THEME.surfaceElevated,
                boxShadow: `0 0 20px ${THEME.accentLight}`
              }}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div 
                    className="text-[10px] tracking-wider mb-1"
                    style={{ color: THEME.textDim }}
                  >
                    YOUR TEMPORARY EMAIL
                  </div>
                  <div 
                    className="text-sm font-mono truncate"
                    style={{ color: THEME.accent, textShadow: `0 0 10px ${THEME.accentLight}` }}
                    data-testid="text-email-address"
                  >
                    {account.address}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider"
                    style={{ 
                      backgroundColor: timeRemaining > 600000 
                        ? 'hsl(var(--success) / 0.1)' 
                        : timeRemaining > 300000
                        ? 'hsl(var(--warning) / 0.1)'
                        : 'hsl(var(--error) / 0.1)',
                      color: timeRemaining > 600000 
                        ? 'hsl(var(--success))' 
                        : timeRemaining > 300000
                        ? 'hsl(var(--warning))'
                        : 'hsl(var(--error))',
                      border: `1px solid ${timeRemaining > 600000 
                        ? 'hsl(var(--success) / 0.3)' 
                        : timeRemaining > 300000
                        ? 'hsl(var(--warning) / 0.3)'
                        : 'hsl(var(--error) / 0.3)'}`
                    }}
                    data-testid="text-time-remaining"
                  >
                    <Clock size={10} />
                    {formatTimeRemaining(timeRemaining)}
                  </div>
                  <button
                    onClick={handleCopyEmail}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider transition-all"
                    style={{ 
                      border: `1px solid ${copied ? THEME.accent : THEME.border}`,
                      color: copied ? THEME.accent : THEME.textSecondary,
                      backgroundColor: copied ? THEME.accentLight : 'transparent'
                    }}
                    data-testid="button-copy-email"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'COPIED' : 'COPY'}
                  </button>
                  <button
                    onClick={handleNewEmailWithClear}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider transition-all"
                    style={{ 
                      border: `1px solid ${THEME.primaryBorder}`,
                      color: THEME.primary
                    }}
                    data-testid="button-new-email"
                  >
                    <Plus size={12} />
                    NEW
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Inbox size={14} style={{ color: THEME.accent }} />
                <span 
                  className="text-xs"
                  style={{ color: THEME.textSecondary }}
                >
                  Inbox ({messages.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider transition-all"
                  style={{ 
                    border: `1px solid ${autoRefreshEnabled ? THEME.accent : THEME.border}`,
                    color: autoRefreshEnabled ? THEME.accent : THEME.textDim,
                    backgroundColor: autoRefreshEnabled ? THEME.accentLight : 'transparent'
                  }}
                  data-testid="button-toggle-auto-refresh"
                >
                  <Clock size={10} />
                  AUTO
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider transition-all"
                  style={{ 
                    border: `1px solid ${isRefreshing ? THEME.primary : THEME.border}`,
                    color: isRefreshing ? THEME.primary : THEME.textSecondary,
                    backgroundColor: isRefreshing ? THEME.primaryLight : 'transparent'
                  }}
                  data-testid="button-refresh-inbox"
                >
                  <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
                  {isRefreshing ? 'REFRESHING...' : 'REFRESH'}
                </button>
              </div>
            </div>

            <div 
              className="divide-y"
              style={{ 
                border: `1px solid ${THEME.border}`,
                borderColor: THEME.border
              }}
            >
              {messages.length === 0 ? (
                <div 
                  className="flex flex-col items-center justify-center p-8 text-center"
                  style={{ backgroundColor: THEME.surfaceElevated }}
                >
                  <Inbox 
                    size={32} 
                    className="mb-3"
                    style={{ color: THEME.textDim }}
                  />
                  <p 
                    className="text-xs"
                    style={{ color: THEME.textDim }}
                  >
                    No emails yet. Waiting for incoming messages...
                  </p>
                  <p 
                    className="text-[10px] mt-1"
                    style={{ color: 'rgba(255, 255, 255, 0.3)' }}
                  >
                    Auto-refresh is {autoRefreshEnabled ? 'enabled' : 'disabled'}
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className="flex items-start gap-3 p-3 transition-colors cursor-pointer hover:opacity-90"
                    style={{ 
                      backgroundColor: message.seen 
                        ? THEME.surfaceElevated 
                        : THEME.surface,
                    }}
                    onClick={() => handleViewMessage(message.id)}
                    data-testid={`email-item-${message.id}`}
                  >
                    <div 
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ 
                        backgroundColor: message.seen 
                          ? THEME.textDim 
                          : THEME.accent,
                        boxShadow: message.seen ? 'none' : `0 0 8px ${THEME.accent}`
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span 
                          className="text-xs font-medium truncate"
                          style={{ color: THEME.textPrimary }}
                        >
                          {message.from.name || message.from.address}
                        </span>
                        <span 
                          className="text-[10px] flex-shrink-0"
                          style={{ color: THEME.textDim }}
                        >
                          {formatDate(message.createdAt)}
                        </span>
                      </div>
                      <div 
                        className="text-xs truncate mb-1 flex items-center gap-1"
                        style={{ color: THEME.textSecondary }}
                      >
                        {message.subject || '(No subject)'}
                        {message.hasAttachments && (
                          <Paperclip size={10} style={{ color: THEME.accent }} />
                        )}
                      </div>
                      <div 
                        className="text-[10px] truncate"
                        style={{ color: THEME.textDim }}
                      >
                        {message.intro || 'No preview available'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewMessage(message.id);
                        }}
                        className="p-1.5 transition-opacity hover:opacity-70"
                        style={{ color: THEME.primary }}
                        data-testid={`button-view-${message.id}`}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMessage(message.id);
                        }}
                        className="p-1.5 transition-opacity hover:opacity-70"
                        style={{ color: 'hsl(var(--error))' }}
                        data-testid={`button-delete-${message.id}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {selectedMessage && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(10, 15, 26, 0.95)' }}
            onClick={() => setSelectedMessage(null)}
          >
            <div 
              className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
              style={{ 
                backgroundColor: THEME.surfaceElevated,
                border: `1px solid ${THEME.border}`,
                boxShadow: `0 0 40px ${THEME.accentLight}`
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid="modal-email-detail"
            >
              <div 
                className="flex items-center justify-between gap-4 p-4 border-b"
                style={{ borderColor: THEME.border }}
              >
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                  style={{ color: THEME.textDim }}
                  data-testid="button-close-modal"
                >
                  <ArrowLeft size={14} />
                  BACK
                </button>
                <div className="flex items-center gap-2">
                  {isAuthenticated && (
                    <button
                      onClick={handleSaveEmail}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider transition-all"
                      style={{ 
                        border: `1px solid ${THEME.primaryBorder}`,
                        color: THEME.primary
                      }}
                      data-testid="button-save-email"
                    >
                      {isSaving ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Save size={10} />
                      )}
                      SAVE
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleDeleteMessage(selectedMessage.id);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider transition-all"
                    style={{ 
                      border: '1px solid hsl(var(--error) / 0.3)',
                      color: 'hsl(var(--error))'
                    }}
                    data-testid="button-delete-current"
                  >
                    <Trash2 size={10} />
                    DELETE
                  </button>
                </div>
              </div>
              
              <div className="p-4 border-b" style={{ borderColor: THEME.border }}>
                <h2 
                  className="text-sm font-medium mb-3"
                  style={{ color: THEME.textPrimary }}
                >
                  {selectedMessage.subject || '(No subject)'}
                </h2>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: THEME.textDim }}>From:</span>
                    <span style={{ color: THEME.textSecondary }}>
                      {selectedMessage.from.name} &lt;{selectedMessage.from.address}&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: THEME.textDim }}>To:</span>
                    <span style={{ color: THEME.textSecondary }}>
                      {selectedMessage.to.map(t => t.address).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: THEME.textDim }}>Date:</span>
                    <span style={{ color: THEME.textSecondary }}>
                      {formatDate(selectedMessage.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                <div 
                  className="p-4 border-b" 
                  style={{ borderColor: THEME.border }}
                >
                  <div 
                    className="text-[10px] tracking-wider mb-2"
                    style={{ color: THEME.textDim }}
                  >
                    ATTACHMENTS ({selectedMessage.attachments.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedMessage.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        onClick={() => handleDownloadAttachment(attachment)}
                        className="flex items-center gap-2 px-3 py-2 text-xs transition-all hover:opacity-80"
                        style={{ 
                          border: `1px solid ${THEME.primaryBorder}`,
                          backgroundColor: THEME.surface,
                          color: THEME.primary
                        }}
                        data-testid={`button-download-${attachment.id}`}
                      >
                        <Download size={12} />
                        <span className="truncate max-w-[150px]">{attachment.filename}</span>
                        <span style={{ color: THEME.textDim }}>
                          ({formatFileSize(attachment.size)})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex-1 overflow-auto p-4">
                {isLoadingMessage ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 
                      size={24} 
                      className="animate-spin"
                      style={{ color: THEME.accent }}
                    />
                  </div>
                ) : (
                  renderEmailContent(selectedMessage)
                )}
              </div>
            </div>
          </div>
        )}

        {renderSavedEmailView()}

        <div 
          className="mt-8 p-3 text-center"
          style={{ 
            backgroundColor: THEME.surfaceElevated,
            border: `1px solid ${THEME.border}`
          }}
        >
          <p 
            className="text-[10px]"
            style={{ color: THEME.textDim }}
          >
            Powered by Mail.tm. Emails are automatically deleted after 1 hour.
            {isAuthenticated && ' Save important emails to your account before they expire.'}
          </p>
        </div>
      </div>
    </RetroLayout>
  );
}
