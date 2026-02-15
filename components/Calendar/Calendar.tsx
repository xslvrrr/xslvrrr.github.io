import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CalendarEvent as CalendarEventType, CalendarSource } from '../../types/calendar';
import { Notice } from '../../types/portal';
import CalendarSidebar from './CalendarSidebar';
import CalendarEventComponent from './CalendarEventComponent';
import AddEventModal from './AddEventModal';
import styles from './Calendar.module.css';
import {
    IconChevronLeft,
    IconChevronRight,
    IconPlus,
    IconEdit,
    IconTrash,
    IconCopy,
} from '@tabler/icons-react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '../ui/context-menu';

interface CalendarProps {
    events: CalendarEventType[];
    calendars: CalendarSource[];
    onCreateEvent?: (event: Partial<CalendarEventType>) => void;
    onUpdateEvent?: (event: CalendarEventType) => void;
    onDeleteEvent?: (event: CalendarEventType) => void;
    onToggleCalendar?: (calendarId: string) => void;
    classEvents?: CalendarEventType[];
    isLoading?: boolean;
    notices?: (Notice & { originalIndex?: number })[];
    onNoticeClick?: (notice: any) => void;
    hasNotification?: boolean;
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    eventColorMode?: 'independent' | 'calendar';
    onCreateCalendar?: (name: string, color?: string) => void;
    onRemoveCalendar?: (calendarId: string) => void;
    onRenameCalendar?: (calendarId: string, name: string) => void;
    onChangeCalendarColor?: (calendarId: string, color: string) => void;
    duplicateCount?: number;
    onSmartClean?: () => void;
    smartCleanBusy?: boolean;
    smartCleanHint?: string;
    monthDayClickView?: 'day' | 'week';
    // External control props
    externalViewMode?: ViewMode;
    externalGoToToday?: number; // Increment to trigger go to today
    showCreateModal?: boolean;
    onCreateModalClose?: () => void;
}

type ViewMode = 'day' | 'week' | 'month';

// All 24 hours
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const EMPTY_EVENTS: CalendarEventType[] = [];
type TimedEventBucketItem = { event: CalendarEventType; start: Date; end: Date };
const EMPTY_TIMED_EVENTS: TimedEventBucketItem[] = [];

const toDayKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function Calendar({
    events,
    calendars,
    onCreateEvent,
    onUpdateEvent,
    onDeleteEvent,
    onToggleCalendar,
    classEvents = [],
    isLoading = false,
    notices = [],
    onNoticeClick,
    hasNotification = false,
    firstDayOfWeek = 1,
    eventColorMode = 'independent',
    onCreateCalendar,
    onRemoveCalendar,
    onRenameCalendar,
    onChangeCalendarColor,
    duplicateCount = 0,
    onSmartClean,
    smartCleanBusy = false,
    smartCleanHint,
    monthDayClickView = 'day',
    externalViewMode,
    externalGoToToday,
    showCreateModal = false,
    onCreateModalClose,
}: CalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>(externalViewMode || 'week');
    const [prevViewMode, setPrevViewMode] = useState<ViewMode>('week');
    const [showAddModal, setShowAddModal] = useState(false);
    const [isClosingModal, setIsClosingModal] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{ date: Date; hour: number } | null>(null);
    const [createAllDayDefault, setCreateAllDayDefault] = useState(false);
    const [editingEvent, setEditingEvent] = useState<CalendarEventType | null>(null);
    const [duplicatingEvent, setDuplicatingEvent] = useState<CalendarEventType | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationClass, setAnimationClass] = useState('');

    // Transition state for seamless view changes
    const [transitionType, setTransitionType] = useState<string | null>(null);
    const [transitionPhase, setTransitionPhase] = useState<'idle' | 'animating' | 'ending'>('idle');
    const [transitionApplied, setTransitionApplied] = useState(false);

    // Ref for external go to today trigger
    const prevGoToTodayRef = useRef(externalGoToToday);

    // View toggle refs for sliding indicator
    const toggleContainerRef = useRef<HTMLDivElement>(null);
    const dayBtnRef = useRef<HTMLButtonElement>(null);
    const weekBtnRef = useRef<HTMLButtonElement>(null);
    const monthBtnRef = useRef<HTMLButtonElement>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

    // Live current time synced to system clock (minute resolution for performance)
    const [currentTime, setCurrentTime] = useState(new Date());
    const timeGridRef = useRef<HTMLDivElement>(null);
    const minuteIntervalRef = useRef<number | null>(null);

    // Update time every minute, aligned to the next minute boundary
    useEffect(() => {
        const syncToMinute = () => {
            setCurrentTime(new Date());
        };

        syncToMinute();
        const now = new Date();
        const msToNextMinute = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds();

        const alignTimeout = setTimeout(() => {
            syncToMinute();
            minuteIntervalRef.current = window.setInterval(syncToMinute, 60 * 1000);
        }, msToNextMinute);

        return () => {
            clearTimeout(alignTimeout);
            if (minuteIntervalRef.current) {
                window.clearInterval(minuteIntervalRef.current);
                minuteIntervalRef.current = null;
            }
        };
    }, []);

    // Scroll to current time on mount and view change
    useEffect(() => {
        if (timeGridRef.current && (viewMode === 'week' || viewMode === 'day')) {
            const currentHour = new Date().getHours();
            const scrollToHour = Math.max(0, currentHour - 2);
            const scrollPosition = scrollToHour * 60;
            timeGridRef.current.scrollTop = scrollPosition;
        }
    }, [viewMode]);

    // Update sliding indicator position and width
    useEffect(() => {
        const updateIndicator = () => {
            const container = toggleContainerRef.current;
            const activeBtn = viewMode === 'day' ? dayBtnRef.current :
                viewMode === 'week' ? weekBtnRef.current : monthBtnRef.current;

            if (container && activeBtn) {
                const containerRect = container.getBoundingClientRect();
                const btnRect = activeBtn.getBoundingClientRect();
                setIndicatorStyle({
                    left: btnRect.left - containerRect.left,
                    width: btnRect.width,
                });
            }
        };

        // Small delay to ensure DOM is ready
        requestAnimationFrame(updateIndicator);
    }, [viewMode]);

    // Get the start of the current week (Sunday/Monday based on user setting)
    const weekStart = useMemo(() => {
        const date = new Date(currentDate);
        const day = date.getDay(); // Sunday=0
        const offset = (day - firstDayOfWeek + 7) % 7;
        date.setDate(date.getDate() - offset);
        date.setHours(0, 0, 0, 0);
        return date;
    }, [currentDate, firstDayOfWeek]);

    // Generate week days
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            return date;
        });
    }, [weekStart]);

    // Generate month days - dynamically calculate rows needed
    const monthDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const startPad = (firstDay.getDay() - firstDayOfWeek + 7) % 7;
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const prevMonthLast = new Date(year, month, 0);
        const prevMonthDays = prevMonthLast.getDate();

        // Render only required calendar rows (5 or 6 weeks).
        const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

        const days: { date: Date; isCurrentMonth: boolean }[] = [];

        // Previous month padding
        for (let i = startPad - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, month - 1, prevMonthDays - i),
                isCurrentMonth: false,
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(year, month, i),
                isCurrentMonth: true,
            });
        }

        // Next month padding
        const remaining = totalCells - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false,
            });
        }

        return days;
    }, [currentDate, firstDayOfWeek]);

    // Calculate number of rows for month grid
    const monthGridRows = useMemo(() => {
        return Math.ceil(monthDays.length / 7);
    }, [monthDays]);


    // Combine all visible events
    const allEvents = useMemo(() => {
        const visibleCalendarIds = new Set(calendars.filter(c => c.visible).map(c => c.id));
        return [...events, ...classEvents].filter(
            e => visibleCalendarIds.has(e.calendarId)
        );
    }, [events, classEvents, calendars]);

    const calendarMap = useMemo(() => {
        return new Map(calendars.map(calendar => [calendar.id, calendar]));
    }, [calendars]);

    const getEventColor = useCallback((event: CalendarEventType) => {
        if (eventColorMode === 'calendar') {
            return calendarMap.get(event.calendarId)?.color || event.color || '#3b82f6';
        }
        return event.color || calendarMap.get(event.calendarId)?.color || '#3b82f6';
    }, [eventColorMode, calendarMap]);

    const coloredEvents = useMemo(
        () => allEvents.map(event => ({ ...event, color: getEventColor(event) })),
        [allEvents, getEventColor]
    );

    const usedColours = useMemo(
        () => coloredEvents.map(e => e.color).filter(Boolean) as string[],
        [coloredEvents]
    );

    const { eventsByDay, allDayEventsByDay, timedEventsByDayHour } = useMemo(() => {
        const dayMap = new Map<string, CalendarEventType[]>();
        const allDayMap = new Map<string, CalendarEventType[]>();
        const timedMap = new Map<string, TimedEventBucketItem[]>();

        for (const event of coloredEvents) {
            const start = new Date(event.start);
            const end = new Date(event.end);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

            const dayKey = toDayKey(start);
            const dayEvents = dayMap.get(dayKey);
            if (dayEvents) {
                dayEvents.push(event);
            } else {
                dayMap.set(dayKey, [event]);
            }

            if (event.allDay) {
                const allDayEvents = allDayMap.get(dayKey);
                if (allDayEvents) {
                    allDayEvents.push(event);
                } else {
                    allDayMap.set(dayKey, [event]);
                }
            } else {
                const hourKey = `${dayKey}:${start.getHours()}`;
                const timedEvents = timedMap.get(hourKey);
                const timedEntry = { event, start, end };
                if (timedEvents) {
                    timedEvents.push(timedEntry);
                } else {
                    timedMap.set(hourKey, [timedEntry]);
                }
            }
        }

        const sortByStart = (a: CalendarEventType, b: CalendarEventType) =>
            new Date(a.start).getTime() - new Date(b.start).getTime();

        dayMap.forEach((value) => value.sort(sortByStart));
        allDayMap.forEach((value) => value.sort(sortByStart));
        timedMap.forEach((value) => value.sort((a, b) => a.start.getTime() - b.start.getTime()));

        return {
            eventsByDay: dayMap,
            allDayEventsByDay: allDayMap,
            timedEventsByDayHour: timedMap,
        };
    }, [coloredEvents]);

    const getEventsForDay = useCallback((date: Date) => {
        return eventsByDay.get(toDayKey(date)) || EMPTY_EVENTS;
    }, [eventsByDay]);

    const getAllDayEventsForDay = useCallback((date: Date) => {
        return allDayEventsByDay.get(toDayKey(date)) || EMPTY_EVENTS;
    }, [allDayEventsByDay]);

    const getTimedEventsForDayHour = useCallback((date: Date, hour: number) => {
        return timedEventsByDayHour.get(`${toDayKey(date)}:${hour}`) || EMPTY_TIMED_EVENTS;
    }, [timedEventsByDayHour]);

    // Handle transition applied state for CSS transitions
    const isDayWeekTransition = transitionType === 'dayToWeek' || transitionType === 'weekToDay';
    const isWeekMonthTransition = transitionType === 'weekToMonth' || transitionType === 'monthToWeek';
    const isDayMonthTransition = transitionType === 'dayToMonth' || transitionType === 'monthToDay';

    useEffect(() => {
        if (isDayWeekTransition) {
            // Use double requestAnimationFrame to ensure browser paints initial state
            // before we trigger the transition
            let rafId1: number;
            let rafId2: number;

            rafId1 = requestAnimationFrame(() => {
                // First RAF: schedule for next frame
                rafId2 = requestAnimationFrame(() => {
                    // Second RAF: browser has painted initial state
                    setTransitionApplied(true);
                });
            });

            return () => {
                cancelAnimationFrame(rafId1);
                cancelAnimationFrame(rafId2);
            };
        } else {
            setTransitionApplied(false);
        }
    }, [transitionType]);

    // View mode change with seamless transition animations
    const changeViewMode = (newMode: ViewMode) => {
        if (newMode === viewMode) return;

        const from = viewMode;
        const to = newMode;

        setPrevViewMode(viewMode);
        setIsAnimating(true);

        // Determine transition type
        let transition = '';
        if (from === 'day' && to === 'week') transition = 'dayToWeek';
        else if (from === 'week' && to === 'day') transition = 'weekToDay';
        else if (from === 'week' && to === 'month') transition = 'weekToMonth';
        else if (from === 'month' && to === 'week') transition = 'monthToWeek';
        else if (from === 'day' && to === 'month') transition = 'dayToMonth';
        else if (from === 'month' && to === 'day') transition = 'monthToDay';

        setTransitionType(transition);
        setTransitionPhase('animating');

        // For day<->week, we render all 7 days during the transition
        // Both directions: keep current view during animation, switch after
        if (transition === 'dayToWeek') {
            // Keep showing day view (which shows weekDays during transition)
            // Animate, then switch view mode at the end
            setTimeout(() => {
                setTransitionPhase('ending');
                // Switch view mode after animation completes
                setTimeout(() => {
                    setViewMode(newMode);
                    setIsAnimating(false);
                    setTransitionType(null);
                    setTransitionPhase('idle');
                }, 420);
            }, 20);
        } else if (transition === 'weekToDay') {
            // Don't switch view mode yet - animate first, then switch
            setTimeout(() => {
                setTransitionPhase('ending');
                // Switch view mode after animation completes
                setTimeout(() => {
                    setViewMode(newMode);
                    setIsAnimating(false);
                    setTransitionType(null);
                    setTransitionPhase('idle');
                }, 420);
            }, 20);
        } else if (transition === 'weekToMonth' || transition === 'monthToWeek' || transition === 'dayToMonth' || transition === 'monthToDay') {
            // Week↔Month and Day↔Month: simple crossfade
            // Switch view mode immediately, let CSS handle the fade
            setViewMode(newMode);
            setTimeout(() => {
                setTransitionPhase('ending');
                setTimeout(() => {
                    setIsAnimating(false);
                    setTransitionType(null);
                    setTransitionPhase('idle');
                }, 300);
            }, 20);
        }
    };

    // Navigation handlers
    const getNavAmount = () => {
        switch (viewMode) {
            case 'day': return 1;
            case 'week': return 7;
            case 'month': return 0; // Special handling for month
        }
    };

    const goToToday = () => {
        setAnimationClass(styles.fadeSlide);
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentDate(new Date());
            setIsAnimating(false);
            setAnimationClass('');
        }, 200);
    };

    const goToPrev = () => {
        setAnimationClass(styles.slideRight);
        setIsAnimating(true);
        setTimeout(() => {
            const newDate = new Date(currentDate);
            if (viewMode === 'month') {
                newDate.setMonth(newDate.getMonth() - 1);
            } else {
                newDate.setDate(newDate.getDate() - getNavAmount());
            }
            setCurrentDate(newDate);
            setAnimationClass(styles.slideLeftEnter);
            setTimeout(() => {
                setIsAnimating(false);
                setAnimationClass('');
            }, 200);
        }, 150);
    };

    const goToNext = () => {
        setAnimationClass(styles.slideLeft);
        setIsAnimating(true);
        setTimeout(() => {
            const newDate = new Date(currentDate);
            if (viewMode === 'month') {
                newDate.setMonth(newDate.getMonth() + 1);
            } else {
                newDate.setDate(newDate.getDate() + getNavAmount());
            }
            setCurrentDate(newDate);
            setAnimationClass(styles.slideRightEnter);
            setTimeout(() => {
                setIsAnimating(false);
                setAnimationClass('');
            }, 200);
        }, 150);
    };

    // External view mode control
    useEffect(() => {
        if (externalViewMode && externalViewMode !== viewMode) {
            changeViewMode(externalViewMode);
        }
    }, [externalViewMode]);

    // External go to today trigger
    useEffect(() => {
        if (externalGoToToday !== undefined && externalGoToToday !== prevGoToTodayRef.current) {
            prevGoToTodayRef.current = externalGoToToday;
            goToToday();
        }
    }, [externalGoToToday]);

    // External create modal trigger
    useEffect(() => {
        if (showCreateModal && !showAddModal) {
            setEditingEvent(null);
            setCreateAllDayDefault(false);
            setSelectedSlot({ date: new Date(), hour: new Date().getHours() });
            setShowAddModal(true);
            onCreateModalClose?.();
        }
    }, [showCreateModal, showAddModal, onCreateModalClose]);

    // Header title
    const headerTitle = useMemo(() => {
        if (viewMode === 'day') {
            return currentDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
        }
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [currentDate, viewMode]);

    // Check if a date is today
    const isToday = (date: Date) => {
        const today = new Date();
        return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
        );
    };

    // Handle time slot click - FIX: Create new Date properly
    const handleSlotClick = (date: Date, hour: number) => {
        const clickedDate = new Date(date);
        clickedDate.setHours(hour, 0, 0, 0);
        setCreateAllDayDefault(false);
        setSelectedSlot({ date: clickedDate, hour });
        setEditingEvent(null);
        setShowAddModal(true);
    };

    const handleAllDaySlotClick = (date: Date) => {
        const clickedDate = new Date(date);
        clickedDate.setHours(9, 0, 0, 0);
        setCreateAllDayDefault(true);
        setSelectedSlot({ date: clickedDate, hour: 9 });
        setEditingEvent(null);
        setShowAddModal(true);
    };

    // Handle event click for editing
    const handleEventClick = (event: CalendarEventType) => {
        setCreateAllDayDefault(false);
        setEditingEvent(event);
        setSelectedSlot(null);
        setShowAddModal(true);
    };

    // Close modal with animation
    const closeModal = () => {
        setIsClosingModal(true);
        setTimeout(() => {
            setShowAddModal(false);
            setIsClosingModal(false);
            setSelectedSlot(null);
            setEditingEvent(null);
            setCreateAllDayDefault(false);
        }, 200);
    };

    // Current time position (percentage of day)
    const currentTimePosition = useMemo(() => {
        const hours = currentTime.getHours();
        const minutes = currentTime.getMinutes();
        return ((hours * 60 + minutes) / (24 * 60)) * 100;
    }, [currentTime]);

    // Format current time
    const currentTimeLabel = useMemo(() => {
        return currentTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }, [currentTime]);

    // Check if viewing current time period
    const isCurrentPeriod = useMemo(() => {
        const today = new Date();
        if (viewMode === 'day') {
            return isToday(currentDate);
        }
        return weekDays.some(day => isToday(day));
    }, [weekDays, currentDate, viewMode]);

    // Render Week/Day time grid
    const renderTimeGrid = (days: Date[]) => {
        // During day<->week transitions, always render all 7 days
        const isDayWeekTransition = transitionType === 'dayToWeek' || transitionType === 'weekToDay';
        const daysToRender = isDayWeekTransition ? weekDays : days;

        // Calculate flex values for each day during transition
        const getDayFlex = (day: Date, index: number): number => {
            if (!isDayWeekTransition || transitionPhase === 'idle') {
                return 1; // Equal flex for all
            }

            const isCurrentDay = day.toDateString() === currentDate.toDateString();

            if (transitionType === 'dayToWeek') {
                // Day -> Week: current day shrinks from 7 to 1, others grow from 0 to 1
                if (transitionPhase === 'animating') {
                    return isCurrentDay ? 1 : 1; // After initial state, all equal
                }
                return 1;
            } else if (transitionType === 'weekToDay') {
                // Week -> Day: current day grows, others shrink
                if (transitionPhase === 'animating') {
                    return isCurrentDay ? 1 : 1; // During transition, all visible
                }
                return 1;
            }
            return 1;
        };

        // Get initial styles for day columns (before CSS transition is applied)
        const getDayStyle = (day: Date, index: number): React.CSSProperties => {
            const isCurrentDay = day.toDateString() === currentDate.toDateString();

            if (transitionType === 'dayToWeek' && !transitionApplied) {
                // Starting state: current day is full width, others are hidden
                if (isCurrentDay) {
                    return {
                        flex: 7,
                        opacity: 1,
                        overflow: 'hidden',
                        transition: 'flex 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                        minWidth: 0,
                    };
                } else {
                    return {
                        flex: 0,
                        opacity: 0,
                        overflow: 'hidden',
                        transition: 'flex 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                        minWidth: 0,
                        width: 0,
                        padding: 0,
                    };
                }
            } else if (transitionType === 'weekToDay' && !transitionApplied) {
                // Starting state: all days visible
                return {
                    flex: 1,
                    opacity: 1,
                    overflow: 'hidden',
                    transition: 'flex 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
                    minWidth: 0,
                };
            }

            return {};
        };

        // Get CSS classes for day column during transition
        const getDayColumnClasses = (day: Date, index: number): string => {
            const isCurrentDay = day.toDateString() === currentDate.toDateString();
            const classes = [styles.dayColumn];

            if (viewMode === 'day' && !isDayWeekTransition) {
                classes.push(styles.singleDay);
            }

            if (!isDayWeekTransition) {
                return classes.join(' ');
            }

            if (transitionType === 'dayToWeek') {
                if (!transitionApplied) {
                    // Initial state: NO TRANSITION CLASS - just hide/show instantly
                    classes.push(isCurrentDay ? styles.dayColumnExpanded : styles.dayColumnHidden);
                } else {
                    // End state: add transition class to animate to normal
                    classes.push(styles.dayColumnAnimating);
                    classes.push(styles.dayColumnNormal);
                }
            } else if (transitionType === 'weekToDay') {
                if (!transitionApplied) {
                    // Initial state: NO TRANSITION CLASS
                    classes.push(styles.dayColumnNormal);
                } else {
                    // End state: add transition class to animate
                    classes.push(styles.dayColumnAnimating);
                    classes.push(isCurrentDay ? styles.dayColumnExpanded : styles.dayColumnHidden);
                }
            }

            return classes.join(' ');
        };

        return (
            <div className={`${styles.timeGridWrapper}`} ref={timeGridRef}>
                <div className={styles.timeGrid}>
                    {/* Time column with hour labels */}
                    <div className={styles.timeColumn}>
                        {HOURS.map(hour => (
                            <div key={hour} className={styles.timeSlot}>
                                <span>
                                    {hour === 0 ? '12AM' : hour === 12 ? '12PM' : hour > 12 ? `${hour - 12}PM` : `${hour}AM`}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Current time indicator - spans full width, positioned in timeGrid */}
                    {isCurrentPeriod && (
                        <div
                            className={styles.currentTime}
                            style={{ top: `${currentTimePosition}%` }}
                        >
                            <div className={styles.currentTimeLabel}><span>{currentTimeLabel}</span></div>
                            <div className={styles.currentTimeLine}></div>
                        </div>
                    )}

                    {/* Days grid with events */}
                    <div className={styles.daysGrid}>
                        {daysToRender.map((day, dayIndex) => (
                            <div
                                key={dayIndex}
                                className={getDayColumnClasses(day, dayIndex)}
                            >
                                {HOURS.map(hour => (
                                    <ContextMenu key={hour}>
                                        <ContextMenuTrigger asChild>
                                            <div
                                                className={styles.hourCell}
                                                onClick={() => handleSlotClick(day, hour)}
                                            >
                                                {getTimedEventsForDayHour(day, hour)
                                                    .map(({ event, start, end }) => {
                                                        const isCurrentlyHappening = currentTime >= start && currentTime < end;
                                                        return (
                                                            <CalendarEventComponent
                                                                key={event.id}
                                                                event={event}
                                                                onClick={() => handleEventClick(event)}
                                                                onDelete={() => onDeleteEvent?.(event)}
                                                                onDuplicate={() => {
                                                                    setCreateAllDayDefault(false);
                                                                    setEditingEvent(null);
                                                                    setDuplicatingEvent(event);
                                                                    setSelectedSlot({
                                                                        date: new Date(event.start),
                                                                        hour: new Date(event.start).getHours()
                                                                    });
                                                                    setShowAddModal(true);
                                                                }}
                                                                isCurrentlyHappening={isCurrentlyHappening}
                                                            />
                                                        );
                                                    })}
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            <ContextMenuItem onClick={() => handleSlotClick(day, hour)}>
                                                <IconPlus size={14} />
                                                Add Event Here
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const getWeekdayLabels = useCallback(() => {
        const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return [...labels.slice(firstDayOfWeek), ...labels.slice(0, firstDayOfWeek)];
    }, [firstDayOfWeek]);

    // Render month view
    const renderMonthView = () => (
        <div className={styles.monthView}>
            <div className={styles.monthHeader}>
                {getWeekdayLabels().map(day => (
                    <div key={day} className={styles.monthDayName}>{day}</div>
                ))}
            </div>
            <div className={styles.monthGrid}>
                {/* Group days into week rows for flex-based animation */}
                {Array.from({ length: monthGridRows }, (_, rowIndex) => {
                    const weekDaysForRow = monthDays.slice(rowIndex * 7, (rowIndex + 1) * 7);

                    return (
                        <div key={rowIndex} className={styles.monthWeekRow}>
                            {weekDaysForRow.map(({ date, isCurrentMonth }, dayIndex) => {
                                const dayEvents = getEventsForDay(date);
                                const isSelectedDate = date.toDateString() === currentDate.toDateString();
                                const monthDayClasses = `${styles.monthDay} ${!isCurrentMonth ? styles.otherMonth : ''} ${isToday(date) ? styles.today : ''} ${isSelectedDate ? styles.selected : ''}`;

                                return (
                                    <ContextMenu key={dayIndex}>
                                        <ContextMenuTrigger asChild>
                                            <div
                                                className={monthDayClasses}
                                                onClick={() => {
                                                    setCurrentDate(date);
                                                    changeViewMode(monthDayClickView);
                                                }}
                                            >
                                                <span className={styles.monthDayNumber}>{date.getDate()}</span>
                                                <div className={styles.monthDayEvents}>
                                                    {dayEvents.slice(0, 3).map(event => (
                                                        <ContextMenu key={event.id}>
                                                            <ContextMenuTrigger asChild>
                                                                <div
                                                                    className={styles.monthEvent}
                                                                    style={{ backgroundColor: event.color || '#3b82f6' }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEventClick(event);
                                                                    }}
                                                                >
                                                                    {event.title}
                                                                </div>
                                                            </ContextMenuTrigger>
                                                            <ContextMenuContent>
                                                                <ContextMenuItem onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    handleEventClick(event);
                                                                }}>
                                                                    <IconEdit size={14} />
                                                                    Edit Event
                                                                </ContextMenuItem>
                                                                <ContextMenuItem onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setCreateAllDayDefault(event.allDay || false);
                                                                    setEditingEvent(null);
                                                                    setDuplicatingEvent(event);
                                                                    setSelectedSlot({
                                                                        date: new Date(event.start),
                                                                        hour: new Date(event.start).getHours()
                                                                    });
                                                                    setShowAddModal(true);
                                                                }}>
                                                                    <IconCopy size={14} />
                                                                    Duplicate
                                                                </ContextMenuItem>
                                                                <ContextMenuSeparator />
                                                                <ContextMenuItem variant="destructive" onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    onDeleteEvent?.(event);
                                                                }}>
                                                                    <IconTrash size={14} />
                                                                    Delete Event
                                                                </ContextMenuItem>
                                                            </ContextMenuContent>
                                                        </ContextMenu>
                                                    ))}
                                                    {dayEvents.length > 3 && (
                                                        <div className={styles.monthMoreEvents}>
                                                            +{dayEvents.length - 3} more
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            <ContextMenuItem onClick={() => handleSlotClick(date, 9)}>
                                                <IconPlus size={14} />
                                                Add Event
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className={`${styles.calendarContainer} ${hasNotification ? styles.withNotification : ''}`}>
            <CalendarSidebar
                currentDate={currentDate}
                onDateSelect={(date) => {
                    setAnimationClass(styles.fadeSlide);
                    setIsAnimating(true);
                    setTimeout(() => {
                        setCurrentDate(date);
                        setIsAnimating(false);
                        setAnimationClass('');
                    }, 200);
                }}
                calendars={calendars}
                onToggleCalendar={onToggleCalendar}
                notices={notices}
                onNoticeClick={onNoticeClick}
                events={coloredEvents}
                firstDayOfWeek={firstDayOfWeek}
                onCreateCalendar={onCreateCalendar}
                onRemoveCalendar={onRemoveCalendar}
                onRenameCalendar={onRenameCalendar}
                onChangeCalendarColor={onChangeCalendarColor}
                duplicateCount={duplicateCount}
                onSmartClean={onSmartClean}
                smartCleanBusy={smartCleanBusy}
                smartCleanHint={smartCleanHint}
            />

            <div className={styles.calendarMain}>
                {/* Header */}
                <div className={styles.calendarHeader}>
                    <div className={styles.headerLeft}>
                        <button className={styles.navBtn} onClick={goToPrev}>
                            <IconChevronLeft size={20} />
                        </button>
                        <button className={styles.navBtn} onClick={goToNext}>
                            <IconChevronRight size={20} />
                        </button>
                        <h2 className={styles.headerTitle}>{headerTitle}</h2>
                    </div>
                    <div className={styles.headerRight}>
                        <button className={styles.todayBtn} onClick={goToToday}>
                            Today
                        </button>
                        <div ref={toggleContainerRef} className={styles.viewToggle} style={{ position: 'relative' }}>
                            {/* Sliding indicator */}
                            <div style={{
                                position: 'absolute',
                                top: '2px',
                                left: indicatorStyle.left || 2,
                                width: indicatorStyle.width || 'auto',
                                height: 'calc(100% - 4px)',
                                background: 'var(--content-bg, #fff)',
                                borderRadius: 'calc(var(--radius-sm) - 2px)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                                pointerEvents: 'none',
                                zIndex: 0,
                            }} />
                            <button
                                ref={dayBtnRef}
                                className={`${styles.viewBtn} ${viewMode === 'day' ? styles.active : ''}`}
                                onClick={() => changeViewMode('day')}
                                style={{ position: 'relative', zIndex: 1, background: 'transparent', boxShadow: 'none' }}
                            >
                                Day
                            </button>
                            <button
                                ref={weekBtnRef}
                                className={`${styles.viewBtn} ${viewMode === 'week' ? styles.active : ''}`}
                                onClick={() => changeViewMode('week')}
                                style={{ position: 'relative', zIndex: 1, background: 'transparent', boxShadow: 'none' }}
                            >
                                Week
                            </button>
                            <button
                                ref={monthBtnRef}
                                className={`${styles.viewBtn} ${viewMode === 'month' ? styles.active : ''}`}
                                onClick={() => changeViewMode('month')}
                                style={{ position: 'relative', zIndex: 1, background: 'transparent', boxShadow: 'none' }}
                            >
                                Month
                            </button>
                        </div>
                        <button
                            className={styles.addBtn}
                            onClick={() => {
                                setEditingEvent(null);
                                setCreateAllDayDefault(false);
                                setSelectedSlot({ date: new Date(), hour: new Date().getHours() });
                                setShowAddModal(true);
                            }}
                        >
                            <IconPlus size={18} />
                            <span>Add Event</span>
                        </button>
                    </div>
                </div>

                {/* Calendar Content with animations */}
                <div className={`${styles.calendarContent} ${animationClass} ${(isWeekMonthTransition || isDayMonthTransition) ? styles.crossfadeTransition : ''
                    }`}>
                    {/* Simple view rendering with crossfade for week↔month and day↔month */}
                    {viewMode === 'month' ? (
                        renderMonthView()
                    ) : (
                        <div className={styles.weekView}>
                            {/* Day headers */}
                            <div className={styles.dayHeaders}>
                                <div className={styles.timeGutter}></div>
                                {(isDayWeekTransition ? weekDays : (viewMode === 'day' ? [currentDate] : weekDays)).map((day, i) => {
                                    const isCurrentDay = day.toDateString() === currentDate.toDateString();

                                    // Build header classes
                                    let headerClasses = `${styles.dayHeader} ${isToday(day) ? styles.today : ''}`;
                                    if (isDayWeekTransition) {
                                        if (transitionType === 'dayToWeek') {
                                            if (!transitionApplied) {
                                                // Initial state: NO TRANSITION
                                                headerClasses += ` ${isCurrentDay ? styles.dayHeaderExpanded : styles.dayHeaderHidden}`;
                                            } else {
                                                // End state: animate to normal
                                                headerClasses += ` ${styles.dayHeaderAnimating} ${styles.dayHeaderNormal}`;
                                            }
                                        } else if (transitionType === 'weekToDay') {
                                            if (!transitionApplied) {
                                                // Initial state: NO TRANSITION
                                                headerClasses += ` ${styles.dayHeaderNormal}`;
                                            } else {
                                                // End state: animate to expanded/hidden
                                                headerClasses += ` ${styles.dayHeaderAnimating} ${isCurrentDay ? styles.dayHeaderExpanded : styles.dayHeaderHidden}`;
                                            }
                                        }
                                    }

                                    return (
                                        <div
                                            key={i}
                                            className={headerClasses}
                                            onClick={() => {
                                                setCurrentDate(day);
                                                changeViewMode('day');
                                            }}
                                        >
                                            <span className={styles.dayName}>
                                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                                            </span>
                                            <span className={styles.dayNumber}>{day.getDate()}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* All-day events */}
                            <div className={styles.allDayRow}>
                                <div className={styles.timeGutter}>
                                    <span>All-day</span>
                                </div>
                                {(isDayWeekTransition ? weekDays : (viewMode === 'day' ? [currentDate] : weekDays)).map((day, i) => {
                                    const dayEvents = getAllDayEventsForDay(day);
                                    const isCurrentDay = day.toDateString() === currentDate.toDateString();

                                    // Build cell classes
                                    let cellClasses = styles.allDayCell;
                                    if (isDayWeekTransition) {
                                        if (transitionType === 'dayToWeek') {
                                            if (!transitionApplied) {
                                                // Initial state: NO TRANSITION
                                                cellClasses += ` ${isCurrentDay ? styles.allDayCellExpanded : styles.allDayCellHidden}`;
                                            } else {
                                                // End state: animate to normal
                                                cellClasses += ` ${styles.allDayCellAnimating} ${styles.allDayCellNormal}`;
                                            }
                                        } else if (transitionType === 'weekToDay') {
                                            if (!transitionApplied) {
                                                // Initial state: NO TRANSITION
                                                cellClasses += ` ${styles.allDayCellNormal}`;
                                            } else {
                                                // End state: animate to expanded/hidden
                                                cellClasses += ` ${styles.allDayCellAnimating} ${isCurrentDay ? styles.allDayCellExpanded : styles.allDayCellHidden}`;
                                            }
                                        }
                                    }

                                    return (
                                        <ContextMenu key={i}>
                                            <ContextMenuTrigger asChild>
                                                <div className={cellClasses}>
                                                    {dayEvents.map(event => (
                                                        <ContextMenu key={event.id}>
                                                            <ContextMenuTrigger asChild>
                                                                <div
                                                                    className={styles.allDayEvent}
                                                                    style={{ backgroundColor: event.color || '#3b82f6' }}
                                                                    onClick={() => handleEventClick(event)}
                                                                >
                                                                    {event.title}
                                                                </div>
                                                            </ContextMenuTrigger>
                                                            <ContextMenuContent>
                                                                <ContextMenuItem onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    handleEventClick(event);
                                                                }}>
                                                                    <IconEdit size={14} />
                                                                    Edit Event
                                                                </ContextMenuItem>
                                                                <ContextMenuItem onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setCreateAllDayDefault(event.allDay || false);
                                                                    setEditingEvent(null);
                                                                    setDuplicatingEvent(event);
                                                                    setSelectedSlot({
                                                                        date: new Date(event.start),
                                                                        hour: new Date(event.start).getHours()
                                                                    });
                                                                    setShowAddModal(true);
                                                                }}>
                                                                    <IconCopy size={14} />
                                                                    Duplicate
                                                                </ContextMenuItem>
                                                                <ContextMenuSeparator />
                                                                <ContextMenuItem variant="destructive" onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    onDeleteEvent?.(event);
                                                                }}>
                                                                    <IconTrash size={14} />
                                                                    Delete Event
                                                                </ContextMenuItem>
                                                            </ContextMenuContent>
                                                        </ContextMenu>
                                                    ))}
                                                </div>
                                            </ContextMenuTrigger>
                                            <ContextMenuContent>
                                                <ContextMenuItem onClick={() => handleAllDaySlotClick(day)}>
                                                    <IconPlus size={14} />
                                                    Add All-day Event
                                                </ContextMenuItem>
                                            </ContextMenuContent>
                                        </ContextMenu>
                                    );
                                })}
                            </div>

                            {/* Time grid */}
                            {renderTimeGrid(viewMode === 'day' ? [currentDate] : weekDays)}
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Event Modal */}
            {showAddModal && (
                <AddEventModal
                    initialDate={selectedSlot?.date || editingEvent?.start || duplicatingEvent?.start}
                    initialHour={selectedSlot?.hour ?? (editingEvent ? new Date(editingEvent.start).getHours() : duplicatingEvent ? new Date(duplicatingEvent.start).getHours() : undefined)}
                    initialAllDay={createAllDayDefault}
                    calendars={calendars}
                    editingEvent={editingEvent}
                    duplicatingEvent={duplicatingEvent}
                    isClosing={isClosingModal}
                    usedColours={usedColours}
                    useCalendarColorMode={eventColorMode === 'calendar'}
                    firstDayOfWeek={firstDayOfWeek}
                    onClose={() => {
                        closeModal();
                        setDuplicatingEvent(null);
                    }}
                    onSave={(event) => {
                        if (editingEvent) {
                            onUpdateEvent?.({ ...editingEvent, ...event } as CalendarEventType);
                        } else {
                            onCreateEvent?.(event);
                        }
                        closeModal();
                        setDuplicatingEvent(null);
                    }}
                    onDelete={editingEvent ? () => {
                        onDeleteEvent?.(editingEvent);
                        closeModal();
                    } : undefined}
                />
            )}
        </div>
    );
}
