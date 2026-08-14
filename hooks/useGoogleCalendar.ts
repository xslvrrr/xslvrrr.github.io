import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from '@/start/session';
import type { CalendarEvent, CalendarSource } from '../types/calendar';
import { formatCalendarDate, parseCalendarDate, toExclusiveAllDayEnd } from '../lib/calendar-date';
import { fetchRequiredJsonWithTimeout, HttpProtocolError } from '../lib/http';

export interface CalendarEventRange {
    /** Inclusive visible-range start. */
    start: Date;
    /** Exclusive visible-range end. */
    end: Date;
}

interface GoogleEventsPage {
    events: unknown[];
    nextPageToken?: string | null;
}

interface GoogleCalendarsPage {
    calendars: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isGoogleEventsPage(value: unknown): value is GoogleEventsPage {
    return isRecord(value)
        && Array.isArray(value.events)
        && (value.nextPageToken === undefined || value.nextPageToken === null || typeof value.nextPageToken === 'string');
}

function isGoogleCalendarsPage(value: unknown): value is GoogleCalendarsPage {
    return isRecord(value) && Array.isArray(value.calendars);
}

function readResponseMessage(value: unknown, fallback: string): string {
    if (!isRecord(value)) return fallback;
    const message = typeof value.message === 'string' ? value.message : value.error;
    return typeof message === 'string' && message.trim() ? message : fallback;
}

function defaultEventRange(now = new Date()): CalendarEventRange {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    return { start, end };
}

function normalizeEventRange(range: CalendarEventRange): CalendarEventRange {
    const start = new Date(range.start);
    const end = new Date(range.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
        throw new RangeError('Calendar event range must have valid dates and an exclusive end after its start');
    }
    return { start, end };
}

function serializeGoogleEventTimes(event: Partial<CalendarEvent>) {
    const start = event.start instanceof Date ? event.start : null;
    const end = event.end instanceof Date ? event.end : null;
    if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        throw new RangeError('Calendar event requires valid start and end dates');
    }

    if (event.allDay) {
        return {
            start: { date: formatCalendarDate(start) },
            end: { date: toExclusiveAllDayEnd(start, end) },
        };
    }
    if (end.getTime() <= start.getTime()) {
        throw new RangeError('Calendar event end must be after its start');
    }
    return {
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
    };
}

interface GoogleCalendarHook {
    events: CalendarEvent[];
    calendars: CalendarSource[];
    isLoading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
    login: () => void;
    logout: () => void;
    /** Refresh current range, or fetch one supplied range without changing navigation state. */
    refresh: (range?: CalendarEventRange) => Promise<void>;
    /** Persist visible range; changing it triggers a refresh. */
    setVisibleRange: (range: CalendarEventRange) => void;
    createEvent: (event: Partial<CalendarEvent>, options?: { refresh?: boolean }) => Promise<CalendarEvent | null>;
    updateEvent: (event: CalendarEvent, options?: { refresh?: boolean }) => Promise<CalendarEvent | null>;
    deleteEvent: (event: CalendarEvent, options?: { refresh?: boolean }) => Promise<boolean>;
    createCalendar: (name: string, color?: string) => Promise<CalendarSource | null>;
    updateCalendarColor: (id: string, color: string) => Promise<void>;
    updateCalendarIcon: (id: string, icon: string) => void;
    toggleCalendarVisibility: (id: string) => void;
}

export function useGoogleCalendar(): GoogleCalendarHook {
    const { data: session, status } = useSession();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<CalendarSource[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [visibleRange, setVisibleRangeState] = useState<CalendarEventRange>(() => defaultEventRange());
    const calendarsRef = useRef<CalendarSource[]>([]);
    const eventsRequestIdRef = useRef(0);

    useEffect(() => {
        calendarsRef.current = calendars;
    }, [calendars]);

    const hasAccessToken = !!(session as any)?.accessToken;
    const authError = (session as any)?.error;
    const isAuthenticated = hasAccessToken && authError !== 'RefreshAccessTokenError';
    const effectiveStatus = status === 'loading' ? 'loading' : (isAuthenticated ? 'authenticated' : 'unauthenticated');

    const mapGoogleEvent = useCallback((value: unknown): CalendarEvent | null => {
        if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.start) || !isRecord(value.end)) {
            return null;
        }

        const allDay = typeof value.start.date === 'string';
        const start = allDay
            ? parseCalendarDate(value.start.date)
            : typeof value.start.dateTime === 'string' ? new Date(value.start.dateTime) : null;
        const end = allDay
            ? parseCalendarDate(value.end.date)
            : typeof value.end.dateTime === 'string' ? new Date(value.end.dateTime) : null;
        if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;

        const calendarId = typeof value.calendarId === 'string' ? value.calendarId : 'primary';
        const calendar = calendarsRef.current.find((candidate) => candidate.id === calendarId);
        return {
            id: value.id,
            title: typeof value.summary === 'string' && value.summary.trim() ? value.summary : 'Untitled',
            description: typeof value.description === 'string' ? value.description : undefined,
            start,
            end,
            allDay,
            location: typeof value.location === 'string' ? value.location : undefined,
            calendarId,
            calendarName: calendar?.name || 'Google Calendar',
            color: typeof value.colorId === 'string'
                ? getColorById(value.colorId)
                : (calendar?.color || '#3b82f6'),
            sourceType: 'google',
        };
    }, []);

    const fetchCalendars = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            const { response, data } = await fetchRequiredJsonWithTimeout<unknown>(
                '/api/calendar/calendars',
                {},
                { name: 'Google Calendar list response' },
            );
            if (!response.ok) throw new Error(readResponseMessage(data, 'Failed to fetch calendars'));
            if (!isGoogleCalendarsPage(data)) {
                throw new HttpProtocolError(response, 'Google Calendar list response did not match the expected contract');
            }

            setCalendars((previous) => {
                const next = data.calendars.flatMap((value): CalendarSource[] => {
                    if (!isRecord(value) || typeof value.id !== 'string') return [];
                    const existing = previous.find((candidate) => candidate.id === value.id);
                    return [{
                        id: value.id,
                        name: typeof value.summary === 'string' && value.summary.trim() ? value.summary : 'Google Calendar',
                        color: typeof value.backgroundColor === 'string' ? value.backgroundColor : '#3b82f6',
                        visible: existing ? existing.visible : true,
                        icon: existing?.icon || 'IconBrandGoogle',
                        isGoogle: true,
                    }];
                });
                calendarsRef.current = next;
                return next;
            });
        } catch (err) {
            console.error('Failed to fetch calendars:', err);
        }
    }, [isAuthenticated]);

    const fetchEvents = useCallback(async (requestedRange: CalendarEventRange = visibleRange) => {
        if (!isAuthenticated) return;

        const requestId = ++eventsRequestIdRef.current;
        setIsLoading(true);
        setError(null);

        try {
            const range = normalizeEventRange(requestedRange);
            const collected = new Map<string, CalendarEvent>();
            const seenPageTokens = new Set<string>();
            let pageToken: string | undefined;
            let completed = false;

            for (let page = 0; page < 50; page += 1) {
                const params = new URLSearchParams({
                    timeMin: range.start.toISOString(),
                    timeMax: range.end.toISOString(),
                });
                if (pageToken) params.set('pageToken', pageToken);

                const { response, data } = await fetchRequiredJsonWithTimeout<unknown>(
                    `/api/calendar/events?${params.toString()}`,
                    {},
                    { name: 'Google Calendar events response' },
                );
                if (!response.ok) throw new Error(readResponseMessage(data, 'Failed to fetch events'));
                if (!isGoogleEventsPage(data)) {
                    throw new HttpProtocolError(response, 'Google Calendar events response did not match the expected contract');
                }

                for (const value of data.events) {
                    const mapped = mapGoogleEvent(value);
                    if (mapped) collected.set(mapped.id, mapped);
                }

                const nextPageToken = data.nextPageToken?.trim();
                if (!nextPageToken) {
                    completed = true;
                    break;
                }
                if (seenPageTokens.has(nextPageToken)) {
                    throw new HttpProtocolError(response, 'Google Calendar events response repeated a page token');
                }
                seenPageTokens.add(nextPageToken);
                pageToken = nextPageToken;
            }

            if (!completed) throw new Error('Google Calendar pagination exceeded the 50-page safety limit');
            if (requestId === eventsRequestIdRef.current) setEvents([...collected.values()]);
        } catch (err) {
            if (requestId === eventsRequestIdRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to fetch events');
            }
        } finally {
            if (requestId === eventsRequestIdRef.current) setIsLoading(false);
        }
    }, [isAuthenticated, mapGoogleEvent, visibleRange]);

    const createEvent = useCallback(async (event: Partial<CalendarEvent>, options?: { refresh?: boolean }) => {
        if (!isAuthenticated) return null;

        try {
            const eventTimes = serializeGoogleEventTimes(event);
            const res = await fetch('/api/calendar/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendarId: event.calendarId || 'primary',
                    summary: event.title,
                    description: event.description,
                    location: event.location,
                    color: event.color,
                    sourceType: event.sourceType,
                    ...eventTimes,
                }),
            });

            if (!res.ok) throw new Error('Failed to create event');
            const payload = await res.json();
            if (options?.refresh !== false) {
                await fetchEvents();
            }
            return payload?.event ? mapGoogleEvent({ ...payload.event, calendarId: event.calendarId || 'primary' }) : null;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create event');
            return null;
        }
    }, [isAuthenticated, fetchEvents, mapGoogleEvent]);

    const updateEvent = useCallback(async (event: CalendarEvent, options?: { refresh?: boolean }) => {
        if (!isAuthenticated) return null;

        try {
            const eventTimes = serializeGoogleEventTimes(event);
            const res = await fetch('/api/calendar/event', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: event.id,
                    calendarId: (event as any).sourceCalendarId || event.calendarId || 'primary',
                    targetCalendarId: (event as any).targetCalendarId,
                    summary: event.title,
                    description: event.description,
                    location: event.location,
                    allDay: event.allDay,
                    color: event.color,
                    ...eventTimes,
                }),
            });

            if (!res.ok) throw new Error('Failed to update event');
            const payload = await res.json();
            if (options?.refresh !== false) {
                await fetchEvents();
            }
            return payload?.event ? mapGoogleEvent({ ...payload.event, calendarId: event.calendarId || 'primary' }) : null;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update event');
            return null;
        }
    }, [isAuthenticated, fetchEvents, mapGoogleEvent]);

    const deleteEvent = useCallback(async (event: CalendarEvent, options?: { refresh?: boolean }) => {
        if (!isAuthenticated) return false;

        try {
            const res = await fetch('/api/calendar/event', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: event.id,
                    calendarId: event.calendarId || 'primary',
                }),
            });
            if (!res.ok) throw new Error('Failed to delete event');
            if (options?.refresh !== false) {
                await fetchEvents();
            }
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete event');
            return false;
        }
    }, [isAuthenticated, fetchEvents]);

    const createCalendar = useCallback(async (name: string, color = '#3b82f6') => {
        if (!isAuthenticated) return null;
        const trimmed = name.trim();
        if (!trimmed) return null;

        try {
            const res = await fetch('/api/calendar/calendars', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ summary: trimmed, backgroundColor: color }),
            });
            if (!res.ok) throw new Error('Failed to create calendar');
            const payload = await res.json();
            await fetchCalendars();
            await fetchEvents();
            return payload?.calendar ? {
                id: payload.calendar.id,
                name: payload.calendar.summary || trimmed,
                color: payload.calendar.backgroundColor || color,
                icon: 'IconBrandGoogle',
                visible: true,
                isGoogle: true,
            } : null;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create calendar');
            return null;
        }
    }, [isAuthenticated, fetchCalendars, fetchEvents]);

    const updateCalendarColor = useCallback(async (id: string, color: string) => {
        if (!isAuthenticated) return;
        try {
            const res = await fetch('/api/calendar/calendars', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ calendarId: id, backgroundColor: color }),
            });
            if (!res.ok) throw new Error('Failed to update calendar color');
            setCalendars(prev => prev.map(calendar => calendar.id === id ? { ...calendar, color } : calendar));
            await fetchEvents();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update calendar color');
        }
    }, [isAuthenticated, fetchEvents]);

    const updateCalendarIcon = useCallback((id: string, icon: string) => {
        setCalendars(prev => prev.map(calendar =>
            calendar.id === id ? { ...calendar, icon } : calendar
        ));
    }, []);

    const toggleCalendarVisibility = useCallback((id: string) => {
        setCalendars(prev => prev.map(calendar =>
            calendar.id === id ? { ...calendar, visible: !calendar.visible } : calendar
        ));
    }, []);

    const setVisibleRange = useCallback((range: CalendarEventRange) => {
        const normalized = normalizeEventRange(range);
        setVisibleRangeState((current) => (
            current.start.getTime() === normalized.start.getTime()
            && current.end.getTime() === normalized.end.getTime()
                ? current
                : normalized
        ));
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            const load = async () => {
                await fetchCalendars();
                await fetchEvents();
            };
            void load();
        } else {
            eventsRequestIdRef.current += 1;
            calendarsRef.current = [];
            setEvents([]);
            setCalendars([]);
            setIsLoading(false);
            setError(null);
        }
    }, [isAuthenticated, fetchCalendars, fetchEvents]);

    const refresh = useCallback(async (range?: CalendarEventRange) => {
        await fetchCalendars();
        await fetchEvents(range);
    }, [fetchCalendars, fetchEvents]);

    return {
        events,
        calendars,
        isLoading,
        error,
        isAuthenticated,
        sessionStatus: effectiveStatus,
        login: () => setError('Google Calendar is not available until OAuth approval and deployment are complete.'),
        logout: () => signOut(),
        refresh,
        setVisibleRange,
        createEvent,
        updateEvent,
        deleteEvent,
        createCalendar,
        updateCalendarColor,
        updateCalendarIcon,
        toggleCalendarVisibility,
    };
}

function getColorById(colorId: string): string {
    const colors: Record<string, string> = {
        '1': '#7986cb',
        '2': '#33b679',
        '3': '#8e24aa',
        '4': '#e67c73',
        '5': '#f6c026',
        '6': '#f5511d',
        '7': '#039be5',
        '8': '#616161',
        '9': '#3f51b5',
        '10': '#0b8043',
        '11': '#d60000',
    };
    return colors[colorId] || '#3b82f6';
}
