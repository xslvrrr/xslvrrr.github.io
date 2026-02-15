export interface HomeSettings {
  dateFormat: 'DMY' | 'MDY' | 'YMD';
  startPage: 'home' | 'calendar' | 'timetable' | 'notifications';
  usePointerCursors: boolean;
  convertEmoticonsToEmojis: boolean;
  sidebarItemVisibility: Record<string, 'show' | 'hide'>;
  sidebarItemOrder: string[];
  columns: 1 | 2;
  notificationsFallback: boolean;
  homeWiggleEnabled: boolean;
  hiddenNotificationCategories: string[];
  calendarFirstDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  calendarEventColorMode: 'independent' | 'calendar';
  calendarMergeConsecutivePeriods: boolean;
  calendarMonthDayClickView: 'day' | 'week';
  calendarSyncMode: 'none' | 'local' | 'local_and_classes';
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
    'classroom-stream': 'show',
    'classroom-assignments': 'show',
    'classroom-missing': 'show',
    'classroom-materials': 'show',
    'classroom-activity': 'show',
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
    'classroom-stream',
    'classroom-assignments',
    'classroom-missing',
    'classroom-materials',
    'classroom-activity',
  ],
  columns: 2,
  notificationsFallback: true,
  homeWiggleEnabled: true,
  hiddenNotificationCategories: ['archive'], // Hide archive by default
  calendarFirstDayOfWeek: 1,
  calendarEventColorMode: 'independent',
  calendarMergeConsecutivePeriods: true,
  calendarMonthDayClickView: 'day',
  calendarSyncMode: 'none',
};

export const HOME_SETTINGS_KEY = 'millennium_home_settings';
