import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Notice, NotificationState, NotificationCounts, NotificationCategory, NotificationImportance } from '../types/portal';
import { scopedBrowserStorageKey } from '../lib/storage-scope';
import type { HomeSettings } from '../types/home';
import {
  parseNotificationDate,
  reconcileAutoArchivedNotifications,
} from '../lib/notification-auto-archive';
import { resolveRuleTarget } from '../lib/notification-rules';
import type { NotificationRule, NotificationRuleTarget } from '../lib/notification-rules';

type NoticeRecord = {
  notice: Notice;
  notificationId: string;
  originalIndex: number;
  derivedCategory: NotificationCategory;
  /** Destination a routing rule assigns, before manual filing or an explicit category. */
  routedTarget?: NotificationRuleTarget;
  searchText: string;
};

const STORAGE_KEY = 'millennium-notification-states';

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

const startsInFuture = (notice: Notice, today: Date): boolean => {
  const rawDates = notice.dates && notice.dates.length > 0 ? notice.dates : (notice.date ? [notice.date] : []);
  const firstDate = rawDates
    .map(parseNotificationDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return Boolean(firstDate && firstDate.getTime() > today.getTime());
};

export function useNotifications(
  notices: Notice[] | undefined,
  disableFutureNotifications = false,
  userId?: string,
  autoArchiveAfter: HomeSettings['notificationAutoArchiveAfter'] = '6m',
  notificationRules: readonly NotificationRule[] = [],
  folderIds: readonly string[] = []
) {
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
  const storageKey = scopedBrowserStorageKey(STORAGE_KEY, userId);
  const loadGenerationRef = useRef(0);
  const categorisingIdsRef = useRef(new Set<string>());
  const hasPendingUserChangeRef = useRef(false);

  const deriveCategory = useCallback((notice: Notice): NotificationCategory => {
    const title = notice.title.toLowerCase();
    if (title.includes('alert') || title.includes('urgent')) return 'alerts';
    if (title.includes('event') || title.includes('meeting')) return 'events';
    if (title.includes('assignment') || title.includes('homework')) return 'assignments';
    return 'inbox';
  }, []);

  // Serialised so a caller passing a fresh array literal every render does not rebuild records.
  const rulesKey = JSON.stringify(notificationRules);
  const folderIdsKey = folderIds.join('|');

  const noticeRecords = useMemo<NoticeRecord[]>(() => {
    if (!notices) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rules = JSON.parse(rulesKey) as NotificationRule[];
    const existingFolderIds = new Set(folderIdsKey ? folderIdsKey.split('|') : []);

    return notices.filter((notice) => !disableFutureNotifications || !startsInFuture(notice, today)).map((notice, index) => ({
      notice,
      notificationId: buildNoticeIdentity(notice),
      originalIndex: index,
      derivedCategory: deriveCategory(notice),
      routedTarget: resolveRuleTarget(notice, rules, existingFolderIds),
      searchText: `${notice.title || ''}\n${notice.preview || ''}`.toLowerCase()
    }));
  }, [deriveCategory, disableFutureNotifications, folderIdsKey, notices, rulesKey]);

  /** Manual filing always wins; otherwise a folder-targeted rule decides the folder. */
  const getEffectiveFolderId = useCallback(
    (state: NotificationState | undefined, routedTarget?: NotificationRuleTarget): string | undefined => {
      if (state?.folderManual) return state.folderId;
      if (state?.folderId) return state.folderId;
      return routedTarget?.kind === 'folder' ? routedTarget.id : undefined;
    },
    []
  );

  /**
   * A category set by hand beats routing, which in turn beats the title-derived guess.
   * Folder-targeted rules leave the category alone so the notice keeps a sensible tab if it
   * is later removed from the folder.
   */
  const getEffectiveCategory = useCallback(
    (
      state: NotificationState | undefined,
      derivedCategory: NotificationCategory,
      routedTarget?: NotificationRuleTarget
    ): NotificationCategory => {
      if (state?.category) return state.category;
      if (routedTarget?.kind === 'category') return routedTarget.id as NotificationCategory;
      return derivedCategory;
    },
    []
  );

  const loadNotificationStates = useCallback(async (options: { fallbackToLocal?: boolean } = {}) => {
    const { fallbackToLocal = false } = options;
    const generation = ++loadGenerationRef.current;
    try {
      const response = await fetch('/api/user/notifications');
      if (response.ok) {
        const payload = await response.json();
        if (loadGenerationRef.current !== generation) return;
        setNotificationStates(payload.states || {});
        setIsStateLoaded(true);
        return;
      }
    } catch (error) {
      console.error('Failed to load notification state from server:', error);
    }

    if (!fallbackToLocal) {
      if (loadGenerationRef.current === generation) setIsStateLoaded(true);
      return;
    }

    if (!storageKey) {
      if (loadGenerationRef.current === generation) setIsStateLoaded(true);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (loadGenerationRef.current === generation && parsed && typeof parsed === 'object') {
          setNotificationStates(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load notification state:', error);
    } finally {
      if (loadGenerationRef.current === generation) setIsStateLoaded(true);
    }
  }, [storageKey]);

  useEffect(() => {
    setNotificationStates({});
    setIsStateLoaded(false);
    void loadNotificationStates({ fallbackToLocal: true });
    return () => { loadGenerationRef.current += 1; };
  }, [loadNotificationStates]);

  useEffect(() => {
    const handleAssistantActionsApplied = () => {
      void loadNotificationStates();
    };

    window.addEventListener('assistant-actions-applied', handleAssistantActionsApplied);
    return () => window.removeEventListener('assistant-actions-applied', handleAssistantActionsApplied);
  }, [loadNotificationStates]);

  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStateLoaded || !hasPendingUserChangeRef.current || typeof window === 'undefined') return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      hasPendingUserChangeRef.current = false;
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
          if (!storageKey) return;
          localStorage.setItem(storageKey, JSON.stringify(notificationStates));
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
  }, [notificationStates, isStateLoaded, storageKey]);

  useEffect(() => {
    if (!isStateLoaded || noticeRecords.length === 0) return;
    const uncategorised = noticeRecords.filter(({ notificationId }) => (
      !notificationStates[notificationId]?.category && !categorisingIdsRef.current.has(notificationId)
    )).slice(0, 100);
    if (uncategorised.length === 0) return;

    uncategorised.forEach(({ notificationId }) => categorisingIdsRef.current.add(notificationId));
    void fetch('/api/user/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notifications: uncategorised.map(({ notificationId, notice }) => ({
          id: notificationId,
          title: notice.title,
          preview: notice.preview || notice.content,
        })),
      }),
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      const categories = payload.categories as Record<string, NotificationCategory> | undefined;
      if (!categories) return;
      setNotificationStates((current) => {
        let changed = false;
        const next = { ...current };
        uncategorised.forEach(({ notificationId }) => {
          const category = categories[notificationId];
          if (!category || current[notificationId]?.category) return;
          next[notificationId] = { ...current[notificationId], category } as NotificationState;
          changed = true;
        });
        if (changed) hasPendingUserChangeRef.current = true;
        return changed ? next : current;
      });
    }).catch((error) => {
      console.error('Failed to auto-categorise notifications:', error);
    });
  }, [isStateLoaded, noticeRecords, notificationStates]);

  const getNotificationId = useCallback((notice: Notice, _index?: number) => {
    return buildNoticeIdentity(notice);
  }, []);

  const updateNotificationStates = useCallback((
    updater: (prev: Record<string, NotificationState>) => Record<string, NotificationState>
  ) => {
    setNotificationStates(prev => {
      const next = updater(prev);
      if (next !== prev) hasPendingUserChangeRef.current = true;
      return next === prev ? prev : next;
    });
  }, []);

  useEffect(() => {
    if (!isStateLoaded || noticeRecords.length === 0) return;
    const now = new Date();
    updateNotificationStates((prev) => reconcileAutoArchivedNotifications(
      prev,
      noticeRecords,
      autoArchiveAfter,
      now,
    ));
  }, [autoArchiveAfter, isStateLoaded, noticeRecords, updateNotificationStates]);

  const updateNotificationState = useCallback((
    notificationId: string,
    updater: (current: NotificationState | undefined) => NotificationState
  ) => {
    updateNotificationStates(prev => {
      const current = prev[notificationId];
      const nextState = updater(current);
      if (
        current &&
        current.read === nextState.read &&
        current.pinned === nextState.pinned &&
        current.archived === nextState.archived &&
        current.autoArchived === nextState.autoArchived &&
        current.category === nextState.category &&
        current.importance === nextState.importance &&
        current.folderId === nextState.folderId
      ) {
        return prev;
      }

      return {
        ...prev,
        [notificationId]: nextState
      };
    });
  }, [updateNotificationStates]);

  const toggleRead = useCallback((notificationId: string) => {
    updateNotificationState(notificationId, current => ({
      ...current,
      read: !current?.read
    } as NotificationState));
  }, [updateNotificationState]);

  const setRead = useCallback((notificationId: string, read: boolean) => {
    updateNotificationState(notificationId, current => ({
      ...current,
      read
    } as NotificationState));
  }, [updateNotificationState]);

  const togglePin = useCallback((notificationId: string) => {
    updateNotificationState(notificationId, current => ({
      ...current,
      pinned: !current?.pinned
    } as NotificationState));
  }, [updateNotificationState]);

  const setPinned = useCallback((notificationId: string, pinned: boolean) => {
    updateNotificationState(notificationId, current => ({
      ...current,
      pinned
    } as NotificationState));
  }, [updateNotificationState]);

  const toggleArchive = useCallback((notificationId: string) => {
    updateNotificationState(notificationId, current => {
      const nextState = {
        ...current,
        archived: !current?.archived
      } as NotificationState;
      delete nextState.autoArchived;
      return nextState;
    });
  }, [updateNotificationState]);

  const setArchived = useCallback((notificationId: string, archived: boolean) => {
    updateNotificationState(notificationId, current => {
      const nextState = {
        ...current,
        archived
      } as NotificationState;
      delete nextState.autoArchived;
      return nextState;
    });
  }, [updateNotificationState]);

  const setCategory = useCallback((notificationId: string, category: NotificationCategory) => {
    updateNotificationState(notificationId, current => ({
      ...current,
      category
    } as NotificationState));
  }, [updateNotificationState]);

  const setImportance = useCallback((notificationId: string, importance?: NotificationImportance) => {
    updateNotificationState(notificationId, current => {
      const nextState = { ...(current || {}) } as NotificationState;
      if (importance === undefined) {
        delete nextState.importance;
      } else {
        nextState.importance = importance;
      }
      return nextState;
    });
  }, [updateNotificationState]);

  const setFolder = useCallback((notificationId: string, folderId?: string) => {
    updateNotificationState(notificationId, current => {
      const nextState = { ...(current || {}) } as NotificationState;
      // Filing by hand pins the choice so routing rules stop reassigning this notice.
      nextState.folderManual = true;
      if (folderId === undefined) {
        delete nextState.folderId;
      } else {
        nextState.folderId = folderId;
      }
      return nextState;
    });
  }, [updateNotificationState]);

  /** Hands the notice back to the routing rules after it was filed manually. */
  const clearManualFolder = useCallback((notificationId: string) => {
    updateNotificationState(notificationId, current => {
      const nextState = { ...(current || {}) } as NotificationState;
      delete nextState.folderManual;
      delete nextState.folderId;
      return nextState;
    });
  }, [updateNotificationState]);

  const markAllAsRead = useCallback(() => {
    if (noticeRecords.length === 0) return;

    updateNotificationStates(prev => {
      let changed = false;
      const next = { ...prev };

      noticeRecords.forEach(({ notificationId }) => {
        if (next[notificationId]?.read) return;
        next[notificationId] = {
          ...next[notificationId],
          read: true
        } as NotificationState;
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [noticeRecords, updateNotificationStates]);

  const filteredNotifications = useMemo(() => {
    if (noticeRecords.length === 0) return [];

    const searchLower = notificationSearchQuery.toLowerCase().trim();

    return noticeRecords.filter(({ notificationId, derivedCategory, routedTarget, searchText }) => {
      const state = notificationStates[notificationId];
      const isPinned = state?.pinned || false;
      const isArchived = state?.archived || false;
      const category = getEffectiveCategory(state, derivedCategory, routedTarget);
      const folderId = getEffectiveFolderId(state, routedTarget);

      if (searchLower && !searchText.includes(searchLower)) {
        return false;
      }

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
    }).map(record => record.notice);
  }, [getEffectiveCategory, getEffectiveFolderId, noticeRecords, notificationSearchQuery, selectedCategory, notificationStates]);

  const getFilteredNotifications = useCallback(() => filteredNotifications, [filteredNotifications]);

  // Update notification counts when states change
  useEffect(() => {
    const counts: NotificationCounts = {
      unreadTotal: 0,
      inbox: 0,
      pinned: 0,
      alerts: 0,
      events: 0,
      assignments: 0,
      archive: 0
    };

    // Empty state is not authoritative until server state (or local fallback) loads.
    // Keep badges at zero instead of briefly treating every notice as unread.
    if (!isStateLoaded || noticeRecords.length === 0) {
      setNotificationCounts(counts);
      return;
    }

    noticeRecords.forEach(({ notificationId, derivedCategory, routedTarget }) => {
      const state = notificationStates[notificationId];
      const isPinned = state?.pinned || false;
      const isArchived = state?.archived || false;
      const isRead = state?.read || false;
      const category = getEffectiveCategory(state, derivedCategory, routedTarget);
      const folderId = getEffectiveFolderId(state, routedTarget);

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
  }, [getEffectiveCategory, getEffectiveFolderId, isStateLoaded, noticeRecords, notificationStates]);

  /** Effective folder per notice, so callers can render folder badges without re-running rules. */
  const notificationFolderIds = useMemo(() => {
    const assigned: Record<string, string> = {};
    noticeRecords.forEach(({ notificationId, routedTarget }) => {
      const folderId = getEffectiveFolderId(notificationStates[notificationId], routedTarget);
      if (folderId) assigned[notificationId] = folderId;
    });
    return assigned;
  }, [getEffectiveFolderId, noticeRecords, notificationStates]);

  return {
    isStateLoaded,
    selectedCategory,
    setSelectedCategory,
    selectedNotification,
    setSelectedNotification,
    notificationSearchQuery,
    setNotificationSearchQuery,
    notificationStates,
    notificationCounts,
    updateNotificationStates,
    toggleRead,
    setRead,
    togglePin,
    setPinned,
    toggleArchive,
    setArchived,
    setCategory,
    setImportance,
    setFolder,
    clearManualFolder,
    notificationFolderIds,
    markAllAsRead,
    getFilteredNotifications,
    getNotificationId
  };
}
