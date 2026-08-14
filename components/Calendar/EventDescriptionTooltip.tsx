import { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactElement, Ref } from 'react';
import type { CalendarEvent } from '../../types/calendar';
import { Tooltip, TooltipContent } from '../ui/tooltip';

// Hover dwell before the description tooltip opens.
export const DESCRIPTION_TOOLTIP_DELAY_MS = 500;
// Grace period between leaving the event and closing, so the pointer can reach
// the tooltip to scroll a long description.
const CLOSE_GRACE_MS = 150;

interface HoverableProps {
    onMouseEnter?: (event: ReactMouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: ReactMouseEvent<HTMLElement>) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
}

interface EventDescriptionTooltipProps {
    event: CalendarEvent;
    /** The event element that acts as the tooltip anchor. */
    children: ReactElement<HoverableProps>;
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function formatRange(event: CalendarEvent): string {
    if (event.allDay) {
        return 'All day';
    }
    return `${formatTime(new Date(event.start))} – ${formatTime(new Date(event.end))}`;
}

/**
 * Wraps a calendar event element with a large hover tooltip showing its
 * description. Events without a description are returned untouched.
 *
 * The open state is controlled with a local timer rather than Base UI's hover
 * delay: the dashboard mounts a `TooltipProvider` with a 0ms group delay, which
 * overrides per-trigger delays.
 *
 * The event element stays the anchor but is deliberately *not* wrapped in a
 * `Tooltip.Trigger`. Every calendar event is already a `ContextMenu.Trigger`
 * rendered through `render`, and stacking a second Base UI trigger on top of it
 * left the popup with no reliable reference element, so it never appeared. An
 * explicit `anchor` ref positions the popup directly and skips the whole trigger
 * association dance — which this tooltip does not need anyway, because the dwell
 * timer already owns when it opens.
 */
export function EventDescriptionTooltip({ event, children }: EventDescriptionTooltipProps) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLElement | null>(null);
    const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = useCallback(() => {
        if (openTimer.current) {
            clearTimeout(openTimer.current);
            openTimer.current = null;
        }
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const description = event.description?.trim();

    const handleMouseEnter = useCallback((mouseEvent: ReactMouseEvent<HTMLElement>) => {
        children.props.onMouseEnter?.(mouseEvent);
        clearTimers();
        openTimer.current = setTimeout(() => setOpen(true), DESCRIPTION_TOOLTIP_DELAY_MS);
    }, [clearTimers, children]);

    // Small grace period so the pointer can travel onto the tooltip itself.
    const handleMouseLeave = useCallback((mouseEvent: ReactMouseEvent<HTMLElement>) => {
        children.props.onMouseLeave?.(mouseEvent);
        clearTimers();
        closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
    }, [clearTimers, children]);

    const handleClick = useCallback((mouseEvent: ReactMouseEvent<HTMLElement>) => {
        clearTimers();
        setOpen(false);
        children.props.onClick?.(mouseEvent);
    }, [clearTimers, children]);

    const handleTooltipEnter = useCallback(() => {
        clearTimers();
    }, [clearTimers]);

    const handleTooltipLeave = useCallback(() => {
        clearTimers();
        setOpen(false);
    }, [clearTimers]);

    if (!description) {
        return children;
    }

    const anchor = cloneElement(children, {
        ref: anchorRef,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onClick: handleClick,
    });

    return (
        <>
            {anchor}
            {/* Only closes are accepted from Base UI's own interactions; opening
                stays owned by the dwell timer above. */}
            <Tooltip open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setOpen(false); }}>
                <TooltipContent
                    anchor={anchorRef}
                    side="right"
                    align="start"
                    className="flex w-[min(22rem,80vw)] max-w-none flex-col items-start gap-1.5 px-3.5 py-3 text-left"
                    onMouseEnter={handleTooltipEnter}
                    onMouseLeave={handleTooltipLeave}
                >
                    <span className="text-sm leading-snug font-semibold">{event.title}</span>
                    <span className="text-xs opacity-70">
                        {formatRange(event)}
                        {event.location ? ` · ${event.location}` : ''}
                    </span>
                    <span className="max-h-60 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap opacity-90">
                        {description}
                    </span>
                </TooltipContent>
            </Tooltip>
        </>
    );
}

export default EventDescriptionTooltip;
