// Shared type definitions for portal data

export interface UserSession {
  loggedIn: boolean;
  username?: string;
  school?: string;
  timestamp?: string;
  profileImage?: string | null;
}

export interface TimetableEntry {
  period: string;
  room: string;
  subject: string;
  teacher: string;
  attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked';
}

// Full timetable entry from extension sync (Week A/B format)
export interface FullTimetableEntry {
  day: string;
  period: string;
  course: string;
  classCode: string;
  teacher: string;
  room: string;
}

export interface FullTimetable {
  weekA: FullTimetableEntry[];
  weekB: FullTimetableEntry[];
}

export interface Notice {
  title: string;
  preview: string;
  content: string;
  contentHtml?: string;
  date?: string;
  dates?: string[];
  currentDay?: string;
}

export interface GradeEntry {
  subject: string;
  task: string;
  result: string;
  date?: string;
}

export interface DiaryEntry {
  date: string;
  title: string;
  description?: string;
}

export interface ClassEntry {
  course: string;
  classCode: string;
  teacher: string;
  lessons: number;
  quickMerits: number;
  rollsMarked: number;
  absences: number;
}

export interface PortalData {
  user: {
    name: string;
    school: string;
  };
  timetable: TimetableEntry[] | FullTimetable;
  notices: Notice[];
  diary: DiaryEntry[];
  grades?: GradeEntry[];
  attendance?: AttendanceData;
  calendar?: any[];
  reports?: Report[];
  classes?: ClassEntry[];
  lastUpdated: string;
}

export type NotificationCategory = 'inbox' | 'alerts' | 'events' | 'assignments';
export type NotificationImportance = 'low' | 'medium' | 'high';

export interface NotificationState {
  read: boolean;
  pinned: boolean;
  archived: boolean;
  category?: NotificationCategory;
  importance?: NotificationImportance;
  folderId?: string;
}

export interface NotificationCounts {
  unreadTotal: number;
  inbox: number;
  pinned: number;
  alerts: number;
  events: number;
  assignments: number;
  archive: number;
}

// Attendance data types
export interface YearlyAttendance {
  year: string;
  schoolDays: number;
  wholeDayAbsences: number;
  wholeDayPercentage: number;
  partialAbsences: number;
  totalPercentage: number;
}

export interface SubjectAttendance {
  classCode: string;
  rollsMarked: number;
  absent: number;
  percentage: number | null; // null when no data (e.g., "-")
}

export interface AttendanceData {
  yearly: YearlyAttendance[];
  subjects: SubjectAttendance[];
}

// Report data types
export interface Report {
  title: string;
  url: string;
  yearLevel: string;    // e.g., "Year 11"
  semester: number;     // 1 or 2
  calendarYear: number; // e.g., 2025
}
