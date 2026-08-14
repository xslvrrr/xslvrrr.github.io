import { useState, useEffect, useCallback, useRef } from 'react';
import type { CalendarEvent, CalendarSource } from '../types/calendar';
import { scopedBrowserStorageKey } from '../lib/storage-scope';
import { readDesktopBootstrapCache, updateDesktopBootstrapCache } from '../lib/desktop/storage';
import { isDesktopApp } from '../lib/desktop/utils';

const LOCAL_EVENTS_KEY = 'millennium_local_events';
const LOCAL_CALENDARS_KEY = 'millennium_local_calendars';

const normalizeCalendar = (calendar: CalendarSource): CalendarSource => (
    calendar.id === 'classes' ? { ...calendar, icon: 'IconBook' } : calendar
);

interface LocalEventsHook {
    events: CalendarEvent[];
    calendars: CalendarSource[];
    addEvent: (event: Partial<CalendarEvent>) => void;
    updateEvent: (id: string, event: Partial<CalendarEvent>) => void;
    deleteEvent: (id: string) => void;
    toggleCalendarVisibility: (id: string) => void;
    addCalendar: (name: string, color?: string) => CalendarSource | null;
    removeCalendar: (id: string) => void;
    renameCalendar: (id: string, name: string) => void;
    updateCalendarColor: (id: string, color: string) => void;
    updateCalendarIcon: (id: string, icon: string) => void;
}

const defaultCalendars = (): CalendarSource[] => [
    {
        id: 'local',
        name: 'My Events',
        color: '#10b981',
        icon: 'IconCalendarEvent',
        visible: true,
        isLocal: true,
    },
    {
        id: 'classes',
        name: 'Classes',
        color: '#8b5cf6',
        icon: 'IconBook',
        visible: true,
        isLocal: true,
    },
];

export function useLocalEvents(userId?: string): LocalEventsHook {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<CalendarSource[]>(defaultCalendars);
    const hasLoadedRef = useRef(false);
    const hasPendingUserChangeRef = useRef(false);
    const eventsStorageKey = scopedBrowserStorageKey(LOCAL_EVENTS_KEY, userId);
    const calendarsStorageKey = scopedBrowserStorageKey(LOCAL_CALENDARS_KEY, userId);

    const loadFromStorage = useCallback(() => {
        if (!eventsStorageKey || !calendarsStorageKey) return;
        try {
            const savedEvents = localStorage.getItem(eventsStorageKey);
            if (savedEvents) {
                const parsed = JSON.parse(savedEvents);
                setEvents(parsed.map((e: any) => ({
                    ...e,
                    start: new Date(e.start),
                    end: new Date(e.end),
                })));
            }

            const savedCalendars = localStorage.getItem(calendarsStorageKey);
            if (savedCalendars) {
                setCalendars(JSON.parse(savedCalendars).map(normalizeCalendar));
            }
        } catch (err) {
            console.error('Failed to load local events:', err);
        }
    }, [calendarsStorageKey, eventsStorageKey]);

    const loadFromApi = useCallback(async () => {
        if (typeof window === 'undefined') return;
        hasLoadedRef.current = false;
        setEvents([]);
        setCalendars(defaultCalendars());
        try {
            const response = await fetch('/api/user/local-calendar');
            if (response.ok) {
                const payload = await response.json();
                if (Array.isArray(payload.events)) {
                    setEvents(payload.events.map((e: any) => ({
                        ...e,
                        start: new Date(e.start),
                        end: new Date(e.end),
                    })));
                }
                if (Array.isArray(payload.calendars)) {
                    setCalendars(payload.calendars.map(normalizeCalendar));
                }
                hasLoadedRef.current = true;
                return;
            }
        } catch (err) {
            console.error('Failed to load local events from server:', err);
        }

        loadFromStorage();
        hasLoadedRef.current = true;
    }, [loadFromStorage]);

    // Load from API (fallback to localStorage)
    useEffect(() => {
        loadFromApi();
    }, [loadFromApi]);

    useEffect(() => {
        if (typeof window === 'undefined' || !eventsStorageKey || !calendarsStorageKey) return;
        window.addEventListener('assistant-actions-applied', loadFromApi);
        return () => window.removeEventListener('assistant-actions-applied', loadFromApi);
    }, [loadFromApi]);

    const saveTimeoutRef = useRef<number | null>(null);

    const persistLocalData = useCallback(async (nextEvents: CalendarEvent[], nextCalendars: CalendarSource[]) => {
        if (typeof window === 'undefined') return;

        const serializedEvents = nextEvents.map(event => ({
            ...event,
            start: event.start instanceof Date ? event.start.toISOString() : event.start,
            end: event.end instanceof Date ? event.end.toISOString() : event.end,
        }));

        try {
            const response = await fetch('/api/user/local-calendar', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: serializedEvents, calendars: nextCalendars })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to save local calendar to server:', error);
            if (!eventsStorageKey || !calendarsStorageKey) return;
            try {
                localStorage.setItem(eventsStorageKey, JSON.stringify(serializedEvents));
                localStorage.setItem(calendarsStorageKey, JSON.stringify(nextCalendars));
            } catch (storageError) {
                console.error('Failed to save local calendar locally:', storageError);
            }
        }
    }, [calendarsStorageKey, eventsStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!hasLoadedRef.current || !hasPendingUserChangeRef.current) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            hasPendingUserChangeRef.current = false;
            persistLocalData(events, calendars);
        }, 500);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [events, calendars, persistLocalData]);

    const addEvent = useCallback((event: Partial<CalendarEvent>) => {
        if (event.calendarId === 'classes' || event.sourceType === 'class') return;

        const newEvent: CalendarEvent = {
            id: `local_${Date.now()}`,
            title: event.title || 'Untitled',
            description: event.description,
            start: event.start || new Date(),
            end: event.end || new Date(),
            allDay: event.allDay,
            location: event.location,
            calendarId: event.calendarId || 'local',
            calendarName: event.calendarName || 'My Events',
            color: event.color || '#10b981',
            isLocal: true,
        };
        setEvents(prev => [...prev, newEvent]);
        hasPendingUserChangeRef.current = true;
    }, []);

    const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
        setEvents(prev => {
            const index = prev.findIndex(event => event.id === id && event.calendarId !== 'classes');
            if (index === -1) return prev;
            hasPendingUserChangeRef.current = true;
            return prev.map((event, eventIndex) => eventIndex === index ? { ...event, ...updates } : event);
        });
    }, []);

    const deleteEvent = useCallback((id: string) => {
        setEvents(prev => {
            const next = prev.filter(event => event.id !== id || event.calendarId === 'classes');
            if (next.length === prev.length) return prev;
            hasPendingUserChangeRef.current = true;
            return next;
        });
    }, []);

    const toggleCalendarVisibility = useCallback((id: string) => {
        setCalendars(prev => {
            if (!prev.some(calendar => calendar.id === id)) return prev;
            hasPendingUserChangeRef.current = true;
            return prev.map(calendar => calendar.id === id ? { ...calendar, visible: !calendar.visible } : calendar);
        });
    }, []);

    const addCalendar = useCallback((name: string, color = '#3b82f6') => {
        const trimmed = name.trim();
        if (!trimmed) return null;

        const newCalendar: CalendarSource = {
            id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: trimmed,
            color,
            icon: 'IconCalendarEvent',
            visible: true,
            isLocal: true,
        };

        setCalendars(prev => [...prev, newCalendar]);
        hasPendingUserChangeRef.current = true;
        return newCalendar;
    }, []);

    const removeCalendar = useCallback((id: string) => {
        if (id === 'classes') return;
        setCalendars(prev => {
            if (!prev.some(calendar => calendar.id === id)) return prev;
            hasPendingUserChangeRef.current = true;
            return prev.filter(calendar => calendar.id !== id);
        });
        setEvents(prev => prev.filter(event => event.calendarId !== id));
    }, []);

    const renameCalendar = useCallback((id: string, name: string) => {
        if (id === 'classes') return;
        const trimmed = name.trim();
        if (!trimmed) return;
        setCalendars(prev => {
            const current = prev.find(calendar => calendar.id === id);
            if (!current || current.name === trimmed) return prev;
            hasPendingUserChangeRef.current = true;
            return prev.map(calendar => calendar.id === id ? { ...calendar, name: trimmed } : calendar);
        });
    }, []);

    const updateCalendarColor = useCallback((id: string, color: string) => {
        setCalendars(prev => {
            const current = prev.find(calendar => calendar.id === id);
            if (!current || current.color === color) return prev;
            hasPendingUserChangeRef.current = true;
            return prev.map(calendar => calendar.id === id ? { ...calendar, color } : calendar);
        });
    }, []);

    const updateCalendarIcon = useCallback((id: string, icon: string) => {
        setCalendars(prev => {
            const current = prev.find(calendar => calendar.id === id);
            if (!current || current.icon === icon) return prev;
            hasPendingUserChangeRef.current = true;
            return prev.map(calendar => calendar.id === id ? { ...calendar, icon } : calendar);
        });
    }, []);

    return {
        events,
        calendars,
        addEvent,
        updateEvent,
        deleteEvent,
        toggleCalendarVisibility,
        addCalendar,
        removeCalendar,
        renameCalendar,
        updateCalendarColor,
        updateCalendarIcon,
    };
}
