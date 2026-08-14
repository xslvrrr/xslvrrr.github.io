import type { PortalDataSettings } from '../lib/data-settings';
import type { NotificationRule } from '../lib/notification-rules';

export interface HomeSettings {
  dateFormat: 'DMY' | 'MDY' | 'YMD';
  startPage: 'home' | 'calendar' | 'timetable' | 'notifications';
  usePointerCursors: boolean;
  convertEmoticonsToEmojis: boolean;
  sidebarItemVisibility: Record<string, 'show' | 'hide'>;
  sidebarItemOrder: string[];
  /** Card surface used by Home items: shadcn card or Kokonut UI bento card. */
  homeCardStyle: 'minimal' | 'stylised';
  columns: 1 | 2;
  mobileColumns: 1 | 2;
  notificationsFallback: boolean;
  notificationsUnreadSection: boolean;
  disableFutureNotifications: boolean;
  notificationAutoArchiveAfter: '1w' | '1m' | '3m' | '6m' | '12m' | 'never';
  /** Ordered routing rules that file incoming notices into tabs or folders. First match wins. */
  notificationRules: NotificationRule[];
  /** Ordered notification sidebar entry ids: category ids and `folder:<id>` entries. */
  notificationSidebarOrder: string[];
  notificationSidebarVisibility: Record<string, 'show' | 'hide'>;
  notificationSidebarWidth: number;
  notificationListWidth: number;
  homeWiggleEnabled: boolean;
  hiddenNotificationCategories: string[];
  calendarFirstDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  calendarEventColorMode: 'independent' | 'calendar';
  calendarMergeConsecutivePeriods: boolean;
  calendarMonthDayClickView: 'day' | 'week';
  calendarShowClasses: boolean;
  /**
   * Calendars the sidebar checkbox has switched off that Millennium synthesises rather than the
   * user creating — currently the school calendar built from portal calendar data. Local and
   * Google calendars carry their own `visible` flag in their own stores.
   */
  calendarHiddenCalendarIds: string[];
  calendarShowTimelineSeconds: boolean;
  calendarSmartCleanerEnabled: boolean;
  calendarShowGoogleValidationBanner: boolean;
  calendarSyncMode: 'none' | 'local' | 'local_and_classes';
  timetableMergeConsecutivePeriods: boolean;
  timetableShowBothWeeks: boolean;
  assistantSummarizeThinking: boolean;
  assistantTone: 'friendly' | 'pragmatic' | 'simple' | 'formal';
  showAiAgent: boolean;
  studyReviewNotifications: boolean;
  unenrolledClassKeys: string[];
  classColors: Record<string, string>;
  shortcutBindings: Record<string, {
    keys: string[];
    isSequence?: boolean;
    isModifier?: boolean;
  }>;
  /**
   * Account copy of the portal sync settings. Local storage stays the synchronous read path for the
   * sync scheduler; this is what carries those settings between devices and across sign-outs.
   * `null` means this account has never saved them.
   */
  dataSettings: PortalDataSettings | null;
}

export const defaultHomeSettings: HomeSettings = {
  dateFormat: 'DMY',
  startPage: 'home',
  usePointerCursors: true,
  convertEmoticonsToEmojis: true,
  sidebarItemVisibility: {
    home: 'show',
    notifications: 'show',
    account: 'show',
    calendar: 'show',
    classes: 'show',
    timetable: 'show',
    reports: 'show',
    attendance: 'show',
    classroom: 'show',
    flashcards: 'show',
  },
  sidebarItemOrder: [
    'home',
    'notifications',
    'account',
    'calendar',
    'classes',
    'timetable',
    'reports',
    'attendance',
    'classroom',
    'flashcards',
  ],
  homeCardStyle: 'stylised',
  columns: 2,
  mobileColumns: 1,
  notificationsFallback: true,
  notificationsUnreadSection: true,
  disableFutureNotifications: false,
  notificationAutoArchiveAfter: '6m',
  notificationRules: [],
  notificationSidebarOrder: ['inbox', 'pinned', 'alerts', 'events', 'assignments', 'archive'],
  notificationSidebarVisibility: {},
  notificationSidebarWidth: 60,
  notificationListWidth: 400,
  homeWiggleEnabled: true,
  hiddenNotificationCategories: ['archive'], // Hide archive by default
  calendarFirstDayOfWeek: 1,
  calendarEventColorMode: 'independent',
  calendarMergeConsecutivePeriods: true,
  calendarMonthDayClickView: 'day',
  calendarShowClasses: false,
  calendarHiddenCalendarIds: [],
  calendarShowTimelineSeconds: false,
  calendarSmartCleanerEnabled: true,
  calendarShowGoogleValidationBanner: true,
  calendarSyncMode: 'none',
  timetableMergeConsecutivePeriods: true,
  timetableShowBothWeeks: false,
  assistantSummarizeThinking: true,
  assistantTone: 'friendly',
  showAiAgent: true,
  studyReviewNotifications: true,
  unenrolledClassKeys: [],
  classColors: {},
  shortcutBindings: {},
  dataSettings: null,
};

export const HOME_SETTINGS_KEY = 'millennium_home_settings';
