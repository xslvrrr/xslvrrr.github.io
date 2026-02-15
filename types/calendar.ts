// Calendar Event Types

export interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    color?: string;
    calendarId: string;
    calendarName: string;
    location?: string;
    isLocal?: boolean; // For local-only events (not synced to Google)
    googleEventId?: string;
    sourceType?: 'local' | 'class' | 'google';
}

export interface CalendarSource {
    id: string;
    name: string;
    color: string;
    visible: boolean;
    isLocal?: boolean;
    isGoogle?: boolean;
}

export interface GoogleCalendarList {
    id: string;
    summary: string;
    backgroundColor: string;
    primary?: boolean;
}
