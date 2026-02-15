import { useState } from 'react';
import { CalendarEvent, CalendarSource } from '../../types/calendar';
import styles from './Calendar.module.css';
import {
    IconX,
    IconCalendar,
    IconClock,
    IconMapPin,
    IconAlignLeft,
    IconPalette,
} from '@tabler/icons-react';
import {
    ColorPicker,
    ColorPickerTrigger,
    ColorPickerContent,
} from '../ui/color-picker';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import ComboboxField from './ComboboxField';
import DateSelector from './DateSelector';

interface AddEventModalProps {
    initialDate?: Date;
    initialHour?: number;
    initialAllDay?: boolean;
    calendars: CalendarSource[];
    editingEvent?: CalendarEvent | null;
    duplicatingEvent?: CalendarEvent | null;
    isClosing?: boolean;
    usedColours?: string[];
    useCalendarColorMode?: boolean;
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    onClose: () => void;
    onSave: (event: Partial<CalendarEvent>) => void;
    onDelete?: () => void;
}

// Helper to format date as YYYY-MM-DD in local timezone (NOT UTC)
const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function AddEventModal({
    initialDate,
    initialHour,
    initialAllDay = false,
    calendars,
    editingEvent,
    duplicatingEvent,
    isClosing = false,
    usedColours = [],
    useCalendarColorMode = false,
    firstDayOfWeek = 1,
    onClose,
    onSave,
    onDelete,
}: AddEventModalProps) {
    const isEditing = !!editingEvent;

    // Properly handle the initial date - use local timezone
    const getDefaultValues = () => {
        if (editingEvent) {
            const start = new Date(editingEvent.start);
            const end = new Date(editingEvent.end);
            return {
                title: editingEvent.title,
                description: editingEvent.description || '',
                location: editingEvent.location || '',
                date: formatDateLocal(start),
                startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
                endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
                allDay: editingEvent.allDay || false,
                color: editingEvent.color || '#3b82f6',
                calendarId: editingEvent.calendarId,
            };
        }

        // Handle duplicating event - pre-fill with same values but no ID
        if (duplicatingEvent) {
            const start = new Date(duplicatingEvent.start);
            const end = new Date(duplicatingEvent.end);
            return {
                title: `${duplicatingEvent.title} (Copy)`,
                description: duplicatingEvent.description || '',
                location: duplicatingEvent.location || '',
                date: formatDateLocal(start),
                startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
                endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
                allDay: duplicatingEvent.allDay || false,
                color: duplicatingEvent.color || '#3b82f6',
                calendarId: duplicatingEvent.calendarId,
            };
        }

        // Use the passed date or current date - in LOCAL timezone
        const date = initialDate || new Date();
        const hour = initialHour ?? 9;

        return {
            title: '',
            description: '',
            location: '',
            date: formatDateLocal(date),
            startTime: `${String(hour).padStart(2, '0')}:00`,
            endTime: `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`,
            allDay: initialAllDay,
            color: calendars.find(c => c.isLocal)?.color || '#3b82f6',
            calendarId: calendars.find(c => c.isLocal)?.id || calendars[0]?.id || '',
        };
    };

    const defaults = getDefaultValues();

    const [title, setTitle] = useState(defaults.title);
    const [description, setDescription] = useState(defaults.description);
    const [location, setLocation] = useState(defaults.location);
    const [date, setDate] = useState(defaults.date);
    const [startTime, setStartTime] = useState(defaults.startTime);
    const [endTime, setEndTime] = useState(defaults.endTime);
    const [allDay, setAllDay] = useState(defaults.allDay);
    const [color, setColor] = useState(defaults.color);
    const [selectedCalendar, setSelectedCalendar] = useState(defaults.calendarId);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const selectedCalendarSource = calendars.find(c => c.id === selectedCalendar);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        // Parse date correctly in local timezone
        const [year, month, day] = date.split('-').map(Number);

        const startDate = new Date(year, month - 1, day, startHour, startMin, 0, 0);
        const endDate = new Date(year, month - 1, day, endHour, endMin, 0, 0);

        const calendar = calendars.find(c => c.id === selectedCalendar);

        onSave({
            id: editingEvent?.id,
            title,
            description: description || undefined,
            location: location || undefined,
            start: startDate,
            end: endDate,
            allDay,
            calendarId: selectedCalendar,
            calendarName: calendar?.name || 'Local',
            color: useCalendarColorMode ? (calendar?.color || color) : color,
            isLocal: calendar?.isLocal,
        });
    };

    // Color presets
    const colorPresets = [
        '#ef4444', // red
        '#f97316', // orange
        '#eab308', // yellow
        '#22c55e', // green
        '#14b8a6', // teal
        '#3b82f6', // blue
        '#8b5cf6', // purple
        '#ec4899', // pink
    ];

    return (
        <div
            className={`${styles.modalOverlay} ${isClosing ? styles.closing : ''}`}
            onClick={onClose}
        >
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{isEditing ? 'Edit Event' : 'Add Event'}</h2>
                    <button className={styles.modalCloseBtn} onClick={onClose}>
                        <IconX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="title">
                            <IconCalendar size={16} />
                            Title
                        </label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Event title"
                            required
                            autoFocus
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="date">
                            <IconCalendar size={16} />
                            Date
                        </label>
                        <DateSelector
                            value={date}
                            onChange={setDate}
                            firstDayOfWeek={firstDayOfWeek}
                        />
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={allDay}
                                    onChange={e => setAllDay(e.target.checked)}
                                />
                                All day event
                            </label>
                        </div>
                    </div>

                    {!allDay && (
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label htmlFor="startTime">
                                    <IconClock size={16} />
                                    Start
                                </label>
                                <input
                                    id="startTime"
                                    type="time"
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="endTime">
                                    <IconClock size={16} />
                                    End
                                </label>
                                <input
                                    id="endTime"
                                    type="time"
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label htmlFor="location">
                            <IconMapPin size={16} />
                            Location
                        </label>
                        <input
                            id="location"
                            type="text"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder="Add location"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="description">
                            <IconAlignLeft size={16} />
                            Description
                        </label>
                        <textarea
                            id="description"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Add description"
                            rows={3}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>
                            <IconPalette size={16} />
                            Colour
                        </label>
                        <div className={styles.colorPickerContainer}>
                            <div className={styles.colorPickerRow}>
                                {useCalendarColorMode ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                        Event color is inherited from the selected calendar.
                                    </div>
                                ) : (
                                    <>
                                        <ColorPicker value={color} onChange={setColor}>
                                            <ColorPickerTrigger />
                                            <ColorPickerContent
                                                presetColors={colorPresets}
                                                usedColors={usedColours}
                                            />
                                        </ColorPicker>
                                        {colorPresets.map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                className={`${styles.colorSwatch} ${color === c ? styles.selected : ''}`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setColor(c)}
                                            />
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="calendar">
                            <IconCalendar size={16} />
                            Calendar
                        </label>
                        <ComboboxField
                            value={selectedCalendar}
                            onChange={setSelectedCalendar}
                            options={calendars.map(cal => ({ value: cal.id, label: cal.name }))}
                        />
                    </div>

                    <div className={styles.modalActions}>
                        {isEditing && onDelete && (
                            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                                <button
                                    type="button"
                                    className={styles.deleteBtn}
                                    onClick={() => setShowDeleteConfirm(true)}
                                >
                                    Delete
                                </button>
                                <AlertDialogContent style={{
                                    maxWidth: '450px',
                                    padding: '24px',
                                    backgroundColor: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '12px',
                                    outline: 'none',
                                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                }}>
                                    <AlertDialogHeader style={{ marginBottom: '16px' }}>
                                        <AlertDialogTitle style={{
                                            fontSize: '18px',
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            marginBottom: '8px',
                                        }}>
                                            Delete Event
                                        </AlertDialogTitle>
                                        <AlertDialogDescription style={{
                                            fontSize: '14px',
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.5,
                                        }}>
                                            Are you sure you want to delete this event? This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter style={{
                                        display: 'flex',
                                        gap: '8px',
                                        justifyContent: 'flex-end',
                                    }}>
                                        <AlertDialogCancel style={{
                                            padding: '10px 16px',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                            backgroundColor: 'var(--bg-surface)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            outline: 'none',
                                        }}>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            variant="destructive"
                                            onClick={() => {
                                                setShowDeleteConfirm(false);
                                                onDelete();
                                            }}
                                            style={{
                                                padding: '10px 16px',
                                                fontSize: '14px',
                                                fontWeight: 500,
                                                color: 'white',
                                                backgroundColor: '#ef4444',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                outline: 'none',
                                            }}
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        <div style={{ flex: 1 }} />
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className={styles.saveBtn}>
                            {isEditing ? 'Update' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
