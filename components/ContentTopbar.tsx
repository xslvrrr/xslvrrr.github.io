"use client"

import * as React from 'react';
import { cn } from '../lib/utils';
import {
    IconCopy,
    IconPin,
    IconPinFilled,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from './ui/context-menu';
import { SidebarTrigger } from './ui/sidebar';
import styles from './ContentTopbar.module.css';

export interface ContentTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    pinned?: boolean;
}

export type ContentTabAction = 'pin' | 'unpin' | 'close' | 'close-below' | 'close-others' | 'new' | 'duplicate';

// ============================================
// TYPES
// ============================================

export interface ContentTopbarProps {
    /** Title to display in the center */
    title: string;
    /** Icon to display before the title */
    icon?: React.ReactNode;
    /** Content to render on the left side (page-specific actions) */
    leftContent?: React.ReactNode;
    /** Content to render on the right side (page-specific actions) */
    rightContent?: React.ReactNode;
    tabs?: ContentTab[];
    activeTabId?: string;
    onTabChange?: (id: string) => void;
    onAddTab?: () => void;
    onTabClose?: (id: string) => void;
    onTabReorder?: (fromId: string, toId: string) => void;
    selectedTabIds?: string[];
    onTabSelectionChange?: (ids: string[]) => void;
    onTabAction?: (action: ContentTabAction, ids: string[]) => void;
    /** Additional CSS class */
    className?: string;
    /** Manual inset for the bottom divider, useful when a page rail owns the left edge. */
    borderInsetStart?: number | string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ContentTopbar({
    title,
    icon,
    leftContent,
    rightContent,
    tabs,
    activeTabId,
    onTabChange,
    onAddTab,
    onTabClose,
    onTabReorder,
    selectedTabIds,
    onTabSelectionChange,
    onTabAction,
    className,
    borderInsetStart,
}: ContentTopbarProps) {
    const selectionAnchorRef = React.useRef<string | null>(activeTabId || null);
    const closeTimeoutsRef = React.useRef<Set<number>>(new Set());
    const [closingTabIds, setClosingTabIds] = React.useState<Set<string>>(() => new Set());
    const style = React.useMemo(() => {
        if (borderInsetStart === undefined) return undefined;
        const value = typeof borderInsetStart === 'number' ? `${borderInsetStart}px` : borderInsetStart;
        return { '--topbar-border-start': value } as React.CSSProperties;
    }, [borderInsetStart]);
    const displayedTabs: ContentTab[] = tabs?.length ? tabs : [{ id: activeTabId || title, label: title, icon }];
    const selectedIdSet = React.useMemo(() => {
        const validIds = new Set(displayedTabs.map(tab => tab.id));
        const validSelectedIds = selectedTabIds?.filter(id => validIds.has(id)) || [];
        return new Set(validSelectedIds.length ? validSelectedIds : activeTabId ? [activeTabId] : []);
    }, [activeTabId, displayedTabs, selectedTabIds]);

    const selectTab = React.useCallback((tabId: string, event: Pick<React.MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>) => {
        const clickedIndex = displayedTabs.findIndex(tab => tab.id === tabId);
        if (clickedIndex < 0) return;

        if (event.shiftKey && selectionAnchorRef.current) {
            const anchorIndex = displayedTabs.findIndex(tab => tab.id === selectionAnchorRef.current);
            if (anchorIndex >= 0) {
                const start = Math.min(anchorIndex, clickedIndex);
                const end = Math.max(anchorIndex, clickedIndex);
                onTabSelectionChange?.(displayedTabs.slice(start, end + 1).map(tab => tab.id));
                return;
            }
        }

        selectionAnchorRef.current = tabId;
        if (event.metaKey || event.ctrlKey) {
            const nextIds = new Set(selectedIdSet);
            if (nextIds.has(tabId) && nextIds.size > 1) nextIds.delete(tabId);
            else nextIds.add(tabId);
            onTabSelectionChange?.(displayedTabs.filter(tab => nextIds.has(tab.id)).map(tab => tab.id));
            return;
        }

        onTabSelectionChange?.([tabId]);
        onTabChange?.(tabId);
    }, [displayedTabs, onTabChange, onTabSelectionChange, selectedIdSet]);

    const selectTabForContextMenu = React.useCallback((tabId: string) => {
        if (selectedIdSet.has(tabId)) return;
        selectionAnchorRef.current = tabId;
        onTabSelectionChange?.([tabId]);
    }, [onTabSelectionChange, selectedIdSet]);

    const closeTabsWithAnimation = React.useCallback((tabIds: string[], close: () => void) => {
        const displayedIds = new Set(displayedTabs.map(tab => tab.id));
        const closingIds = tabIds.filter(id => displayedIds.has(id));
        if (!closingIds.length) return;

        setClosingTabIds(current => new Set([...current, ...closingIds]));
        const root = document.documentElement;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = root.dataset.animations === 'disabled' || reducedMotion
            ? 0
            : Number.parseFloat(getComputedStyle(root).getPropertyValue('--anim-duration-slow')) || 300;
        const timeoutId = window.setTimeout(() => {
            closeTimeoutsRef.current.delete(timeoutId);
            close();
            setClosingTabIds(current => {
                const next = new Set(current);
                closingIds.forEach(id => next.delete(id));
                return next;
            });
        }, duration);
        closeTimeoutsRef.current.add(timeoutId);
    }, [displayedTabs]);

    React.useEffect(() => () => {
        closeTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
        closeTimeoutsRef.current.clear();
    }, []);

    return (
        <div className={cn(styles.topbar, className)} style={style}>
            <div className={styles.leftSection}>
                <div className={styles.mobileHeading}>
                    <SidebarTrigger className={styles.mobileSidebarTrigger} />
                    {icon && <span className={styles.mobileTitleIcon}>{icon}</span>}
                    <span className={styles.mobileTitle}>{title}</span>
                </div>
                {leftContent && (
                    <div className={styles.leftContent}>
                        {leftContent}
                    </div>
                )}
            </div>

            <div
                className={styles.tabStrip}
                data-tour-id="content-tabs"
                role="tablist"
                aria-label="Open pages"
                onWheel={(event) => {
                    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                    event.currentTarget.scrollLeft += event.deltaY;
                }}
            >
                {displayedTabs.map((tab) => {
                    const contextSelection = selectedIdSet.has(tab.id) ? displayedTabs.filter(item => selectedIdSet.has(item.id)) : [tab];
                    const contextIds = contextSelection.map(item => item.id);
                    const contextIdSet = new Set(contextIds);
                    const allPinned = contextSelection.every(item => item.pinned);
                    const lastSelectedIndex = Math.max(...contextSelection.map(item => displayedTabs.findIndex(tabItem => tabItem.id === item.id)));
                    const hasTabsBelow = displayedTabs.slice(lastSelectedIndex + 1).some(item => !item.pinned);
                    const hasOtherTabs = displayedTabs.some(item => !contextIdSet.has(item.id) && !item.pinned);
                    const plural = contextIds.length > 1;

                    return (
                        <ContextMenu key={tab.id}>
                            <ContextMenuTrigger
                                render={
                                    <div
                                        className={cn(
                                            styles.tab,
                                            tab.id === activeTabId && styles.activeTab,
                                            selectedIdSet.has(tab.id) && styles.selectedTab,
                                            tab.pinned && styles.pinnedTab,
                                        )}
                                        data-closing={closingTabIds.has(tab.id) ? 'true' : 'false'}
                                        draggable={Boolean(onTabReorder) && selectedIdSet.size <= 1 && !closingTabIds.has(tab.id)}
                                        onContextMenu={() => selectTabForContextMenu(tab.id)}
                                        onDragStart={(event) => {
                                            event.dataTransfer.effectAllowed = 'move';
                                            event.dataTransfer.setData('text/plain', tab.id);
                                            event.currentTarget.dataset.dragging = 'true';
                                        }}
                                        onDragEnd={(event) => { delete event.currentTarget.dataset.dragging; }}
                                        onDragOver={(event) => {
                                            if (!onTabReorder) return;
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            const fromId = event.dataTransfer.getData('text/plain');
                                            if (fromId && fromId !== tab.id) onTabReorder?.(fromId, tab.id);
                                        }}
                                    />
                                }
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab.id === activeTabId || (!activeTabId && tab.label === title)}
                                    aria-label={`${tab.label}${tab.pinned ? ', pinned' : ''}`}
                                    className={styles.tabMain}
                                    onClick={(event) => selectTab(tab.id, event)}
                                >
                                    {tab.icon && <span className={styles.titleIcon}>{tab.icon}</span>}
                                    <span className={styles.title}>{tab.label}</span>
                                    {tab.pinned && <IconPinFilled className={styles.pinIndicator} aria-hidden="true" />}
                                </button>
                                <button
                                    type="button"
                                    className={styles.closeTab}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        closeTabsWithAnimation([tab.id], () => onTabClose?.(tab.id));
                                    }}
                                    aria-label={`Close ${tab.label} tab`}
                                    title="Close tab"
                                >
                                    <span aria-hidden="true">×</span>
                                </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="min-w-56">
                                <ContextMenuGroup>
                                    {plural ? <ContextMenuLabel>{contextIds.length} tabs selected</ContextMenuLabel> : null}
                                    <ContextMenuItem onClick={() => onTabAction?.(allPinned ? 'unpin' : 'pin', contextIds)}>
                                        {allPinned ? <IconPin /> : <IconPinFilled />}
                                        {allPinned ? `Unpin ${plural ? 'tabs' : 'tab'}` : `Pin ${plural ? 'tabs' : 'tab'}`}
                                    </ContextMenuItem>
                                </ContextMenuGroup>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => closeTabsWithAnimation(contextIds, () => onTabAction?.('close', contextIds))}>
                                    <IconX />
                                    Close {plural ? 'tabs' : 'tab'}
                                </ContextMenuItem>
                                <ContextMenuItem
                                    disabled={!hasTabsBelow}
                                    onClick={() => closeTabsWithAnimation(
                                        displayedTabs.slice(lastSelectedIndex + 1).filter(item => !item.pinned).map(item => item.id),
                                        () => onTabAction?.('close-below', contextIds),
                                    )}
                                >
                                    <IconX />
                                    Close tabs below
                                </ContextMenuItem>
                                <ContextMenuItem
                                    disabled={!hasOtherTabs}
                                    onClick={() => closeTabsWithAnimation(
                                        displayedTabs.filter(item => !contextIdSet.has(item.id) && !item.pinned).map(item => item.id),
                                        () => onTabAction?.('close-others', contextIds),
                                    )}
                                >
                                    <IconX />
                                    Close other tabs
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => onTabAction?.('new', contextIds)}>
                                    <IconPlus />
                                    New tab
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => onTabAction?.('duplicate', contextIds)}>
                                    <IconCopy />
                                    Duplicate {plural ? 'tabs' : 'tab'}
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    );
                })}
                {onAddTab ? (
                    <button type="button" className={styles.addTab} onClick={onAddTab} aria-label="New tab" title="New tab">
                        <span aria-hidden="true">+</span>
                    </button>
                ) : null}
            </div>

            {/* Right Section - Page Actions */}
            <div className={styles.rightSection}>
                {rightContent}
            </div>
        </div>
    );
}

// ============================================
// ACTION BUTTON FOR RIGHT SECTION
// ============================================

export interface TopbarActionProps {
    onClick?: () => void;
    icon?: React.ReactNode;
    children?: React.ReactNode;
    variant?: 'default' | 'primary' | 'danger' | 'ghost';
    disabled?: boolean;
    className?: string;
}

export function TopbarSeparator({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(styles.actionSeparator, className)}
        />
    );
}

export function TopbarAction({
    onClick,
    icon,
    children,
    variant = 'default',
    disabled,
    className,
}: TopbarActionProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                styles.actionButton,
                styles[`actionButton--${variant}`],
                className
            )}
        >
            {icon && <span className={styles.actionIcon}>{icon}</span>}
            {children && <span>{children}</span>}
        </button>
    );
}

// ============================================
// TOGGLE GROUP FOR RIGHT SECTION (e.g., Day/Week/Month)
// ============================================

export interface TopbarToggleOption {
    value: string;
    label: string;
}

export interface TopbarToggleGroupProps {
    options: TopbarToggleOption[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export function TopbarToggleGroup({
    options,
    value,
    onChange,
    className,
}: TopbarToggleGroupProps) {
    const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const buttonRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

    React.useEffect(() => {
        const activeButton = buttonRefs.current.get(value);
        const container = containerRef.current;

        if (activeButton && container) {
            const containerRect = container.getBoundingClientRect();
            const buttonRect = activeButton.getBoundingClientRect();

            setIndicatorStyle({
                width: buttonRect.width,
                transform: `translateX(${buttonRect.left - containerRect.left - 2}px)`,
            });
        }
    }, [value, options]);

    return (
        <div ref={containerRef} className={cn(styles.toggleGroup, className)}>
            <div className={styles.toggleIndicator} style={indicatorStyle} />
            {options.map((option) => (
                <button
                    key={option.value}
                    ref={(el) => {
                        if (el) buttonRefs.current.set(option.value, el);
                    }}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        styles.toggleButton,
                        value === option.value && styles.toggleButtonActive
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default ContentTopbar;
