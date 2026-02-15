import { useState, useCallback, useEffect, useRef } from 'react';
import { Notice, NotificationState, NotificationCounts, NotificationCategory, NotificationImportance } from '../types/portal';

const normalizeDateForId = (value?: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const hashString = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const buildNoticeIdentity = (notice: Notice): string => {
  const allDates = [notice.date, ...(notice.dates || [])]
    .map(normalizeDateForId)
    .filter(Boolean)
    .sort();

  const payload = [
    notice.title?.trim().toLowerCase() || '',
    notice.preview?.trim().toLowerCase() || '',
    notice.content?.trim().toLowerCase() || '',
    notice.contentHtml?.trim().toLowerCase() || '',
    allDates.join('|')
  ].join('::');

  return `notice-${hashString(payload)}`;
};

export function useNotifications(notices: Notice[] | undefined) {
  const STORAGE_KEY = 'millennium-notification-states';
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('inbox');
  const [selectedNotification, setSelectedNotification] = useState<Notice | null>(null);
  const [notificationSearchQuery, setNotificationSearchQuery] = useState('');
  const [notificationStates, setNotificationStates] = useState<Record<string, NotificationState>>({});
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
    unreadTotal: 0,
    inbox: 0,
    pinned: 0,
    alerts: 0,
    events: 0,
    assignments: 0,
    archive: 0
  });

  useEffect(() => {
    let cancelled = false;

    const loadStates = async () => {
      try {
        const response = await fetch('/api/user/notifications');
        if (response.ok) {
          const payload = await response.json();
          if (!cancelled) {
            setNotificationStates(payload.states || {});
            setIsStateLoaded(true);
          }
          return;
        }
      } catch (error) {
        console.error('Failed to load notification state from server:', error);
      }

      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            setNotificationStates(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load notification state:', error);
      } finally {
        if (!cancelled) {
          setIsStateLoaded(true);
        }
      }
    };

    loadStates();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStateLoaded || typeof window === 'undefined') return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/user/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ states: notificationStates })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to save notification state to server:', error);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(notificationStates));
        } catch (storageError) {
          console.error('Failed to save notification state locally:', storageError);
        }
      }
    }, 400);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [notificationStates, isStateLoaded]);

  const getNotificationId = useCallback((notice: Notice, _index?: number) => {
    return buildNoticeIdentity(notice);
  }, []);

  const toggleRead = useCallback((notificationId: string) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        read: !prev[notificationId]?.read
      }
    }));
  }, []);

  const setRead = useCallback((notificationId: string, read: boolean) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        read
      }
    }));
  }, []);

  const togglePin = useCallback((notificationId: string) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        pinned: !prev[notificationId]?.pinned
      }
    }));
  }, []);

  const setPinned = useCallback((notificationId: string, pinned: boolean) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        pinned
      }
    }));
  }, []);

  const toggleArchive = useCallback((notificationId: string) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        archived: !prev[notificationId]?.archived
      }
    }));
  }, []);

  const setArchived = useCallback((notificationId: string, archived: boolean) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        archived
      }
    }));
  }, []);

  const setCategory = useCallback((notificationId: string, category: NotificationCategory) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        category
      }
    }));
  }, []);

  const setImportance = useCallback((notificationId: string, importance: NotificationImportance) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        importance
      }
    }));
  }, []);

  const setFolder = useCallback((notificationId: string, folderId?: string) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        folderId
      }
    }));
  }, []);

  const deriveCategory = useCallback((notice: Notice): NotificationCategory => {
    const title = notice.title.toLowerCase();
    if (title.includes('alert') || title.includes('urgent')) return 'alerts';
    if (title.includes('event') || title.includes('meeting')) return 'events';
    if (title.includes('assignment') || title.includes('homework')) return 'assignments';
    return 'inbox';
  }, []);

  const markAllAsRead = useCallback(() => {
    if (!notices) return;

    const newStates: Record<string, NotificationState> = {};
    notices.forEach((notice, index) => {
      const notificationId = getNotificationId(notice, index);
      newStates[notificationId] = {
        ...notificationStates[notificationId],
        read: true
      };
    });

    setNotificationStates(prev => ({
      ...prev,
      ...newStates
    }));
  }, [notices, notificationStates, getNotificationId]);

  const getFilteredNotifications = useCallback(() => {
    if (!notices) return [];

    return notices.filter((notice, index) => {
      const notificationId = getNotificationId(notice, index);
      const isPinned = notificationStates[notificationId]?.pinned || false;
      const isArchived = notificationStates[notificationId]?.archived || false;
      const category = notificationStates[notificationId]?.category || deriveCategory(notice);
      const folderId = notificationStates[notificationId]?.folderId;

      // Search filter
      if (notificationSearchQuery) {
        const searchLower = notificationSearchQuery.toLowerCase();
        if (!notice.title.toLowerCase().includes(searchLower) &&
          !notice.preview.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory.startsWith('folder:')) {
        const activeFolderId = selectedCategory.replace('folder:', '');
        return !isArchived && folderId === activeFolderId;
      }

      switch (selectedCategory) {
        case 'archive':
          return isArchived;
        case 'pinned':
          return isPinned && !isArchived;
        case 'inbox':
          return !isPinned && !isArchived && !folderId && category === 'inbox';
        case 'alerts':
          return !isPinned && !isArchived && !folderId && category === 'alerts';
        case 'events':
          return !isPinned && !isArchived && !folderId && category === 'events';
        case 'assignments':
          return !isPinned && !isArchived && !folderId && category === 'assignments';
        default:
          return true;
      }
    });
  }, [notices, notificationSearchQuery, selectedCategory, notificationStates, getNotificationId, deriveCategory]);

  // Update notification counts when states change
  useEffect(() => {
    if (!notices) return;

    const counts: NotificationCounts = {
      unreadTotal: 0,
      inbox: 0,
      pinned: 0,
      alerts: 0,
      events: 0,
      assignments: 0,
      archive: 0
    };

    notices.forEach((notice, index) => {
      const notificationId = getNotificationId(notice, index);
      const state = notificationStates[notificationId];
      const isPinned = state?.pinned || false;
      const isArchived = state?.archived || false;
      const isRead = state?.read || false;
      const category = state?.category || deriveCategory(notice);
      const folderId = state?.folderId;

      if (!isRead && !isArchived) counts.unreadTotal++;

      if (isArchived) {
        if (!isRead) counts.archive++;
        return;
      }

      if (isPinned) {
        if (!isRead) counts.pinned++;
        return;
      }

      if (folderId) return;
      if (!isRead && category === 'inbox') counts.inbox++;
      if (!isRead && category === 'alerts') counts.alerts++;
      if (!isRead && category === 'events') counts.events++;
      if (!isRead && category === 'assignments') counts.assignments++;
    });

    setNotificationCounts(counts);
  }, [notices, notificationStates, getNotificationId, deriveCategory]);

  return {
    selectedCategory,
    setSelectedCategory,
    selectedNotification,
    setSelectedNotification,
    notificationSearchQuery,
    setNotificationSearchQuery,
    notificationStates,
    notificationCounts,
    toggleRead,
    setRead,
    togglePin,
    setPinned,
    toggleArchive,
    setArchived,
    setCategory,
    setImportance,
    setFolder,
    markAllAsRead,
    getFilteredNotifications,
    getNotificationId
  };
}
