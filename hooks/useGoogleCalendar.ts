import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { CalendarEvent, CalendarSource } from '../types/calendar';

interface GoogleCalendarHook {
    events: CalendarEvent[];
    calendars: CalendarSource[];
    isLoading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
    login: () => void;
    logout: () => void;
    refresh: () => void;
    createEvent: (event: Partial<CalendarEvent>, options?: { refresh?: boolean }) => Promise<CalendarEvent | null>;
    updateEvent: (event: CalendarEvent, options?: { refresh?: boolean }) => Promise<CalendarEvent | null>;
    deleteEvent: (event: CalendarEvent, options?: { refresh?: boolean }) => Promise<boolean>;
    createCalendar: (name: string, color?: string) => Promise<CalendarSource | null>;
    updateCalendarColor: (id: string, color: string) => Promise<void>;
    toggleCalendarVisibility: (id: string) => void;
}

export function useGoogleCalendar(): GoogleCalendarHook {
    const { data: session, status } = useSession();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<CalendarSource[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasAccessToken = !!(session as any)?.accessToken;
    const authError = (session as any)?.error;
    const isAuthenticated = hasAccessToken && authError !== 'RefreshAccessTokenError';
    const effectiveStatus = status === 'loading' ? 'loading' : (isAuthenticated ? 'authenticated' : 'unauthenticated');

    const mapGoogleEvent = useCallback((event: any): CalendarEvent => ({
        id: event.id,
        title: event.summary || 'Untitled',
        description: event.description,
        start: new Date(event.start?.dateTime || event.start?.date),
        end: new Date(event.end?.dateTime || event.end?.date),
        allDay: !!event.start?.date,
        location: event.location,
        calendarId: event.calendarId || 'primary',
        calendarName: calendars.find((cal) => cal.id === (event.calendarId || 'primary'))?.name || 'Google Calendar',
        color: event.colorId
            ? getColorById(event.colorId)
            : (calendars.find((cal) => cal.id === (event.calendarId || 'primary'))?.color || '#3b82f6'),
        sourceType: 'google',
    }), [calendars]);

    const fetchCalendars = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            const res = await fetch('/api/calendar/calendars');
            if (res.ok) {
                const data = await res.json();
                setCalendars(prev => data.calendars.map((cal: any) => {
                    const existing = prev.find((p) => p.id === cal.id);
                    return {
                        id: cal.id,
                        name: cal.summary,
                        color: cal.backgroundColor || '#3b82f6',
                        visible: existing ? existing.visible : true,
                        isGoogle: true,
                    };
                }));
            }
        } catch (err) {
            console.error('Failed to fetch calendars:', err);
        }
    }, [isAuthenticated]);

    const fetchEvents = useCallback(async () => {
        if (!isAuthenticated) return;

        setIsLoading(true);
        setError(null);

        try {
            const now = new Date();
            const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

            const res = await fetch(`/api/calendar/events?timeMin=${timeMin}&timeMax=${timeMax}`);
            if (res.ok) {
                const data = await res.json();
                setEvents((data.events || []).map(mapGoogleEvent));
            } else {
                throw new Error('Failed to fetch events');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch events');
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, mapGoogleEvent]);

    const createEvent = useCallback(async (event: Partial<CalendarEvent>, options?: { refresh?: boolean }) => {
        if (!isAuthenticated) return null;

        try {
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
                    start: {
                        dateTime: event.allDay ? undefined : event.start?.toISOString(),
                        date: event.allDay ? event.start?.toISOString().split('T')[0] : undefined,
                    },
                    end: {
                        dateTime: event.allDay ? undefined : event.end?.toISOString(),
                        date: event.allDay ? event.end?.toISOString().split('T')[0] : undefined,
                    },
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
                    start: {
                        dateTime: event.allDay ? undefined : event.start?.toISOString(),
                        date: event.allDay ? event.start?.toISOString().split('T')[0] : undefined,
                    },
                    end: {
                        dateTime: event.allDay ? undefined : event.end?.toISOString(),
                        date: event.allDay ? event.end?.toISOString().split('T')[0] : undefined,
                    },
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

    const toggleCalendarVisibility = useCallback((id: string) => {
        setCalendars(prev => prev.map(calendar =>
            calendar.id === id ? { ...calendar, visible: !calendar.visible } : calendar
        ));
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            const load = async () => {
                await fetchCalendars();
                await fetchEvents();
            };
            load();
        }
    }, [isAuthenticated, fetchCalendars, fetchEvents]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = window.setInterval(() => {
            fetchCalendars();
            fetchEvents();
        }, 60 * 1000);
        return () => window.clearInterval(interval);
    }, [isAuthenticated, fetchCalendars, fetchEvents]);

    const refresh = useCallback(() => {
        const load = async () => {
            await fetchCalendars();
            await fetchEvents();
        };
        load();
    }, [fetchCalendars, fetchEvents]);

    return {
        events,
        calendars,
        isLoading,
        error,
        isAuthenticated,
        sessionStatus: effectiveStatus,
        login: () => signIn('google'),
        logout: () => signOut(),
        refresh,
        createEvent,
        updateEvent,
        deleteEvent,
        createCalendar,
        updateCalendarColor,
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
