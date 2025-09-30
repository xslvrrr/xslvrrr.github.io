// Shared type definitions for portal data

export interface UserSession {
  loggedIn: boolean;
  username?: string;
  school?: string;
  timestamp?: string;
}

export interface TimetableEntry {
  period: string;
  room: string;
  subject: string;
  teacher: string;
  attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked';
}

export interface Notice {
  title: string;
  preview: string;
  content: string;
}

export interface DiaryEntry {
  date: string;
  title: string;
  description?: string;
}

export interface PortalData {
  user: {
    name: string;
    school: string;
  };
  timetable: TimetableEntry[];
  notices: Notice[];
  diary: DiaryEntry[];
  lastUpdated: string;
}

export interface NotificationState {
  read: boolean;
  pinned: boolean;
  archived: boolean;
}

export interface NotificationCounts {
  inbox: number;
  pinned: number;
  alerts: number;
  events: number;
  assignments: number;
  archive: number;
  trash: number;
}
