import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';

interface RefreshContextType {
  isRefreshing: boolean;
  triggerRefresh: () => Promise<void>;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    
    await queryClient.invalidateQueries();
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    setIsRefreshing(false);
  }, []);

  return (
    <RefreshContext.Provider value={{ isRefreshing, triggerRefresh }}>
      {isRefreshing && (
        <div className="loading-line-container">
          <div className="loading-line" />
        </div>
      )}
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
}
