import { useState, useMemo } from 'react';
import { CalendarSource, CalendarEvent } from '../../types/calendar';
import { Notice } from '../../types/portal';
import styles from './Calendar.module.css';
import { IconChevronLeft, IconChevronRight, IconCheck, IconBell, IconCalendarEvent, IconClock, IconPlus, IconTrash, IconEdit, IconPalette } from '@tabler/icons-react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '../ui/context-menu';
import {
    ColorPicker,
    ColorPickerTrigger,
    ColorPickerContent,
} from '../ui/color-picker';

type NoticeWithIndex = Notice & { originalIndex?: number };

interface CalendarSidebarProps {
    currentDate: Date;
    onDateSelect: (date: Date) => void;
    calendars: CalendarSource[];
    onToggleCalendar?: (calendarId: string) => void;
    notices?: NoticeWithIndex[];
    onNoticeClick?: (notice: any) => void;
    events?: CalendarEvent[];
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    onCreateCalendar?: (name: string, color?: string) => void;
    onRemoveCalendar?: (calendarId: string) => void;
    onRenameCalendar?: (calendarId: string, name: string) => void;
    onChangeCalendarColor?: (calendarId: string, color: string) => void;
    duplicateCount?: number;
    onSmartClean?: () => void;
    smartCleanBusy?: boolean;
    smartCleanHint?: string;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const rotateDays = (firstDayOfWeek: number) => {
    return [...DAY_LABELS.slice(firstDayOfWeek), ...DAY_LABELS.slice(0, firstDayOfWeek)];
};

export default function CalendarSidebar({
    currentDate,
    onDateSelect,
    calendars,
    onToggleCalendar,
    notices = [],
    onNoticeClick,
    events = [],
    firstDayOfWeek = 1,
    onCreateCalendar,
    onRemoveCalendar,
    onRenameCalendar,
    onChangeCalendarColor,
    duplicateCount = 0,
    onSmartClean,
    smartCleanBusy = false,
    smartCleanHint = '',
}: CalendarSidebarProps) {
    const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationDirection, setAnimationDirection] = useState<'left' | 'right'>('right');
    const [showCreate, setShowCreate] = useState(false);
    const [isCreateClosing, setIsCreateClosing] = useState(false);
    const [newCalendarName, setNewCalendarName] = useState('');
    const [newCalendarColor, setNewCalendarColor] = useState('#3b82f6');
    const [renameTarget, setRenameTarget] = useState<CalendarSource | null>(null);
    const [isRenameClosing, setIsRenameClosing] = useState(false);
    const [renameCalendarName, setRenameCalendarName] = useState('');
    const [colorTarget, setColorTarget] = useState<CalendarSource | null>(null);
    const [colorDraft, setColorDraft] = useState('#3b82f6');
    const [isColorClosing, setIsColorClosing] = useState(false);
    const colorPresets = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

    const closeCreateModal = () => {
        setIsCreateClosing(true);
        setTimeout(() => {
            setShowCreate(false);
            setIsCreateClosing(false);
        }, 140);
    };

    const closeRenameModal = () => {
        setIsRenameClosing(true);
        setTimeout(() => {
            setRenameTarget(null);
            setIsRenameClosing(false);
        }, 140);
    };

    const closeColorModal = () => {
        setIsColorClosing(true);
        setTimeout(() => {
            setColorTarget(null);
            setIsColorClosing(false);
        }, 140);
    };

    const calendarDays = useMemo(() => {
        const year = miniCalendarDate.getFullYear();
        const month = miniCalendarDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const rawStartPad = firstDay.getDay();
        const startPad = (rawStartPad - firstDayOfWeek + 7) % 7;
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const prevMonthLast = new Date(year, month, 0);
        const prevMonthDays = prevMonthLast.getDate();

        const days: { date: Date; isCurrentMonth: boolean }[] = [];

        for (let i = startPad - 1; i >= 0; i--) {
            days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
        }

        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ date: new Date(year, month, i), isCurrentMonth: true });
        }

        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        }

        return days;
    }, [miniCalendarDate, firstDayOfWeek]);

    const isToday = (date: Date) => {
        const today = new Date();
        return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
        );
    };

    const isSelected = (date: Date) => (
        date.getFullYear() === currentDate.getFullYear() &&
        date.getMonth() === currentDate.getMonth() &&
        date.getDate() === currentDate.getDate()
    );

    const goToPrevMonth = () => {
        setAnimationDirection('left');
        setIsAnimating(true);
        setTimeout(() => {
            const newDate = new Date(miniCalendarDate);
            newDate.setMonth(newDate.getMonth() - 1);
            setMiniCalendarDate(newDate);
            setIsAnimating(false);
        }, 150);
    };

    const goToNextMonth = () => {
        setAnimationDirection('right');
        setIsAnimating(true);
        setTimeout(() => {
            const newDate = new Date(miniCalendarDate);
            newDate.setMonth(newDate.getMonth() + 1);
            setMiniCalendarDate(newDate);
            setIsAnimating(false);
        }, 150);
    };

    const todaysNotices = notices.slice(0, 5);

    const currentEvents = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        return events
            .filter(event => {
                const start = new Date(event.start);
                const end = new Date(event.end);
                return start <= now && end > now && start < endOfDay;
            })
            .sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime())
            .slice(0, 3);
    }, [events]);

    const upcomingEvents = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        return events
            .filter(event => {
                const start = new Date(event.start);
                return start > now && start < endOfDay;
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            .slice(0, 5);
    }, [events]);

    return (
        <div className={styles.sidebar}>
            <div className={styles.miniCalendar}>
                <div className={styles.miniCalendarHeader}>
                    <button onClick={goToPrevMonth} className={styles.miniNavBtn}>
                        <IconChevronLeft size={16} />
                    </button>
                    <span className={styles.miniCalendarTitle}>
                        {miniCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={goToNextMonth} className={styles.miniNavBtn}>
                        <IconChevronRight size={16} />
                    </button>
                </div>

                <div
                    className={styles.miniCalendarGrid}
                    style={{
                        opacity: isAnimating ? 0 : 1,
                        transform: isAnimating
                            ? `translateX(${animationDirection === 'left' ? '10px' : '-10px'})`
                            : 'translateX(0)',
                        transition: 'all 0.15s ease',
                    }}
                >
                    {rotateDays(firstDayOfWeek).map(day => (
                        <div key={day} className={styles.miniCalendarDayName}>{day}</div>
                    ))}
                    {calendarDays.map(({ date, isCurrentMonth }, i) => (
                        <button
                            key={i}
                            className={`${styles.miniCalendarDay} ${!isCurrentMonth ? styles.otherMonth : ''} ${isToday(date) ? styles.today : ''} ${isSelected(date) ? styles.selected : ''}`}
                            onClick={() => onDateSelect(date)}
                        >
                            {date.getDate()}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.noticesSection}>
                <h3 className={styles.sidebarSectionTitle}>Today's Notices</h3>
                {todaysNotices.length > 0 ? todaysNotices.map((notice, i) => (
                    <div
                        key={i}
                        className={styles.noticeItem}
                        onClick={() => onNoticeClick?.(notice)}
                        style={{ cursor: onNoticeClick ? 'pointer' : 'default' }}
                    >
                        <div className={styles.noticeTitle}>{notice.title}</div>
                        <div className={styles.noticePreview}>{notice.preview}</div>
                    </div>
                )) : (
                    <div className={styles.noNotices}>
                        <IconBell size={32} strokeWidth={1.5} />
                        <span>No notices for today</span>
                    </div>
                )}
            </div>

            {currentEvents.length > 0 && (
                <div className={styles.upcomingEventsSection}>
                    <h3 className={styles.sidebarSectionTitle}>Happening Now</h3>
                    <div className={styles.upcomingEventsList}>
                        {currentEvents.map(event => {
                            const end = new Date(event.end);
                            const timeStr = end.toLocaleTimeString('en-US', {
                                hour: 'numeric', minute: '2-digit', hour12: true,
                            });
                            return (
                                <div key={event.id} className={`${styles.upcomingEventItem} ${styles.currentEventItem}`}>
                                    <div className={styles.upcomingEventColor} style={{ backgroundColor: event.color || '#3b82f6' }} />
                                    <div className={styles.upcomingEventContent}>
                                        <div className={styles.upcomingEventTitle}>{event.title}</div>
                                        <div className={styles.upcomingEventTime}>
                                            <IconClock size={12} />
                                            {event.allDay ? 'All Day' : `Ends ${timeStr}`}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className={styles.upcomingEventsSection}>
                <h3 className={styles.sidebarSectionTitle}>Upcoming Today</h3>
                {upcomingEvents.length > 0 ? (
                    <div className={styles.upcomingEventsList}>
                        {upcomingEvents.map(event => {
                            const start = new Date(event.start);
                            const timeStr = start.toLocaleTimeString('en-US', {
                                hour: 'numeric', minute: '2-digit', hour12: true,
                            });
                            return (
                                <div key={event.id} className={styles.upcomingEventItem}>
                                    <div className={styles.upcomingEventColor} style={{ backgroundColor: event.color || '#3b82f6' }} />
                                    <div className={styles.upcomingEventContent}>
                                        <div className={styles.upcomingEventTitle}>{event.title}</div>
                                        <div className={styles.upcomingEventTime}>
                                            <IconClock size={12} />
                                            {event.allDay ? 'All Day' : timeStr}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className={styles.noUpcomingEvents}>
                        <IconCalendarEvent size={32} strokeWidth={1.5} />
                        <span>No more events today</span>
                    </div>
                )}
            </div>

            <div className={styles.sidebarSection}>
                <div className={styles.calendarSectionHeader}>
                    <h3 className={styles.sidebarSectionTitle} style={{ marginBottom: 0 }}>Calendars</h3>
                    <button className={styles.createCalendarBtn} onClick={() => setShowCreate(true)} title="Create calendar">
                        <IconPlus size={14} />
                    </button>
                </div>
                <div className={styles.calendarList}>
                    {calendars.map(calendar => {
                        const isProtected = calendar.isGoogle || calendar.id === 'classes';
                        const isPrimaryGoogleCalendar = calendar.isGoogle && (calendar.id === 'primary' || calendar.name.trim().toLowerCase() === 'google calendar');
                        const canRecolor = !isPrimaryGoogleCalendar;
                        return (
                            <ContextMenu key={calendar.id}>
                                <ContextMenuTrigger asChild>
                                    <div className={styles.calendarItemRow}>
                                        <button className={styles.calendarItem} onClick={() => onToggleCalendar?.(calendar.id)}>
                                            <div
                                                className={`${styles.calendarCheckbox} ${calendar.visible ? styles.checked : ''}`}
                                                style={{
                                                    backgroundColor: calendar.visible ? calendar.color : 'transparent',
                                                    borderColor: calendar.color,
                                                }}
                                            >
                                                {calendar.visible && <IconCheck size={12} />}
                                            </div>
                                            <span className={styles.calendarName}>{calendar.name}</span>
                                        </button>
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                    <ContextMenuItem
                                        disabled={isProtected}
                                        onClick={() => {
                                            setRenameTarget(calendar);
                                            setRenameCalendarName(calendar.name);
                                        }}
                                    >
                                        <IconEdit size={14} />
                                        Rename
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        disabled={!canRecolor}
                                        onClick={() => {
                                            setColorTarget(calendar);
                                            setColorDraft(calendar.color || '#3b82f6');
                                        }}
                                    >
                                        <IconPalette size={14} />
                                        {canRecolor ? 'Change Colour' : 'Change Colour (Unavailable)'}
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        variant="destructive"
                                        disabled={isProtected}
                                        onClick={() => onRemoveCalendar?.(calendar.id)}
                                    >
                                        <IconTrash size={14} />
                                        Delete
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        );
                    })}
                </div>
            </div>

            <div className={styles.sidebarFooterAction}>
                <div
                    className={styles.smartCleanTooltipHost}
                    data-tooltip={smartCleanHint}
                >
                    <button
                        className={`${styles.smartCleanBtn} ${smartCleanBusy ? styles.smartCleanBtnBusy : ''}`}
                        onClick={() => onSmartClean?.()}
                        disabled={smartCleanBusy || !onSmartClean || duplicateCount <= 0}
                        aria-busy={smartCleanBusy}
                    >
                        <IconTrash size={14} />
                        <span>{smartCleanBusy ? 'Cleaning...' : 'Smart Cleaner'}</span>
                        {duplicateCount > 0 && !smartCleanBusy && (
                            <span className={styles.smartCleanCount}>{duplicateCount}</span>
                        )}
                    </button>
                </div>
            </div>

            {showCreate && (
                <div className={`${styles.modalOverlay} ${isCreateClosing ? styles.closing : ''}`} onClick={closeCreateModal}>
                    <div className={styles.modal} style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Create Calendar</h2>
                            <button className={styles.modalCloseBtn} onClick={closeCreateModal}>×</button>
                        </div>
                        <div className={styles.modalForm}>
                            <div className={styles.formGroup}>
                                <label htmlFor="new-cal-name">Name</label>
                                <input
                                    id="new-cal-name"
                                    type="text"
                                    value={newCalendarName}
                                    onChange={(e) => setNewCalendarName(e.target.value)}
                                    placeholder="Calendar name"
                                    autoFocus
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button className={styles.cancelBtn} onClick={closeCreateModal}>Cancel</button>
                                <button
                                    className={styles.saveBtn}
                                    onClick={() => {
                                        const trimmed = newCalendarName.trim();
                                        if (!trimmed) return;
                                        onCreateCalendar?.(trimmed, newCalendarColor);
                                        setNewCalendarName('');
                                        setNewCalendarColor('#3b82f6');
                                        closeCreateModal();
                                    }}
                                >
                                    Create
                                </button>
                            </div>
                            <div className={styles.formGroup}>
                                <label>Colour</label>
                                <div className={styles.colorPickerRow}>
                                    <ColorPicker value={newCalendarColor} onChange={setNewCalendarColor}>
                                        <ColorPickerTrigger className={styles.customColorBtn} />
                                        <ColorPickerContent
                                            presetColors={colorPresets}
                                            usedColors={calendars.map((calendar) => calendar.color).filter(Boolean)}
                                        />
                                    </ColorPicker>
                                    {colorPresets.map((color) => (
                                        <button
                                            key={`new-${color}`}
                                            type="button"
                                            className={`${styles.colorSwatch} ${newCalendarColor === color ? styles.selected : ''}`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => setNewCalendarColor(color)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {renameTarget && (
                <div className={`${styles.modalOverlay} ${isRenameClosing ? styles.closing : ''}`} onClick={closeRenameModal}>
                    <div className={styles.modal} style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Rename Calendar</h2>
                            <button className={styles.modalCloseBtn} onClick={closeRenameModal}>×</button>
                        </div>
                        <div className={styles.modalForm}>
                            <div className={styles.formGroup}>
                                <label htmlFor="rename-cal-name">Name</label>
                                <input
                                    id="rename-cal-name"
                                    type="text"
                                    value={renameCalendarName}
                                    onChange={(e) => setRenameCalendarName(e.target.value)}
                                    placeholder="Calendar name"
                                    autoFocus
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button className={styles.cancelBtn} onClick={closeRenameModal}>Cancel</button>
                                <button
                                    className={styles.saveBtn}
                                    onClick={() => {
                                        const trimmed = renameCalendarName.trim();
                                        if (!trimmed || !renameTarget) return;
                                        onRenameCalendar?.(renameTarget.id, trimmed);
                                        closeRenameModal();
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {colorTarget && (
                <div className={`${styles.modalOverlay} ${isColorClosing ? styles.closing : ''}`} onClick={closeColorModal}>
                    <div className={styles.modal} style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Calendar Colour</h2>
                            <button className={styles.modalCloseBtn} onClick={closeColorModal}>×</button>
                        </div>
                        <div className={styles.modalForm}>
                            <div className={styles.formGroup}>
                                <label>{colorTarget.name}</label>
                                <div className={styles.colorPickerRow}>
                                    <ColorPicker
                                        value={colorDraft}
                                        onChange={setColorDraft}
                                    >
                                        <ColorPickerTrigger className={styles.customColorBtn} />
                                        <ColorPickerContent
                                            presetColors={colorPresets}
                                            usedColors={calendars.map((calendar) => calendar.color).filter(Boolean)}
                                        />
                                    </ColorPicker>
                                    {colorPresets.map((color) => (
                                        <button
                                            key={`edit-${color}`}
                                            type="button"
                                            className={`${styles.colorSwatch} ${colorDraft === color ? styles.selected : ''}`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => setColorDraft(color)}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className={styles.modalActions}>
                                <button className={styles.cancelBtn} onClick={closeColorModal}>Cancel</button>
                                <button
                                    className={styles.saveBtn}
                                    onClick={() => {
                                        onChangeCalendarColor?.(colorTarget.id, colorDraft);
                                        closeColorModal();
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
