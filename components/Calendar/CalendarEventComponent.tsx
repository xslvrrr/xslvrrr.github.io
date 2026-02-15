import { memo } from 'react';
import { CalendarEvent as CalendarEventType } from '../../types/calendar';
import styles from './Calendar.module.css';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '../ui/context-menu';
import { IconEdit, IconTrash, IconCopy } from '@tabler/icons-react';

interface CalendarEventProps {
    event: CalendarEventType;
    onClick?: () => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
    isCurrentlyHappening?: boolean;
}

function CalendarEvent({
    event,
    onClick,
    onDelete,
    onDuplicate,
    isCurrentlyHappening = false
}: CalendarEventProps) {
    // Calculate event geometry using pixels for better short-event handling.
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    const minHeightPx = 16;
    const heightPx = Math.max(durationMinutes, minHeightPx);

    // Position within the hour cell
    const startMinutes = startTime.getMinutes();
    const topOffsetPx = startMinutes;

    // Format time
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={`${styles.event} ${isCurrentlyHappening ? styles.currentlyHappening : ''}`}
                    style={{
                        backgroundColor: event.color || '#3b82f6',
                        height: `${heightPx}px`,
                        top: `${topOffsetPx}px`,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick?.();
                    }}
                >
                    <div className={styles.eventTime}>
                        {formatTime(startTime)}
                    </div>
                    <div className={styles.eventTitle}>{event.title}</div>
                    {event.location && (
                        <div className={styles.eventLocation}>{event.location}</div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick?.();
                }}>
                    <IconEdit size={14} />
                    Edit Event
                </ContextMenuItem>
                <ContextMenuItem onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDuplicate?.();
                }}>
                    <IconCopy size={14} />
                    Duplicate
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.();
                }}>
                    <IconTrash size={14} />
                    Delete Event
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export default memo(CalendarEvent);
