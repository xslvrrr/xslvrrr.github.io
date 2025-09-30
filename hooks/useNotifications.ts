import { useState, useCallback, useMemo, useEffect } from 'react';
import { Notice, NotificationState, NotificationCounts } from '../types/portal';

export function useNotifications(notices: Notice[] | undefined) {
  const [selectedCategory, setSelectedCategory] = useState('inbox');
  const [selectedNotification, setSelectedNotification] = useState<Notice | null>(null);
  const [notificationSearchQuery, setNotificationSearchQuery] = useState('');
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const [notificationStates, setNotificationStates] = useState<Record<string, NotificationState>>({});
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
    inbox: 0,
    pinned: 0,
    alerts: 0,
    events: 0,
    assignments: 0,
    archive: 0,
    trash: 0
  });

  const getNotificationId = useCallback((notice: Notice, index: number) => {
    return `${notice.title}-${index}`;
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

  const togglePin = useCallback((notificationId: string) => {
    setNotificationStates(prev => ({
      ...prev,
      [notificationId]: {
        ...prev[notificationId],
        pinned: !prev[notificationId]?.pinned
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

  const getFilteredNotifications = useCallback(() => {
    if (!notices) return [];

    return notices.filter((notice, index) => {
      const notificationId = getNotificationId(notice, index);
      const isPinned = notificationStates[notificationId]?.pinned || false;

      // Search filter
      if (notificationSearchQuery) {
        const searchLower = notificationSearchQuery.toLowerCase();
        if (!notice.title.toLowerCase().includes(searchLower) &&
            !notice.preview.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Category filter
      switch (selectedCategory) {
        case 'inbox':
          return !isPinned;
        case 'pinned':
          return isPinned;
        case 'alerts':
          return notice.title.toLowerCase().includes('alert') || notice.title.toLowerCase().includes('urgent');
        case 'events':
          return notice.title.toLowerCase().includes('event') || notice.title.toLowerCase().includes('meeting');
        case 'assignments':
          return notice.title.toLowerCase().includes('assignment') || notice.title.toLowerCase().includes('homework');
        case 'archive':
          return notificationStates[notificationId]?.archived || false;
        case 'trash':
          return false;
        default:
          return true;
      }
    });
  }, [notices, notificationSearchQuery, selectedCategory, notificationStates, getNotificationId]);

  // Update notification counts when states change
  useEffect(() => {
    if (!notices) return;
    
    const counts: NotificationCounts = {
      inbox: 0,
      pinned: 0,
      alerts: 0,
      events: 0,
      assignments: 0,
      archive: 0,
      trash: 0
    };
    
    notices.forEach((notice, index) => {
      const notificationId = getNotificationId(notice, index);
      const isPinned = notificationStates[notificationId]?.pinned || false;
      
      if (isPinned) counts.pinned++;
      if (!isPinned) counts.inbox++;
      if (notificationStates[notificationId]?.archived) counts.archive++;
      if (notice.title.toLowerCase().includes('event') || notice.title.toLowerCase().includes('meeting')) counts.events++;
      if (notice.title.toLowerCase().includes('assignment') || notice.title.toLowerCase().includes('homework')) counts.assignments++;
    });
    
    setNotificationCounts(counts);
  }, [notices, notificationStates, getNotificationId]);

  return {
    selectedCategory,
    setSelectedCategory,
    selectedNotification,
    setSelectedNotification,
    notificationSearchQuery,
    setNotificationSearchQuery,
    showTooltip,
    setShowTooltip,
    notificationStates,
    notificationCounts,
    toggleRead,
    togglePin,
    toggleArchive,
    getFilteredNotifications,
    getNotificationId
  };
}
