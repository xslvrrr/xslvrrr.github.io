import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { UserSession, PortalData } from '../types/portal';

export function useDashboardData() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session');
      const sessionData = await response.json();
      
      if (!sessionData.loggedIn) {
        router.push('/login');
        return;
      }
      
      setSession(sessionData);
    } catch (error) {
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const loadPortalData = useCallback(async (force = false) => {
    if (dataLoading) return;
    
    // Check if we have recent data (less than 2 minutes old) and not forcing refresh
    if (!force && portalData?.lastUpdated) {
      const lastUpdate = new Date(portalData.lastUpdated);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
      
      if (diffMinutes < 2) {
        return;
      }
    }
    
    setDataLoading(true);
    try {
      const response = await fetch('/api/portal/scrape');
      const data = await response.json();
      
      if (response.ok) {
        setPortalData(data);
      } else if (data.expired) {
        router.push('/login');
      }
    } catch (error) {
      // Error loading portal data
    } finally {
      setDataLoading(false);
    }
  }, [dataLoading, portalData, router]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      router.push('/');
    }
  }, [router]);

  return {
    session,
    isLoading,
    portalData,
    dataLoading,
    checkSession,
    loadPortalData,
    handleLogout
  };
}
