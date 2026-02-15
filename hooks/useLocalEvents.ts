import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent, CalendarSource } from '../types/calendar';

const LOCAL_EVENTS_KEY = 'millennium_local_events';
const LOCAL_CALENDARS_KEY = 'millennium_local_calendars';

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
}

export function useLocalEvents(): LocalEventsHook {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<CalendarSource[]>([
        {
            id: 'local',
            name: 'My Events',
            color: '#10b981',
            visible: true,
            isLocal: true,
        },
        {
            id: 'classes',
            name: 'Classes',
            color: '#8b5cf6',
            visible: true,
            isLocal: true,
        },
    ]);
    const hasLoadedRef = useRef(false);

    // Load from API (fallback to localStorage)
    useEffect(() => {
        let cancelled = false;

        const loadFromStorage = () => {
            try {
                const savedEvents = localStorage.getItem(LOCAL_EVENTS_KEY);
                if (savedEvents) {
                    const parsed = JSON.parse(savedEvents);
                    setEvents(parsed.map((e: any) => ({
                        ...e,
                        start: new Date(e.start),
                        end: new Date(e.end),
                    })));
                }

                const savedCalendars = localStorage.getItem(LOCAL_CALENDARS_KEY);
                if (savedCalendars) {
                    setCalendars(JSON.parse(savedCalendars));
                }
            } catch (err) {
                console.error('Failed to load local events:', err);
            }
        };

        const loadFromApi = async () => {
            if (typeof window === 'undefined') return;
            try {
                const response = await fetch('/api/user/local-calendar');
                if (response.ok) {
                    const payload = await response.json();
                    if (cancelled) return;
                    if (Array.isArray(payload.events)) {
                        setEvents(payload.events.map((e: any) => ({
                            ...e,
                            start: new Date(e.start),
                            end: new Date(e.end),
                        })));
                    }
                    if (Array.isArray(payload.calendars)) {
                        setCalendars(payload.calendars);
                    }
                    hasLoadedRef.current = true;
                    return;
                }
            } catch (err) {
                console.error('Failed to load local events from server:', err);
            }

            loadFromStorage();
            hasLoadedRef.current = true;
        };

        loadFromApi();

        return () => {
            cancelled = true;
        };
    }, []);

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
            try {
                localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(serializedEvents));
                localStorage.setItem(LOCAL_CALENDARS_KEY, JSON.stringify(nextCalendars));
            } catch (storageError) {
                console.error('Failed to save local calendar locally:', storageError);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!hasLoadedRef.current) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            persistLocalData(events, calendars);
        }, 500);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [events, calendars, persistLocalData]);

    const addEvent = useCallback((event: Partial<CalendarEvent>) => {
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
    }, []);

    const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
        setEvents(prev => prev.map(e =>
            e.id === id ? { ...e, ...updates } : e
        ));
    }, []);

    const deleteEvent = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id));
    }, []);

    const toggleCalendarVisibility = useCallback((id: string) => {
        setCalendars(prev => prev.map(c =>
            c.id === id ? { ...c, visible: !c.visible } : c
        ));
    }, []);

    const addCalendar = useCallback((name: string, color = '#3b82f6') => {
        const trimmed = name.trim();
        if (!trimmed) return null;

        const newCalendar: CalendarSource = {
            id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: trimmed,
            color,
            visible: true,
            isLocal: true,
        };

        setCalendars(prev => [...prev, newCalendar]);
        return newCalendar;
    }, []);

    const removeCalendar = useCallback((id: string) => {
        setCalendars(prev => prev.filter(c => c.id !== id));
        setEvents(prev => prev.filter(e => e.calendarId !== id));
    }, []);

    const renameCalendar = useCallback((id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setCalendars(prev => prev.map(calendar =>
            calendar.id === id ? { ...calendar, name: trimmed } : calendar
        ));
    }, []);

    const updateCalendarColor = useCallback((id: string, color: string) => {
        setCalendars(prev => prev.map(calendar =>
            calendar.id === id ? { ...calendar, color } : calendar
        ));
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
    };
}
