import { useEffect } from 'react';

/**
 * Hook that automatically refreshes data at regular intervals
 * @param {Function} fetchData - Function to call to refresh data
 * @param {number} intervalMs - Refresh interval in milliseconds (default: 10000ms = 10 seconds)
 * @param {boolean} enabled - Whether polling is enabled (default: true)
 */
export function useAutoRefresh(fetchData, intervalMs = 10000, enabled = true) {
  useEffect(() => {
    if (!enabled || !fetchData) return;

    // Poll for updates at the specified interval
    const pollInterval = setInterval(() => {
      // Only poll if page is visible
      if (!document.hidden) {
        fetchData();
      }
    }, intervalMs);
    
    // Also refetch when page becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData, intervalMs, enabled]);
}

export default useAutoRefresh;
