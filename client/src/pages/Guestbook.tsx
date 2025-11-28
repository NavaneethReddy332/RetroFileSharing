import { useState } from "react";
import { RetroLayout } from "../components/RetroLayout";
import { useTerminal } from "../context/TerminalContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import type { GuestbookEntry, InsertGuestbookEntry } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Guestbook() {
  const { addLog } = useTerminal();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const [favoriteSystem, setFavoriteSystem] = useState("");

  const { data: entries, isLoading } = useQuery<GuestbookEntry[]>({
    queryKey: ['/api/guestbook'],
  });

  const createEntryMutation = useMutation({
    mutationFn: async (entry: InsertGuestbookEntry) => {
      const res = await apiRequest('POST', '/api/guestbook', entry);
      return await res.json();
    },
    onSuccess: () => {
      addLog(`GUESTBOOK_ENTRY_SAVED... OK`);
      queryClient.invalidateQueries({ queryKey: ['/api/guestbook'] });
      setDisplayName("");
      setMessage("");
      setLocation("");
      setFavoriteSystem("");
    },
    onError: (error) => {
      addLog(`ERROR: FAILED_TO_SAVE_ENTRY - ${error.message}`, 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !message.trim()) {
      addLog(`ERROR: NAME_AND_MESSAGE_REQUIRED`, 'error');
      toast({
        title: "Missing Information",
        description: "Please fill in your name and message.",
        variant: "destructive",
      });
      return;
    }

    addLog(`TRANSMITTING_GUESTBOOK_ENTRY...`);
    const entryData: InsertGuestbookEntry = {
      displayName: displayName.trim(),
      message: message.trim(),
    };
    
    if (location.trim()) {
      entryData.location = location.trim();
    }
    
    if (favoriteSystem) {
      entryData.favoriteSystem = favoriteSystem;
    }
    
    createEntryMutation.mutate(entryData);
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <RetroLayout>
      <center>
        <h2 className="text-2xl sm:text-3xl font-bold mb-4">
          <span style={{ color: 'var(--accent)' }}>★ GUESTBOOK ★</span>
        </h2>
        <p className="mb-6">Sign our retro guestbook! Leave a message for other visitors.</p>
      </center>

      {/* Sign Guestbook Form */}
      <div className="border-2 p-4 sm:p-6 mb-6" style={{ backgroundColor: 'var(--panel-light)', borderColor: 'var(--border-highlight)' }}>
        <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--accent)' }}>Sign the Guestbook</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Name: *</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="retro-input w-full"
                placeholder="Your name"
                maxLength={50}
                required
                data-testid="input-name"
              />
            </div>
            
            <div>
              <label className="block font-semibold mb-1">Location:</label>
              <input 
                type="text" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="retro-input w-full"
                placeholder="City, Country"
                maxLength={50}
                data-testid="input-location"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Favorite OS/System:</label>
            <select 
              value={favoriteSystem}
              onChange={(e) => setFavoriteSystem(e.target.value)}
              className="retro-input w-full"
              data-testid="select-os"
            >
              <option value="">-- Select --</option>
              <option value="Windows 95">Windows 95</option>
              <option value="Windows 98">Windows 98</option>
              <option value="Windows ME">Windows ME</option>
              <option value="Windows XP">Windows XP</option>
              <option value="Mac OS 9">Mac OS 9</option>
              <option value="Mac OS X">Mac OS X</option>
              <option value="Linux">Linux</option>
              <option value="BeOS">BeOS</option>
              <option value="Amiga">Amiga</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Message: *</label>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="retro-input w-full"
              rows={4}
              placeholder="Leave your message here..."
              maxLength={500}
              required
              data-testid="textarea-message"
            />
            <small style={{ color: 'var(--text-secondary)' }}>{message.length}/500 characters</small>
          </div>

          <button 
            type="submit" 
            className="retro-button"
            disabled={createEntryMutation.isPending}
            data-testid="button-sign"
          >
            {createEntryMutation.isPending ? "Signing..." : "Sign Guestbook >>"}
          </button>
        </form>
      </div>

      <hr className="my-6" style={{ borderColor: 'var(--border-shadow)' }} />

      {/* Guestbook Entries */}
      <div>
        <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--accent)' }}>Recent Entries</h3>
        
        {isLoading && (
          <center>
            <p>Loading guestbook entries...</p>
            <div className="w-64 h-4 border-2 p-0.5 relative mt-2" style={{ borderColor: 'var(--border-highlight)', backgroundColor: 'var(--input-bg)' }}>
              <div className="h-full animate-[width_2s_ease-in-out_infinite]" style={{ width: '50%', backgroundColor: 'var(--accent)' }}></div>
            </div>
          </center>
        )}

        {!isLoading && entries && entries.length === 0 && (
          <div className="border-2 p-4 text-center" style={{ backgroundColor: 'var(--panel-light)', borderColor: 'var(--accent)' }}>
            <p>No entries yet. Be the first to sign our guestbook!</p>
          </div>
        )}

        {!isLoading && entries && entries.length > 0 && (
          <div className="space-y-4" data-testid="guestbook-entries">
            {entries.map((entry) => (
              <div 
                key={entry.id} 
                className="border-2 p-4" style={{ backgroundColor: 'var(--panel-light)', borderColor: 'var(--border-highlight)' }}
                data-testid={`entry-${entry.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                  <div>
                    <span className="font-bold" style={{ color: 'var(--accent)' }} data-testid={`name-${entry.id}`}>
                      {entry.displayName}
                    </span>
                    {entry.location && (
                      <span className="text-sm ml-2" style={{ color: 'var(--text-secondary)' }}>
                        from {entry.location}
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(entry.createdAt)}
                  </span>
                </div>
                
                {entry.favoriteSystem && (
                  <div className="text-sm mb-2">
                    <img 
                      src="https://win98icons.alexmeub.com/icons/png/computer_explorer-3.png" 
                      width="16" 
                      className="inline mr-1" 
                      alt="OS" 
                    />
                    Favorite: {entry.favoriteSystem}
                  </div>
                )}
                
                <div className="border-2 p-3" style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border-shadow)' }} data-testid={`message-${entry.id}`}>
                  {entry.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="my-6" style={{ borderColor: 'var(--border-shadow)' }} />
      
      <center>
        <small style={{ color: 'var(--text-secondary)' }}>
          <img 
            src="https://win98icons.alexmeub.com/icons/png/globe_internet-0.png" 
            width="24" 
            className="inline mr-1" 
            alt="Web" 
          />
          Thank you for visiting RetroSend!
        </small>
      </center>
    </RetroLayout>
  );
}
