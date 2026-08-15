import React, { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react';
import type { ReactNode, MouseEvent, PointerEvent, CSSProperties } from 'react';
import { AppLink as Link } from '@/start/link';
// native img elements replace framework image optimization
import { useAppRouter as useRouter } from '@/start/router';
import { dynamic } from '@/start/dynamic';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { PortalSyncStatusToasts } from '@/components/PortalSyncStatusToasts';
import { previewCalendarEvents, previewCalendars } from '@/lib/dashboard-preview-data';
import { rewriteMailtoHref, splitDetectedLinks } from '@/lib/link-detection';
import { isDesktopApp, openExternal } from '@/lib/desktop/utils';
import DOMPurify from 'isomorphic-dompurify';
import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from '@/styles/Dashboard.module.css';
import type { Notice, AttendanceData, GradeEntry, NotificationState, PortalData } from '@/types/portal';
import { DEFAULT_ATTENDANCE_THRESHOLDS, resolveAttendanceThresholds } from '@/types/portal';
import { highestTabSequence, loadDashboardTabs, saveDashboardTabs } from '@/lib/dashboard-tabs';
import { inferSchoolTermsByYear } from '@/lib/school-terms';
import { NotificationsSidebar } from '@/components/dashboard/notifications/NotificationsSidebar';
import { NotificationsResizer } from '@/components/dashboard/notifications/NotificationsResizer';
import {
    MAX_NOTIFICATION_LIST_WIDTH,
    MAX_NOTIFICATION_SIDEBAR_WIDTH,
    MIN_NOTIFICATION_LIST_WIDTH,
    MIN_NOTIFICATION_SIDEBAR_WIDTH,
    isNotificationEntryVisible,
    listNotificationSidebarOptions,
} from '@/components/dashboard/notifications/notificationLayout';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useGoogleClassroom } from '@/hooks/useGoogleClassroom';
import { useNotifications } from '@/hooks/useNotifications';
import { formatShortcutDisplay, useShortcuts } from '@/hooks/useShortcuts';
import type { ShortcutHandlers } from '@/hooks/useShortcuts';
import { PageTransition, InlineLoader } from '@/components/PageTransition';
import { SimpleTooltip as CustomTooltip } from '@/components/SimpleTooltip';

const NOTIFICATION_RENDER_BATCH_SIZE = 80;
const NOTIFICATION_LOAD_BASE_DISTANCE = 480;
const NOTIFICATION_LOAD_LOOKAHEAD_MS = 650;
const NOTIFICATION_MAX_PRELOAD_DISTANCE = 3200;

function parsePortalDateOnly(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toPortalDayKey(value: Date): string {
    return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0'),
    ].join('-');
}

function isPortalHolidayEvent(event: any): boolean {
    return /holiday/i.test(String(event?.type || event?.title || ''));
}

// Shadcn UI components
import {
    SidebarProvider,
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarMenuBadge,
    SidebarInset,
    SidebarTrigger,
    SidebarRail,
    useSidebar,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarBadge, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { ColorPicker, ColorPickerTrigger, ColorPickerContent } from '@/components/ui/color-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { CommandMenu } from '@/components/CommandMenu';
import { SettingsSidebar } from '@/components/SettingsSidebar';
import { SettingsSectionReset } from '@/components/settings/SettingsSectionReset';
import { defaultHomeSettingsForSection, isResettableSettingsSection } from '@/components/settings/settingsResets';
import { defaultHomeSettings } from '@/types/home';
import { getDataFetchIntervalMs, readDataSettings } from '@/lib/data-settings';
import { loadAndApplySavedTheme } from '@/lib/theme';
import { useAnimationSettings } from '@/hooks/useAnimationSettings';
import { useIsMobile } from '@/components/ui/use-mobile';
import { ContentTopbar } from '@/components/ContentTopbar';
import type { ContentTabAction } from '@/components/ContentTopbar';
import { cn } from '@/lib/utils';
import { BentoGridItem } from '@/components/kokonutui/bento-grid';
import { Toolbar } from '@/components/kokonutui/toolbar';
import { IconExplorer, IconExplorerIcon, normalizeIconExplorerValue } from '@/components/ui/icon-explorer';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DEFAULT_NOTE,
    defaultHomeLayout,
    HIDDEN_HOME_ITEMS,
    HOME_MAX_COLUMNS,
    homeItemColumn,
    homeItemSpan,
} from '@/components/dashboard/home/homeLayout';
import {
    computeHomePlacements,
    homeColumnAtPoint,
    measureHomeColumnRects,
} from '@/components/dashboard/home/homePlacement';
import type { HomeCardPlacement } from '@/components/dashboard/home/homePlacement';
import type {
    HomeCanvasElement,
    HomeItemSpan,
    HomeItemType,
    HomeLayout,
} from '@/components/dashboard/home/homeLayout';

import { useDashboardPreferences } from '@/components/dashboard/preferences/dashboardPreferences';
import { useSyncedDataSettings } from '@/components/dashboard/preferences/useSyncedDataSettings';
import type { NotificationFolder } from '@/components/dashboard/notifications/types';
import {
    RELEASED_DASHBOARD_SECTIONS,
    getDashboardSectionDefinition,
    getSettingsSectionDefinition,
    normalizeSettingsSection,
    type DashboardSectionId,
    type SettingsSectionId,
} from '@/components/dashboard/navigation/dashboardRegistry';
import { useDashboardNavigation } from '@/components/dashboard/navigation/useDashboardNavigation';
import { ProfileImageDialog } from '@/components/dashboard/account/ProfileImageDialog';
import { PortalAccountForm } from '@/components/dashboard/account/PortalAccountForm';
import { SidebarProfileCard } from '@/components/dashboard/SidebarProfileCard';
import { DesktopUpdateButton } from '@/components/dashboard/DesktopUpdateButton';
import { countDueFlashcards, normalizeFlashcardSets } from '@/lib/study';
import { fetchStudyBootstrap } from '@/lib/study/client';
import {
    applyNoteTokens,
    buildNoteTokenValues,
    markdownToHtml,
} from '@/components/markdown/markdown';
import {
    clampNumber,
    clientPointToCanvas,
    elementsInLasso,
    offsetCanvasElement,
    type CanvasPoint,
} from '@/components/dashboard/home/homeCanvasMath';
import { dedupeHomeNotices } from '@/components/dashboard/home/homeNotices';
import {
    HomeImageError,
    prepareHomeImage,
    type PreparedHomeImage,
} from '@/components/dashboard/home/homeImages';
import {
    buildClassInsights,
    detectSyncReviewItems,
    getClassReviewKey,
    normalizeFullTimetable,
} from '@/components/dashboard/classes/classTimetableInsights';
import type {
    ClassInsight,
    RoomChangeReviewItem,
} from '@/components/dashboard/classes/classTimetableInsights';
import {
    findJunkClassEntries,
    pruneJunkClassColors,
    pruneJunkClassKeys,
    sanitizeClassEntries,
} from '@/lib/portal-classes';


/** Shown for the moment a section's code is in flight. Matches the page padding so nothing jumps. */
function DashboardSectionFallback() {
    return (
        <div className={styles.contentWrapper} role="status" aria-live="polite">
            <div className={styles.contentWrapperInner}>
                <Skeleton className="h-24 w-full rounded-xl" />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-48 w-full rounded-xl" />
                    <Skeleton className="h-48 w-full rounded-xl" />
                </div>
                <span className="sr-only">Loading section</span>
            </div>
        </div>
    );
}

/**
 * Dashboard pages and settings panels, loaded when they are opened.
 *
 * One section is on screen at a time, so importing all twenty-two of them eagerly put every page's
 * dependency graph into a single chunk — the study system, the PDF viewer, the theme builder — and
 * that chunk had to be bundled into the server build before it could be deployed. Loading them on
 * demand keeps the shell small; the sections themselves are behind authentication and have nothing
 * worth server-rendering.
 */
const TimetablePage = dynamic(() => import('@/components/dashboard/timetable/TimetablePage').then((module) => ({ default: module.TimetablePage })), {
    loading: DashboardSectionFallback,
});
const ClassesPage = dynamic(() => import('@/components/dashboard/classes/ClassesPage').then((module) => ({ default: module.ClassesPage })), {
    loading: DashboardSectionFallback,
});
const AttendancePage = dynamic(() => import('@/components/dashboard/attendance/AttendancePage').then((module) => ({ default: module.AttendancePage })), {
    loading: DashboardSectionFallback,
});
const ReportsPage = dynamic(() => import('@/components/dashboard/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })), {
    loading: DashboardSectionFallback,
});
const ClassroomPage = dynamic(() => import('@/components/dashboard/classroom/ClassroomPage').then((module) => ({ default: module.ClassroomPage })), {
    loading: DashboardSectionFallback,
});
const StudyShell = dynamic(() => import('@/components/dashboard/study/StudyShell').then((module) => ({ default: module.StudyShell })), {
    loading: DashboardSectionFallback,
});
const PastPapersPage = dynamic(() => import('@/components/dashboard/past-papers/PastPapersPage').then((module) => ({ default: module.PastPapersPage })), {
    loading: DashboardSectionFallback,
});
const GeneralSettings = dynamic(() => import('@/components/settings/GeneralSettings').then((module) => ({ default: module.GeneralSettings })), {
    loading: DashboardSectionFallback,
});
const AssistantProvidersSettings = dynamic(() => import('@/components/settings/AssistantProvidersSettings').then((module) => ({ default: module.AssistantProvidersSettings })), {
    loading: DashboardSectionFallback,
});
const AssistantSettings = dynamic(() => import('@/components/settings/AssistantSettings').then((module) => ({ default: module.AssistantSettings })), {
    loading: DashboardSectionFallback,
});
const FlashcardsSettings = dynamic(() => import('@/components/settings/FlashcardsSettings').then((module) => ({ default: module.FlashcardsSettings })), {
    loading: DashboardSectionFallback,
});
const ThemeBuilder = dynamic(() => import('@/components/settings/ThemeBuilder').then((module) => ({ default: module.ThemeBuilder })), {
    loading: DashboardSectionFallback,
});
const ThemeCreationSidebar = dynamic(() => import('@/components/settings/ThemeCreationSidebar').then((module) => ({ default: module.ThemeCreationSidebar })), {
    loading: DashboardSectionFallback,
});
const ShortcutsSettings = dynamic(() => import('@/components/settings/ShortcutsSettings').then((module) => ({ default: module.ShortcutsSettings })), {
    loading: DashboardSectionFallback,
});
const AnimationsSettings = dynamic(() => import('@/components/settings/AnimationsSettings').then((module) => ({ default: module.AnimationsSettings })), {
    loading: DashboardSectionFallback,
});
const NotificationsSettings = dynamic(() => import('@/components/settings/NotificationsSettings').then((module) => ({ default: module.NotificationsSettings })), {
    loading: DashboardSectionFallback,
});
const AdminSettings = dynamic(() => import('@/components/settings/AdminSettings').then((module) => ({ default: module.AdminSettings })), {
    loading: DashboardSectionFallback,
});
const FeedbackHistorySettings = dynamic(() => import('@/components/settings/FeedbackHistorySettings').then((module) => ({ default: module.FeedbackHistorySettings })), {
    loading: DashboardSectionFallback,
});
const DataSettings = dynamic(() => import('@/components/settings/DataSettings').then((module) => ({ default: module.DataSettings })), {
    loading: DashboardSectionFallback,
});
const ExportSettings = dynamic(() => import('@/components/settings/ExportSettings').then((module) => ({ default: module.ExportSettings })), {
    loading: DashboardSectionFallback,
});
const AccountDeletionSettings = dynamic(() => import('@/components/settings/AccountDeletionSettings').then((module) => ({ default: module.AccountDeletionSettings })), {
    loading: DashboardSectionFallback,
});
const ClassColorsSettings = dynamic(() => import('@/components/settings/ClassColorsSettings').then((module) => ({ default: module.ClassColorsSettings })), {
    loading: DashboardSectionFallback,
});
const PastPapersSettings = dynamic(() => import('@/components/settings/PastPapersSettings').then((module) => ({ default: module.PastPapersSettings })), {
    loading: DashboardSectionFallback,
});

const AssistantChat = dynamic(
    () => import('@/components/dashboard/assistant/AssistantChat'),
    { loading: InlineLoader },
);
import { AssistantDock } from '@/components/dashboard/assistant/AssistantDock';
import { DashboardTour } from '@/components/tour';
import { UpcomingAnnouncement } from '@/components/announcements';
import {
    AdminFeedbackQueue,
    FeedbackAnnouncementSlot,
    FeedbackProvider,
    FeedbackSidebarButton,
} from '@/components/feedback';
import { useTourDashboardAdapter } from '@/hooks/useTourDashboardAdapter';
import { REPLAY_FULL_TOUR_EVENT, REPLAY_UPDATE_TOUR_EVENT } from '@/lib/tour/dashboardRegistry';
import { SYNC_REVIEW_ACK_KEY as ACKED_SYNC_REVIEW_KEY } from '@/lib/one-time-notices';

// Tabler icons
import {
    IconHome,
    IconBell,
    IconUser,
    IconCalendar,
    IconBook,
    IconClock,
    IconColumns1,
    IconColumns2,
    IconFileText,
    IconClipboardCheck,
    IconSettings,
    IconLogout,
    IconChevronDown,
    IconSearch,
    IconActivity,
    IconReportAnalytics,
    IconCalendarEvent,
    IconInbox,
    IconPin,
    IconPinFilled,
    IconAlertCircle,
    IconArchive,
    IconRefresh,
    IconRestore,
    IconMail,
    IconMailOpened,
    IconEye,
    IconFolder,
    IconLayoutSidebar,
    IconFolderPlus,
    IconFolders,
    IconArrowDown,
    IconArrowUp,
    IconArrowLeft,
    IconArrowRight,
    IconMinus,
    IconPalette,
    IconPencil,
    IconPhoto,
    IconPlus,
    IconAlertTriangle,
    IconChecks,
    IconX,
    IconCheck,
    IconTrash,
    IconChevronUp,
    IconArrowBackUp,
    IconArrowForwardUp,
    IconBrush,
    IconCopy,
    IconEraser,
    IconLasso,
    IconLine,
    IconMessageCircle,
    IconPointer,
    IconTextPlus,
    IconZoomIn,
    IconZoomOut,
    IconSchool,
    IconCards,
    IconShieldLock,
} from '@tabler/icons-react';

// Calendar imports
import { Calendar } from '@/components/Calendar';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useLocalEvents } from '@/hooks/useLocalEvents';
import type { CalendarEvent } from '@/types/calendar';
import { useSession } from '@/start/session';
import type { DashboardTab } from '@/lib/dashboard-tabs';

const SEARCH_SHORTCUT_LABEL = formatShortcutDisplay(['mod', 'k']).replaceAll(' + ', '');
type HomeCanvasTool = 'select' | 'lasso' | 'draw' | 'eraser' | 'text' | 'line';
/** Toolbar entries that run an action instead of arming a tool. */
type HomeToolbarAction = HomeCanvasTool | 'image';
type HomeCanvasSelection = { kind: 'element'; id: string } | null;
type SyncReviewDialog =
    | { type: 'unenroll'; item: ClassInsight }
    | { type: 'room-change'; item: RoomChangeReviewItem };
/** Matches `--space-lg`: the gap the home grid fakes through spanned 1px rows. */
const HOME_ROW_GAP = 16;
const HOME_DEFAULT_ACCENT = '#6b7280';
/** Minimum clickable width of a stroke, so thin ink stays selectable and erasable. */
const HOME_CANVAS_HIT_STROKE = 16;
/** Widest a picture is placed at. Taller-than-wide images keep their ratio and simply run longer. */
const HOME_IMAGE_PLACED_MAX_WIDTH = 420;
/** Gap from the visible top-left corner a newly added picture is dropped at. */
const HOME_IMAGE_DROP_INSET = 48;
/** Maps renamed sidebar sections to the identifier stored in older saved preferences. */
const LEGACY_SIDEBAR_ITEM_IDS: Readonly<Record<string, string>> = { flashcards: 'study' };

/**
 * Surface around a Home item. Card style is a user setting rather than a side effect of the layout
 * mode, so both simple columns and the advanced canvas render through this shell.
 *
 * Both styles use the same element and the same motion behaviour; only the decoration differs
 * (`data-card-style` drives it from Dashboard.module.css). Swapping the element per style made the
 * two styles behave differently — minimal canvas cards skipped the layout animation that shows
 * overlap settling on drop — so the element is chosen by layout mode instead: the simple layout
 * disables the layout animation because dnd-kit already owns the sortable transform.
 */
function HomeCardShell({
    stylised,
    animateLayout = true,
    className,
    children,
    ...rest
}: {
    stylised: boolean;
    animateLayout?: boolean;
    className?: string;
    children: React.ReactNode;
    'data-selected'?: string;
    'data-home-item'?: HomeItemType;
}) {
    return (
        <BentoGridItem
            className={className}
            data-card-style={stylised ? 'stylised' : 'minimal'}
            animateLayout={animateLayout}
            highlight={stylised}
            {...rest}
        >
            {children}
        </BentoGridItem>
    );
}


/**
 * Calendars Millennium builds from portal data instead of a user creating them. They have no store
 * of their own, so their sidebar visibility is kept in `calendarHiddenCalendarIds`.
 */
const SCHOOL_CALENDAR_ID = 'school-calendar';
const SYNTHETIC_CALENDAR_IDS = new Set<string>([SCHOOL_CALENDAR_ID]);

// Week A/B auto-detection: Feb 16 2026 is the start of a Week A
const WEEK_A_REFERENCE = new Date(2026, 1, 16); // Month is 0-indexed
function getAutoWeekType(date: Date): 'weekA' | 'weekB' {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const diff = date.getTime() - WEEK_A_REFERENCE.getTime();
    const weekNumber = Math.floor(diff / msPerWeek);
    // Even weeks (0, 2, 4...) = Week A, odd weeks = Week B
    return (weekNumber % 2 === 0 || (weekNumber < 0 && weekNumber % 2 === 0)) ? 'weekA' : 'weekB';
    // Handle negative weeks correctly: -1 should be weekB, -2 weekA etc.
}

function readStringListFromStorage(key: string): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
        return [];
    }
}

function getSyncReviewDialogKey(dialog: SyncReviewDialog): string {
    if (dialog.type === 'unenroll') {
        return `unenroll:${getClassReviewKey(dialog.item)}`;
    }

    return [
        'room',
        dialog.item.classCode || dialog.item.course,
        dialog.item.week,
        dialog.item.day,
        dialog.item.period,
        dialog.item.fromRoom,
        dialog.item.toRoom,
    ].join(':').toLowerCase();
}

function getPortalDataReviewSignature(data: Pick<PortalData, 'classes' | 'timetable' | 'lastUpdated'>): string {
    const timetable = normalizeFullTimetable(data.timetable);
    return [
        data.lastUpdated || '',
        data.classes?.length || 0,
        timetable.weekA.length,
        timetable.weekB.length,
    ].join(':');
}

// Dynamically import heavy components for code splitting
const LoadingSkeleton = dynamic(() => import('@/components/LoadingSkeleton').then(mod => ({
    default: mod.LoadingSkeleton,
})), {
    ssr: false
});

function DashboardLoadingHomeCard({
    titleClassName,
    descriptionClassName,
    rows = 3,
    stats = false,
}: {
    titleClassName: string;
    descriptionClassName: string;
    rows?: number;
    stats?: boolean;
}) {
    return (
        <Card className={`${styles.homeDenseCard} ${styles.dashboardLoadingHomeCard}`}>
            <CardHeader className={styles.homeCardHeader}>
                <div>
                    <CardTitle className="text-sm">
                        <Skeleton className={`h-3.5 ${titleClassName}`} />
                    </CardTitle>
                    <CardDescription>
                        <Skeleton className={`mt-1.5 h-3 ${descriptionClassName}`} />
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {stats ? (
                    <div className={styles.homeStatsGrid}>
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div className={styles.homeStat} key={`loading-stat-${index}`}>
                                <Skeleton className="mb-2 h-4 w-8" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.homeList}>
                        {Array.from({ length: rows }).map((_, index) => (
                            <div className={styles.homeListItem} key={`loading-row-${index}`}>
                                <div>
                                    <Skeleton className="mb-2 h-3 w-32" />
                                    <Skeleton className="h-3 w-44 max-w-full" />
                                </div>
                                <Skeleton className="h-6 w-12 rounded-full" />
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function DashboardLoadingQuickAccess() {
    return (
        <div className={styles.homeQuickAccess}>
            <div className={styles.homeQuickAccessHeader}>
                <Skeleton className="h-3.5 w-[82px]" />
                <Skeleton className="h-3 w-[80px]" />
            </div>
            <div className={styles.homeQuickAccessRows}>
                {[0, 1].map((row) => (
                    <div className={styles.homeQuickAccessRow} key={`loading-qa-row-${row}`}>
                        {[0, 1].map((item) => (
                            <div className={styles.homeQuickAccessItem} key={`loading-qa-${row}-${item}`}>
                                <Card className={styles.homeQuickAccessCard}>
                                    <CardHeader className={styles.homeQuickAccessCardHeader}>
                                        <div className={styles.quickAccessIcon}>
                                            <Skeleton className="h-4 w-4 rounded-sm" />
                                        </div>
                                        <div>
                                            <CardTitle className={styles.quickAccessLabel}>
                                                <Skeleton className="h-3 w-20" />
                                            </CardTitle>
                                            <CardDescription className={styles.quickAccessSubtitle}>
                                                <Skeleton className="mt-1.5 h-3 w-28" />
                                            </CardDescription>
                                        </div>
                                    </CardHeader>
                                </Card>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

function DashboardLoadingNote() {
    return (
        <Card className={`${styles.homeDenseCard} ${styles.dashboardLoadingHomeCard}`}>
            <CardHeader className={styles.noteHeader}>
                <CardTitle className="text-sm">
                    <Skeleton className="h-3.5 w-[32px]" />
                </CardTitle>
                <Skeleton className="h-8 w-[58px]" />
            </CardHeader>
            <CardContent>
                <div className={styles.notePreview}>
                    <Skeleton className="mb-2 h-3 w-full" />
                    <Skeleton className="mb-2 h-3 w-11/12" />
                    <Skeleton className="mb-2 h-3 w-3/4" />
                    <Skeleton className="mt-4 h-3 w-24" />
                </div>
            </CardContent>
        </Card>
    );
}

function DashboardLoadingSkeleton() {
    return (
        <div className={styles.dashboardBody} data-dashboard-shell="true">
            <div className={styles.dashboardLoadingShell} aria-busy="true" aria-live="polite">
                <aside className={styles.dashboardLoadingSidebar} aria-hidden="true">
                    <div className={styles.dashboardLoadingProfile}>
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className={styles.dashboardLoadingProfileText}>
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                    <div className={styles.dashboardLoadingNavGroup}>
                        <Skeleton className="h-3 w-20" />
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div className={styles.dashboardLoadingNavItem} key={`primary-${index}`}>
                                <Skeleton className="h-4 w-4 rounded-sm" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        ))}
                    </div>
                    <div className={styles.dashboardLoadingNavGroup}>
                        <Skeleton className="h-3 w-16" />
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div className={styles.dashboardLoadingNavItem} key={`secondary-${index}`}>
                                <Skeleton className="h-4 w-4 rounded-sm" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        ))}
                    </div>
                </aside>

                <main className={styles.dashboardLoadingMain}>
                    <div className={styles.dashboardLoadingHeader} aria-hidden="true">
                        <div className={styles.dashboardLoadingHeaderTitle}>
                            <Skeleton className="h-4 w-4 rounded-sm" />
                            <Skeleton className="h-3.5 w-[72px]" />
                            <Skeleton className="ml-auto h-3.5 w-3.5 rounded-sm" />
                        </div>
                        <Skeleton className={styles.dashboardLoadingHeaderAdd} />
                    </div>

                    <div className={styles.dashboardLoadingContent} aria-hidden="true">
                        {/* Cards are direct grid children, matching the real Home grid row flow. */}
                        <div className={styles.homeLayout} data-columns="2">
                            <div className={styles.homeItem}>
                                <DashboardLoadingNote />
                            </div>
                            <div className={styles.homeItem}>
                                <DashboardLoadingHomeCard titleClassName="w-[58px]" descriptionClassName="w-[210px]" rows={3} />
                            </div>
                            <div className={styles.homeItem}>
                                <DashboardLoadingQuickAccess />
                            </div>
                            <div className={styles.homeItem}>
                                <DashboardLoadingHomeCard titleClassName="w-[74px]" descriptionClassName="w-[116px]" stats />
                            </div>
                            <div className={styles.homeItem}>
                                <DashboardLoadingHomeCard titleClassName="w-[88px]" descriptionClassName="w-[34px]" rows={3} />
                            </div>
                            <div className={styles.homeItem}>
                                <DashboardLoadingHomeCard titleClassName="w-[105px]" descriptionClassName="w-[56px]" rows={4} />
                            </div>
                        </div>
                    </div>
                </main>
                <div className={styles.dashboardLoadingDock} aria-hidden="true">
                    <Skeleton className="h-8 w-[132px] rounded-md" />
                    <span />
                    <Skeleton className="h-8 w-28 rounded-md" />
                    <Skeleton className="size-8 rounded-md" />
                </div>
                <span className="sr-only">Loading dashboard...</span>
            </div>
        </div>
    );
}

/**
 * Home is a masonry grid: cards differ in height and a card may span both columns, so no card sits
 * in a uniform slot. dnd-kit's `rectSortingStrategy` assumes it does — it rotates the measured rect
 * array and translates each card onto its neighbour's rect, which here throws unrelated cards
 * across the page on every pointer move and lands them somewhere else again on drop.
 *
 * Returning no transform hands the preview back to the real grid instead: the drag handlers move
 * the dragged card in the layout live, `computeHomePlacements` re-places it, and `useSortable`'s
 * derived FLIP transform animates it from where it was to where it now is. What is on screen
 * mid-drag is the arrangement that gets saved.
 */
const homeSortingStrategy: SortingStrategy = () => null;

/**
 * Reordering happens live, so a drop target must be the card the pointer is genuinely inside.
 * `closestCenter` compares centre points, and a tall two-column card's centre routinely wins over
 * the small card actually under the cursor, which flips the target back and forth. The centre pass
 * is kept only as the fallback for the keyboard sensor, which has no pointer coordinates.
 */
const homeCollisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

/**
 * A home card in the sortable grid. While it is being dragged the card itself stays put as a
 * placeholder and the floating copy is rendered by `DragOverlay`, which is what lets neighbouring
 * cards reflow under the pointer instead of the dragged card snapping back until it is dropped.
 *
 * The card does not choose where it goes. It measures its natural height, reports it upwards, and
 * renders whatever grid column and row `computeHomePlacements` hands back — that is what keeps a
 * card in its own column when a card elsewhere on the page grows or shrinks.
 *
 * Before every card has been measured there is no placement to render, and the card falls back to
 * auto-placement with its own row span so the first frame is a plain flowed grid rather than a pile.
 */
const SortableHomeItem = ({
    id,
    children,
    disabled,
    homeItem,
    span,
    placement,
    fallbackRowSpan,
    onMeasure,
}: {
    id: string;
    children: ReactNode;
    disabled: boolean;
    homeItem?: HomeItemType;
    span: HomeItemSpan;
    placement?: HomeCardPlacement;
    fallbackRowSpan?: number;
    onMeasure: (id: string, height: number) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id,
        disabled,
        // dnd-kit skips its layout-change animation while sorting because the sorting strategy is
        // normally the thing doing the animating. This grid has no strategy transform, so the FLIP
        // pass is the only thing that stops a live reorder from teleporting cards between slots.
        animateLayoutChanges: () => true,
    });
    const contentRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const content = contentRef.current;
        if (!content || typeof ResizeObserver === 'undefined') return undefined;

        const measure = () => {
            const height = content.getBoundingClientRect().height;
            if (height > 0) onMeasure(id, height);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        return () => observer.disconnect();
    }, [id, onMeasure]);

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString({
            x: transform?.x ?? 0,
            y: transform?.y ?? 0,
            scaleX: 1,
            scaleY: 1,
        }),
        transition,
        ...(placement
            ? {
                gridColumn: `${placement.column + 1} / span ${placement.columnSpan}`,
                gridRow: `${placement.rowStart} / span ${placement.rowSpan}`,
            }
            : {
                gridColumn: `span ${span}`,
                ...(fallbackRowSpan ? { gridRow: `span ${fallbackRowSpan}` } : {}),
            }),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={styles.homeItemSortable}
            data-home-item={homeItem}
            data-span={span}
            data-dragging={isDragging ? 'true' : 'false'}
            {...attributes}
            {...listeners}
        >
            <div ref={contentRef} className={styles.homeItemMeasure}>
                {children}
            </div>
        </div>
    );
};

const SortableQuickAccessItem = ({ id, children, disabled }: { id: string; children: ReactNode; disabled: boolean }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString({
            x: transform?.x ?? 0,
            y: transform?.y ?? 0,
            scaleX: 1,
            scaleY: 1,
        }),
        transition,
        zIndex: isDragging ? 2 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={styles.homeQuickAccessSortable}
            {...attributes}
            {...listeners}
        >
            {children}
        </div>
    );
};

function AccountSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className={styles.accountSection}>
            <div className={styles.accountSectionHeader}>
                <h3>{title}</h3>
            </div>
            <div className={styles.accountSectionPanel}>
                {children}
            </div>
        </section>
    );
}

function AccountRow({
    icon,
    label,
    value,
    children,
}: {
    icon?: ReactNode;
    label: string;
    value?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className={styles.accountRow}>
            {icon ? <div className={styles.accountRowIcon}>{icon}</div> : null}
            <div className={styles.accountRowBody}>
                <div className={styles.accountRowLabel}>{label}</div>
            </div>
            {value ? <div className={styles.accountRowValue}>{value}</div> : null}
            {children ? <div className={styles.accountRowAction}>{children}</div> : null}
        </div>
    );
}

function AccountMetric({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: ReactNode;
}) {
    return (
        <div className={styles.accountMetric}>
            <div className={styles.accountMetricIcon}>{icon}</div>
            <div>
                <div className={styles.accountMetricValue}>{value}</div>
                <div className={styles.accountMetricLabel}>{label}</div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const isPhone = useIsMobile();
    const router = useRouter();
    const isPreviewMode = router.query.preview === '1';
    const isAssistantPreviewMode = router.query.previewAssistant === '1';
    const [clientReady, setClientReady] = useState(false);
    const [syncScheduleNow, setSyncScheduleNow] = useState(0);
    const staleAutoSyncRef = useRef('');

    useEffect(() => {
        setClientReady(true);
    }, []);

    useEffect(() => {
        const updateCountdown = () => setSyncScheduleNow(Date.now());
        updateCountdown();
        const interval = window.setInterval(updateCountdown, 30_000);
        window.addEventListener('millennium-data-settings-change', updateCountdown);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('millennium-data-settings-change', updateCountdown);
        };
    }, []);

    // Use custom hooks for better organization
    const {
        session,
        isLoading,
        portalData,
        setPortalData,
        dataLoading,
        isExternalSyncRunning,
        checkSession,
        loadPortalData,
        handleLogout
    } = useDashboardData(isPreviewMode);

    const classroom = useGoogleClassroom(session?.userId, !isPreviewMode && Boolean(session?.loggedIn));

    const {
        homeSettings,
        updateHomeSettings,
        homeLayout,
        setHomeLayout,
        notificationFolders,
        setNotificationFolders,
        relativeNotificationDates,
        setRelativeNotificationDates,
        attendanceSettings,
        setAttendanceSettings,
        loaded: homeSettingsLoaded,
    } = useDashboardPreferences(session?.userId);

    useSyncedDataSettings(homeSettings.dataSettings, homeSettingsLoaded && !isPreviewMode, updateHomeSettings);

    const notificationFolderIdList = useMemo(
        () => notificationFolders.map((folder: { id: string }) => folder.id),
        [notificationFolders]
    );

    const [isNotificationsEditing, setIsNotificationsEditing] = useState(false);
    /**
     * Which customise mode has a reset waiting on confirmation.
     *
     * Both resets discard arrangement work that can represent a lot of fiddling and cannot be
     * recovered once saved, so neither fires straight off the button.
     */
    const [resetCustomiseTarget, setResetCustomiseTarget] = useState<'home' | 'notifications' | null>(null);

    const NOTIFICATION_CATEGORY_ICONS: Record<string, typeof IconInbox> = useMemo(() => ({
        inbox: IconInbox,
        pinned: IconPin,
        alerts: IconAlertCircle,
        events: IconCalendarEvent,
        assignments: IconClipboardCheck,
        archive: IconArchive,
    }), []);

    const attendanceThresholds = useMemo(
        () => resolveAttendanceThresholds(attendanceSettings),
        [attendanceSettings]
    );

    const hasPerfectAttendance = Boolean(
        portalData?.attendance?.yearly?.some((year) => year.totalPercentage === 100)
        || portalData?.attendance?.subjects?.some((subject) => subject.percentage === 100)
    );

    const notificationHooks = useNotifications(
        portalData?.notices,
        homeSettings.disableFutureNotifications,
        session?.userId,
        homeSettings.notificationAutoArchiveAfter,
        homeSettings.notificationRules,
        notificationFolderIdList,
    );

    const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([]);
    const [homeNotificationGlance, setHomeNotificationGlance] = useState<{
        notice: Notice;
        notificationId: string;
        sourceRect: { centerX: number; centerY: number; width: number; height: number };
        targetRect: { width: number; height: number };
    } | null>(null);
    const [homeNotificationGlanceOpen, setHomeNotificationGlanceOpen] = useState(false);
    const homeNotificationGlanceCloseTimerRef = useRef<number | null>(null);
    const preserveNextNotificationSelectionRef = useRef(false);
    const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
    const [isMultiSelectKeyActive, setIsMultiSelectKeyActive] = useState(false);
    const [collapsedNotificationDateKeys, setCollapsedNotificationDateKeys] = useState<string[]>([]);
    const [visibleNotificationCount, setVisibleNotificationCount] = useState(NOTIFICATION_RENDER_BATCH_SIZE);
    const notificationListContentRef = useRef<HTMLDivElement | null>(null);
    const notificationLoadMoreRef = useRef<HTMLDivElement | null>(null);
    const notificationScrollFrameRef = useRef<number | null>(null);
    const notificationLastScrollRef = useRef({ top: 0, time: 0 });

    const [foldersExpanded, setFoldersExpanded] = useState(true);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderTitle, setNewFolderTitle] = useState('');
    const [newFolderSubtitle, setNewFolderSubtitle] = useState('');
    const [newFolderIcon, setNewFolderIcon] = useState('IconFolder');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editFolderTitle, setEditFolderTitle] = useState('');
    const [editFolderSubtitle, setEditFolderSubtitle] = useState('');
    const [editFolderIcon, setEditFolderIcon] = useState('IconFolder');
    const [deleteFolderConfirmId, setDeleteFolderConfirmId] = useState<string | null>(null);

    const renderLinkedText = useCallback((text: string) => (
        splitDetectedLinks(text).map((part, index) => (
            part.href ? (
                <a key={`${part.href}-${index}`} href={part.href} target="_blank" rel="noopener noreferrer">
                    {part.text}
                </a>
            ) : part.text
        ))
    ), []);

    const sanitizeNoticeHtml = useCallback((html: string) => {
        const sanitized = DOMPurify.sanitize(html);
        if (typeof document === 'undefined') return sanitized;

        const template = document.createElement('template');
        template.innerHTML = sanitized;
        template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
            const href = rewriteMailtoHref(anchor.getAttribute('href') || '');
            anchor.setAttribute('href', href);
            if (/^https?:\/\//i.test(href)) {
                anchor.setAttribute('target', '_blank');
                anchor.setAttribute('rel', 'noopener noreferrer');
            }
        });

        return template.innerHTML;
    }, []);

    // Calendar hooks
    const googleCalendar = useGoogleCalendar();
    const localEvents = useLocalEvents(session?.userId);

    // Animation settings hook
    const animationSettings = useAnimationSettings();
    const navigationTransitionDelay = animationSettings.animationsEnabled
        ? Math.round(150 * (100 / animationSettings.settings.animationSpeed))
        : 0;

    const {
        currentSection,
        currentView,
        isInSettings,
        settingsSection,
        navigateToSection,
        replaceWithSection,
        navigateToSettings,
        replaceWithSettings,
        navigateToNotifications,
        closeSettings,
    } = useDashboardNavigation({
        startPage: homeSettings.startPage,
        loggedIn: Boolean(session?.loggedIn),
        preferencesLoaded: homeSettingsLoaded,
    });

    const tourNavigation = useTourDashboardAdapter({
        navigateToSection,
        navigateToNotifications,
        navigateToSettings,
        closeTransientUi: () => setShowCommandMenu(false),
        onDisableAiAgent: () => updateHomeSettings({ showAiAgent: false }),
    });

    const currentTabTarget = isInSettings
        ? (settingsSection === 'general' ? 'settings' : `settings/${settingsSection}`)
        : currentView === 'notifications' ? 'notifications' : currentSection || 'home';
    const [openDashboardTabs, setOpenDashboardTabs] = useState<DashboardTab[]>([
        { id: 'tab-1', target: currentTabTarget, pinned: false },
    ]);
    const [activeDashboardTabId, setActiveDashboardTabId] = useState('tab-1');
    const [selectedDashboardTabIds, setSelectedDashboardTabIds] = useState<string[]>(['tab-1']);
    const tabSequenceRef = useRef(1);
    const tabsRestoredRef = useRef(false);
    /**
     * Tab actions are declared far below the shortcut handler map, so they are reached through
     * a ref rather than being captured directly (which would be a temporal dead zone at render).
     */
    const tabActionsRef = useRef<{
        newTab?: () => void;
        closeActiveTab?: () => void;
        cycleTab?: (offset: number) => void;
        switchToTab?: (tabId: string) => void;
    }>({});
    /** Scroll offset per tab, so returning to a tab lands where it was left. */
    const tabScrollPositionsRef = useRef<Record<string, number>>({});

    // Restore the tab strip once per session, after the account is known so the snapshot is
    // read from that account's scoped storage rather than a previous user's.
    useEffect(() => {
        if (tabsRestoredRef.current || !session?.userId) return;
        tabsRestoredRef.current = true;

        const snapshot = loadDashboardTabs(session.userId);
        if (!snapshot) return;

        tabSequenceRef.current = Math.max(tabSequenceRef.current, highestTabSequence(snapshot.tabs));
        // The active tab adopts the landing target so the "start page" preference still decides
        // where a session opens; every other restored tab keeps the page it was left on.
        setOpenDashboardTabs(snapshot.tabs.map(tab => (
            tab.id === snapshot.activeTabId ? { ...tab, target: currentTabTarget } : tab
        )));
        setActiveDashboardTabId(snapshot.activeTabId);
        setSelectedDashboardTabIds([snapshot.activeTabId]);
    }, [currentTabTarget, session?.userId]);

    useEffect(() => {
        if (!tabsRestoredRef.current || !session?.userId) return;
        saveDashboardTabs({ tabs: openDashboardTabs, activeTabId: activeDashboardTabId }, session.userId);
    }, [activeDashboardTabId, openDashboardTabs, session?.userId]);

    useEffect(() => {
        setOpenDashboardTabs(tabs => tabs.map(tab => (
            tab.id === activeDashboardTabId && tab.target !== currentTabTarget
                ? { ...tab, target: currentTabTarget }
                : tab
        )));
    }, [activeDashboardTabId, currentTabTarget]);

    useEffect(() => {
        setSelectedDashboardTabIds(selectedIds => {
            const openIds = new Set(openDashboardTabs.map(tab => tab.id));
            const validIds = selectedIds.filter(id => openIds.has(id));
            if (validIds.length) return validIds;
            if (openIds.has(activeDashboardTabId)) return [activeDashboardTabId];
            return openDashboardTabs[0] ? [openDashboardTabs[0].id] : [];
        });
    }, [activeDashboardTabId, openDashboardTabs]);

    useEffect(() => {
        if (!isPreviewMode) return;
        if (!isInSettings && (currentSection !== 'assistant' || isAssistantPreviewMode)) return;
        replaceWithSection('account');
    }, [currentSection, isAssistantPreviewMode, isInSettings, isPreviewMode, replaceWithSection]);

    useEffect(() => {
        if (!session) return;
        if (isInSettings && settingsSection === 'admin' && session.role !== 'admin') {
            replaceWithSettings('general');
        }
    }, [isInSettings, replaceWithSettings, session, settingsSection]);

    const [profileImageOverride, setProfileImage] = useState<string | null | undefined>(undefined);
    const profileImage = profileImageOverride === undefined
        ? session?.profileImage || null
        : profileImageOverride;

    useEffect(() => {
        if (isPreviewMode || !session?.loggedIn || profileImageOverride !== undefined) return;
        let cancelled = false;
        void fetch('/api/user/profile-image', { cache: 'force-cache' })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
                if (!cancelled) setProfileImage(data?.profileImage || null);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [isPreviewMode, profileImageOverride, session?.loggedIn]);

    const handleCalendarNoticeClick = useCallback((notice: any) => {
        const resolvedIndex = typeof notice.originalIndex === 'number'
            ? notice.originalIndex
            : (portalData?.notices?.findIndex(n => n.title === notice.title && n.date === notice.date) ?? 0);

        // Find the notification in the notifications hook
        const notificationId = notificationHooks.getNotificationId(notice, resolvedIndex);
        const state = notificationHooks.notificationStates[notificationId];

        // Determine which category to switch to
        let targetCategory = 'inbox';
        if (state?.archived) {
            targetCategory = 'archive';
        } else if (state?.pinned) {
            targetCategory = 'pinned';
        } else if (state?.folderId) {
            targetCategory = `folder:${state.folderId}`;
        } else {
            // Check derived category (alerts, events, assignments)
            // We can't easily access deriveCategory here as it's internal to the hook,
            // but we can just use 'inbox' as a safe default or re-implement the logic
            const title = notice.title.toLowerCase();
            if (title.includes('alert') || title.includes('urgent')) targetCategory = 'alerts';
            else if (title.includes('event') || title.includes('meeting')) targetCategory = 'events';
            else if (title.includes('assignment') || title.includes('homework')) targetCategory = 'assignments';
        }

        const resolvedNotice = portalData?.notices?.[resolvedIndex] || notice;
        notificationHooks.setSelectedNotification(resolvedNotice);
        notificationHooks.setSelectedCategory(targetCategory);
        preserveNextNotificationSelectionRef.current = true;

        navigateToNotifications();

        setSelectedNotificationIds([notificationId]);
    }, [navigateToNotifications, notificationHooks, portalData?.notices]);

    const convertEmoticonsToEmoji = useCallback((value: string) => {
        if (!homeSettings.convertEmoticonsToEmojis) return value;
        return value
            .replace(/:\)/g, '🙂')
            .replace(/:-\)/g, '🙂')
            .replace(/:\(/g, '🙁')
            .replace(/:-\(/g, '🙁')
            .replace(/:D/g, '😄')
            .replace(/;-\)/g, '😉')
            .replace(/;\)/g, '😉')
            .replace(/:P/gi, '😛')
            .replace(/<3/g, '❤️');
    }, [homeSettings.convertEmoticonsToEmojis]);

    const dateLocale = useMemo(() => {
        if (homeSettings.dateFormat === 'MDY') return 'en-US';
        if (homeSettings.dateFormat === 'YMD') return 'sv-SE';
        return 'en-GB';
    }, [homeSettings.dateFormat]);

    const formatDateByPreference = useCallback((value: Date | string, options?: Intl.DateTimeFormatOptions) => {
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toLocaleDateString(dateLocale, options);
    }, [dateLocale]);

    const [isHomeEditing, setIsHomeEditing] = useState(false);
    const [previewHomeRearranging, setPreviewHomeRearranging] = useState(false);
    const [isNoteEditing, setIsNoteEditing] = useState(false);
    const [noteDraft, setNoteDraft] = useState(homeLayout.note);
    const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const homeCanvasRef = useRef<HTMLDivElement | null>(null);
    const homeImageInputRef = useRef<HTMLInputElement | null>(null);
    const homeInteractionRef = useRef<{
        mode: 'draw' | 'erase' | 'lasso' | 'line' | 'move-element' | 'resize-element' | 'resize-line';
        id?: string;
        startClientX: number;
        startClientY: number;
        startWorldX: number;
        startWorldY: number;
        lastWorldX?: number;
        lastWorldY?: number;
        element?: HomeCanvasElement;
        erasedIds?: Set<string>;
        /** Freeform path of an in-progress lasso, in canvas coordinates. */
        lassoPoints?: CanvasPoint[];
        /** Pre-drag snapshot of every element the move applies to, keyed by id. */
        movingElements?: Map<string, HomeCanvasElement>;
    } | null>(null);
    const [homeCanvasTool, setHomeCanvasTool] = useState<HomeCanvasTool>('select');
    const [homeCanvasSelection, setHomeCanvasSelection] = useState<HomeCanvasSelection>(null);
    /** Lasso result. The single-element `homeCanvasSelection` still drives the text inspector. */
    const [homeCanvasSelectedIds, setHomeCanvasSelectedIds] = useState<string[]>([]);
    const [homeLassoPoints, setHomeLassoPoints] = useState<CanvasPoint[] | null>(null);
    const [drawColor, setDrawColor] = useState(HOME_DEFAULT_ACCENT);
    const [drawStrokeWidth, setDrawStrokeWidth] = useState(4);
    const [textDefaults, setTextDefaults] = useState({
        fontFamily: 'Inter',
        fontSize: 22,
        color: HOME_DEFAULT_ACCENT,
        highlightColor: 'transparent',
    });
    const [removingCanvasElementIds, setRemovingCanvasElementIds] = useState<string[]>([]);
    const [newCanvasElementIds, setNewCanvasElementIds] = useState<string[]>([]);
    const homeLayoutHistoryRef = useRef<{
        past: HomeLayout[];
        future: HomeLayout[];
        last: string;
        isRestoring: boolean;
    }>({ past: [], future: [], last: '', isRestoring: false });
    const homeLayoutRef = useRef(homeLayout);
    const homeHistorySuspendedRef = useRef(false);
    const homeHistoryTransactionRef = useRef(false);
    const [, setHomeHistoryVersion] = useState(0);
    const [activeHomeDragId, setActiveHomeDragId] = useState<string | null>(null);
    const [activeHomeDragRect, setActiveHomeDragRect] = useState<{ width: number; height: number } | null>(null);
    /** Order and columns as the drag found them, so a cancelled gesture restores rather than keeps its preview. */
    const homeDragOrderRef = useRef<Pick<HomeLayout, 'items' | 'itemColumns'> | null>(null);
    /** Order the current drag reordered away from, used to refuse an immediate reversal. */
    const homeDragPreviousOrderKeyRef = useRef<string | null>(null);
    /** The card grid element, read during a drag to find which column the pointer is over. */
    const homeGridRef = useRef<HTMLDivElement | null>(null);
    /**
     * Measured card heights, keyed by card. Placement is computed here rather than by the cards
     * themselves because a card's row depends on the cards above it in its column.
     */
    const [homeItemHeights, setHomeItemHeights] = useState<Partial<Record<HomeItemType, number>>>({});
    /**
     * Columns the grid is actually rendering, read back from it rather than taken from the
     * preference: a responsive override can collapse Home to one column, and placing cards for two
     * columns while the page shows one would put them in rows nothing occupies.
     */
    const [measuredHomeColumns, setMeasuredHomeColumns] = useState<number | null>(null);

    useEffect(() => {
        if (!isPreviewMode || isAssistantPreviewMode) return undefined;

        function handlePreviewMessage(event: MessageEvent) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'millennium-preview-home-rearrange') return;

            setPreviewHomeRearranging(true);
            setHomeLayout(prev => ({
                ...prev,
                items: ['calendar', 'quick_access', 'notifications', 'attendance_snapshot', 'note', 'today_classes'],
            }));
            window.setTimeout(() => setPreviewHomeRearranging(false), 1500);
        }

        window.addEventListener('message', handlePreviewMessage);
        return () => window.removeEventListener('message', handlePreviewMessage);
    }, [isAssistantPreviewMode, isPreviewMode, setHomeLayout]);

    // Enhanced dashboard state
    const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
    const [studyDueCount, setStudyDueCount] = useState(0);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [showCommandMenu, setShowCommandMenu] = useState(false);
    const [pageTransitioning, setPageTransitioning] = useState(false);
    const [sidebarTransitioning, setSidebarTransitioning] = useState(false);
    const [selectedWeek, setSelectedWeek] = useState<'weekA' | 'weekB'>(() => getAutoWeekType(new Date()));
    const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'week' | 'month'>('week');
    const [calendarGoToToday, setCalendarGoToToday] = useState(0); // Increment to trigger go to today
    const [calendarGoToPrev, setCalendarGoToPrev] = useState(0);
    const [calendarGoToNext, setCalendarGoToNext] = useState(0);
    const [showCreateEventModal, setShowCreateEventModal] = useState(false);
    const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [themeCreateMode, setThemeCreateMode] = useState<'simple' | 'advanced' | null>(null);
    const [themeEditDraft, setThemeEditDraft] = useState<any | null>(null);
    const [showGoogleConnectInfo, setShowGoogleConnectInfo] = useState(false);
    const [showGoogleHideConfirm, setShowGoogleHideConfirm] = useState(false);
    const [syncReviewQueue, setSyncReviewQueue] = useState<SyncReviewDialog[]>([]);
    const locallyUnenrolledClassKeys = homeSettings.unenrolledClassKeys;
    const [ackedSyncReviewKeys, setAckedSyncReviewKeys] = useState<string[]>(() => readStringListFromStorage(ACKED_SYNC_REVIEW_KEY));
    const previousPortalDataRef = useRef<PortalData | null>(null);
    const lastReviewSignatureRef = useRef('');
    const activeSyncReview = syncReviewQueue[0] || null;

    useEffect(() => {
        if (isPhone) setCalendarViewMode('day');
    }, [isPhone]);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const cookieValue = document.cookie
            .split('; ')
            .find((cookie) => cookie.startsWith('sidebar_state='))
            ?.split('=')[1];

        if (cookieValue === 'true') {
            setSidebarOpen(true);
        } else if (cookieValue === 'false') {
            setSidebarOpen(false);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(ACKED_SYNC_REVIEW_KEY, JSON.stringify(ackedSyncReviewKeys));
    }, [ackedSyncReviewKeys]);

    const acknowledgeSyncReview = useCallback((dialog: SyncReviewDialog) => {
        const key = getSyncReviewDialogKey(dialog);
        setAckedSyncReviewKeys(prev => prev.includes(key) ? prev : [...prev, key]);
        setSyncReviewQueue(prev => prev.slice(1));
    }, []);

    const handleLocalUnenroll = useCallback((dialog: Extract<SyncReviewDialog, { type: 'unenroll' }>) => {
        const classKey = getClassReviewKey(dialog.item);
        if (!locallyUnenrolledClassKeys.includes(classKey)) {
            updateHomeSettings({ unenrolledClassKeys: [...locallyUnenrolledClassKeys, classKey] });
        }
        acknowledgeSyncReview(dialog);
        toast.success(`${dialog.item.classCode || dialog.item.course} hidden from Classes`);
    }, [acknowledgeSyncReview, locallyUnenrolledClassKeys, updateHomeSettings]);

    useEffect(() => {
        if (!portalData?.lastUpdated) return;

        const signature = getPortalDataReviewSignature(portalData);
        if (lastReviewSignatureRef.current === signature) return;

        const previous = previousPortalDataRef.current;
        previousPortalDataRef.current = portalData;
        lastReviewSignatureRef.current = signature;

        const review = detectSyncReviewItems(previous, portalData);
        const nextDialogs: SyncReviewDialog[] = [
            ...review.roomChanges.map((item): SyncReviewDialog => ({ type: 'room-change', item })),
            ...review.unenrollCandidates.map((item): SyncReviewDialog => ({ type: 'unenroll', item })),
        ].filter(dialog => {
            const reviewKey = getSyncReviewDialogKey(dialog);
            if (ackedSyncReviewKeys.includes(reviewKey)) return false;
            if (dialog.type === 'unenroll' && locallyUnenrolledClassKeys.includes(getClassReviewKey(dialog.item))) return false;
            return true;
        });

        if (nextDialogs.length > 0) {
            setSyncReviewQueue(prev => {
                const existing = new Set(prev.map(getSyncReviewDialogKey));
                return [
                    ...prev,
                    ...nextDialogs.filter(dialog => !existing.has(getSyncReviewDialogKey(dialog))),
                ];
            });
        }
    }, [ackedSyncReviewKeys, locallyUnenrolledClassKeys, portalData]);

    const holidayDateKeys = useMemo(() => {
        const dates = new Set<string>();
        for (const event of portalData?.calendar || []) {
            if (!isPortalHolidayEvent(event)) continue;
            const date = parsePortalDateOnly(event.date);
            if (date) dates.add(toPortalDayKey(date));
        }
        return dates;
    }, [portalData?.calendar]);

    /**
     * Terms for the most recent year the calendar covers. The attendance page only buckets
     * dated records, so a single year's terms is the useful unit rather than every year.
     */
    const schoolTerms = useMemo(() => {
        const byYear = inferSchoolTermsByYear(portalData?.calendar || []);
        if (byYear.size === 0) return [];
        const latestYear = Math.max(...byYear.keys());
        return byYear.get(latestYear) || [];
    }, [portalData?.calendar]);

    const portalCalendarEvents = useMemo(() => {
        return (portalData?.calendar || []).flatMap((event: any): CalendarEvent[] => {
            const start = parsePortalDateOnly(event.date);
            if (!start) return [];
            const end = new Date(start);
            end.setDate(start.getDate() + 1);
            return [{
                id: `school_${toPortalDayKey(start)}_${String(event.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                title: String(event.title || 'School event'),
                description: event.type ? String(event.type) : undefined,
                start,
                end,
                allDay: true,
                calendarId: SCHOOL_CALENDAR_ID,
                calendarName: 'School Calendar',
                color: isPortalHolidayEvent(event) ? '#f59e0b' : '#06b6d4',
                isLocal: true,
                sourceType: 'local',
            }];
        });
    }, [portalData?.calendar]);

    const classEvents = useMemo(() => {
        if (!portalData?.timetable || Array.isArray(portalData.timetable)) return [] as CalendarEvent[];
        const timetable = portalData.timetable as { weekA?: any[]; weekB?: any[] };

        // Helper to get color
        const getClassEventColor = (course: string) => {
            const colors: Record<string, string> = {
                'Mathematics': '#3b82f6',
                'English': '#10b981',
                'Science': '#8b5cf6',
                'Physics': '#8b5cf6',
                'Chemistry': '#ec4899',
                'Biology': '#10b981',
                'History': '#f59e0b',
                'Geography': '#06b6d4',
                'PDHPE': '#ef4444',
                'Music': '#ec4899',
                'Art': '#f97316',
                'Technology': '#6366f1',
                'Languages': '#14b8a6',
                'Religion': '#a855f7',
                'Studies': '#f59e0b',
            };
            for (const [subject, color] of Object.entries(colors)) {
                if (course.toLowerCase().includes(subject.toLowerCase())) return color;
            }
            return '#8b5cf6';
        };

        const dayIndex: Record<string, number> = {
            monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
        };

        const periodSchedule: Record<string, { start: number; end: number }> = {
            '1': { start: 8 * 60 + 45, end: 9 * 60 + 24 },
            '2': { start: 9 * 60 + 24, end: 10 * 60 + 3 },
            '3': { start: 10 * 60 + 3, end: 10 * 60 + 42 },
            '3a': { start: 10 * 60 + 3, end: 10 * 60 + 42 },
            '3b': { start: 10 * 60 + 32, end: 11 * 60 + 11 },
            '4': { start: 11 * 60 + 11, end: 11 * 60 + 50 },
            '5': { start: 11 * 60 + 50, end: 12 * 60 + 31 },
            '6': { start: 12 * 60 + 31, end: 13 * 60 + 8 },
            '6a': { start: 12 * 60 + 31, end: 13 * 60 + 8 },
            '6b': { start: 12 * 60 + 58, end: 13 * 60 + 37 },
            '7': { start: 13 * 60 + 37, end: 14 * 60 + 16 },
            '8': { start: 14 * 60 + 16, end: 14 * 60 + 55 },
        };

        const parsePeriodCode = (period: unknown) => {
            const raw = String(period || '').toLowerCase();
            const match = raw.match(/(\d+)\s*([ab])?/);
            if (!match) return null;
            const periodNumber = Number(match[1]);
            const suffix = match[2] || '';
            const periodCode = `${periodNumber}${suffix}`;
            return { periodNumber, periodCode };
        };

        const getPeriodBounds = (dayKey: string, periodCode: string) => {
            const normalizedCode = String(periodCode || '').toLowerCase();
            const numberOnly = normalizedCode.match(/\d+/)?.[0] || normalizedCode;
            const bounds = periodSchedule[normalizedCode] || periodSchedule[numberOnly];
            if (!bounds) return null;
            if (dayKey === 'tuesday' && numberOnly === '8') {
                return { ...bounds, end: bounds.start + 28 };
            }
            return bounds;
        };

        const mapped: CalendarEvent[] = [];

        // Calculate base Monday for the current view
        const now = new Date();
        const currentWeekStart = new Date(now);
        const day = currentWeekStart.getDay();
        const mondayOffset = (day + 6) % 7;
        currentWeekStart.setDate(currentWeekStart.getDate() - mondayOffset);
        currentWeekStart.setHours(0, 0, 0, 0);

        const referenceWeekStart = new Date(WEEK_A_REFERENCE);
        referenceWeekStart.setHours(0, 0, 0, 0);
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const lastGeneratedWeekOffset = Math.max(0, Math.floor((currentWeekStart.getTime() - referenceWeekStart.getTime()) / msPerWeek) + 1);

        for (let weekOffset = 0; weekOffset <= lastGeneratedWeekOffset; weekOffset++) {
            const weekStart = new Date(referenceWeekStart);
            weekStart.setDate(referenceWeekStart.getDate() + (weekOffset * 7));
            const targetWeekType = getAutoWeekType(weekStart);

            const weekEntries = targetWeekType === 'weekA' ? (timetable.weekA || []) : (timetable.weekB || []);
            if (!weekEntries.length) continue;

            // Parse periods for this week
            const parsedPeriods = weekEntries
                .map((entry: any) => {
                    const parsed = parsePeriodCode(entry.period);
                    if (!parsed) return null;
                    const dayKey = String(entry.day || '').toLowerCase();
                    const periodBounds = getPeriodBounds(dayKey, parsed.periodCode);
                    if (!periodBounds) return null;
                    return {
                        ...entry,
                        periodNumber: parsed.periodNumber,
                        periodCode: parsed.periodCode,
                        periodBounds,
                    };
                })
                .filter((entry: any): entry is any => Boolean(entry));

            // Merge logic (simplified integration from original)
            const sourceEntries = homeSettings.calendarMergeConsecutivePeriods
                ? (() => {
                    const byDay = new Map<string, any[]>();
                    for (const entry of parsedPeriods) {
                        const key = String(entry.day || '').toLowerCase();
                        if (!byDay.has(key)) byDay.set(key, []);
                        byDay.get(key)!.push(entry);
                    }
                    const merged: any[] = [];
                    for (const [, dayEntries] of byDay) {
                        const sorted = [...dayEntries].sort((a, b) => a.periodBounds.start - b.periodBounds.start);
                        let current: any | null = null;
                        for (const entry of sorted) {
                            if (!current) {
                                current = {
                                    ...entry,
                                    periodStart: entry.periodCode,
                                    periodEnd: entry.periodCode,
                                    periodStartBounds: entry.periodBounds,
                                    periodEndBounds: entry.periodBounds,
                                };
                                continue;
                            }
                            const sameClass = current.course === entry.course && current.classCode === entry.classCode && current.teacher === entry.teacher && current.room === entry.room;
                            const touchesPreviousPeriod = current.periodEndBounds?.end === entry.periodBounds.start;
                            if (sameClass && touchesPreviousPeriod) {
                                current.periodEnd = entry.periodCode;
                                current.periodEndBounds = entry.periodBounds;
                            } else {
                                merged.push(current);
                                current = {
                                    ...entry,
                                    periodStart: entry.periodCode,
                                    periodEnd: entry.periodCode,
                                    periodStartBounds: entry.periodBounds,
                                    periodEndBounds: entry.periodBounds,
                                };
                            }
                        }
                        if (current) merged.push(current);
                    }
                    return merged;
                })()
                : parsedPeriods.map((entry: any) => ({
                    ...entry,
                    periodStart: entry.periodCode,
                    periodEnd: entry.periodCode,
                    periodStartBounds: entry.periodBounds,
                    periodEndBounds: entry.periodBounds,
                }));

            for (const entry of sourceEntries) {
                const dayKey = String(entry.day || '').toLowerCase();
                const idx = dayIndex[dayKey];
                if (idx === undefined) continue;

                const eventDate = new Date(weekStart);
                eventDate.setDate(weekStart.getDate() + idx);
                if (holidayDateKeys.has(toPortalDayKey(eventDate))) continue;

                const startBounds = entry.periodStartBounds || getPeriodBounds(dayKey, entry.periodStart);
                const endBounds = entry.periodEndBounds || getPeriodBounds(dayKey, entry.periodEnd);
                if (!startBounds || !endBounds) continue;

                const start = new Date(eventDate);
                start.setHours(Math.floor(startBounds.start / 60), startBounds.start % 60, 0, 0);

                const end = new Date(eventDate);
                end.setHours(Math.floor(endBounds.end / 60), endBounds.end % 60, 0, 0);

                const classCode = String(entry.classCode || '');
                // Unique ID must include week offset to differentiate weeks
                mapped.push({
                    id: `class_w${weekOffset}_${targetWeekType}_${dayKey}_${entry.periodStart}_${entry.periodEnd}_${classCode || 'nocode'}`,
                    title: entry.course || entry.subject || classCode || `Period ${entry.periodStart}`,
                    description: [entry.teacher, entry.room].filter(Boolean).join(' • ') || undefined,
                    start,
                    end,
                    calendarId: 'classes',
                    calendarName: 'Classes',
                    color: getClassEventColor(entry.course || entry.subject || 'Class'),
                    location: entry.room || undefined,
                    isLocal: true,
                    sourceType: 'class',
                });
            }
        }
        return mapped;
    }, [holidayDateKeys, portalData?.timetable, homeSettings.calendarMergeConsecutivePeriods]);

    const CAL_SYNC_MAP_KEY = 'millennium_google_sync_map_v2';
    const LEGACY_CAL_SYNC_MAP_KEY = 'millennium_google_sync_map_v1';
    type SyncMapValue = { googleEventId: string; calendarId: string; source: 'local' | 'class'; hash: string };
    type SyncMap = Record<string, SyncMapValue>;

    const [syncMap, setSyncMap] = useState<SyncMap>({});
    const [syncMapOwnerKey, setSyncMapOwnerKey] = useState('');
    const isSyncRunningRef = useRef(false);
    const [isSmartCleaning, setIsSmartCleaning] = useState(false);
    const [smartCleanHint, setSmartCleanHint] = useState('No duplicates found');

    const calendarSyncMapKey = useMemo(
        () => session?.userId ? `${CAL_SYNC_MAP_KEY}:${session.userId}` : '',
        [session?.userId]
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setSyncMap({});
        setSyncMapOwnerKey('');
        if (!calendarSyncMapKey) return;
        try {
            const parsed = JSON.parse(localStorage.getItem(calendarSyncMapKey) || '{}');
            if (parsed && typeof parsed === 'object') {
                const validated = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, SyncMapValue] => {
                    const value = entry[1] as Partial<SyncMapValue> | null;
                    return Boolean(
                        value &&
                        typeof value.googleEventId === 'string' &&
                        typeof value.calendarId === 'string' &&
                        (value.source === 'local' || value.source === 'class') &&
                        typeof value.hash === 'string'
                    );
                }));
                setSyncMap(validated);
            }
        } catch {
            setSyncMap({});
        }
        // The legacy journal was shared by every account in the browser and may
        // contain raw event fingerprints. Never attach it to the current user.
        localStorage.removeItem(LEGACY_CAL_SYNC_MAP_KEY);
        setSyncMapOwnerKey(calendarSyncMapKey);
    }, [calendarSyncMapKey]);

    const persistSyncMap = useCallback((nextMap: SyncMap) => {
        setSyncMap(nextMap);
        setSyncMapOwnerKey(calendarSyncMapKey);
        if (typeof window !== 'undefined' && calendarSyncMapKey) {
            localStorage.setItem(calendarSyncMapKey, JSON.stringify(nextMap));
        }
    }, [calendarSyncMapKey]);

    const toSafeIso = useCallback((value: Date | string | undefined) => {
        const parsed = value ? new Date(value) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) return '';
        return parsed.toISOString();
    }, []);

    const exactDuplicateKey = useCallback((event: CalendarEvent) => {
        return [
            event.title,
            event.description || '',
            event.location || '',
            toSafeIso(event.start),
            toSafeIso(event.end),
            event.allDay ? '1' : '0',
            event.calendarId || '',
        ].join('|');
    }, [toSafeIso]);

    const compactFingerprint = useCallback((value: string) => {
        let first = 0x811c9dc5;
        let second = 0x9e3779b9;
        for (let index = 0; index < value.length; index += 1) {
            const code = value.charCodeAt(index);
            first = Math.imul(first ^ code, 0x01000193);
            second = Math.imul(second ^ code, 0x85ebca6b);
        }
        return `v2:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
    }, []);

    const eventHash = useCallback(
        (event: CalendarEvent) => compactFingerprint(exactDuplicateKey(event)),
        [compactFingerprint, exactDuplicateKey]
    );

    const syncJournalKey = useCallback(
        (source: 'local' | 'school' | 'class', id: string) => `${source}:${compactFingerprint(id)}`,
        [compactFingerprint]
    );

    const syncIdentityKey = useCallback((event: CalendarEvent, calendarId: string) => {
        return [
            event.title,
            event.description || '',
            event.location || '',
            toSafeIso(event.start),
            toSafeIso(event.end),
            event.allDay ? '1' : '0',
            calendarId || '',
        ].join('|');
    }, [toSafeIso]);

    // The school calendar is synthesised from portal calendar data rather than owned by a store, so
    // its checkbox state lives in preferences alongside the other calendar settings.
    const hiddenSyntheticCalendarIds = useMemo(
        () => new Set(homeSettings.calendarHiddenCalendarIds),
        [homeSettings.calendarHiddenCalendarIds]
    );

    const allCalendars = useMemo(
        () => [
            ...(isPreviewMode ? previewCalendars : localEvents.calendars),
            ...(portalCalendarEvents.length > 0
                ? [{
                    id: SCHOOL_CALENDAR_ID,
                    name: 'School Calendar',
                    color: '#f59e0b',
                    icon: 'IconCalendarEvent',
                    visible: !hiddenSyntheticCalendarIds.has(SCHOOL_CALENDAR_ID),
                    isLocal: true,
                }]
                : []),
            ...googleCalendar.calendars
        ],
        [googleCalendar.calendars, hiddenSyntheticCalendarIds, isPreviewMode, localEvents.calendars, portalCalendarEvents.length]
    );

    const googleEventIds = useMemo(
        () => new Set(googleCalendar.events.map((event) => event.id)),
        [googleCalendar.events]
    );

    const syncedGoogleEventIds = useMemo(
        () => new Set(Object.values(syncMap).map((entry) => entry.googleEventId)),
        [syncMap]
    );

    const visibleLocalEvents = useMemo(
        () => isPreviewMode ? previewCalendarEvents : [...localEvents.events, ...portalCalendarEvents],
        [isPreviewMode, localEvents.events, portalCalendarEvents]
    );

    const visibleClassEvents = useMemo(
        () => classEvents,
        [classEvents]
    );

    const visibleGoogleEvents = useMemo(
        () => googleCalendar.events.filter((event) => !syncedGoogleEventIds.has(event.id)),
        [googleCalendar.events, syncedGoogleEventIds]
    );

    const allEvents = useMemo(
        () => [...visibleLocalEvents, ...visibleGoogleEvents],
        [visibleLocalEvents, visibleGoogleEvents]
    );

    const duplicateGroups = useMemo(() => {
        const groups = new Map<string, CalendarEvent[]>();
        const candidates = [...localEvents.events, ...googleCalendar.events];

        for (const event of candidates) {
            const key = exactDuplicateKey(event);
            if (!key) continue;
            const existing = groups.get(key);
            if (existing) {
                existing.push(event);
            } else {
                groups.set(key, [event]);
            }
        }

        return Array.from(groups.values()).filter((group) => group.length > 1);
    }, [localEvents.events, googleCalendar.events, exactDuplicateKey]);

    const duplicateCount = useMemo(
        () => duplicateGroups.reduce((acc, group) => acc + (group.length - 1), 0),
        [duplicateGroups]
    );

    const hideGoogleValidationBanner = useCallback(() => {
        updateHomeSettings({ calendarShowGoogleValidationBanner: false });
        setShowGoogleHideConfirm(false);
    }, [updateHomeSettings]);

    useEffect(() => {
        if (isSmartCleaning) return;
        if (duplicateCount <= 0) {
            setSmartCleanHint('No duplicates found');
            return;
        }
        setSmartCleanHint(`Clean ${duplicateCount} duplicate event${duplicateCount === 1 ? '' : 's'}`);
    }, [duplicateCount, isSmartCleaning]);

    const googleEventsBySyncIdentity = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const event of googleCalendar.events) {
            const key = syncIdentityKey(event, event.calendarId || 'primary');
            const existing = map.get(key);
            if (existing) {
                existing.push(event);
            } else {
                map.set(key, [event]);
            }
        }
        return map;
    }, [googleCalendar.events, syncIdentityKey]);

    const resolveGoogleTargetCalendarId = useCallback((event: CalendarEvent) => {
        if (googleCalendar.calendars.some((cal) => cal.id === event.calendarId)) {
            return event.calendarId;
        }

        const normalizedName = String(event.calendarName || '').trim().toLowerCase();
        if (normalizedName) {
            const matchingCalendar = googleCalendar.calendars.find(
                (cal) => cal.name.trim().toLowerCase() === normalizedName
            );
            if (matchingCalendar) return matchingCalendar.id;
        }
        return 'primary';
    }, [googleCalendar.calendars]);

    const handleToggleCalendar = useCallback((calendarId: string) => {
        if (localEvents.calendars.some(c => c.id === calendarId)) {
            localEvents.toggleCalendarVisibility(calendarId);
            return;
        }
        // Synthesised calendars have no store to toggle, and falling through to Google left the
        // school calendar permanently visible.
        if (SYNTHETIC_CALENDAR_IDS.has(calendarId)) {
            const hidden = new Set(homeSettings.calendarHiddenCalendarIds);
            if (hidden.has(calendarId)) hidden.delete(calendarId);
            else hidden.add(calendarId);
            updateHomeSettings({ calendarHiddenCalendarIds: [...hidden] });
            return;
        }
        googleCalendar.toggleCalendarVisibility(calendarId);
    }, [googleCalendar, homeSettings.calendarHiddenCalendarIds, localEvents, updateHomeSettings]);

    const handleCreateEvent = useCallback((event: Partial<CalendarEvent>) => {
        if (event.calendarId === 'classes' || event.sourceType === 'class') return;
        const target = allCalendars.find(c => c.id === event.calendarId);
        if (target?.isGoogle) {
            googleCalendar.createEvent({ ...event, calendarId: target.id });
            return;
        }
        localEvents.addEvent(event);
    }, [allCalendars, googleCalendar, localEvents]);

    const handleCreateCalendar = useCallback((name: string, color = '#3b82f6') => {
        const created = localEvents.addCalendar(name, color);
        if (googleCalendar.isAuthenticated) {
            googleCalendar.createCalendar(name, color);
        }
        return created;
    }, [localEvents, googleCalendar]);

    const handleRenameCalendar = useCallback((calendarId: string, name: string) => {
        if (calendarId === 'classes') return;
        localEvents.renameCalendar(calendarId, name);
    }, [localEvents]);

    const handleRemoveCalendar = useCallback((calendarId: string) => {
        if (calendarId === 'classes') return;
        localEvents.removeCalendar(calendarId);
    }, [localEvents]);

    const handleChangeCalendarColor = useCallback((calendarId: string, color: string) => {
        if (localEvents.calendars.some((calendar) => calendar.id === calendarId)) {
            localEvents.updateCalendarColor(calendarId, color);
            return;
        }
        googleCalendar.updateCalendarColor(calendarId, color);
    }, [localEvents, googleCalendar]);

    const handleChangeCalendarIcon = useCallback((calendarId: string, icon: string) => {
        if (calendarId === 'classes') return;
        if (localEvents.calendars.some((calendar) => calendar.id === calendarId)) {
            localEvents.updateCalendarIcon(calendarId, icon);
            return;
        }
        googleCalendar.updateCalendarIcon(calendarId, icon);
    }, [localEvents, googleCalendar]);

    const handleUpdateEvent = useCallback((event: CalendarEvent) => {
        if (event.calendarId === 'classes' || event.sourceType === 'class') return;
        if (event.isLocal) {
            localEvents.updateEvent(event.id, event);
            return;
        }
        const existingGoogle = googleCalendar.events.find((googleEvent) => googleEvent.id === event.id);
        const sourceCalendarId = existingGoogle?.calendarId || event.calendarId;
        const targetCalendarId = event.calendarId;
        googleCalendar.updateEvent({
            ...event,
            calendarId: sourceCalendarId,
            sourceCalendarId,
            targetCalendarId,
        } as CalendarEvent);
    }, [localEvents, googleCalendar]);

    const handleDeleteEvent = useCallback((event: CalendarEvent) => {
        if (event.calendarId === 'classes' || event.sourceType === 'class') return;
        if (event.isLocal) {
            localEvents.deleteEvent(event.id);
            return;
        }
        googleCalendar.deleteEvent(event);
    }, [localEvents, googleCalendar]);

    const handleSmartClean = useCallback(async () => {
        if (isSmartCleaning) return;
        setIsSmartCleaning(true);
        setSmartCleanHint('Smart Cleaner is working...');

        try {
            if (duplicateGroups.length === 0) {
                toast.info('No duplicate events found.');
                setSmartCleanHint('No duplicates found');
                return;
            }

            const removedGoogleIds = new Set<string>();
            let removedLocal = 0;
            let removedGoogle = 0;

            for (const group of duplicateGroups) {
                const sorted = [...group].sort((a, b) => {
                    const startDiff = new Date(a.start).getTime() - new Date(b.start).getTime();
                    if (startDiff !== 0) return startDiff;
                    return a.id.localeCompare(b.id);
                });

                const googleOnly = sorted.filter((event) => !event.isLocal);
                if (googleOnly.length > 1) {
                    for (const duplicate of googleOnly.slice(1)) {
                        const deleted = await googleCalendar.deleteEvent(duplicate, { refresh: false });
                        if (deleted) {
                            removedGoogleIds.add(duplicate.id);
                            removedGoogle += 1;
                        }
                    }
                    continue;
                }

                if (googleOnly.length === 1) {
                    continue;
                }

                for (const duplicate of sorted.slice(1)) {
                    localEvents.deleteEvent(duplicate.id);
                    removedLocal += 1;
                }
            }

            if (removedGoogleIds.size > 0) {
                const nextMap: SyncMap = { ...syncMap };
                let changed = false;
                for (const [key, value] of Object.entries(nextMap)) {
                    if (removedGoogleIds.has(value.googleEventId)) {
                        delete nextMap[key];
                        changed = true;
                    }
                }
                if (changed) {
                    persistSyncMap(nextMap);
                }
                googleCalendar.refresh();
            }

            const removedTotal = removedLocal + removedGoogle;
            if (removedTotal > 0) {
                toast.success(`Smart Cleaner removed ${removedTotal} duplicate event${removedTotal === 1 ? '' : 's'}.`);
                setSmartCleanHint(`Removed ${removedTotal} duplicate event${removedTotal === 1 ? '' : 's'}`);
            } else {
                toast.info('No duplicates could be removed.');
                setSmartCleanHint('No duplicates found');
            }
        } finally {
            setIsSmartCleaning(false);
        }
    }, [duplicateGroups, isSmartCleaning, localEvents, googleCalendar, syncMap, persistSyncMap]);

    useEffect(() => {
        if (
            !googleCalendar.isAuthenticated ||
            googleCalendar.isLoading ||
            !calendarSyncMapKey ||
            syncMapOwnerKey !== calendarSyncMapKey ||
            homeSettings.calendarSyncMode === 'none' ||
            isSyncRunningRef.current
        ) {
            return;
        }

        let cancelled = false;

        const timeout = window.setTimeout(async () => {
            if (cancelled || isSyncRunningRef.current) return;
            isSyncRunningRef.current = true;

            try {
                let nextMap: SyncMap = { ...syncMap };
                let mapChanged = false;
                let remoteMutations = false;
                let failedMutations = 0;
                const missingRemoteKeys = new Set<string>();

                const desired: Array<{ key: string; event: CalendarEvent; source: 'local' | 'class' }> = [];
                if (homeSettings.calendarSyncMode === 'local' || homeSettings.calendarSyncMode === 'local_and_classes') {
                    for (const event of localEvents.events) {
                        desired.push({ key: syncJournalKey('local', event.id), event, source: 'local' });
                    }
                    for (const event of portalCalendarEvents) {
                        desired.push({ key: syncJournalKey('school', event.id), event, source: 'local' });
                    }
                }
                if (homeSettings.calendarSyncMode === 'local_and_classes') {
                    for (const event of classEvents) {
                        desired.push({ key: syncJournalKey('class', event.id), event, source: 'class' });
                    }
                }
                const desiredKeys = new Set(desired.map((item) => item.key));

                // Handle remote deletions first. If a remote event disappeared, drop the mapping
                // and let sync recreate it from local/class sources on the next pass.
                for (const [key, entry] of Object.entries(nextMap)) {
                    if (cancelled) return;
                    const existsRemotely = googleEventIds.has(entry.googleEventId);
                    if (!existsRemotely) {
                        missingRemoteKeys.add(key);
                        delete nextMap[key];
                        mapChanged = true;
                    }
                }

                for (const item of desired) {
                    if (cancelled) return;
                    if (missingRemoteKeys.has(item.key)) continue;
                    const existing = nextMap[item.key];
                    const hash = eventHash(item.event);
                    let targetCalendarId = resolveGoogleTargetCalendarId(item.event);
                    const desiredCalendarName = String(item.event.calendarName || '').trim();
                    if (targetCalendarId === 'primary' && desiredCalendarName && desiredCalendarName.toLowerCase() !== 'google calendar') {
                        const createdCalendar = await googleCalendar.createCalendar(desiredCalendarName, item.event.color || '#3b82f6');
                        if (createdCalendar?.id) {
                            targetCalendarId = createdCalendar.id;
                        } else {
                            failedMutations += 1;
                            continue;
                        }
                    }
                    const identityKey = syncIdentityKey(item.event, targetCalendarId);

                    if (!existing) {
                        const alreadyOnGoogle = googleEventsBySyncIdentity.get(identityKey)?.[0];
                        if (alreadyOnGoogle?.id) {
                            nextMap[item.key] = {
                                googleEventId: alreadyOnGoogle.id,
                                calendarId: alreadyOnGoogle.calendarId || targetCalendarId,
                                source: item.source,
                                hash,
                            };
                            mapChanged = true;
                            continue;
                        }

                        const created = await googleCalendar.createEvent({
                            ...item.event,
                            calendarId: targetCalendarId,
                            sourceType: item.source,
                        }, { refresh: false });
                        if (created?.id) {
                            nextMap[item.key] = {
                                googleEventId: created.id,
                                calendarId: created.calendarId || targetCalendarId,
                                source: item.source,
                                hash,
                            };
                            mapChanged = true;
                            remoteMutations = true;
                        } else {
                            failedMutations += 1;
                        }
                        continue;
                    }

                    if (existing.hash !== hash) {
                        const updated = await googleCalendar.updateEvent({
                            ...item.event,
                            id: existing.googleEventId,
                            calendarId: existing.calendarId || 'primary',
                            targetCalendarId,
                            sourceType: item.source,
                            isLocal: false,
                        } as CalendarEvent, { refresh: false });
                        if (updated) {
                            nextMap[item.key] = { ...existing, hash, calendarId: targetCalendarId };
                            mapChanged = true;
                            remoteMutations = true;
                        } else {
                            failedMutations += 1;
                        }
                    }
                }

                for (const [key, entry] of Object.entries(nextMap)) {
                    if (cancelled) return;
                    if (desiredKeys.has(key)) continue;
                    const deleted = await googleCalendar.deleteEvent({
                            id: entry.googleEventId,
                            calendarId: entry.calendarId || 'primary',
                            title: '',
                            start: new Date(),
                            end: new Date(),
                            calendarName: 'Google Calendar',
                        }, { refresh: false });
                    if (deleted) {
                        remoteMutations = true;
                        delete nextMap[key];
                        mapChanged = true;
                    } else {
                        // Preserve the journal entry so a transient provider failure can
                        // be retried without losing ownership of the remote event.
                        failedMutations += 1;
                    }
                }

                if (mapChanged) {
                    persistSyncMap(nextMap);
                }
                if (remoteMutations) {
                    googleCalendar.refresh();
                }
                if (failedMutations > 0 && !cancelled) {
                    toast.error(`Google Calendar sync could not apply ${failedMutations} change${failedMutations === 1 ? '' : 's'}. It will retry without discarding sync history.`);
                }
            } finally {
                isSyncRunningRef.current = false;
            }
        }, 40);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [
        googleCalendar,
        googleCalendar.isAuthenticated,
        googleCalendar.isLoading,
        calendarSyncMapKey,
        syncMapOwnerKey,
        googleEventIds,
        syncMap,
        homeSettings.calendarSyncMode,
        localEvents.events,
        portalCalendarEvents,
        classEvents,
        eventHash,
        syncJournalKey,
        syncIdentityKey,
        googleEventsBySyncIdentity,
        resolveGoogleTargetCalendarId,
        persistSyncMap,
        googleCalendar.createEvent,
        googleCalendar.createCalendar,
        googleCalendar.updateEvent,
        googleCalendar.deleteEvent,
        googleCalendar.refresh,
    ]);

    /**
     * Derived, never mirrored into state. A separate copy drifted from the saved preference
     * whenever a load resolved between an edit and its save, which is how customised class colours
     * appeared to revert until the next sign-in.
     */
    const customClassColors = useMemo(
        () => homeSettings.classColors || {},
        [homeSettings.classColors],
    );

    // Pointer-cursor preference lives on <html>, not the shell div: dialogs, dropdowns, popovers,
    // selects, tooltips and context menus are portalled to document.body and would otherwise never
    // match a selector rooted at the dashboard shell.
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-pointer-cursors', homeSettings.usePointerCursors ? 'true' : 'false');
        return () => {
            root.removeAttribute('data-pointer-cursors');
        };
    }, [homeSettings.usePointerCursors]);

    // Load and apply saved theme on mount. Marketing previews stay on the shipped default theme so
    // the landing page never reflects whatever the visitor happens to have saved.
    useEffect(() => {
        if (isPreviewMode) return;
        loadAndApplySavedTheme();
    }, [isPreviewMode]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleKeyChange = (event: KeyboardEvent) => {
            setIsMultiSelectKeyActive(event.shiftKey || event.metaKey || event.ctrlKey);
        };

        const handleWindowBlur = () => setIsMultiSelectKeyActive(false);

        window.addEventListener('keydown', handleKeyChange);
        window.addEventListener('keyup', handleKeyChange);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyChange);
            window.removeEventListener('keyup', handleKeyChange);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, []);

    useEffect(() => {
        homeLayoutRef.current = homeLayout;
    }, [homeLayout, setHomeLayout]);

    const getHomeLayoutHistoryKey = useCallback((layout: HomeLayout) => JSON.stringify(layout), []);

    const beginHomeLayoutTransaction = useCallback(() => {
        if (homeHistoryTransactionRef.current) return;
        const history = homeLayoutHistoryRef.current;
        const snapshot = homeLayoutRef.current;
        const serialized = getHomeLayoutHistoryKey(snapshot);

        if (history.last !== serialized) {
            history.last = serialized;
        }

        history.past = [...history.past.slice(-59), snapshot];
        history.future = [];
        homeHistorySuspendedRef.current = true;
        homeHistoryTransactionRef.current = true;
        setHomeHistoryVersion(version => version + 1);
    }, [getHomeLayoutHistoryKey]);

    const endHomeLayoutTransaction = useCallback(() => {
        homeHistorySuspendedRef.current = false;
        homeHistoryTransactionRef.current = false;
        homeLayoutHistoryRef.current.last = getHomeLayoutHistoryKey(homeLayoutRef.current);
        setHomeHistoryVersion(version => version + 1);
    }, [getHomeLayoutHistoryKey]);

    useEffect(() => {
        const history = homeLayoutHistoryRef.current;
        const serialized = getHomeLayoutHistoryKey(homeLayout);

        if (!history.last) {
            history.last = serialized;
            return;
        }

        if (history.last === serialized) return;

        if (homeHistorySuspendedRef.current) {
            history.last = serialized;
            return;
        }

        if (history.isRestoring) {
            history.last = serialized;
            history.isRestoring = false;
            setHomeHistoryVersion(version => version + 1);
            return;
        }

        history.past = [...history.past.slice(-59), JSON.parse(history.last) as HomeLayout];
        history.future = [];
        history.last = serialized;
        setHomeHistoryVersion(version => version + 1);
    }, [getHomeLayoutHistoryKey, homeLayout]);

    const undoHomeLayout = useCallback(() => {
        const history = homeLayoutHistoryRef.current;
        const previous = history.past.pop();
        if (!previous) return;
        history.future = [homeLayout, ...history.future.slice(0, 59)];
        history.isRestoring = true;
        setHomeLayout(previous);
        setHomeHistoryVersion(version => version + 1);
    }, [homeLayout, setHomeLayout]);

    const redoHomeLayout = useCallback(() => {
        const history = homeLayoutHistoryRef.current;
        const next = history.future.shift();
        if (!next) return;
        history.past = [...history.past.slice(-59), homeLayout];
        history.isRestoring = true;
        setHomeLayout(next);
        setHomeHistoryVersion(version => version + 1);
    }, [homeLayout, setHomeLayout]);

    /**
     * Restores the default Home arrangement.
     *
     * The note is deliberately kept. It is writing the student did, not layout they arranged, and
     * losing it to a layout reset would be the kind of surprise no confirmation dialog excuses.
     * The reset opens a history transaction, so Cmd-Z still walks it back.
     */
    const resetHomeCustomisation = useCallback(() => {
        // No history transaction: this is a single committed change, so the tracking effect records
        // it on its own. Opening a transaction here would stamp the history against a layout ref
        // that has not been updated yet in this tick.
        setHomeLayout(prev => ({
            ...defaultHomeLayout,
            // Cloned rather than shared. These are module-level defaults, and handing the live
            // layout a reference to them makes the next edit rewrite the defaults themselves.
            items: [...defaultHomeLayout.items],
            itemSpans: { ...defaultHomeLayout.itemSpans },
            canvasElements: [],
            quickAccessSlots: defaultHomeLayout.quickAccessSlots.map(slot => ({ ...slot })),
            note: prev.note,
        }));
        setHomeCanvasSelection(null);
        setHomeCanvasSelectedIds([]);
        setHomeCanvasTool('select');
        toast.success('Home layout reset. Your note was kept.');
    }, [setHomeLayout]);

    /**
     * Restores the default Notifications arrangement: sidebar order, entry visibility, and the two
     * column widths. Notices, folders, and their read/pinned/filed state are untouched — this resets
     * how the page is laid out, not what is in it.
     */
    const resetNotificationsCustomisation = useCallback(() => {
        updateHomeSettings({
            notificationSidebarOrder: [...defaultHomeSettings.notificationSidebarOrder],
            notificationSidebarVisibility: { ...defaultHomeSettings.notificationSidebarVisibility },
            notificationSidebarWidth: defaultHomeSettings.notificationSidebarWidth,
            notificationListWidth: defaultHomeSettings.notificationListWidth,
        });
        toast.success('Notifications layout reset. Your folders and notices were kept.');
    }, [updateHomeSettings]);

    useEffect(() => {
        const handleHomeUndoRedo = (event: KeyboardEvent) => {
            if (currentSection !== 'home') return;
            const isMod = event.metaKey || event.ctrlKey;
            if (!isMod || event.key.toLowerCase() !== 'z') return;

            event.preventDefault();
            if (event.shiftKey) {
                redoHomeLayout();
            } else {
                undoHomeLayout();
            }
        };

        window.addEventListener('keydown', handleHomeUndoRedo);
        return () => window.removeEventListener('keydown', handleHomeUndoRedo);
    }, [currentSection, redoHomeLayout, undoHomeLayout]);

    useEffect(() => {
        if (!isHomeEditing) {
            setHomeCanvasSelection(null);
            setHomeCanvasSelectedIds([]);
            setHomeLassoPoints(null);
            setHomeCanvasTool('select');
        }
    }, [isHomeEditing, setHomeLayout]);

    useEffect(() => {
        if (!isNoteEditing) {
            setNoteDraft(homeLayout.note);
        }
    }, [homeLayout.note, isNoteEditing]);

    // Destructure notification hooks
    const {
        isStateLoaded: notificationStateLoaded,
        selectedCategory,
        setSelectedCategory,
        selectedNotification,
        setSelectedNotification,
        notificationSearchQuery,
        setNotificationSearchQuery,
        notificationStates,
        notificationCounts,
        updateNotificationStates,
        toggleRead,
        setRead,
        togglePin,
        setPinned,
        toggleArchive,
        setArchived,
        setCategory,
        setImportance,
        setFolder,
        markAllAsRead,
        getFilteredNotifications,
        notificationFolderIds,
        getNotificationId
    } = notificationHooks;

    /**
     * Sidebar rows in the reader's saved order, with hidden entries dropped. Folder rows carry
     * their own unread count because folder membership can come from a routing rule rather
     * than the per-category counters.
     */
    const notificationSidebarOptions = useMemo(() => {
        const folderUnread = new Map<string, number>();
        Object.entries(notificationFolderIds as Record<string, string>).forEach(([notificationId, folderId]) => {
            const state = notificationStates[notificationId];
            if (state?.read || state?.archived) return;
            folderUnread.set(folderId, (folderUnread.get(folderId) || 0) + 1);
        });

        return listNotificationSidebarOptions(notificationFolders, homeSettings.notificationSidebarOrder)
            .map((entry) => {
                const Icon = NOTIFICATION_CATEGORY_ICONS[entry.id] ?? IconFolder;
                return {
                    id: entry.id,
                    label: entry.label,
                    icon: entry.folder
                        ? <IconExplorerIcon name={entry.folder.icon} size={20} />
                        : <Icon size={20} stroke={1.5} />,
                    count: entry.folder
                        ? folderUnread.get(entry.folder.id) || 0
                        : (notificationCounts[entry.id as keyof typeof notificationCounts] || 0),
                };
            });
    }, [
        NOTIFICATION_CATEGORY_ICONS,
        homeSettings.notificationSidebarOrder,
        notificationCounts,
        notificationFolderIds,
        notificationFolders,
        notificationStates,
    ]);

    const notificationSidebarItems = useMemo(
        () => notificationSidebarOptions.filter((item) => (
            isNotificationEntryVisible(item.id, homeSettings.notificationSidebarVisibility)
        )),
        [homeSettings.notificationSidebarVisibility, notificationSidebarOptions]
    );

    const notificationHiddenSidebarItems = useMemo(
        () => notificationSidebarOptions.filter((item) => (
            !isNotificationEntryVisible(item.id, homeSettings.notificationSidebarVisibility)
        )),
        [homeSettings.notificationSidebarVisibility, notificationSidebarOptions]
    );

    // Removing the entry that is currently open would leave the list showing nothing, so the
    // selection falls back to the first row still in the sidebar.
    useEffect(() => {
        if (notificationSidebarItems.length === 0) return;
        if (notificationSidebarItems.some((item) => item.id === selectedCategory)) return;
        setSelectedCategory(notificationSidebarItems[0].id);
    }, [notificationSidebarItems, selectedCategory, setSelectedCategory]);

    const setNotificationEntryVisible = useCallback((id: string, visible: boolean) => {
        updateHomeSettings({
            notificationSidebarVisibility: {
                ...homeSettings.notificationSidebarVisibility,
                [id]: visible ? 'show' : 'hide',
            },
        });
    }, [homeSettings.notificationSidebarVisibility, updateHomeSettings]);

    const deriveNotificationCategory = useCallback((notice: Notice) => {
        const title = notice.title.toLowerCase();
        if (title.includes('alert') || title.includes('urgent')) return 'alerts';
        if (title.includes('event') || title.includes('meeting')) return 'events';
        if (title.includes('assignment') || title.includes('homework')) return 'assignments';
        return 'inbox';
    }, []);

    const getNoticeCategory = useCallback((notice: Notice, notificationId: string) => {
        return notificationStates[notificationId]?.category || deriveNotificationCategory(notice);
    }, [notificationStates, deriveNotificationCategory]);

    const getNoticeImportance = useCallback((notificationId: string) => {
        return notificationStates[notificationId]?.importance;
    }, [notificationStates]);

    const essentialSidebarIds = useMemo(() => (
        RELEASED_DASHBOARD_SECTIONS.filter(section => 'sidebarGroup' in section && section.sidebarGroup === 'essentials').map(section => section.id)
    ), []);
    const registerSidebarIds = useMemo(() => (
        RELEASED_DASHBOARD_SECTIONS.filter(section => 'sidebarGroup' in section && section.sidebarGroup === 'register').map(section => section.id)
    ), []);
    /**
     * The student's year level, for the past papers filter's detected default.
     *
     * Read from the most recent report rather than a profile field, because a report states the
     * year it was issued for and the portal profile does not carry one. Null when there are no
     * reports yet, which the filter shows as "any year level" rather than guessing.
     */
    const detectedPaperYearLevel = useMemo(() => {
        const reports = portalData?.reports ?? [];
        const newest = [...reports].sort(
            (a, b) => (b.calendarYear ?? 0) - (a.calendarYear ?? 0) || (b.semester ?? 0) - (a.semester ?? 0),
        )[0];
        const match = newest?.yearLevel?.match(/\b(9|10|11|12)\b/);
        return match ? `yr${match[1]}` : null;
    }, [portalData?.reports]);

    const studySidebarIds = useMemo(() => (
        RELEASED_DASHBOARD_SECTIONS.filter(section => 'sidebarGroup' in section && section.sidebarGroup === 'study').map(section => section.id)
    ), []);

    /**
     * Reads the due count on load so the sidebar badge is right before Flashcards is ever opened.
     *
     * The count has to come from the same source the page uses, otherwise the badge silently
     * disagrees with it until the page mounts and overwrites the number: accounts on normalized
     * storage are scheduled server-side by FSRS and reported through the study bootstrap, and only
     * accounts still on the legacy JSONB snapshot are counted from the flashcard sets.
     */
    useEffect(() => {
        if (isPreviewMode || !session?.loggedIn || !homeSettingsLoaded) return;
        let active = true;

        const readDueCount = async (): Promise<number | null> => {
            const bootstrap = await fetchStudyBootstrap().catch(() => null);
            if (bootstrap?.capabilities.normalizedStorage) return bootstrap.dueCount;

            const legacyResponse = await fetch('/api/study/flashcards', { cache: 'no-store' });
            if (!legacyResponse.ok) return null;
            const legacy = await legacyResponse.json();
            return countDueFlashcards(normalizeFlashcardSets(legacy?.sets));
        };

        void readDueCount()
            .then(due => {
                if (!active || due === null) return;
                setStudyDueCount(due);
                if (!homeSettings.studyReviewNotifications || due === 0) return;
                const today = new Date().toISOString().slice(0, 10);
                const reminderKey = `millennium-study-reminder:${session.userId}:${today}`;
                if (localStorage.getItem(reminderKey)) return;
                localStorage.setItem(reminderKey, 'shown');
                toast.info(`${due} flashcard${due === 1 ? ' is' : 's are'} due for review.`, {
                    action: { label: 'Study', onClick: () => navigateToSection('flashcards') },
                });
            })
            .catch(() => undefined);
        return () => { active = false; };
    }, [
        homeSettings.studyReviewNotifications,
        homeSettingsLoaded,
        isPreviewMode,
        navigateToSection,
        session?.loggedIn,
        session?.userId,
    ]);

    const getSidebarItemVisibility = useCallback((itemId: string) => {
        const legacyId = LEGACY_SIDEBAR_ITEM_IDS[itemId];
        return homeSettings.sidebarItemVisibility[itemId]
            || (legacyId ? homeSettings.sidebarItemVisibility[legacyId] : undefined)
            || 'show';
    }, [homeSettings.sidebarItemVisibility]);

    const isSidebarItemVisible = useCallback((itemId: string) => {
        const visibility = getSidebarItemVisibility(itemId);
        return visibility !== 'hide';
    }, [getSidebarItemVisibility]);

    const getOrderedSidebarItems = useCallback((itemIds: string[]) => {
        const orderPositions = new Map(homeSettings.sidebarItemOrder.map((id, index) => [id, index]));
        const positionOf = (itemId: string) => {
            const legacyId = LEGACY_SIDEBAR_ITEM_IDS[itemId];
            const position = orderPositions.get(itemId) ?? (legacyId ? orderPositions.get(legacyId) : undefined);
            return position ?? Number.MAX_SAFE_INTEGER;
        };
        return [...itemIds].sort((a, b) => positionOf(a) - positionOf(b));
    }, [homeSettings.sidebarItemOrder]);

    const renderSidebarBadge = useCallback((count: number) => {
        if (count <= 0) {
            return null;
        }
        return (
            <SidebarMenuBadge>
                {count}
            </SidebarMenuBadge>
        );
    }, []);

    // Get today's notices for calendar sidebar (respect hidden settings)
    const todaysNotices = useMemo(() => {
        const notices = (portalData?.notices || []) as Notice[];
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        return dedupeHomeNotices(notices
            .map((n, index) => ({ ...n, originalIndex: index }))
            .filter(n => n.date === todayKey))
            .filter(n => {
                const notificationId = getNotificationId(n, n.originalIndex ?? 0);
                const state = notificationStates[notificationId];
                const isArchived = state?.archived || false;
                const isPinned = state?.pinned || false;
                const folderId = state?.folderId;

                if (homeSettings.hiddenNotificationCategories.includes('archive') && isArchived) return false;
                if (homeSettings.hiddenNotificationCategories.includes('pinned') && isPinned) return false;
                if (folderId && homeSettings.hiddenNotificationCategories.includes(`folder:${folderId}`)) return false;
                return true;
            })
            .slice(0, 5)
            .map(n => ({
                ...n,
                title: n.title || 'Notice',
                preview: n.preview || n.content?.substring(0, 50) || '',
            }));
    }, [portalData?.notices, notificationStates, getNotificationId, homeSettings.hiddenNotificationCategories]);

    const handleSelectNotification = useCallback((notice: Notice, notificationId: string) => {
        setSelectedNotification(notice);
        if (!notificationStates[notificationId]?.read) {
            setRead(notificationId, true);
        }
    }, [notificationStates, setRead, setSelectedNotification]);

    useEffect(() => {
        return () => {
            if (homeNotificationGlanceCloseTimerRef.current !== null) {
                window.clearTimeout(homeNotificationGlanceCloseTimerRef.current);
            }
        };
    }, []);

    const closeHomeNotificationGlance = useCallback(() => {
        setHomeNotificationGlanceOpen(false);
        if (homeNotificationGlanceCloseTimerRef.current !== null) {
            window.clearTimeout(homeNotificationGlanceCloseTimerRef.current);
        }
        homeNotificationGlanceCloseTimerRef.current = window.setTimeout(() => {
            setHomeNotificationGlance(null);
            homeNotificationGlanceCloseTimerRef.current = null;
        }, 220);
    }, []);

    const openHomeNotificationGlance = useCallback((notice: Notice, notificationId: string, triggerElement?: HTMLElement) => {
        const rect = triggerElement?.getBoundingClientRect();
        const targetWidth = typeof window !== 'undefined' ? Math.min(920, window.innerWidth - 48) : 920;
        const targetHeight = typeof window !== 'undefined' ? Math.min(760, Math.max(560, window.innerHeight * 0.84)) : 720;
        const sourceRect = rect
            ? {
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                width: rect.width,
                height: rect.height,
            }
            : {
                centerX: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
                centerY: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
                width: 96,
                height: 48,
            };
        const targetRect = {
            width: Math.max(320, targetWidth),
            height: Math.max(420, targetHeight),
        };

        if (homeNotificationGlanceCloseTimerRef.current !== null) {
            window.clearTimeout(homeNotificationGlanceCloseTimerRef.current);
            homeNotificationGlanceCloseTimerRef.current = null;
        }
        setHomeNotificationGlance({ notice, notificationId, sourceRect, targetRect });
        setHomeNotificationGlanceOpen(true);
        if (!notificationStates[notificationId]?.read) {
            setRead(notificationId, true);
        }
    }, [notificationStates, setRead]);

    const homeNotificationGlanceStyle = useMemo(() => {
        if (!homeNotificationGlance) return undefined;
        const { sourceRect } = homeNotificationGlance;
        const scaleX = Math.min(1, Math.max(0.1, sourceRect.width / homeNotificationGlance.targetRect.width));
        const scaleY = Math.min(1, Math.max(0.08, sourceRect.height / homeNotificationGlance.targetRect.height));
        return {
            '--notification-glance-origin-x': `${sourceRect.centerX}px`,
            '--notification-glance-origin-y': `${sourceRect.centerY}px`,
            '--notification-glance-origin-width': `${sourceRect.width}px`,
            '--notification-glance-origin-height': `${sourceRect.height}px`,
            '--notification-glance-target-width': `${homeNotificationGlance.targetRect.width}px`,
            '--notification-glance-target-height': `${homeNotificationGlance.targetRect.height}px`,
            '--notification-glance-scale-x': `${scaleX}`,
            '--notification-glance-scale-y': `${scaleY}`,
        } as CSSProperties;
    }, [homeNotificationGlance]);

    const handleMoveToCategory = useCallback((notificationId: string, category: 'inbox' | 'alerts' | 'events' | 'assignments') => {
        setCategory(notificationId, category);
        setFolder(notificationId, undefined);
        if (notificationStates[notificationId]?.archived) {
            setArchived(notificationId, false);
        }
    }, [notificationStates, setArchived, setCategory, setFolder]);

    const handleMoveToFolder = useCallback((notificationId: string, folderId?: string) => {
        setFolder(notificationId, folderId);
        if (notificationStates[notificationId]?.archived) {
            setArchived(notificationId, false);
        }
    }, [notificationStates, setArchived, setFolder]);

    const updateManyNotificationStates = useCallback((
        notificationIds: string[],
        updater: (current: NotificationState | undefined) => NotificationState
    ) => {
        if (notificationIds.length === 0) return;

        updateNotificationStates(prev => {
            let changed = false;
            const next = { ...prev };

            notificationIds.forEach(notificationId => {
                const current = prev[notificationId];
                const nextState = updater(current);
                if (
                    current &&
                    current.read === nextState.read &&
                    current.pinned === nextState.pinned &&
                    current.archived === nextState.archived &&
                    current.autoArchived === nextState.autoArchived &&
                    current.category === nextState.category &&
                    current.importance === nextState.importance &&
                    current.folderId === nextState.folderId
                ) {
                    return;
                }

                next[notificationId] = nextState;
                changed = true;
            });

            return changed ? next : prev;
        });
    }, [updateNotificationStates]);

    const formatNoticeDateRange = useCallback((notice: Notice) => {
        const rawDates = notice.dates && notice.dates.length > 0 ? notice.dates : (notice.date ? [notice.date] : []);
        const dates = rawDates.filter(Boolean).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        if (dates.length === 0) return 'Date unavailable';

        const formatDate = (value: string) => {
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return value;
            return formatDateByPreference(parsed, { day: 'numeric', month: 'short', year: 'numeric' });
        };

        if (dates.length === 1 || dates[0] === dates[dates.length - 1]) {
            return formatDate(dates[0]);
        }

        return `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`;
    }, [formatDateByPreference]);

    const parseNoticeStartDate = useCallback((value?: string) => {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
        if (dateOnly) {
            return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
        }

        const parsed = new Date(trimmed);
        if (Number.isNaN(parsed.getTime())) return null;
        parsed.setHours(0, 0, 0, 0);
        return parsed;
    }, []);

    const getNoticeStartDate = useCallback((notice: Notice) => {
        const rawDates = notice.dates && notice.dates.length > 0 ? notice.dates : (notice.date ? [notice.date] : []);
        const dates = rawDates
            .map(parseNoticeStartDate)
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => a.getTime() - b.getTime());

        return dates[0] || null;
    }, [parseNoticeStartDate]);

    const getNoticeDateKey = useCallback((notice: Notice) => {
        const startDate = getNoticeStartDate(notice);
        if (!startDate) return 'undated';

        const year = startDate.getFullYear();
        const month = String(startDate.getMonth() + 1).padStart(2, '0');
        const day = String(startDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, [getNoticeStartDate]);

    const formatNoticeGroupLabel = useCallback((dateKey: string) => {
        if (dateKey === 'undated') return 'No starting date';

        const parsed = parseNoticeStartDate(dateKey);
        if (!parsed) return dateKey;

        return formatDateByPreference(parsed, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }, [formatDateByPreference, parseNoticeStartDate]);

    const getRelativeNoticeGroupMeta = useCallback((dateKey: string) => {
        if (dateKey === 'undated') {
            return { key: 'relative:undated', label: 'No starting date' };
        }

        const parsed = parseNoticeStartDate(dateKey);
        if (!parsed) {
            return { key: `relative:invalid:${dateKey}`, label: dateKey };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayDiff = Math.round((parsed.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

        if (dayDiff === 0) return { key: 'relative:day:0', label: 'Today' };
        if (dayDiff === 1) return { key: 'relative:future:day:1', label: 'Tomorrow' };
        if (dayDiff === -1) return { key: 'relative:past:day:1', label: 'Yesterday' };

        const absoluteDayDiff = Math.abs(dayDiff);
        let value: number;
        let unit: 'day' | 'week' | 'month' | 'year';

        if (absoluteDayDiff <= 13) {
            value = absoluteDayDiff;
            unit = 'day';
        } else if (absoluteDayDiff <= 28) {
            value = Math.round(absoluteDayDiff / 7);
            unit = 'week';
        } else if (absoluteDayDiff < 365) {
            value = Math.min(11, Math.max(1, Math.round(absoluteDayDiff / 30.44)));
            unit = 'month';
        } else {
            value = Math.max(1, Math.round(absoluteDayDiff / 365.24));
            unit = 'year';
        }

        const direction = dayDiff > 0 ? 'future' : 'past';
        const relativeAmount = `${value} ${unit}${value === 1 ? '' : 's'}`;
        return {
            key: `relative:${direction}:${unit}:${value}`,
            label: dayDiff > 0 ? `In ${relativeAmount}` : `${relativeAmount} ago`,
        };
    }, [parseNoticeStartDate]);

    const getCategoryIconColor = useCallback((category: string) => {
        switch (category) {
            case 'alerts':
                return 'var(--priority-high, #ef4444)';
            case 'events':
                return 'var(--accent-color)';
            case 'assignments':
                return 'var(--priority-low, #22c55e)';
            default:
                return 'var(--accent-color)';
        }
    }, []);

    const folderCounts = useMemo(() => {
        const counts: Record<string, { unread: number; total: number }> = {};
        const notices = portalData?.notices || [];
        notices.forEach((notice, index) => {
            const notificationId = getNotificationId(notice, index);
            const state = notificationStates[notificationId];
            if (!state?.folderId || state.archived) return;
            if (!counts[state.folderId]) {
                counts[state.folderId] = { unread: 0, total: 0 };
            }
            counts[state.folderId].total += 1;
            if (!state.read) counts[state.folderId].unread += 1;
        });
        return counts;
    }, [portalData?.notices, notificationStates, getNotificationId]);

    const handleCreateFolder = useCallback(() => {
        const title = convertEmoticonsToEmoji(newFolderTitle.trim());
        if (!title) return;
        const subtitle = convertEmoticonsToEmoji(newFolderSubtitle.trim());
        const iconName = normalizeIconExplorerValue(newFolderIcon);
        const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setNotificationFolders(prev => [...prev, { id, title, subtitle: subtitle || undefined, icon: iconName }]);
        setNewFolderTitle('');
        setNewFolderSubtitle('');
        setNewFolderIcon('IconFolder');
        setIsCreatingFolder(false);
        setFoldersExpanded(true);
    }, [convertEmoticonsToEmoji, newFolderIcon, newFolderSubtitle, newFolderTitle, setNotificationFolders]);

    const handleCancelFolder = useCallback(() => {
        setNewFolderTitle('');
        setNewFolderSubtitle('');
        setNewFolderIcon('IconFolder');
        setIsCreatingFolder(false);
    }, []);

    const handleStartEditFolder = useCallback((folder: NotificationFolder) => {
        setIsCreatingFolder(false);
        setEditingFolderId(folder.id);
        setEditFolderTitle(folder.title);
        setEditFolderSubtitle(folder.subtitle || '');
        setEditFolderIcon(folder.icon);
    }, []);

    const handleSaveEditFolder = useCallback(() => {
        if (!editingFolderId) return;
        const title = convertEmoticonsToEmoji(editFolderTitle.trim());
        if (!title) return;
        const subtitle = convertEmoticonsToEmoji(editFolderSubtitle.trim());
        const iconName = normalizeIconExplorerValue(editFolderIcon);
        setNotificationFolders(prev => prev.map(folder =>
            folder.id === editingFolderId
                ? { ...folder, title, subtitle: subtitle || undefined, icon: iconName }
                : folder
        ));
        setEditingFolderId(null);
        setEditFolderTitle('');
        setEditFolderSubtitle('');
        setEditFolderIcon('IconFolder');
    }, [convertEmoticonsToEmoji, editingFolderId, editFolderTitle, editFolderSubtitle, editFolderIcon, setNotificationFolders]);

    const handleCancelEditFolder = useCallback(() => {
        setEditingFolderId(null);
        setEditFolderTitle('');
        setEditFolderSubtitle('');
        setEditFolderIcon('IconFolder');
    }, []);

    const handleDeleteFolder = useCallback((folderId: string) => {
        const notices = portalData?.notices || [];
        const notificationIds = notices
            .map((notice, index) => getNotificationId(notice, index))
            .filter(notificationId => notificationStates[notificationId]?.folderId === folderId);

        updateManyNotificationStates(notificationIds, current => {
            const nextState = { ...(current || {}) } as NotificationState;
            delete nextState.folderId;
            return nextState;
        });

        setNotificationFolders(prev => prev.filter(folder => folder.id !== folderId));
        if (selectedCategory === `folder:${folderId}`) {
            setSelectedCategory('inbox');
        }
        setDeleteFolderConfirmId(null);
    }, [portalData?.notices, notificationStates, getNotificationId, selectedCategory, setNotificationFolders, setSelectedCategory, updateManyNotificationStates]);

    const requestDeleteFolder = useCallback((folderId: string, event?: { shiftKey?: boolean }) => {
        if (event?.shiftKey) {
            handleDeleteFolder(folderId);
            return;
        }
        setDeleteFolderConfirmId(folderId);
    }, [handleDeleteFolder]);

    const handleMoveFolderUp = useCallback((folderId: string) => {
        setNotificationFolders(prev => {
            const index = prev.findIndex(f => f.id === folderId);
            if (index <= 0) return prev;
            const newFolders = [...prev];
            [newFolders[index - 1], newFolders[index]] = [newFolders[index], newFolders[index - 1]];
            return newFolders;
        });
    }, [setNotificationFolders]);

    const handleMoveFolderDown = useCallback((folderId: string) => {
        setNotificationFolders(prev => {
            const index = prev.findIndex(f => f.id === folderId);
            if (index < 0 || index >= prev.length - 1) return prev;
            const newFolders = [...prev];
            [newFolders[index], newFolders[index + 1]] = [newFolders[index + 1], newFolders[index]];
            return newFolders;
        });
    }, [setNotificationFolders]);

    const selectedNotificationIdSet = useMemo(() => new Set(selectedNotificationIds), [selectedNotificationIds]);

    const selectionStats = useMemo(() => {
        let hasRead = false;
        let hasUnread = false;
        let hasPinned = false;
        let hasUnpinned = false;
        let hasArchived = false;
        let hasUnarchived = false;

        selectedNotificationIds.forEach((notificationId) => {
            const state = notificationStates[notificationId];
            const isRead = state?.read || false;
            const isPinned = state?.pinned || false;
            const isArchived = state?.archived || false;

            if (isRead) hasRead = true;
            if (!isRead) hasUnread = true;
            if (isPinned) hasPinned = true;
            if (!isPinned) hasUnpinned = true;
            if (isArchived) hasArchived = true;
            if (!isArchived) hasUnarchived = true;
        });

        return { hasRead, hasUnread, hasPinned, hasUnpinned, hasArchived, hasUnarchived };
    }, [selectedNotificationIds, notificationStates]);

    const filteredNotifications = useMemo(() => getFilteredNotifications(), [getFilteredNotifications]);
    const noticeIndexByReference = useMemo(() => {
        const entries = (portalData?.notices || []).map((notice, index) => [notice, index] as const);
        return new Map<Notice, number>(entries);
    }, [portalData?.notices]);

    const preparedNotifications = useMemo(() => {
        return filteredNotifications.map((notice, index) => {
            const originalIndex = noticeIndexByReference.get(notice);
            const resolvedIndex = originalIndex === undefined || originalIndex < 0 ? index : originalIndex;
            const notificationId = getNotificationId(notice, resolvedIndex);
            const startDate = getNoticeStartDate(notice);
            return {
                notice,
                notificationId,
                index,
                originalIndex: resolvedIndex,
                dateKey: getNoticeDateKey(notice),
                isRead: notificationStates[notificationId]?.read === true,
                startTime: startDate?.getTime() ?? Number.NEGATIVE_INFINITY,
            };
        })
            .sort((a, b) => {
                if (homeSettings.notificationsUnreadSection && a.isRead !== b.isRead) {
                    return a.isRead ? 1 : -1;
                }
                if (a.startTime !== b.startTime) return b.startTime - a.startTime;
                return a.originalIndex - b.originalIndex;
            })
            .map((item, index) => ({ ...item, index }));
    }, [
        filteredNotifications,
        getNoticeDateKey,
        getNoticeStartDate,
        getNotificationId,
        homeSettings.notificationsUnreadSection,
        noticeIndexByReference,
        notificationStates,
    ]);

    const visiblePreparedNotifications = useMemo(() => (
        preparedNotifications.slice(0, visibleNotificationCount)
    ), [preparedNotifications, visibleNotificationCount]);

    const notificationGroups = useMemo(() => {
        const groups = new Map<string, { key: string; label: string; items: typeof visiblePreparedNotifications; total: number }>();
        const getGroupMeta = (item: typeof preparedNotifications[number]) => {
            if (homeSettings.notificationsUnreadSection && !item.isRead) {
                return { key: 'unread', label: 'Unread' };
            }

            if (relativeNotificationDates) {
                return getRelativeNoticeGroupMeta(item.dateKey);
            }

            return {
                key: item.dateKey,
                label: formatNoticeGroupLabel(item.dateKey),
            };
        };

        visiblePreparedNotifications.forEach((item) => {
            const groupMeta = getGroupMeta(item);
            const group = groups.get(groupMeta.key);
            if (group) {
                group.items.push(item);
            } else {
                groups.set(groupMeta.key, {
                    key: groupMeta.key,
                    label: groupMeta.label,
                    items: [item],
                    total: 0,
                });
            }
        });

        preparedNotifications.forEach((item) => {
            const group = groups.get(getGroupMeta(item).key);
            if (group) {
                group.total += 1;
            }
        });

        return Array.from(groups.values()).map(group => ({
            ...group,
            total: group.total || group.items.length,
        }));
    }, [
        formatNoticeGroupLabel,
        getRelativeNoticeGroupMeta,
        homeSettings.notificationsUnreadSection,
        preparedNotifications,
        relativeNotificationDates,
        visiblePreparedNotifications,
    ]);

    const visibleNotificationGroupKeys = useMemo(() => notificationGroups.map(group => group.key), [notificationGroups]);
    const hiddenNotificationCount = Math.max(0, preparedNotifications.length - visiblePreparedNotifications.length);
    const allSelectedInList = preparedNotifications.length > 0
        && selectedNotificationIds.length === preparedNotifications.length
        && preparedNotifications.every(item => selectedNotificationIdSet.has(item.notificationId));
    const orderedNotificationIds = useMemo(() => preparedNotifications.map(item => item.notificationId), [preparedNotifications]);
    const notificationLookup = useMemo(() => new Map(preparedNotifications.map(item => [item.notificationId, item.notice])), [preparedNotifications]);
    const activeFolderId = useMemo(() => (selectedCategory.startsWith('folder:') ? selectedCategory.replace('folder:', '') : null), [selectedCategory]);
    const collapsedNotificationDateKeySet = useMemo(() => new Set(collapsedNotificationDateKeys), [collapsedNotificationDateKeys]);

    useEffect(() => {
        setVisibleNotificationCount(NOTIFICATION_RENDER_BATCH_SIZE);
    }, [selectedCategory, notificationSearchQuery, filteredNotifications.length]);

    useEffect(() => {
        const visibleGroupKeys = new Set(visibleNotificationGroupKeys);
        setCollapsedNotificationDateKeys(prev => prev.filter(key => visibleGroupKeys.has(key)));
    }, [visibleNotificationGroupKeys]);

    useEffect(() => {
        if (hiddenNotificationCount <= 0) return;

        const root = notificationListContentRef.current;
        const loadForDistance = (distance: number) => {
            setVisibleNotificationCount((current) => {
                const batches = Math.max(1, Math.ceil(distance / NOTIFICATION_LOAD_BASE_DISTANCE));
                return Math.min(current + batches * NOTIFICATION_RENDER_BATCH_SIZE, preparedNotifications.length);
            });
        };

        const checkDistance = () => {
            if (!root) return;
            const now = performance.now();
            const previous = notificationLastScrollRef.current;
            const elapsed = Math.max(1, now - previous.time);
            const velocity = previous.time ? Math.abs(root.scrollTop - previous.top) / elapsed : 0;
            notificationLastScrollRef.current = { top: root.scrollTop, time: now };

            // distance = minimum buffer + scroll velocity * time needed to render next batch
            const preloadDistance = Math.min(
                NOTIFICATION_MAX_PRELOAD_DISTANCE,
                NOTIFICATION_LOAD_BASE_DISTANCE + velocity * NOTIFICATION_LOAD_LOOKAHEAD_MS,
            );
            const remainingDistance = root.scrollHeight - root.scrollTop - root.clientHeight;
            if (remainingDistance <= preloadDistance) loadForDistance(preloadDistance);
        };

        const handleScroll = () => {
            if (notificationScrollFrameRef.current !== null) return;
            notificationScrollFrameRef.current = requestAnimationFrame(() => {
                notificationScrollFrameRef.current = null;
                checkDistance();
            });
        };

        root?.addEventListener('scroll', handleScroll, { passive: true });
        checkDistance();

        if (typeof IntersectionObserver === 'undefined') {
            loadForDistance(NOTIFICATION_LOAD_BASE_DISTANCE);
            return () => root?.removeEventListener('scroll', handleScroll);
        }

        const sentinel = notificationLoadMoreRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                loadForDistance(NOTIFICATION_LOAD_BASE_DISTANCE);
            }
        }, {
            root: notificationListContentRef.current,
            rootMargin: `${NOTIFICATION_MAX_PRELOAD_DISTANCE}px 0px`,
        });

        observer.observe(sentinel);
        return () => {
            observer.disconnect();
            root?.removeEventListener('scroll', handleScroll);
            if (notificationScrollFrameRef.current !== null) {
                cancelAnimationFrame(notificationScrollFrameRef.current);
                notificationScrollFrameRef.current = null;
            }
        };
    }, [hiddenNotificationCount, preparedNotifications.length]);

    const toggleNotificationDateGroup = useCallback((dateKey: string) => {
        setCollapsedNotificationDateKeys(prev => (
            prev.includes(dateKey)
                ? prev.filter(key => key !== dateKey)
                : [...prev, dateKey]
        ));
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedNotificationIds([]);
        setSelectionAnchorIndex(null);
    }, []);

    useEffect(() => {
        clearSelection();
        setSelectedNotification(null);
    }, [selectedCategory, notificationSearchQuery, clearSelection, setSelectedNotification]);

    useEffect(() => {
        if (currentView !== 'notifications') return;
        if (preserveNextNotificationSelectionRef.current) {
            preserveNextNotificationSelectionRef.current = false;
            return;
        }
        clearSelection();
        setSelectedNotification(null);
    }, [clearSelection, currentView, setSelectedNotification]);

    const handleNotificationClick = useCallback((event: MouseEvent, notice: Notice, notificationId: string, index: number, orderedIds: string[]) => {
        const isRange = event.shiftKey;
        const isToggle = event.metaKey || event.ctrlKey;
        let nextSelected = new Set(selectedNotificationIdSet);

        if (isRange) {
            const anchor = selectionAnchorIndex ?? index;
            if (!isToggle) {
                nextSelected = new Set();
            }
            const start = Math.min(anchor, index);
            const end = Math.max(anchor, index);
            for (let i = start; i <= end; i += 1) {
                const id = orderedIds[i];
                if (id) nextSelected.add(id);
            }
            if (selectionAnchorIndex === null) {
                setSelectionAnchorIndex(index);
            }
        } else if (isToggle) {
            if (nextSelected.has(notificationId)) {
                nextSelected.delete(notificationId);
            } else {
                nextSelected.add(notificationId);
            }
            setSelectionAnchorIndex(index);
        } else if (selectedNotificationIdSet.size === 1 && selectedNotificationIdSet.has(notificationId)) {
            nextSelected = new Set();
            setSelectionAnchorIndex(null);
        } else {
            nextSelected = new Set([notificationId]);
            setSelectionAnchorIndex(index);
        }

        const nextSelectedArray = Array.from(nextSelected);
        setSelectedNotificationIds(nextSelectedArray);

        if (nextSelectedArray.length === 1 && nextSelected.has(notificationId)) {
            handleSelectNotification(notice, notificationId);
        } else if (nextSelectedArray.length === 1) {
            const soleId = nextSelectedArray[0];
            const soleNotice = notificationLookup.get(soleId);
            if (soleNotice) {
                handleSelectNotification(soleNotice, soleId);
            }
        } else {
            setSelectedNotification(null);
        }
    }, [handleSelectNotification, notificationLookup, selectedNotificationIdSet, selectionAnchorIndex, setSelectedNotification]);

    const bulkSetRead = useCallback((read: boolean) => {
        updateManyNotificationStates(selectedNotificationIds, current => ({
            ...current,
            read
        } as NotificationState));
    }, [selectedNotificationIds, updateManyNotificationStates]);

    const bulkSetPinned = useCallback((pinned: boolean) => {
        updateManyNotificationStates(selectedNotificationIds, current => ({
            ...current,
            pinned
        } as NotificationState));
    }, [selectedNotificationIds, updateManyNotificationStates]);

    const bulkSetArchived = useCallback((archived: boolean) => {
        updateManyNotificationStates(selectedNotificationIds, current => {
            const nextState = {
                ...current,
                archived
            } as NotificationState;
            delete nextState.autoArchived;
            return nextState;
        });
    }, [selectedNotificationIds, updateManyNotificationStates]);

    const bulkSetImportance = useCallback((importance?: 'low' | 'medium' | 'high') => {
        updateManyNotificationStates(selectedNotificationIds, current => {
            const nextState = { ...(current || {}) } as NotificationState;
            if (importance === undefined) {
                delete nextState.importance;
            } else {
                nextState.importance = importance;
            }
            return nextState;
        });
    }, [selectedNotificationIds, updateManyNotificationStates]);

    const bulkMoveToCategory = useCallback((category: 'inbox' | 'alerts' | 'events' | 'assignments') => {
        updateManyNotificationStates(selectedNotificationIds, current => {
            const nextState = {
                ...current,
                category,
                archived: false,
            } as NotificationState;
            delete nextState.folderId;
            delete nextState.autoArchived;
            return nextState;
        });
    }, [selectedNotificationIds, updateManyNotificationStates]);

    const bulkMoveToFolder = useCallback((folderId?: string) => {
        updateManyNotificationStates(selectedNotificationIds, current => {
            const nextState = {
                ...current,
                archived: false,
            } as NotificationState;
            if (folderId === undefined) {
                delete nextState.folderId;
            } else {
                nextState.folderId = folderId;
            }
            delete nextState.autoArchived;
            return nextState;
        });
    }, [selectedNotificationIds, updateManyNotificationStates]);


    const requestLogout = useCallback((event?: { shiftKey?: boolean }) => {
        if (event?.shiftKey) {
            handleLogout();
            return;
        }
        setShowLogoutConfirm(true);
    }, [handleLogout]);

    const handleOpenPortal = useCallback(async () => {
        await openExternal('https://millennium.education/portal/');
    }, []);

    // Centralized keyboard shortcuts
    const shortcutHandlers: ShortcutHandlers = useMemo(() => ({
        // Navigation
        'nav-home': () => { navigateToSection('home'); },
        'nav-account': () => { navigateToSection('account'); },
        'nav-notifications': () => { navigateToNotifications(); },
        'nav-calendar': () => { navigateToSection('calendar'); },
        'nav-classes': () => { navigateToSection('classes'); },
        'nav-timetable': () => { navigateToSection('timetable'); },
        'nav-reports': () => { navigateToSection('reports'); },
        'nav-attendance': () => { navigateToSection('attendance'); },
        'nav-classroom': () => { navigateToSection('classroom'); },
        'nav-settings': () => {
            if (!isPreviewMode) navigateToSettings('general');
        },
        // Tabs
        'tab-new': () => {
            if (!isPreviewMode) tabActionsRef.current.newTab?.();
        },
        'tab-close': () => {
            if (!isPreviewMode) tabActionsRef.current.closeActiveTab?.();
        },
        'tab-next': () => {
            if (!isPreviewMode) tabActionsRef.current.cycleTab?.(1);
        },
        'tab-previous': () => {
            if (!isPreviewMode) tabActionsRef.current.cycleTab?.(-1);
        },
        // Actions
        'action-search': () => {
            if (!isPreviewMode) setShowCommandMenu(true);
        },
        'action-logout': () => {
            if (!isPreviewMode) requestLogout();
        },
        // Calendar
        'calendar-create-event': () => {
            if (isPreviewMode) return;
            if (currentSection === 'calendar') setShowCreateEventModal(true);
        },
        'calendar-day-view': () => {
            if (currentSection === 'calendar') setCalendarViewMode('day');
        },
        'calendar-week-view': () => {
            if (currentSection === 'calendar') setCalendarViewMode('week');
        },
        'calendar-month-view': () => {
            if (currentSection === 'calendar') setCalendarViewMode('month');
        },
        'calendar-today': () => {
            if (currentSection === 'calendar') setCalendarGoToToday(prev => prev + 1);
        },
        'calendar-prev': () => {
            if (currentSection === 'calendar') setCalendarGoToPrev(prev => prev + 1);
        },
        'calendar-next': () => {
            if (currentSection === 'calendar') setCalendarGoToNext(prev => prev + 1);
        },
        // Timetable
        'timetable-week-a': () => {
            if (currentSection === 'timetable') setSelectedWeek('weekA');
        },
        'timetable-week-b': () => {
            if (currentSection === 'timetable') setSelectedWeek('weekB');
        },
        // Notifications
        'notifications-inbox': () => {
            if (currentView === 'notifications') setSelectedCategory('inbox');
        },
        'notifications-pinned': () => {
            if (currentView === 'notifications') setSelectedCategory('pinned');
        },
        'notifications-alerts': () => {
            if (currentView === 'notifications') setSelectedCategory('alerts');
        },
        'notifications-events': () => {
            if (currentView === 'notifications') setSelectedCategory('events');
        },
        'notifications-assignments': () => {
            if (currentView === 'notifications') setSelectedCategory('assignments');
        },
        'notifications-archive': () => {
            if (currentView === 'notifications') setSelectedCategory('archive');
        },
        // Settings
        'settings-general': () => { if (!isPreviewMode) navigateToSettings('general'); },
        'settings-appearance': () => { if (!isPreviewMode) navigateToSettings('general'); },
        'settings-animations': () => { if (!isPreviewMode) navigateToSettings('animations'); },
        'settings-notifications': () => { if (!isPreviewMode) navigateToSettings('notifications'); },
        'settings-theme-builder': () => { if (!isPreviewMode) navigateToSettings('theme-builder'); },
        'settings-class-colors': () => { if (!isPreviewMode) navigateToSettings('class-colors'); },
        'settings-shortcuts': () => { if (!isPreviewMode) navigateToSettings('shortcuts'); },
        'settings-sync': () => { if (!isPreviewMode) navigateToSettings('sync'); },
        'settings-export': () => { if (!isPreviewMode) navigateToSettings('export'); },
    }), [currentSection, currentView, isPreviewMode, navigateToNotifications, navigateToSection, navigateToSettings, requestLogout, setSelectedCategory]);

    // Determine current context for shortcuts
    const currentShortcutContext = useMemo(() => {
        if (isInSettings) return 'settings';
        if (currentView === 'notifications') return 'notifications';
        if (currentSection === 'calendar') return 'calendar';
        if (currentSection === 'timetable') return 'timetable';
        return undefined;
    }, [isInSettings, currentView, currentSection]);

    const {
        shortcuts: shortcutDefinitions,
        bindings: shortcutBindings,
        setShortcutBinding,
        resetBinding,
        resetAllBindings,
        contextAwareCategories,
        toggleContextAware,
    } = useShortcuts(
        shortcutHandlers,
        !showCommandMenu && !isRecordingShortcut, // Disable shortcuts when command menu is open or recording
        currentShortcutContext
    );

    // Subject color mapping - Defined at component level for use in Timetable and Classes
    const getSubjectColor = (course: string, classCode?: string) => {
        // Check for custom color first (using classCode as key)
        if (classCode && customClassColors[classCode]) {
            return customClassColors[classCode];
        }

        const colors: Record<string, string> = {
            'Mathematics': '#3b82f6',
            'English': '#10b981',
            'Science': '#8b5cf6',
            'Physics': '#8b5cf6',
            'Chemistry': '#ec4899',
            'Biology': '#10b981',
            'History': '#f59e0b',
            'Geography': '#06b6d4',
            'PDHPE': '#ef4444',
            'Music': '#ec4899',
            'Art': '#f97316',
            'Technology': '#6366f1',
            'Languages': '#14b8a6',
            'Religion': '#a855f7',
            'Studies': '#f59e0b',
        };
        for (const [subject, color] of Object.entries(colors)) {
            if (course.toLowerCase().includes(subject.toLowerCase())) return color;
        }
        let hash = 0;
        for (let i = 0; i < course.length; i++) {
            hash = course.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 60%, 50%)`;
    };

    // Handlers for updating class colors. `customClassColors` mirrors the saved preference, so the
    // preference is what they write: updating it from inside a `setCustomClassColors` updater made
    // the save a render-phase side effect that could be replayed or dropped, losing the colour.
    const handleColorChange = (classCode: string, color: string) => {
        updateHomeSettings({ classColors: { ...customClassColors, [classCode]: color } });
    };

    const handleResetClassColor = (classCode: string) => {
        const next = { ...customClassColors };
        delete next[classCode];
        updateHomeSettings({ classColors: next });
    };

    const handleResetAllClassColors = useCallback(() => {
        updateHomeSettings({ classColors: {} });
    }, [updateHomeSettings]);

    /**
     * Enrolment is derived from the latest timetable sync, not from the stored class list,
     * so classes that stopped being scheduled drop out everywhere instead of staying "enrolled".
     */
    const classInsights = useMemo(
        () => buildClassInsights(
            portalData?.classes || [],
            portalData?.timetable,
            portalData?.attendance,
            { locallyUnenrolledKeys: locallyUnenrolledClassKeys },
        ),
        [locallyUnenrolledClassKeys, portalData?.attendance, portalData?.classes, portalData?.timetable],
    );

    const enrolledClassKeys = useMemo(
        () => new Set(classInsights.filter(insight => insight.isEnrolled).map(getClassReviewKey)),
        [classInsights],
    );

    /** Removes scraper junk (rows named `100`, `101`, …) from stored data and preferences. */
    useEffect(() => {
        const junkEntries = findJunkClassEntries(portalData?.classes);
        if (junkEntries.length === 0) return;

        if (portalData) {
            setPortalData({ ...portalData, classes: sanitizeClassEntries(portalData.classes) });
        }

        const prunedKeys = pruneJunkClassKeys(locallyUnenrolledClassKeys, junkEntries);
        const prunedColors = pruneJunkClassColors(customClassColors, junkEntries);
        const patch: Record<string, unknown> = {};
        if (prunedKeys.length !== locallyUnenrolledClassKeys.length) patch.unenrolledClassKeys = prunedKeys;
        if (Object.keys(prunedColors).length !== Object.keys(customClassColors).length) {
            patch.classColors = prunedColors;
        }
        if (Object.keys(patch).length > 0) updateHomeSettings(patch);
    }, [customClassColors, locallyUnenrolledClassKeys, portalData, setPortalData, updateHomeSettings]);

    const handleRestoreClass = useCallback((classItem: ClassInsight) => {
        const classKey = getClassReviewKey(classItem);
        if (!locallyUnenrolledClassKeys.includes(classKey)) return;
        updateHomeSettings({
            unenrolledClassKeys: locallyUnenrolledClassKeys.filter(key => key !== classKey),
        });
        toast.success(`${classItem.classCode || classItem.course} restored to your classes`);
    }, [locallyUnenrolledClassKeys, updateHomeSettings]);

    const classColorOptions = (portalData?.classes || [])
        .filter((item: any) => typeof item?.classCode === 'string' && item.classCode.trim())
        .filter((item: any, index: number, all: any[]) => all.findIndex(candidate => candidate.classCode === item.classCode) === index)
        .map((item: any) => ({
            classCode: item.classCode,
            course: item.course || item.subject || item.classCode,
            color: getSubjectColor(item.course || item.subject || item.classCode, item.classCode),
            customized: Boolean(customClassColors[item.classCode]),
            enrolled: enrolledClassKeys.has(getClassReviewKey({
                course: item.course || item.subject || item.classCode,
                classCode: item.classCode,
            })),
        }))
        .sort((a: any, b: any) => a.course.localeCompare(b.course));

    // Check session on mount
    useEffect(() => {
        checkSession();
    }, [checkSession]);

    useEffect(() => {
        if (currentSection !== 'home') {
            setIsHomeEditing(false);
            setIsNoteEditing(false);
        }
    }, [currentSection]);

    useEffect(() => {
        if (session?.loggedIn) {
            loadPortalData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    // Stale data is refreshed immediately instead of interrupting the user with
    // a reminder that still requires a second action.
    useEffect(() => {
        if (isPreviewMode || session?.offline) return;
        if (!portalData?.lastUpdated) return;

        const lastSyncTime = Date.parse(portalData.lastUpdated);
        if (!Number.isFinite(lastSyncTime) || Date.now() - lastSyncTime < 24 * 60 * 60 * 1000) return;
        if (staleAutoSyncRef.current === portalData.lastUpdated) return;

        staleAutoSyncRef.current = portalData.lastUpdated;
        void loadPortalData(false);
    }, [isPreviewMode, loadPortalData, portalData?.lastUpdated, session?.offline]);

    // Removed duplicate notification count update - handled above

    // Parse username to extract display name
    const parseDisplayName = useCallback((username: string): string => {
        // Handle email format: firstname.lastnamenumber@education.nsw.gov.au
        const emailMatch = username.match(/^([a-z]+)\.([a-z]+)\d*@/i);
        if (emailMatch) {
            const [, first, last] = emailMatch;
            return `${first.charAt(0).toUpperCase() + first.slice(1)} ${last.charAt(0).toUpperCase() + last.slice(1)}`;
        }

        // Handle username format: firstname.lastnamenumber
        const usernameMatch = username.match(/^([a-z]+)\.([a-z]+)\d*$/i);
        if (usernameMatch) {
            const [, first, last] = usernameMatch;
            return `${first.charAt(0).toUpperCase() + first.slice(1)} ${last.charAt(0).toUpperCase() + last.slice(1)}`;
        }

        return username;
    }, []);

    const getUserInitials = (username?: string) => {
        if (!username) return 'U';
        const names = username.split(' ');
        if (names.length >= 2) {
            return (names[0][0] + names[1][0]).toUpperCase();
        }
        return username.substring(0, 2).toUpperCase();
    };

    // Memoized calculations for better performance
    const displayName = useMemo(() => {
        const rawName = portalData?.user.name || session?.username || 'User';
        // If it's a username format, parse it to display name
        if (rawName.includes('.') || rawName.includes('@')) {
            return parseDisplayName(rawName);
        }
        return rawName;
    }, [portalData?.user.name, session?.username, parseDisplayName]);

    const displaySchool = useMemo(() => {
        return portalData?.user.school || session?.school || 'School';
    }, [portalData?.user.school, session?.school]);

    const portalUsername = portalData?.account?.username || session?.username || 'User';

    const lastLoginLabel = useMemo(() => {
        if (!session?.timestamp) return 'Not available';
        const date = new Date(session.timestamp);
        return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
    }, [session?.timestamp]);

    const lastSyncedLabel = useMemo(() => {
        if (!portalData?.lastUpdated) return 'Never synced';
        const date = new Date(portalData.lastUpdated);
        return Number.isNaN(date.getTime()) ? 'Never synced' : date.toLocaleString();
    }, [portalData?.lastUpdated]);

    const autoSyncLabel = useMemo(() => {
        if (dataLoading) return 'Syncing now';
        if (!portalData?.lastUpdated) return 'Due now';

        const lastSyncTime = Date.parse(portalData.lastUpdated);
        if (!Number.isFinite(lastSyncTime)) return 'Due now';
        const dueInMs = lastSyncTime + getDataFetchIntervalMs(readDataSettings()) - syncScheduleNow;
        if (dueInMs <= 0) return 'Due now';

        const dueInMinutes = Math.max(1, Math.ceil(dueInMs / 60_000));
        if (dueInMinutes < 60) {
            return `In ${dueInMinutes} minute${dueInMinutes === 1 ? '' : 's'}`;
        }
        const dueInHours = Math.ceil(dueInMinutes / 60);
        return `In ${dueInHours} hour${dueInHours === 1 ? '' : 's'}`;
    }, [dataLoading, portalData?.lastUpdated, syncScheduleNow]);

    const syncAgeLabel = useMemo(() => {
        if (!portalData?.lastUpdated) return 'No portal data yet';
        const date = new Date(portalData.lastUpdated);
        if (Number.isNaN(date.getTime())) return 'No portal data yet';

        const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
        if (minutes < 1) return 'Synced just now';
        if (minutes < 60) return `Synced ${minutes} min ago`;

        const hours = Math.round(minutes / 60);
        if (hours < 48) return `Synced ${hours} hr ago`;

        const days = Math.round(hours / 24);
        return `Synced ${days} days ago`;
    }, [portalData?.lastUpdated]);

    // Enhanced functionality methods
    const toggleSection = useCallback((section: string) => {
        setCollapsedSections(prev =>
            prev.includes(section)
                ? prev.filter(s => s !== section)
                : [...prev, section]
        );
    }, []);

    const handleSectionClick = useCallback((section: DashboardSectionId) => {
        const delay = navigationTransitionDelay;
        setPageTransitioning(true);
        setTimeout(() => {
            navigateToSection(section);
            setShowUserDropdown(false);
            setTimeout(() => setPageTransitioning(false), 50);
        }, delay);
    }, [navigateToSection, navigationTransitionDelay]);

    // Settings transition handlers - now using hash routing
    const handleOpenSettings = useCallback((section: SettingsSectionId = 'general') => {
        if (isPreviewMode) return;

        const delay = navigationTransitionDelay;
        setPageTransitioning(true);
        setSidebarTransitioning(true);
        setTimeout(() => {
            navigateToSettings(section);
            setTimeout(() => {
                setPageTransitioning(false);
                setSidebarTransitioning(false);
            }, 50);
        }, delay);
    }, [isPreviewMode, navigateToSettings, navigationTransitionDelay]);

    const handleCloseSettings = useCallback(() => {
        const delay = navigationTransitionDelay;
        setPageTransitioning(true);
        setSidebarTransitioning(true);
        setTimeout(() => {
            closeSettings();
            setTimeout(() => {
                setPageTransitioning(false);
                setSidebarTransitioning(false);
            }, 50);
        }, delay);
    }, [closeSettings, navigationTransitionDelay]);

    const handleCreateTheme = useCallback((mode: 'simple' | 'advanced', theme?: any) => {
        const delay = navigationTransitionDelay;
        setPageTransitioning(true);
        setSidebarTransitioning(true);
        setTimeout(() => {
            navigateToSection('home');
            setThemeEditDraft(theme ?? null);
            setThemeCreateMode(mode);
            setTimeout(() => {
                setPageTransitioning(false);
                setSidebarTransitioning(false);
            }, 50);
        }, delay);
    }, [navigateToSection, navigationTransitionDelay]);

    const handleSettingsSectionChange = useCallback((section: SettingsSectionId) => {
        const delay = navigationTransitionDelay;
        setPageTransitioning(true);
        setTimeout(() => {
            navigateToSettings(section);
            setTimeout(() => setPageTransitioning(false), 50);
        }, delay);
    }, [navigateToSettings, navigationTransitionDelay]);

    const toggleUserDropdown = useCallback(() => {
        setShowUserDropdown(prev => !prev);
    }, []);

    const handleNavigateToNotifications = useCallback(() => {
        const delay = navigationTransitionDelay;
        setPageTransitioning(true);
        setTimeout(() => {
            navigateToNotifications();
            setTimeout(() => setPageTransitioning(false), 50);
        }, delay);
    }, [navigateToNotifications, navigationTransitionDelay]);

    // Handle command menu navigation from CommandMenu component
    const handleCommandNavigate = useCallback((page: DashboardSectionId | 'settings') => {
        if (page === 'notifications') {
            handleNavigateToNotifications();
        } else if (page === 'settings') {
            handleOpenSettings('general');
        } else {
            handleSectionClick(page);
        }
        setShowCommandMenu(false);
    }, [handleSectionClick, handleNavigateToNotifications, handleOpenSettings]);

    // Handle command menu actions
    const handleCommandAction = useCallback((action: string, payload?: unknown) => {
        switch (action) {
            case "logout":
                requestLogout();
                break;
            case "create-event":
                // Navigate to calendar and show create event modal
                handleSectionClick('calendar');
                setTimeout(() => setShowCreateEventModal(true), 200);
                break;
            case "calendar-view":
                // Change calendar view mode
                if (payload === 'day' || payload === 'week' || payload === 'month') {
                    handleSectionClick('calendar');
                    setCalendarViewMode(payload);
                }
                break;
            case "calendar-today":
                handleSectionClick('calendar');
                setCalendarGoToToday(prev => prev + 1);
                break;
            case "timetable-week":
                // Change timetable week
                handleSectionClick('timetable');
                if (payload === 'weekA' || payload === 'weekB') {
                    setSelectedWeek(payload);
                }
                break;
            case "notification-category":
                // Navigate to notifications and set category
                handleNavigateToNotifications();
                if (typeof payload === 'string') {
                    setSelectedCategory(payload);
                }
                break;
            case "settings-section":
                // Navigate to specific settings section
                if (typeof payload === 'string') {
                    handleOpenSettings(normalizeSettingsSection(payload));
                }
                break;
            case "tab-new":
                tabActionsRef.current.newTab?.();
                break;
            case "tab-close":
                tabActionsRef.current.closeActiveTab?.();
                break;
            case "tab-cycle":
                if (typeof payload === 'number') tabActionsRef.current.cycleTab?.(payload);
                break;
            case "tab-switch":
                if (typeof payload === 'string') tabActionsRef.current.switchToTab?.(payload);
                break;
        }
    }, [handleSectionClick, handleNavigateToNotifications, handleOpenSettings, requestLogout, setSelectedCategory]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Cmd/Ctrl + K for command menu
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (isPreviewMode) return;
            setShowCommandMenu(true);
        }
        // Escape to close modals (CommandMenu handles its own Escape)
        if (e.key === 'Escape') {
            setShowUserDropdown(false);
        }
    }, [isPreviewMode]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    useEffect(() => {
        const handleClickOutside = (e: globalThis.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (showUserDropdown && !target.closest('.user-profile') && !target.closest('.user-dropdown')) {
                setShowUserDropdown(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showUserDropdown]);

    const quickAccessActions = useMemo(() => {
        const actions = [
            { id: 'nav-home', label: 'Home', description: 'Go to Home', icon: <IconHome size={16} />, onSelect: () => handleSectionClick('home') },
            { id: 'nav-timetable', label: 'Timetable', description: 'Today\'s timetable', icon: <IconClock size={16} />, onSelect: () => handleSectionClick('timetable') },
            { id: 'nav-calendar', label: 'Calendar', description: 'Open calendar', icon: <IconCalendar size={16} />, onSelect: () => handleSectionClick('calendar') },
            { id: 'nav-notifications', label: 'Notifications', description: 'Open notifications', icon: <IconBell size={16} />, onSelect: () => handleNavigateToNotifications() },
            { id: 'nav-attendance', label: 'Attendance', description: 'Attendance summary', icon: <IconClipboardCheck size={16} />, onSelect: () => handleSectionClick('attendance') },
            { id: 'nav-reports', label: 'Reports', description: 'Open reports', icon: <IconReportAnalytics size={16} />, onSelect: () => handleSectionClick('reports') },
            { id: 'nav-classes', label: 'Classes', description: 'Class list', icon: <IconBook size={16} />, onSelect: () => handleSectionClick('classes') },
            { id: 'nav-flashcards', label: 'Flashcards', description: 'Review what is due', icon: <IconCards size={16} />, onSelect: () => handleSectionClick('flashcards') },
            { id: 'open-search', label: 'Search', description: 'Open command menu', icon: <IconSearch size={16} />, onSelect: () => setShowCommandMenu(true) },
            { id: 'open-settings', label: 'Settings', description: 'Open settings', icon: <IconSettings size={16} />, onSelect: () => handleOpenSettings('general') },
            {
                id: 'calendar-create-event',
                label: 'New Event',
                description: 'Create calendar event',
                icon: <IconCalendarEvent size={16} />,
                onSelect: () => {
                    handleSectionClick('calendar');
                    setTimeout(() => setShowCreateEventModal(true), 200);
                }
            },
            {
                id: 'calendar-today',
                label: 'Calendar Today',
                description: 'Jump to today',
                icon: <IconCalendar size={16} />,
                onSelect: () => {
                    handleSectionClick('calendar');
                    setCalendarGoToToday(prev => prev + 1);
                }
            },
        ];

        if (isPreviewMode) {
            return actions.filter((action) => !['open-search', 'open-settings', 'calendar-create-event'].includes(action.id));
        }

        return actions;
    }, [
        handleNavigateToNotifications,
        handleOpenSettings,
        handleSectionClick,
        isPreviewMode,
        setCalendarGoToToday,
        setShowCommandMenu,
        setShowCreateEventModal,
    ]);

    const quickAccessActionMap = useMemo(() => {
        return new Map(quickAccessActions.map(action => [action.id, action]));
    }, [quickAccessActions]);

    const homeItemDefinitions = useMemo<Partial<Record<HomeItemType, { label: string; description: string; icon: ReactNode }>>>(() => ({
        note: { label: 'Note', description: 'Editable home note', icon: <IconPencil size={16} /> },
        quick_access: { label: 'Quick Access', description: 'Jump to pages and actions', icon: <IconHome size={16} /> },
        notifications: { label: 'Notifications', description: 'Daily notices', icon: <IconBell size={16} /> },
        calendar: { label: 'Calendar', description: 'Today\'s events', icon: <IconCalendar size={16} /> },
        today_classes: { label: 'Today\'s Classes', description: 'Current schedule', icon: <IconClock size={16} /> },
        attendance_snapshot: { label: 'Attendance', description: 'Quick attendance snapshot', icon: <IconClipboardCheck size={16} /> },
        classroom_assignments: { label: 'Classroom Assignments', description: 'Assigned and missing work', icon: <IconClipboardCheck size={16} /> },
        classroom_activity: { label: 'Classroom Activity', description: 'Recent classwork updates', icon: <IconSchool size={16} /> },
    }), []);

    const homeItemsInLayout = useMemo(() => {
        return new Set(homeLayout.items);
    }, [homeLayout.items]);

    const availableHomeItems = useMemo(() => {
        return Object.entries(homeItemDefinitions)
            .filter((entry): entry is [string, { label: string; description: string; icon: ReactNode }] => Boolean(entry[1]))
            .filter(([key]) => !homeItemsInLayout.has(key as HomeItemType))
            .filter(([key]) => {
                if (HIDDEN_HOME_ITEMS.includes(key as HomeItemType)) {
                    return false;
                }
                return true;
            })
            .map(([key, value]) => ({ key: key as HomeItemType, ...value }));
    }, [homeItemDefinitions, homeItemsInLayout]);

    /** A card added from the picker joins the column that is carrying the fewest cards. */
    const addHomeItem = useCallback((item: HomeItemType) => {
        setHomeLayout(prev => {
            if (prev.items.includes(item)) return prev;

            const counts = new Array<number>(HOME_MAX_COLUMNS).fill(0);
            for (const entry of prev.items) {
                if (prev.itemSpans[entry] === 2) continue;
                counts[homeItemColumn(prev, entry, HOME_MAX_COLUMNS)] += 1;
            }
            const column = counts.indexOf(Math.min(...counts));

            return {
                ...prev,
                items: [...prev.items, item],
                itemColumns: { ...prev.itemColumns, [item]: column },
            };
        });
    }, [setHomeLayout]);

    const removeHomeItem = useCallback((item: HomeItemType) => {
        setHomeLayout(prev => {
            const { [item]: _removedSpan, ...itemSpans } = prev.itemSpans;
            const { [item]: _removedColumn, ...itemColumns } = prev.itemColumns;
            return {
                ...prev,
                items: prev.items.filter(entry => entry !== item),
                itemSpans,
                itemColumns,
            };
        });
    }, [setHomeLayout]);

    /**
     * Right-click width toggle: a card occupies one column or spans the full grid. Only the width
     * changes — the card keeps its place in the order, because a resize that also relocated the
     * card is exactly the unrequested movement the grid is meant to avoid.
     */
    const setHomeItemSpan = useCallback((item: HomeItemType, span: HomeItemSpan) => {
        setHomeLayout(prev => {
            const { [item]: _removedSpan, ...withoutItem } = prev.itemSpans;
            const itemSpans = span === 1 ? withoutItem : { ...withoutItem, [item]: span };
            return { ...prev, itemSpans };
        });
    }, [setHomeLayout]);

    const updateQuickAccessSlot = useCallback((index: number, actionId: string | null) => {
        setHomeLayout(prev => {
            const nextSlots = [...prev.quickAccessSlots];
            const existing = nextSlots[index];
            // Changing the action drops the custom label with it: a renamed shortcut pointing at a
            // different page reads as a mislabelled one.
            nextSlots[index] = {
                id: existing?.id || `qa-${Date.now()}-${index}`,
                actionId,
                ...(existing?.accentColor ? { accentColor: existing.accentColor } : {}),
            };
            return { ...prev, quickAccessSlots: nextSlots };
        });
    }, [setHomeLayout]);

    /** Per-shortcut styling: a custom label, an accent colour, or both cleared back to defaults. */
    const styleQuickAccessSlot = useCallback((
        index: number,
        style: { label?: string | null; accentColor?: string | null }
    ) => {
        setHomeLayout(prev => {
            const existing = prev.quickAccessSlots[index];
            if (!existing) return prev;

            const label = style.label === undefined ? existing.label : style.label?.trim() || undefined;
            const accentColor = style.accentColor === undefined ? existing.accentColor : style.accentColor || undefined;
            const nextSlots = [...prev.quickAccessSlots];
            nextSlots[index] = {
                id: existing.id,
                actionId: existing.actionId,
                ...(label ? { label: label.slice(0, 40) } : {}),
                ...(accentColor ? { accentColor } : {}),
            };
            return { ...prev, quickAccessSlots: nextSlots };
        });
    }, [setHomeLayout]);

    const addQuickAccessSlot = useCallback(() => {
        setHomeLayout(prev => ({
            ...prev,
            quickAccessSlots: [
                ...prev.quickAccessSlots,
                { id: `qa-${Date.now()}`, actionId: null },
            ],
        }));
    }, [setHomeLayout]);

    const removeQuickAccessSlot = useCallback((index: number) => {
        setHomeLayout(prev => {
            const nextSlots = [...prev.quickAccessSlots];
            nextSlots.splice(index, 1);
            return { ...prev, quickAccessSlots: nextSlots };
        });
    }, [setHomeLayout]);

    const noteTokenValues = useMemo(() => {
        return buildNoteTokenValues({
            lastUpdated: portalData?.lastUpdated,
            formatDate: formatDateByPreference,
        });
    }, [formatDateByPreference, portalData?.lastUpdated]);

    const noteHtml = useMemo(() => {
        const withTokens = applyNoteTokens(homeLayout.note || DEFAULT_NOTE, noteTokenValues);
        return markdownToHtml(withTokens);
    }, [homeLayout.note, noteTokenValues]);

    const insertNoteToken = useCallback((token: string) => {
        const textarea = noteTextareaRef.current;
        if (!textarea) {
            setNoteDraft(prev => `${prev}${token}`);
            return;
        }
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const nextValue = `${noteDraft.slice(0, start)}${token}${noteDraft.slice(end)}`;
        setNoteDraft(nextValue);
        requestAnimationFrame(() => {
            textarea.focus();
            const caret = start + token.length;
            textarea.setSelectionRange(caret, caret);
        });
    }, [noteDraft]);

    const homeSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const quickAccessSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        const grid = homeGridRef.current;
        if (!grid || typeof ResizeObserver === 'undefined') {
            setMeasuredHomeColumns(null);
            return undefined;
        }

        const measure = () => {
            const count = measureHomeColumnRects(grid).length;
            if (count > 0) setMeasuredHomeColumns(current => (current === count ? current : count));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(grid);
        return () => observer.disconnect();
    }, [currentSection]);

    const preferredHomeColumns = isPhone ? homeSettings.mobileColumns : homeSettings.columns;
    const homeColumnCount = measuredHomeColumns ?? preferredHomeColumns;

    /**
     * Explicit column and row for every card. Recomputed when a card's height changes, but a height
     * change can only ever move cards below it in the same column — the column itself comes from the
     * layout, so nothing here can move a card sideways.
     */
    const homePlacements = useMemo(() => computeHomePlacements({
        items: homeLayout.items,
        layout: homeLayout,
        heights: homeItemHeights,
        columnCount: homeColumnCount,
        rowGap: HOME_ROW_GAP,
    }), [homeColumnCount, homeItemHeights, homeLayout]);

    /**
     * Sub-pixel jitter from a reflow is not a height change worth re-placing the whole grid for, so
     * anything under half a pixel is ignored.
     */
    const handleHomeItemMeasure = useCallback((id: string, height: number) => {
        const item = id as HomeItemType;
        setHomeItemHeights(prev => {
            const previous = prev[item];
            if (previous !== undefined && Math.abs(previous - height) < 0.5) return prev;
            return { ...prev, [item]: height };
        });
    }, []);

    /**
     * The column the pointer is currently over, read off the laid-out grid rather than recomputed
     * from the column preference so it always agrees with what is on screen.
     */
    const homeColumnAtClientX = useCallback((clientX: number) => {
        const grid = homeGridRef.current;
        if (!grid) return null;
        const columnRects = measureHomeColumnRects(grid);
        if (columnRects.length === 0) return null;
        return homeColumnAtPoint(columnRects, clientX);
    }, []);

    /**
     * A card changes column only here, and only because the pointer carried it into another one.
     * Nothing else in the layout can move a card sideways: the column is stored per card and every
     * other card's column is left exactly as it was.
     */
    const handleHomeDragMove = useCallback(({ active }: DragMoveEvent) => {
        if (!isHomeEditing) return;
        const item = active.id as HomeItemType;
        const layout = homeLayoutRef.current;
        // A full-width card occupies every column, so there is no column for it to be carried into.
        if (layout.itemSpans[item] === 2) return;

        const rect = active.rect.current?.translated;
        if (!rect) return;

        const column = homeColumnAtClientX(rect.left + rect.width / 2);
        if (column === null || layout.itemColumns[item] === column) return;

        const itemColumns = { ...layout.itemColumns, [item]: column };
        beginHomeLayoutTransaction();
        homeLayoutRef.current = { ...layout, itemColumns };
        setHomeLayout(prev => ({ ...prev, itemColumns }));
    }, [beginHomeLayoutTransaction, homeColumnAtClientX, isHomeEditing, setHomeLayout]);

    /**
     * The order is rewritten while the pointer moves, not on release, so the preview and the saved
     * arrangement are the same thing and nothing re-shuffles on drop. Order decides only how cards
     * stack *within* a column; `handleHomeDragMove` owns which column they are in.
     *
     * The whole gesture is one history transaction, so undo steps back over the drag rather than
     * over every intermediate order it passed through.
     */
    const handleHomeDragOver = useCallback(({ active, over }: DragOverEvent) => {
        if (!isHomeEditing || !over || active.id === over.id) return;

        const current = homeLayoutRef.current.items;
        const oldIndex = current.indexOf(active.id as HomeItemType);
        const newIndex = current.indexOf(over.id as HomeItemType);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        // Only the dragged card changes index. Nothing is re-sorted afterwards, so a card can be
        // dropped anywhere in the order — including between or above two-column cards — and every
        // card the drag did not touch keeps the position it already had.
        const reordered = arrayMove(current, oldIndex, newIndex);
        const key = reordered.join('|');
        const currentKey = current.join('|');
        if (key === currentKey) return;
        // Repacking can leave the pointer over a different neighbour than the one it just displaced,
        // which would move the card straight back. Refusing to undo the previous step keeps a drag
        // that hovers a boundary from flickering between two orders.
        if (key === homeDragPreviousOrderKeyRef.current) return;
        homeDragPreviousOrderKeyRef.current = currentKey;

        // Snapshot once per gesture; the call is a no-op while a transaction is already open.
        beginHomeLayoutTransaction();
        homeLayoutRef.current = { ...homeLayoutRef.current, items: reordered };
        setHomeLayout(prev => ({ ...prev, items: reordered }));
    }, [beginHomeLayoutTransaction, isHomeEditing, setHomeLayout]);

    const handleHomeDragEnd = useCallback(() => {
        setActiveHomeDragId(null);
        setActiveHomeDragRect(null);
        homeDragOrderRef.current = null;
        homeDragPreviousOrderKeyRef.current = null;
        if (homeHistoryTransactionRef.current) {
            endHomeLayoutTransaction();
        }
    }, [endHomeLayoutTransaction]);

    const handleHomeDragStart = useCallback(({ active }: DragStartEvent) => {
        if (!isHomeEditing) return;
        setActiveHomeDragId(String(active.id));
        const rect = active.rect.current?.initial;
        setActiveHomeDragRect(rect ? { width: rect.width, height: rect.height } : null);
        homeDragOrderRef.current = {
            items: homeLayoutRef.current.items,
            itemColumns: homeLayoutRef.current.itemColumns,
        };
        homeDragPreviousOrderKeyRef.current = null;
    }, [isHomeEditing]);

    /** Escape or a lost pointer puts the order and the columns back where the drag found them. */
    const handleHomeDragCancel = useCallback(() => {
        setActiveHomeDragId(null);
        setActiveHomeDragRect(null);
        const original = homeDragOrderRef.current;
        homeDragOrderRef.current = null;
        homeDragPreviousOrderKeyRef.current = null;
        if (original) {
            homeLayoutRef.current = { ...homeLayoutRef.current, ...original };
            setHomeLayout(prev => (
                prev.items === original.items && prev.itemColumns === original.itemColumns
                    ? prev
                    : { ...prev, ...original }
            ));
        }
        if (homeHistoryTransactionRef.current) {
            endHomeLayoutTransaction();
        }
    }, [endHomeLayoutTransaction, setHomeLayout]);

    const handleQuickAccessDragEnd = useCallback((event: DragEndEvent) => {
        if (!isHomeEditing) return;
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setHomeLayout(prev => {
            const oldIndex = prev.quickAccessSlots.findIndex(slot => slot.id === active.id);
            const newIndex = prev.quickAccessSlots.findIndex(slot => slot.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const reordered = arrayMove(prev.quickAccessSlots, oldIndex, newIndex);
            return { ...prev, quickAccessSlots: reordered };
        });
    }, [isHomeEditing, setHomeLayout]);



    const selectedHomeElement = useMemo(() => {
        if (homeCanvasSelection?.kind !== 'element') return null;
        return homeLayout.canvasElements.find(element => element.id === homeCanvasSelection.id) || null;
    }, [homeCanvasSelection, homeLayout.canvasElements]);

    const canvasPointFromClient = useCallback((clientX: number, clientY: number) => {
        const canvas = homeCanvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        if (!canvas || !rect) return { x: 0, y: 0 };

        return clientPointToCanvas({
            clientX,
            clientY,
            rect,
            scrollLeft: canvas.scrollLeft,
            scrollTop: canvas.scrollTop,
        });
    }, []);

    const updateCanvasElement = useCallback((elementId: string, updater: (element: HomeCanvasElement) => HomeCanvasElement) => {
        setHomeLayout(prev => ({
            ...prev,
            canvasElements: prev.canvasElements.map(element => element.id === elementId ? updater(element) : element),
        }));
    }, [setHomeLayout]);

    const removeCanvasElements = useCallback((elementIds: string[]) => {
        if (elementIds.length === 0) return;
        const removing = new Set(elementIds);
        setRemovingCanvasElementIds(prev => [...prev, ...elementIds.filter(id => !prev.includes(id))]);
        setHomeCanvasSelection(prev => prev?.kind === 'element' && removing.has(prev.id) ? null : prev);
        setHomeCanvasSelectedIds(prev => prev.filter(id => !removing.has(id)));
        window.setTimeout(() => {
            setHomeLayout(prev => ({
                ...prev,
                canvasElements: prev.canvasElements.filter(element => !removing.has(element.id)),
            }));
            setRemovingCanvasElementIds(prev => prev.filter(id => !removing.has(id)));
        }, 150);
    }, [setHomeLayout]);

    const removeCanvasElement = useCallback((elementId: string) => {
        removeCanvasElements([elementId]);
    }, [removeCanvasElements]);

    const eraseCanvasElementAtPoint = useCallback((clientX: number, clientY: number, erasedIds: Set<string>) => {
        const target = document.elementsFromPoint(clientX, clientY)
            .map(element => element.closest('[data-canvas-element-id]') as HTMLElement | null)
            .find((element): element is HTMLElement => Boolean(element));
        const elementId = target?.dataset.canvasElementId;
        if (!elementId || erasedIds.has(elementId)) return;

        erasedIds.add(elementId);
        setHomeCanvasSelection(prev => prev?.kind === 'element' && prev.id === elementId ? null : prev);
        setHomeCanvasSelectedIds(prev => prev.includes(elementId) ? prev.filter(id => id !== elementId) : prev);
        setHomeLayout(prev => ({
            ...prev,
            canvasElements: prev.canvasElements.filter(element => element.id !== elementId),
        }));
    }, [setHomeLayout]);

    const addCanvasTextElement = useCallback((x: number, y: number) => {
        const id = `text-${Date.now()}`;
        setHomeLayout(prev => ({
            ...prev,
            canvasElements: [
                ...prev.canvasElements,
                {
                    id,
                    kind: 'text',
                    x: x,
                    y: y,
                    w: 280,
                    h: 110,
                    text: 'Text',
                    ...textDefaults,
                },
            ],
        }));
        setHomeCanvasSelection({ kind: 'element', id });
        setHomeCanvasTool('select');
        setNewCanvasElementIds(prev => [...prev, id]);
        window.setTimeout(() => setNewCanvasElementIds(prev => prev.filter(entry => entry !== id)), 180);
    }, [setHomeLayout, textDefaults]);

    /**
     * Places a picture on the freeform layer at its own aspect ratio, capped so a large photo does
     * not land wider than the cards it is meant to annotate.
     */
    const addCanvasImageElement = useCallback((image: PreparedHomeImage, x: number, y: number) => {
        const width = Math.min(HOME_IMAGE_PLACED_MAX_WIDTH, image.width);
        const height = Math.max(40, Math.round(width * (image.height / image.width)));
        const id = `image-${Date.now()}`;
        setHomeLayout(prev => ({
            ...prev,
            canvasElements: [
                ...prev.canvasElements,
                {
                    id,
                    kind: 'image',
                    x: x,
                    y: y,
                    w: width,
                    h: height,
                    src: image.src,
                    alt: '',
                    radius: 12,
                },
            ],
        }));
        setHomeCanvasSelection({ kind: 'element', id });
        setHomeCanvasTool('select');
        setNewCanvasElementIds(prev => [...prev, id]);
        window.setTimeout(() => setNewCanvasElementIds(prev => prev.filter(entry => entry !== id)), 180);
    }, [setHomeLayout]);

    const handleHomeImageFile = useCallback(async (file: File | null | undefined) => {
        if (!file) return;
        try {
            const prepared = await prepareHomeImage(file);
            // Dropped near the visible top-left of the board rather than under the pointer: the file
            // picker is a separate window, so there is no meaningful pointer position when it closes.
            const canvas = homeCanvasRef.current;
            addCanvasImageElement(
                prepared,
                (canvas?.scrollLeft ?? 0) + HOME_IMAGE_DROP_INSET,
                (canvas?.scrollTop ?? 0) + HOME_IMAGE_DROP_INSET,
            );
        } catch (error) {
            toast.error(error instanceof HomeImageError ? error.message : 'That image could not be added.');
        }
    }, [addCanvasImageElement]);

    const handleHomeCanvasPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const worldPoint = canvasPointFromClient(event.clientX, event.clientY);

        if (!isHomeEditing) return;

        if (homeCanvasTool === 'text') {
            addCanvasTextElement(worldPoint.x, worldPoint.y);
            return;
        }

        if (homeCanvasTool === 'lasso') {
            // Selection is not layout state, so a lasso never opens a history transaction.
            const lassoPoints = [worldPoint];
            setHomeCanvasSelection(null);
            setHomeCanvasSelectedIds([]);
            setHomeLassoPoints(lassoPoints);
            homeInteractionRef.current = {
                mode: 'lasso',
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWorldX: worldPoint.x,
                startWorldY: worldPoint.y,
                lassoPoints,
            };
            return;
        }

        if (homeCanvasTool === 'eraser') {
            const erasedIds = new Set<string>();
            beginHomeLayoutTransaction();
            homeInteractionRef.current = {
                mode: 'erase',
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWorldX: worldPoint.x,
                startWorldY: worldPoint.y,
                erasedIds,
            };
            eraseCanvasElementAtPoint(event.clientX, event.clientY, erasedIds);
            return;
        }

        if (homeCanvasTool === 'draw') {
            const id = `draw-${Date.now()}`;
            beginHomeLayoutTransaction();
            setHomeLayout(prev => ({
                ...prev,
                canvasElements: [
                    ...prev.canvasElements,
                    { id, kind: 'draw', points: [worldPoint], color: drawColor, strokeWidth: drawStrokeWidth },
                ],
            }));
            homeInteractionRef.current = {
                mode: 'draw',
                id,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWorldX: worldPoint.x,
                startWorldY: worldPoint.y,
                lastWorldX: worldPoint.x,
                lastWorldY: worldPoint.y,
            };
            setNewCanvasElementIds(prev => [...prev, id]);
            window.setTimeout(() => setNewCanvasElementIds(prev => prev.filter(entry => entry !== id)), 180);
            return;
        }

        if (homeCanvasTool === 'line') {
            const id = `line-${Date.now()}`;
            beginHomeLayoutTransaction();
            setHomeLayout(prev => ({
                ...prev,
                canvasElements: [
                    ...prev.canvasElements,
                    { id, kind: 'line', x: worldPoint.x, y: worldPoint.y, w: 1, h: 0, color: drawColor, strokeWidth: drawStrokeWidth },
                ],
            }));
            setHomeCanvasSelection({ kind: 'element', id });
            homeInteractionRef.current = {
                mode: 'line',
                id,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWorldX: worldPoint.x,
                startWorldY: worldPoint.y,
            };
            setNewCanvasElementIds(prev => [...prev, id]);
            window.setTimeout(() => setNewCanvasElementIds(prev => prev.filter(entry => entry !== id)), 180);
            return;
        }

        setHomeCanvasSelection(null);
        setHomeCanvasSelectedIds([]);
    }, [
        addCanvasTextElement,
        canvasPointFromClient,
        drawColor,
        drawStrokeWidth,
        homeCanvasTool,
        isHomeEditing,
        beginHomeLayoutTransaction,
        eraseCanvasElementAtPoint,
        setHomeLayout,
    ]);

    const handleHomeElementPointerDown = useCallback((event: PointerEvent<Element>, element: HomeCanvasElement, mode: 'move-element' | 'resize-element' | 'resize-line') => {
        if (!isHomeEditing) return;
        const worldPoint = canvasPointFromClient(event.clientX, event.clientY);

        if (homeCanvasTool === 'eraser') {
            event.stopPropagation();
            const erasedIds = new Set<string>();
            beginHomeLayoutTransaction();
            homeInteractionRef.current = {
                mode: 'erase',
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWorldX: worldPoint.x,
                startWorldY: worldPoint.y,
                erasedIds,
            };
            eraseCanvasElementAtPoint(event.clientX, event.clientY, erasedIds);
            return;
        }

        // Draw, line, text and lasso all start from the surface, so an existing element must not
        // swallow the press: drawing over old ink and lassoing across it have to keep working.
        if (homeCanvasTool !== 'select') return;

        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (mode === 'move-element' && target.closest('[contenteditable="true"]')) {
            setHomeCanvasSelection({ kind: 'element', id: element.id });
            return;
        }

        // Pressing a member of a lasso selection moves the whole selection; pressing anything else
        // drops back to a single element so the group is not carried around by accident.
        const isGroupMove = mode === 'move-element'
            && homeCanvasSelectedIds.length > 1
            && homeCanvasSelectedIds.includes(element.id);
        const movingIds = isGroupMove ? new Set(homeCanvasSelectedIds) : new Set([element.id]);
        if (!isGroupMove) setHomeCanvasSelectedIds([]);

        setHomeCanvasSelection({ kind: 'element', id: element.id });
        beginHomeLayoutTransaction();
        homeInteractionRef.current = {
            mode,
            id: element.id,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startWorldX: worldPoint.x,
            startWorldY: worldPoint.y,
            element,
            movingElements: mode === 'move-element'
                ? new Map(homeLayoutRef.current.canvasElements
                    .filter(candidate => movingIds.has(candidate.id))
                    .map(candidate => [candidate.id, candidate]))
                : undefined,
        };
    }, [beginHomeLayoutTransaction, canvasPointFromClient, eraseCanvasElementAtPoint, homeCanvasSelectedIds, homeCanvasTool, isHomeEditing]);

    useEffect(() => {
        const handlePointerMove = (event: globalThis.PointerEvent) => {
            const interaction = homeInteractionRef.current;
            if (!interaction) return;
            const worldPoint = canvasPointFromClient(event.clientX, event.clientY);
            const deltaWorldX = worldPoint.x - interaction.startWorldX;
            const deltaWorldY = worldPoint.y - interaction.startWorldY;

            if (interaction.mode === 'erase' && interaction.erasedIds) {
                eraseCanvasElementAtPoint(event.clientX, event.clientY, interaction.erasedIds);
                return;
            }

            if (interaction.mode === 'lasso' && interaction.lassoPoints) {
                const last = interaction.lassoPoints[interaction.lassoPoints.length - 1];
                if (Math.hypot(worldPoint.x - last.x, worldPoint.y - last.y) < 3) return;
                const nextPoints = [...interaction.lassoPoints, worldPoint];
                interaction.lassoPoints = nextPoints;
                setHomeLassoPoints(nextPoints);
                return;
            }

            if (interaction.mode === 'draw' && interaction.id) {
                const lastX = interaction.lastWorldX ?? interaction.startWorldX;
                const lastY = interaction.lastWorldY ?? interaction.startWorldY;
                if (Math.hypot(worldPoint.x - lastX, worldPoint.y - lastY) < 3) {
                    return;
                }
                interaction.lastWorldX = worldPoint.x;
                interaction.lastWorldY = worldPoint.y;
                updateCanvasElement(interaction.id, element => element.kind === 'draw'
                    ? { ...element, points: [...element.points, worldPoint] }
                    : element
                );
                return;
            }

            if (interaction.mode === 'line' && interaction.id) {
                updateCanvasElement(interaction.id, element => element.kind === 'line'
                    ? { ...element, w: worldPoint.x - interaction.startWorldX, h: worldPoint.y - interaction.startWorldY }
                    : element
                );
                return;
            }

            if (interaction.mode === 'move-element' && interaction.movingElements) {
                const origins = interaction.movingElements;
                // A group (or a stroke, which has no origin of its own) moves by shifting every
                // point, so the elements keep their relative spacing; a lone box moves its origin.
                const isGroupMove = origins.size > 1;

                setHomeLayout(prev => ({
                    ...prev,
                    canvasElements: prev.canvasElements.map(element => {
                        const origin = origins.get(element.id);
                        if (!origin) return element;
                        if (isGroupMove || origin.kind === 'draw') {
                            return offsetCanvasElement(origin, deltaWorldX, deltaWorldY);
                        }
                        return {
                            ...origin,
                            x: origin.x + deltaWorldX,
                            y: origin.y + deltaWorldY,
                        };
                    }),
                }));
                return;
            }

            if (interaction.mode === 'resize-element' && interaction.id && interaction.element) {
                const origin = interaction.element;
                updateCanvasElement(interaction.id, element => {
                    if (element.kind === 'draw' || element.kind === 'line') return element;
                    if (origin.kind === 'draw' || origin.kind === 'line') return element;

                    const width = clampNumber(origin.w + deltaWorldX, 60, 1200);
                    // A picture keeps the ratio it was added at. Free-resizing a photo only ever
                    // produces a stretched one, so the height follows the width.
                    if (element.kind === 'image') {
                        const ratio = origin.h / Math.max(1, origin.w);
                        return { ...element, w: width, h: clampNumber(Math.round(width * ratio), 30, 900) };
                    }

                    return {
                        ...element,
                        w: width,
                        h: clampNumber(origin.h + deltaWorldY, 30, 900),
                    };
                });
                return;
            }

            if (interaction.mode === 'resize-line' && interaction.id) {
                updateCanvasElement(interaction.id, element => element.kind === 'line'
                    ? { ...element, w: worldPoint.x - element.x, h: worldPoint.y - element.y }
                    : element
                );
            }
        };

        const handlePointerUp = () => {
            const interaction = homeInteractionRef.current;

            if (interaction?.mode === 'lasso') {
                const selectedIds = elementsInLasso(
                    homeLayoutRef.current.canvasElements,
                    interaction.lassoPoints ?? []
                );
                setHomeLassoPoints(null);
                setHomeCanvasSelectedIds(selectedIds);
                setHomeCanvasSelection(selectedIds.length === 1 ? { kind: 'element', id: selectedIds[0] } : null);
                // Hand the selection straight to the pointer so it can be dragged or deleted without
                // a trip back to the toolbar.
                if (selectedIds.length > 0) setHomeCanvasTool('select');
            }

            if (homeHistoryTransactionRef.current) {
                endHomeLayoutTransaction();
            }
            homeInteractionRef.current = null;
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [canvasPointFromClient, endHomeLayoutTransaction, eraseCanvasElementAtPoint, setHomeLayout, updateCanvasElement]);

    /** Delete clears the freeform selection, which is the only way to remove a lassoed group. */
    useEffect(() => {
        if (currentSection !== 'home' || !isHomeEditing) return undefined;

        const handleDeleteSelection = (event: KeyboardEvent) => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;

            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, [contenteditable="true"]')) return;

            const selectedIds = homeCanvasSelectedIds.length > 0
                ? homeCanvasSelectedIds
                : homeCanvasSelection?.kind === 'element' ? [homeCanvasSelection.id] : [];
            if (selectedIds.length === 0) return;

            event.preventDefault();
            removeCanvasElements(selectedIds);
        };

        window.addEventListener('keydown', handleDeleteSelection);
        return () => window.removeEventListener('keydown', handleDeleteSelection);
    }, [currentSection, homeCanvasSelectedIds, homeCanvasSelection, isHomeEditing, removeCanvasElements]);

    const renderCurrentSection = () => {
        // Helper function to get badge variant based on attendance status
        const getAttendanceVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
            switch (status) {
                case 'present': return 'default';
                case 'absent': return 'destructive';
                case 'partial': return 'secondary';
                default: return 'outline';
            }
        };

        // Helper function to format attendance status text
        const formatAttendanceStatus = (status: string): string => {
            return status.charAt(0).toUpperCase() + status.slice(1);
        };

        switch (currentSection) {
            case 'home': {
                // Phone layout is intentionally independent from the saved desktop/tablet column
                // count, so a two-column desktop Home still projects onto a single phone column.
                const effectiveHomeColumns = homeColumnCount;
                const spanOf = (item: HomeItemType) => homeItemSpan(homeLayout, item, effectiveHomeColumns);
                // Until every card has reported a height there is no placement to render, so each
                // card falls back to auto-placement with whatever span it has measured so far.
                const fallbackRowSpanOf = (item: HomeItemType) => {
                    const height = homeItemHeights[item];
                    return height ? Math.ceil(height + HOME_ROW_GAP) : undefined;
                };
                const quickAccessSlots = homeLayout.quickAccessSlots.map((slot, index) => {
                    const action = slot.actionId ? quickAccessActionMap.get(slot.actionId) : null;
                    return { slot, action, index };
                });
                // Shortcut density follows the width the Quick Access card actually occupies, so a
                // card spanning both columns fits four per row rather than keeping the narrow two.
                const quickAccessIsFullWidth = effectiveHomeColumns === 1 || spanOf('quick_access') === 2;
                const quickAccessPerRow = isPhone ? 2 : quickAccessIsFullWidth ? 4 : 2;

                const isStylisedHomeCards = homeSettings.homeCardStyle === 'stylised';
                const homeItems = homeLayout.items;
                const activeHomeDragItem = activeHomeDragId as HomeItemType | null;
                // Freeform tools are desktop-only: they need a precise pointer and a stable frame.
                const canUseFreeformTools = !isPhone;

                const noteInsertOptions = [
                    { label: 'Heading', token: '# ' },
                    { label: 'Bold', token: '**text**' },
                    { label: 'Italic', token: '*text*' },
                    { label: 'Link', token: '[label](url)' },
                    { label: 'List', token: '- ' },
                    { label: 'Separator', token: '---' },
                    { label: 'Last updated', token: '{{lastUpdated}}' },
                    { label: 'Current date', token: '{{today}}' },
                    { label: 'Current time', token: '{{time}}' },
                ];

                const handleSaveNote = () => {
                    const trimmed = convertEmoticonsToEmoji(noteDraft.trim());
                    setHomeLayout(prev => ({ ...prev, note: trimmed.length > 0 ? trimmed : DEFAULT_NOTE }));
                    setIsNoteEditing(false);
                };

                const handleCancelNote = () => {
                    setNoteDraft(homeLayout.note);
                    setIsNoteEditing(false);
                };

                const handleStartNoteEditing = () => {
                    setIsNoteEditing(true);
                };

                /**
                 * `preview` renders the read-only face of a card for the drag overlay. Quick Access
                 * would otherwise mount a second sortable context inside the active drag.
                 */
                const renderHomeItem = (item: HomeItemType, options?: { preview?: boolean }) => {
                    switch (item) {
                        case 'note':
                            return (
                                <Card className={`${styles.homeDenseCard} ${isNoteEditing ? styles.noteCardEditing : ''}`}>
                                    <CardHeader
                                        className={styles.noteHeader}
                                        style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                                    >
                                        <CardTitle className="text-sm">Note</CardTitle>
                                        {!isNoteEditing && (
                                            <Button size="sm" className={styles.notePrimaryButton} onClick={handleStartNoteEditing}>
                                                <IconPencil size={14} />
                                                Edit
                                            </Button>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        <div className={styles.noteActionsRow}>
                                            {isNoteEditing && (
                                                <>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            render={
                                                                <button
                                                                    type="button"
                                                                    className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), styles.noteSecondaryButton)}
                                                                />
                                                            }
                                                        >
                                                                <IconPlus size={14} />
                                                                Insert
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="start">
                                                            {noteInsertOptions.map(option => (
                                                                <DropdownMenuItem key={option.token} onClick={() => insertNoteToken(option.token)}>
                                                                    {option.label}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                    <Button size="sm" variant="secondary" className={styles.noteSecondaryButton} onClick={handleCancelNote}>
                                                        Cancel
                                                    </Button>
                                                    <Button size="sm" className={styles.notePrimaryButton} onClick={handleSaveNote}>
                                                        Save
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                        {isNoteEditing ? (
                                            <>
                                                <Textarea
                                                    ref={noteTextareaRef}
                                                    value={noteDraft}
                                                    onChange={(e) => setNoteDraft(e.target.value)}
                                                    placeholder="Write something for your home page..."
                                                    className={styles.noteTextarea}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <div
                                                    className={styles.notePreview}
                                                    dangerouslySetInnerHTML={{ __html: noteHtml }}
                                                />
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        case 'quick_access': {
                            const quickAccessMinWidth = 220;
                            const showQuickAccessEditing = isHomeEditing && !options?.preview;
                            const quickAccessSlotsToShow = showQuickAccessEditing
                                ? quickAccessSlots
                                : quickAccessSlots.filter(entry => entry.action);
                            const quickAccessRows: Array<typeof quickAccessSlotsToShow> = [];
                            if (!showQuickAccessEditing) {
                                for (let i = 0; i < quickAccessSlotsToShow.length; i += quickAccessPerRow) {
                                    quickAccessRows.push(quickAccessSlotsToShow.slice(i, i + quickAccessPerRow));
                                }
                            }
                            const slotLabel = (slot: { label?: string }, action?: { label: string } | null) => (
                                slot.label || action?.label || 'Add shortcut'
                            );
                            const slotStyle = (slot: { accentColor?: string }) => (
                                slot.accentColor ? ({ '--qa-accent': slot.accentColor } as React.CSSProperties) : undefined
                            );
                            return (
                                <div className={styles.homeQuickAccess}>
                                    <div className={styles.homeQuickAccessHeader}>
                                        <h2 className={styles.homeQuickAccessTitle}>Quick Access</h2>
                                        <span className={styles.homeQuickAccessSubtitle}>
                                            {isPhone ? '2 per row' : quickAccessIsFullWidth ? 'Up to 4 per row' : 'Up to 2 per row'}
                                        </span>
                                    </div>
                                    {showQuickAccessEditing ? (
                                        <DndContext
                                            sensors={quickAccessSensors}
                                            collisionDetection={closestCenter}
                                            onDragEnd={handleQuickAccessDragEnd}
                                            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                                        >
                                            <SortableContext
                                                items={quickAccessSlotsToShow.map(entry => entry.slot.id)}
                                                strategy={rectSortingStrategy}
                                            >
                                                <div
                                                    className={styles.homeQuickAccessGrid}
                                                    style={{ '--qa-columns': quickAccessPerRow, '--qa-min': `${quickAccessMinWidth}px` } as React.CSSProperties}
                                                >
                                                    {quickAccessSlotsToShow.map(({ slot, action, index }) => {
                                                        const isEmpty = !action;
                                                        const label = slotLabel(slot, action);
                                                        const description = action?.description || 'Pick a page or action';
                                                        return (
                                                            <SortableQuickAccessItem
                                                                key={slot.id}
                                                                id={slot.id}
                                                                disabled={!showQuickAccessEditing}
                                                            >
                                                                <div
                                                                    className={`${styles.homeQuickAccessItem} ${isEmpty ? styles.homeQuickAccessEmpty : ''}`}
                                                                    style={slotStyle(slot)}
                                                                >
                                                                    <Card
                                                                        data-card-style={isStylisedHomeCards ? 'stylised' : 'minimal'}
                                                                        data-accent={slot.accentColor ? 'true' : 'false'}
                                                                        className={`${styles.homeQuickAccessCard} ${styles.homeQuickAccessCardDisabled}`}
                                                                    >
                                                                        <CardHeader className={styles.homeQuickAccessCardHeader}>
                                                                            <div className={styles.quickAccessIcon}>
                                                                                {action?.icon || <IconPlus size={16} />}
                                                                            </div>
                                                                            <div>
                                                                                <CardTitle className={styles.quickAccessLabel}>{label}</CardTitle>
                                                                                <CardDescription className={styles.quickAccessSubtitle}>{description}</CardDescription>
                                                                            </div>
                                                                        </CardHeader>
                                                                    </Card>
                                                                    <button
                                                                        className={styles.quickAccessRemove}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            removeQuickAccessSlot(index);
                                                                        }}
                                                                        title="Remove shortcut"
                                                                    >
                                                                        <IconX size={12} />
                                                                    </button>
                                                                    <div className={styles.quickAccessEditOverlay}>
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger
                                                                                render={
                                                                                    <button
                                                                                        className={styles.quickAccessEditButton}
                                                                                        onClick={(event) => event.stopPropagation()}
                                                                                    />
                                                                                }
                                                                            >
                                                                                    <IconPencil size={12} />
                                                                                    {isEmpty ? 'Add' : 'Edit'}
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="center">
                                                                                {quickAccessActions.map((option) => (
                                                                                    <DropdownMenuItem
                                                                                        key={option.id}
                                                                                        onClick={() => updateQuickAccessSlot(index, option.id)}
                                                                                    >
                                                                                        {option.label}
                                                                                    </DropdownMenuItem>
                                                                                ))}
                                                                                {!isEmpty && (
                                                                                    <>
                                                                                        <DropdownMenuSeparator />
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => updateQuickAccessSlot(index, null)}
                                                                                            variant="destructive"
                                                                                        >
                                                                                            Clear shortcut
                                                                                        </DropdownMenuItem>
                                                                                    </>
                                                                                )}
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                        {!isEmpty && (
                                                                            <Popover>
                                                                                <PopoverTrigger
                                                                                    render={
                                                                                        <button
                                                                                            className={styles.quickAccessEditButton}
                                                                                            onClick={(event) => event.stopPropagation()}
                                                                                        />
                                                                                    }
                                                                                >
                                                                                    <IconPalette size={12} />
                                                                                    Style
                                                                                </PopoverTrigger>
                                                                                <PopoverContent
                                                                                    align="center"
                                                                                    className={styles.quickAccessStylePanel}
                                                                                    onPointerDown={(event) => event.stopPropagation()}
                                                                                >
                                                                                    <label className={styles.quickAccessStyleRow}>
                                                                                        Label
                                                                                        <Input
                                                                                            value={slot.label || ''}
                                                                                            placeholder={action?.label || 'Shortcut'}
                                                                                            maxLength={40}
                                                                                            onChange={(event) => styleQuickAccessSlot(index, { label: event.target.value })}
                                                                                        />
                                                                                    </label>
                                                                                    <div className={styles.quickAccessStyleRow}>
                                                                                        Accent
                                                                                        <ColorPicker
                                                                                            value={slot.accentColor || HOME_DEFAULT_ACCENT}
                                                                                            onChange={(accentColor) => styleQuickAccessSlot(index, { accentColor })}
                                                                                        >
                                                                                            <ColorPickerTrigger className={styles.homeColorTrigger} />
                                                                                            <ColorPickerContent />
                                                                                        </ColorPicker>
                                                                                    </div>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="secondary"
                                                                                        onClick={() => styleQuickAccessSlot(index, { label: null, accentColor: null })}
                                                                                    >
                                                                                        Reset styling
                                                                                    </Button>
                                                                                </PopoverContent>
                                                                            </Popover>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </SortableQuickAccessItem>
                                                        );
                                                    })}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    ) : quickAccessSlotsToShow.length > 0 ? (
                                        <div className={styles.homeQuickAccessRows}>
                                            {quickAccessRows.map((row, rowIndex) => (
                                                <div key={`qa-row-${rowIndex}`} className={styles.homeQuickAccessRow}>
                                                    {row.map(({ slot, action }) => (
                                                        <div
                                                            key={slot.id}
                                                            className={styles.homeQuickAccessItem}
                                                            style={slotStyle(slot)}
                                                        >
                                                            <Card
                                                                data-clickable={!!action}
                                                                data-card-style={isStylisedHomeCards ? 'stylised' : 'minimal'}
                                                                data-accent={slot.accentColor ? 'true' : 'false'}
                                                                onClick={() => action?.onSelect()}
                                                                className={styles.homeQuickAccessCard}
                                                            >
                                                                <CardHeader className={styles.homeQuickAccessCardHeader}>
                                                                    <div className={styles.quickAccessIcon}>
                                                                        {action?.icon || <IconPlus size={16} />}
                                                                    </div>
                                                                    <div>
                                                                        <CardTitle className={styles.quickAccessLabel}>{slotLabel(slot, action)}</CardTitle>
                                                                        <CardDescription className={styles.quickAccessSubtitle}>
                                                                            {action?.description || 'Pick a page or action'}
                                                                        </CardDescription>
                                                                    </div>
                                                                </CardHeader>
                                                            </Card>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={styles.homeEmptyState}>
                                            No shortcuts yet. Toggle Customise Home to add some.
                                        </div>
                                    )}
                                    {/*
                                      * Outside the grid on purpose. As a tile it consumed a slot and pushed a
                                      * whole column (both, at two-column width) down every time Quick Access
                                      * was edited. Floating it under the last row keeps the shortcut grid the
                                      * only thing that decides the card's height; it overhangs the card edge
                                      * and paints above whatever sits below.
                                      */}
                                    {showQuickAccessEditing ? (
                                        <Tooltip>
                                            <TooltipTrigger
                                                render={
                                                    <button
                                                        type="button"
                                                        aria-label="Add shortcut"
                                                        className={styles.quickAccessAdd}
                                                        onClick={addQuickAccessSlot}
                                                    />
                                                }
                                            >
                                                <IconPlus size={16} />
                                            </TooltipTrigger>
                                            <TooltipContent>Add shortcut</TooltipContent>
                                        </Tooltip>
                                    ) : null}
                                </div>
                            );
                        }
                        case 'notifications': {
                            const notices = (portalData?.notices || []) as Notice[];
                            const now = new Date();
                            const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                            const isForDate = (notice: Notice, date: string) => {
                                const targetDate = parseNoticeStartDate(date);
                                const noticeDates = [notice.date, ...(notice.dates || [])]
                                    .map(parseNoticeStartDate)
                                    .filter((value): value is Date => Boolean(value))
                                    .sort((a, b) => a.getTime() - b.getTime());
                                if (!targetDate || noticeDates.length === 0) return false;

                                return targetDate >= noticeDates[0]
                                    && targetDate <= noticeDates[noticeDates.length - 1];
                            };

                            const activeDate = notices.some(notice => isForDate(notice, todayKey)) ? todayKey : '';

                            // Dedupe runs after the date filter so notices that legitimately repeat
                            // under the same title on different days are only collapsed within a day.
                            const activeNotices = activeDate
                                ? dedupeHomeNotices(notices
                                    .map((n, index) => ({ ...n, originalIndex: index }))
                                    .filter(notice => {
                                        if (!isForDate(notice, activeDate)) return false;

                                        const notificationId = notificationHooks.getNotificationId(notice, notice.originalIndex);
                                        const state = notificationHooks.notificationStates[notificationId];
                                        const isArchived = state?.archived || false;
                                        const isPinned = state?.pinned || false;
                                        const folderId = state?.folderId;

                                        // Filter based on settings
                                        if (homeSettings.hiddenNotificationCategories.includes('archive') && isArchived) return false;
                                        if (homeSettings.hiddenNotificationCategories.includes('pinned') && isPinned) return false;
                                        if (folderId && homeSettings.hiddenNotificationCategories.includes(`folder:${folderId}`)) return false;

                                        return true;
                                    }))
                                : [];
                            const groupLabel = activeDate ? 'Today' : 'No notifications yet';

                            return (
                                <Card className={styles.homeDenseCard}>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Notifications</CardTitle>
                                            <CardDescription>{groupLabel}</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {activeNotices.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No notifications for today.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {activeNotices.map((notice, index) => {
                                                    const notificationId = getNotificationId(notice, notice.originalIndex ?? index);
                                                    return (
                                                        <button
                                                            key={`${notice.title}-${index}`}
                                                            type="button"
                                                            className={`${styles.homeListItem} ${styles.homeListItemButton}`}
                                                            onClick={(event) => openHomeNotificationGlance(notice, notificationId, event.currentTarget)}
                                                        >
                                                            <div>
                                                                <div className={styles.homeListItemTitle}>{notice.title}</div>
                                                                <div className={styles.homeListItemMeta}>{notice.preview}</div>
                                                            </div>
                                                            <span className={styles.homeListItemIcon} aria-hidden="true">
                                                                <IconEye size={14} />
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'classroom_assignments': {
                            const assignments = classroom.assignedItems
                                .slice()
                                .sort((a, b) => {
                                    const aDate = Date.parse(a.dueAt || '');
                                    const bDate = Date.parse(b.dueAt || '');
                                    if (!Number.isFinite(aDate)) return 1;
                                    if (!Number.isFinite(bDate)) return -1;
                                    return aDate - bDate;
                                })
                                .slice(0, 5);
                            return (
                                <Card className={styles.homeDenseCard}>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Classroom Assignments</CardTitle>
                                            <CardDescription>Assigned and missing work</CardDescription>
                                        </div>
                                        {classroom.missingItems.length > 0 && <Badge variant="destructive">{classroom.missingItems.length} missing</Badge>}
                                    </CardHeader>
                                    <CardContent>
                                        {!classroom.snapshot ? (
                                            <button type="button" className={`${styles.homeEmptyState} w-full`} onClick={() => handleSectionClick('classroom')}>
                                                Sync Google Classroom to see assignments.
                                            </button>
                                        ) : assignments.length === 0 ? (
                                            <div className={styles.homeEmptyState}>No assigned work.</div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {assignments.map((item) => (
                                                    <button key={item.id} type="button" className={`${styles.homeListItem} ${styles.homeListItemButton}`} onClick={() => handleSectionClick('classroom')}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{item.title}</div>
                                                            <div className={styles.homeListItemMeta}>
                                                                {classroom.courseById.get(item.courseId)?.title || 'Google Classroom'}
                                                                {item.dueAt ? ` • Due ${new Date(item.dueAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                                                            </div>
                                                        </div>
                                                        {item.submission?.status === 'missing' && <span className={styles.homeListItemBadge}>Missing</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'classroom_activity': {
                            const activity = classroom.recentItems.slice(0, 5);
                            return (
                                <Card className={styles.homeDenseCard}>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Classroom Activity</CardTitle>
                                            <CardDescription>Recent classwork updates</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {!classroom.snapshot ? (
                                            <button type="button" className={`${styles.homeEmptyState} w-full`} onClick={() => handleSectionClick('classroom')}>
                                                No Classroom sync yet.
                                            </button>
                                        ) : activity.length === 0 ? (
                                            <div className={styles.homeEmptyState}>No recent activity.</div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {activity.map((item) => (
                                                    <button key={item.id} type="button" className={`${styles.homeListItem} ${styles.homeListItemButton}`} onClick={() => handleSectionClick('classroom')}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{item.title}</div>
                                                            <div className={styles.homeListItemMeta}>
                                                                {classroom.courseById.get(item.courseId)?.title || 'Google Classroom'} • {item.kind}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'calendar': {
                            const now = new Date();
                            const dayStart = new Date(now);
                            dayStart.setHours(0, 0, 0, 0);
                            const dayEnd = new Date(now);
                            dayEnd.setHours(23, 59, 59, 999);

                            const homeCalendarEvents = homeSettings.calendarShowClasses
                                ? [...allEvents, ...visibleClassEvents]
                                : allEvents;
                            const visibleCalendarIds = new Set(allCalendars
                                .filter(c => c.visible)
                                .filter(c => homeSettings.calendarShowClasses || c.id !== 'classes')
                                .map(c => c.id));
                            const todaysEvents = homeCalendarEvents
                                .filter(event =>
                                    visibleCalendarIds.has(event.calendarId) &&
                                    event.end >= dayStart &&
                                    event.start <= dayEnd
                                )
                                .sort((a, b) => a.start.getTime() - b.start.getTime());

                            const runningEvents = todaysEvents.filter(event => event.start <= now && event.end >= now);
                            const upcomingEvents = todaysEvents.filter(event => event.start > now);
                            const visibleEvents = [...runningEvents, ...upcomingEvents];

                            // A day with nothing left on it is the common case, and an empty card is
                            // useless there, so fall back to the next fortnight instead of today only.
                            const horizon = new Date(now);
                            horizon.setDate(horizon.getDate() + 14);
                            const laterEvents = visibleEvents.length > 0 ? [] : homeCalendarEvents
                                .filter(event =>
                                    visibleCalendarIds.has(event.calendarId) &&
                                    event.start > dayEnd &&
                                    event.start <= horizon
                                )
                                .sort((a, b) => a.start.getTime() - b.start.getTime());
                            const resolvedEvents = visibleEvents.length > 0 ? visibleEvents : laterEvents;
                            const eventsToShow = (isPreviewMode && resolvedEvents.length === 0
                                ? previewCalendarEvents
                                : resolvedEvents
                            ).slice(0, 5);
                            const isShowingLaterEvents = visibleEvents.length === 0 && laterEvents.length > 0;

                            const formatEventTime = (event: CalendarEvent) => {
                                const day = event.start < dayStart || event.start > dayEnd
                                    ? formatDateByPreference(event.start, { weekday: 'short', day: 'numeric', month: 'short' })
                                    : '';
                                if (event.allDay) return day ? `${day} • All day` : 'All day';
                                const start = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const end = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return day ? `${day} ${start} - ${end}` : `${start} - ${end}`;
                            };

                            return (
                                <Card className={styles.homeDenseCard}>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Calendar</CardTitle>
                                            <CardDescription>
                                                {isShowingLaterEvents ? 'Nothing left today — coming up next' : 'Running now and coming up today'}
                                            </CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {eventsToShow.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No events in the next two weeks.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {eventsToShow.map(event => (
                                                    <div key={event.id} className={styles.homeListItem}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{event.title}</div>
                                                            <div className={styles.homeListItemMeta}>
                                                                {formatEventTime(event)} • {event.calendarName}
                                                            </div>
                                                        </div>
                                                        {event.start <= now && event.end >= now && (
                                                            <span className={styles.homeListItemBadge}>Now</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'today_classes': {
                            const now = new Date();
                            const todayKey = toPortalDayKey(now);
                            const isHolidayToday = holidayDateKeys.has(todayKey);
                            const dayIndex = now.getDay();
                            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                            const todayName = dayNames[dayIndex - 1] || '';

                            const timetableData = portalData?.timetable;
                            const isFullTimetable = timetableData &&
                                typeof timetableData === 'object' &&
                                !Array.isArray(timetableData) &&
                                ('weekA' in timetableData || 'weekB' in timetableData);

                            let todayClasses: Array<{ period: string; subject: string; teacher: string; room: string; attendanceStatus?: string }> = [];

                            if (isHolidayToday) {
                                todayClasses = [];
                            } else if (Array.isArray(timetableData)) {
                                todayClasses = timetableData.map(entry => ({
                                    period: entry.period,
                                    subject: entry.subject,
                                    teacher: entry.teacher,
                                    room: entry.room,
                                    attendanceStatus: entry.attendanceStatus,
                                }));
                            } else if (isFullTimetable && todayName) {
                                const fullTimetable = timetableData as { weekA: any[]; weekB: any[] };
                                const entries = fullTimetable[selectedWeek]?.filter(entry =>
                                    entry.day?.toLowerCase() === todayName.toLowerCase()
                                ) || [];
                                todayClasses = entries.map(entry => ({
                                    period: entry.period,
                                    subject: entry.course || entry.classCode,
                                    teacher: entry.teacher,
                                    room: entry.room,
                                }));
                            }

                            const periodSchedule: Record<string, { start: number; end: number }> = {
                                '1': { start: 8 * 60 + 45, end: 9 * 60 + 24 },
                                '2': { start: 9 * 60 + 24, end: 10 * 60 + 3 },
                                '3': { start: 10 * 60 + 3, end: 10 * 60 + 42 },
                                '3a': { start: 10 * 60 + 3, end: 10 * 60 + 42 },
                                '3b': { start: 10 * 60 + 32, end: 11 * 60 + 11 },
                                '4': { start: 11 * 60 + 11, end: 11 * 60 + 50 },
                                '5': { start: 11 * 60 + 50, end: 12 * 60 + 31 },
                                '6': { start: 12 * 60 + 31, end: 13 * 60 + 8 },
                                '6a': { start: 12 * 60 + 31, end: 13 * 60 + 8 },
                                '6b': { start: 12 * 60 + 58, end: 13 * 60 + 37 },
                                '7': { start: 13 * 60 + 37, end: 14 * 60 + 16 },
                                '8': { start: 14 * 60 + 16, end: 14 * 60 + 55 },
                            };
                            const currentMinutes = now.getHours() * 60 + now.getMinutes();
                            const getClassPeriodState = (period: string) => {
                                const raw = String(period || '').toLowerCase();
                                const match = raw.match(/(\d+)\s*([ab])?/);
                                if (!match) return 'upcoming';

                                const code = `${Number(match[1])}${match[2] || ''}`;
                                const numberOnly = match[1];
                                const baseBounds = periodSchedule[code] || periodSchedule[numberOnly];
                                if (!baseBounds) return 'upcoming';

                                const bounds = todayName.toLowerCase() === 'tuesday' && numberOnly === '8'
                                    ? { ...baseBounds, end: baseBounds.start + 28 }
                                    : baseBounds;

                                if (currentMinutes >= bounds.start && currentMinutes < bounds.end) return 'current';
                                if (currentMinutes >= bounds.end) return 'past';
                                return 'upcoming';
                            };

                            return (
                                <Card className={styles.homeDenseCard}>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Today&apos;s Classes</CardTitle>
                                            <CardDescription>{isHolidayToday ? 'Holiday' : (todayName ? todayName : 'Weekend')}</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {isHolidayToday ? (
                                            <div className={styles.homeEmptyState}>
                                                No classes today. It&apos;s marked as a holiday.
                                            </div>
                                        ) : dayIndex === 0 || dayIndex === 6 ? (
                                            <div className={styles.homeEmptyState}>
                                                No classes today.
                                            </div>
                                        ) : todayClasses.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No classes scheduled for today.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {todayClasses.map((item, index) => {
                                                    const periodState = getClassPeriodState(item.period);
                                                    return (
                                                        <div
                                                            key={`${item.subject}-${index}`}
                                                            className={`${styles.homeListItem} ${periodState === 'current' ? styles.homeListItemCurrent : ''} ${periodState === 'past' ? styles.homeListItemPast : ''}`}
                                                        >
                                                            <div>
                                                                <div className={styles.homeListItemTitle}>{item.subject}</div>
                                                                <div className={styles.homeListItemMeta}>
                                                                    {item.period} • {item.teacher} • {item.room}
                                                                </div>
                                                            </div>
                                                            {item.attendanceStatus && (
                                                                <span className={styles.homeListItemBadge}>
                                                                    {formatAttendanceStatus(item.attendanceStatus)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'attendance_snapshot': {
                            const attendanceData = portalData?.attendance as AttendanceData | undefined;
                            const yearlyAttendance = attendanceData?.yearly || [];
                            const currentYear = new Date().getFullYear().toString();
                            const currentYearAttendance = yearlyAttendance.find(entry => entry.year === currentYear)
                                || [...yearlyAttendance].sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10))[0];

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Attendance</CardTitle>
                                            <CardDescription>Current year snapshot</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {!currentYearAttendance ? (
                                            <div className={styles.homeEmptyState}>
                                                No attendance data yet.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                <div className={styles.homeListItem}>
                                                    <div>
                                                        <div className={styles.homeListItemTitle}>{currentYearAttendance.year}</div>
                                                        <div className={styles.homeListItemMeta}>Overall attendance</div>
                                                    </div>
                                                    <span className={styles.homeListItemBadge}>
                                                        {currentYearAttendance.totalPercentage.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div className={styles.homeListItem}>
                                                    <div>
                                                        <div className={styles.homeListItemTitle}>Total absences</div>
                                                        <div className={styles.homeListItemMeta}>Whole-day absences</div>
                                                    </div>
                                                    <span className={styles.homeListItemBadge}>{currentYearAttendance.wholeDayAbsences}</span>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        default:
                            return null;
                    }
                };

                const toolButtons: Array<{ id: HomeToolbarAction; title: string; icon: ReactNode }> = [
                    { id: 'select', title: 'Select', icon: <IconPointer size={16} /> },
                    { id: 'lasso', title: 'Lasso select', icon: <IconLasso size={16} /> },
                    { id: 'draw', title: 'Free draw', icon: <IconBrush size={16} /> },
                    { id: 'eraser', title: 'Erase', icon: <IconEraser size={16} /> },
                    { id: 'text', title: 'Text', icon: <IconTextPlus size={16} /> },
                    { id: 'line', title: 'Line', icon: <IconLine size={16} /> },
                    { id: 'image', title: 'Image', icon: <IconPhoto size={16} /> },
                ];
                const canUndoHomeLayout = homeLayoutHistoryRef.current.past.length > 0;
                const canRedoHomeLayout = homeLayoutHistoryRef.current.future.length > 0;
                const toolTipButton = (
                    label: string,
                    button: React.ReactElement
                ) => (
                    <Tooltip>
                        <TooltipTrigger render={button} />
                        <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                );
                const renderNumberStepper = (
                    value: number,
                    min: number,
                    max: number,
                    onChange: (value: number) => void,
                    label: string,
                    step = 1
                ) => (
                    <div className={styles.homeNumberStepper}>
                        <input
                            value={value}
                            inputMode="numeric"
                            onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
                            aria-label={label}
                        />
                        <div>
                            {toolTipButton(`${label} up`, (
                                <button type="button" onClick={() => onChange(clampNumber(value + step, min, max))}>
                                    <IconChevronUp size={12} />
                                </button>
                            ))}
                            {toolTipButton(`${label} down`, (
                                <button type="button" onClick={() => onChange(clampNumber(value - step, min, max))}>
                                    <IconChevronDown size={12} />
                                </button>
                            ))}
                        </div>
                    </div>
                );

                const renderCanvasElement = (element: HomeCanvasElement) => {
                    const isSelected = (homeCanvasSelection?.kind === 'element' && homeCanvasSelection.id === element.id)
                        || homeCanvasSelectedIds.includes(element.id);
                    // Only the single-element selection opens inline editors and handles; a lassoed
                    // group is a move/delete target, not something to type into.
                    const isSoleSelection = isSelected && homeCanvasSelectedIds.length <= 1;

                    if (element.kind === 'text') {
                        const isRemoving = removingCanvasElementIds.includes(element.id);
                        return (
                            <div
                                key={element.id}
                                className={styles.homeCanvasTextElement}
                                data-canvas-element-id={element.id}
                                data-selected={isSelected ? 'true' : 'false'}
                                data-removing={isRemoving ? 'true' : 'false'}
                                data-new={newCanvasElementIds.includes(element.id) ? 'true' : 'false'}
                                style={{
                                    left: element.x,
                                    top: element.y,
                                    width: element.w,
                                    height: element.h,
                                    color: element.color,
                                    backgroundColor: element.highlightColor,
                                    fontFamily: element.fontFamily,
                                    fontSize: element.fontSize,
                                }}
                                onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'move-element')}
                            >
                                {isHomeEditing && isSoleSelection && homeCanvasTool === 'select' ? (
                                    <textarea
                                        className={styles.homeCanvasTextInput}
                                        value={element.text}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onChange={(event) => {
                                            const text = event.target.value;
                                            updateCanvasElement(element.id, current => current.kind === 'text' ? { ...current, text } : current);
                                        }}
                                    />
                                ) : (
                                    <div>{element.text}</div>
                                )}
                                {isHomeEditing && isSoleSelection && (
                                    <>
                                        {toolTipButton('Delete text', (
                                            <button
                                                className={styles.homeCanvasElementDelete}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeCanvasElement(element.id);
                                                }}
                                            >
                                                <IconTrash size={14} />
                                            </button>
                                        ))}
                                        {toolTipButton('Resize text', (
                                            <button
                                                className={styles.homeCanvasResizeHandle}
                                                onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'resize-element')}
                                            />
                                        ))}
                                    </>
                                )}
                            </div>
                        );
                    }

                    if (element.kind === 'image') {
                        const isRemoving = removingCanvasElementIds.includes(element.id);
                        return (
                            <div
                                key={element.id}
                                className={styles.homeCanvasImageElement}
                                data-canvas-element-id={element.id}
                                data-selected={isSelected ? 'true' : 'false'}
                                data-removing={isRemoving ? 'true' : 'false'}
                                data-new={newCanvasElementIds.includes(element.id) ? 'true' : 'false'}
                                style={{
                                    left: element.x,
                                    top: element.y,
                                    width: element.w,
                                    height: element.h,
                                    borderRadius: element.radius,
                                }}
                                onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'move-element')}
                            >
                                {/* `draggable={false}` matters: without it a press on the picture starts
                                    the browser's own image drag and the move gesture never begins. */}
                                <img src={element.src} alt={element.alt} draggable={false} />
                                {isHomeEditing && isSoleSelection && (
                                    <>
                                        {toolTipButton('Remove image', (
                                            <button
                                                className={styles.homeCanvasElementDelete}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeCanvasElement(element.id);
                                                }}
                                            >
                                                <IconTrash size={14} />
                                            </button>
                                        ))}
                                        {toolTipButton('Resize image', (
                                            <button
                                                className={styles.homeCanvasResizeHandle}
                                                onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'resize-element')}
                                            />
                                        ))}
                                    </>
                                )}
                            </div>
                        );
                    }

                    if (element.kind === 'line') {
                        const isRemoving = removingCanvasElementIds.includes(element.id);
                        const left = Math.min(element.x, element.x + element.w);
                        const top = Math.min(element.y, element.y + element.h);
                        const width = Math.max(Math.abs(element.w), 8);
                        const height = Math.max(Math.abs(element.h), 8);

                        return (
                            <div
                                key={element.id}
                                className={styles.homeCanvasLineElement}
                                data-canvas-element-id={element.id}
                                data-selected={isSelected ? 'true' : 'false'}
                                data-removing={isRemoving ? 'true' : 'false'}
                                data-new={newCanvasElementIds.includes(element.id) ? 'true' : 'false'}
                                style={{ left, top, width, height }}
                                onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'move-element')}
                            >
                                <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                                    {/*
                                      * The visible stroke is inert and a fat transparent copy owns the
                                      * hit area. The element box is a bounding rectangle, so hit-testing
                                      * the box would let a diagonal line block clicks and drags on every
                                      * card under its corner, and would let the eraser delete it from
                                      * far away.
                                      */}
                                    <line
                                        className={styles.homeCanvasHitStroke}
                                        x1={element.w < 0 ? width : 0}
                                        y1={element.h < 0 ? height : 0}
                                        x2={element.w < 0 ? 0 : width}
                                        y2={element.h < 0 ? 0 : height}
                                        strokeWidth={Math.max(element.strokeWidth + 12, HOME_CANVAS_HIT_STROKE)}
                                        strokeLinecap="round"
                                    />
                                    <line
                                        x1={element.w < 0 ? width : 0}
                                        y1={element.h < 0 ? height : 0}
                                        x2={element.w < 0 ? 0 : width}
                                        y2={element.h < 0 ? 0 : height}
                                        stroke={element.color}
                                        strokeWidth={element.strokeWidth}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                {isHomeEditing && isSoleSelection && toolTipButton('Resize line', (
                                    <button
                                        className={styles.homeCanvasResizeHandle}
                                        onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'resize-line')}
                                    />
                                ))}
                            </div>
                        );
                    }

                    const xs = element.points.map(point => point.x);
                    const ys = element.points.map(point => point.y);
                    const left = xs.length ? Math.min(...xs) : 0;
                    const top = ys.length ? Math.min(...ys) : 0;
                    const right = xs.length ? Math.max(...xs) : 1;
                    const bottom = ys.length ? Math.max(...ys) : 1;

                    const drawPoints = element.points.map(point => `${point.x},${point.y}`).join(' ');

                    return (
                        <svg
                            key={element.id}
                            className={styles.homeCanvasDrawElement}
                            data-canvas-element-id={element.id}
                            data-selected={isSelected ? 'true' : 'false'}
                            data-removing={removingCanvasElementIds.includes(element.id) ? 'true' : 'false'}
                            data-new={newCanvasElementIds.includes(element.id) ? 'true' : 'false'}
                            style={{ left: left - 8, top: top - 8, width: right - left + 16, height: bottom - top + 16 }}
                            viewBox={`${left - 8} ${top - 8} ${right - left + 16} ${bottom - top + 16}`}
                            onPointerDown={(event) => handleHomeElementPointerDown(event, element, 'move-element')}
                        >
                            {/*
                              * Only the ink is clickable. A stroke's box is its bounding rectangle, so
                              * hit-testing the box made a single diagonal scribble swallow presses and
                              * card drags across everything it spanned.
                              */}
                            <polyline
                                className={styles.homeCanvasHitStroke}
                                points={drawPoints}
                                strokeWidth={Math.max(element.strokeWidth + 12, HOME_CANVAS_HIT_STROKE)}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <polyline
                                points={drawPoints}
                                fill="none"
                                stroke={element.color}
                                strokeWidth={element.strokeWidth}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    );
                };

                return (
                    <div className={`${styles.contentWrapper} ${styles.homeContentWrapper}`}>
                            <div
                                className={styles.homeCanvasShell}
                                data-tour-home-editing-area=""
                                data-editing={isHomeEditing ? 'true' : 'false'}
                            >
                                {isHomeEditing && canUseFreeformTools && (
                                    <div className={styles.homeFloatingToolbar} data-tour-id="home-editing-tools">
                                        {/* Image is an action, not a mode: there is nothing to draw
                                            once a picture is chosen, so it never becomes the armed
                                            tool and the previous tool stays selected. */}
                                        <Toolbar<HomeToolbarAction>
                                            items={toolButtons}
                                            selected={homeCanvasTool}
                                            ariaLabel="Home editing tools"
                                            onSelect={(toolId) => {
                                                if (toolId === 'image') {
                                                    homeImageInputRef.current?.click();
                                                    return;
                                                }
                                                setHomeCanvasTool(toolId);
                                            }}
                                        />
                                        <input
                                            ref={homeImageInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="sr-only"
                                            aria-hidden="true"
                                            tabIndex={-1}
                                            onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                // Cleared so choosing the same file twice in a row
                                                // still fires a change event.
                                                event.target.value = '';
                                                void handleHomeImageFile(file);
                                            }}
                                        />
                                        <div className={styles.homeToolGroup}>
                                            {toolTipButton('Undo', (
                                                <button className={styles.homeToolButton} onClick={undoHomeLayout} disabled={!canUndoHomeLayout}>
                                                    <IconArrowBackUp size={16} />
                                                </button>
                                            ))}
                                            {toolTipButton('Redo', (
                                                <button className={styles.homeToolButton} onClick={redoHomeLayout} disabled={!canRedoHomeLayout}>
                                                    <IconArrowForwardUp size={16} />
                                                </button>
                                            ))}
                                        </div>
                                        <ColorPicker value={drawColor} onChange={setDrawColor}>
                                            <ColorPickerTrigger className={styles.homeColorTrigger} />
                                            <ColorPickerContent />
                                        </ColorPicker>
                                        {renderNumberStepper(drawStrokeWidth, 1, 24, setDrawStrokeWidth, 'Stroke width')}
                                    </div>
                                )}
                                {isHomeEditing && selectedHomeElement?.kind === 'text' && (
                                    <div className={styles.homeInspectorBar}>
                                        <Select
                                            value={selectedHomeElement.fontFamily}
                                            onValueChange={(fontFamily) => {
                                                if (!fontFamily) return;
                                                setTextDefaults(prev => ({ ...prev, fontFamily }));
                                                updateCanvasElement(selectedHomeElement.id, element => element.kind === 'text' ? { ...element, fontFamily } : element);
                                            }}
                                        >
                                            <SelectTrigger className={styles.homeInspectorSelect}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Inter">Inter</SelectItem>
                                                <SelectItem value="Geist">Geist</SelectItem>
                                                <SelectItem value="Georgia">Georgia</SelectItem>
                                                <SelectItem value="Times New Roman">Times</SelectItem>
                                                <SelectItem value="SF Mono">Mono</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {renderNumberStepper(
                                            selectedHomeElement.fontSize,
                                            10,
                                            96,
                                            (fontSize) => {
                                                setTextDefaults(prev => ({ ...prev, fontSize }));
                                                updateCanvasElement(selectedHomeElement.id, element => element.kind === 'text' ? { ...element, fontSize } : element);
                                            },
                                            'Font size'
                                        )}
                                        <div className={styles.homeInspectorLabel}>
                                            Text
                                            <ColorPicker
                                                value={selectedHomeElement.color || HOME_DEFAULT_ACCENT}
                                                onChange={(color) => {
                                                    setTextDefaults(prev => ({ ...prev, color }));
                                                    updateCanvasElement(selectedHomeElement.id, element => element.kind === 'text' ? { ...element, color } : element);
                                                }}
                                            >
                                                <ColorPickerTrigger className={styles.homeColorTrigger} />
                                                <ColorPickerContent />
                                            </ColorPicker>
                                        </div>
                                        <div className={styles.homeInspectorLabel}>
                                            Highlight
                                            <ColorPicker
                                                value={selectedHomeElement.highlightColor === 'transparent' ? HOME_DEFAULT_ACCENT : selectedHomeElement.highlightColor}
                                                onChange={(highlightColor) => {
                                                    setTextDefaults(prev => ({ ...prev, highlightColor }));
                                                    updateCanvasElement(selectedHomeElement.id, element => element.kind === 'text' ? { ...element, highlightColor } : element);
                                                }}
                                            >
                                                <ColorPickerTrigger className={styles.homeColorTrigger} />
                                                <ColorPickerContent />
                                            </ColorPicker>
                                        </div>
                                        <button className={styles.homeInspectorButton} onClick={() => removeCanvasElement(selectedHomeElement.id)}>
                                            <IconTrash size={14} />
                                            Remove
                                        </button>
                                    </div>
                                )}
                                <div
                                    ref={homeCanvasRef}
                                    className={styles.homeCanvasSurface}
                                    data-tool={homeCanvasTool}
                                    onPointerDown={handleHomeCanvasPointerDown}
                                >
                                    <DndContext
                                        sensors={homeSensors}
                                        collisionDetection={homeCollisionDetection}
                                        onDragStart={handleHomeDragStart}
                                        onDragMove={handleHomeDragMove}
                                        onDragOver={handleHomeDragOver}
                                        onDragEnd={handleHomeDragEnd}
                                        onDragCancel={handleHomeDragCancel}
                                        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                                    >
                                        {/*
                                          * `data-columns` carries the preference, because that is what the
                                          * CSS reads. `homeColumnCount` is the count measured back off the
                                          * laid-out grid; feeding that in here instead would latch Home at
                                          * one column the moment a responsive override collapsed it.
                                          */}
                                        <div
                                            ref={homeGridRef}
                                            className={styles.homeLayout}
                                            data-tour-id="page-home"
                                            data-columns={preferredHomeColumns}
                                            data-editing={isHomeEditing ? 'true' : 'false'}
                                            data-wiggle={homeSettings.homeWiggleEnabled ? 'true' : 'false'}
                                        >
                                            <SortableContext items={homeItems} strategy={homeSortingStrategy}>
                                                {homeItems.map(item => {
                                                    const span = spanOf(item);
                                                    const itemLabel = homeItemDefinitions[item]?.label || item;
                                                    const cardBody = (
                                                        <HomeCardShell
                                                            stylised={isStylisedHomeCards}
                                                            animateLayout={false}
                                                            className={styles.homeItem}
                                                            data-home-item={item}
                                                        >
                                                            {isHomeEditing ? (
                                                                <Button
                                                                    type="button"
                                                                    variant="secondary"
                                                                    size="icon-xs"
                                                                    className={styles.homeItemRemove}
                                                                    onPointerDown={(event) => event.stopPropagation()}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        removeHomeItem(item);
                                                                    }}
                                                                    aria-label={`Remove ${itemLabel}`}
                                                                >
                                                                    <IconX size={14} />
                                                                </Button>
                                                            ) : null}
                                                            {renderHomeItem(item)}
                                                        </HomeCardShell>
                                                    );

                                                    return (
                                                        <SortableHomeItem
                                                            key={item}
                                                            id={item}
                                                            homeItem={item}
                                                            span={span}
                                                            placement={homePlacements?.get(item)}
                                                            fallbackRowSpan={fallbackRowSpanOf(item)}
                                                            onMeasure={handleHomeItemMeasure}
                                                            // A card drag and a freeform gesture must never start from the
                                                            // same press: while any ink tool is armed the grid stops
                                                            // listening rather than relying on the overlay to shield it.
                                                            disabled={!isHomeEditing || homeCanvasTool !== 'select'}
                                                        >
                                                            {/*
                                                              * Right-click owns card width and removal. It is editing-only so a
                                                              * normal visit keeps the browser menu over note text and links.
                                                              * The trigger is display:contents so it never becomes the grid
                                                              * item and steal the card's span.
                                                              */}
                                                            {isHomeEditing ? (
                                                                <ContextMenu>
                                                                    <ContextMenuTrigger render={<div className={styles.homeItemContextTrigger} />}>
                                                                        {cardBody}
                                                                    </ContextMenuTrigger>
                                                                    <ContextMenuContent>
                                                                        <ContextMenuGroup>
                                                                            {/* The card's own icon labels the menu, so a right-click on a
                                                                              * dense grid says which card it caught. */}
                                                                            <ContextMenuLabel className="flex items-center gap-2">
                                                                                {homeItemDefinitions[item]?.icon}
                                                                                {itemLabel}
                                                                            </ContextMenuLabel>
                                                                            <ContextMenuItem
                                                                                disabled={effectiveHomeColumns === 1 || span === 1}
                                                                                onClick={() => setHomeItemSpan(item, 1)}
                                                                            >
                                                                                <IconColumns1 size={16} />
                                                                                One column wide
                                                                            </ContextMenuItem>
                                                                            <ContextMenuItem
                                                                                disabled={effectiveHomeColumns === 1 || span === 2}
                                                                                onClick={() => setHomeItemSpan(item, 2)}
                                                                            >
                                                                                <IconColumns2 size={16} />
                                                                                Two columns wide
                                                                            </ContextMenuItem>
                                                                        </ContextMenuGroup>
                                                                        <ContextMenuSeparator />
                                                                        <ContextMenuItem variant="destructive" onClick={() => removeHomeItem(item)}>
                                                                            <IconTrash size={16} />
                                                                            Remove card
                                                                        </ContextMenuItem>
                                                                    </ContextMenuContent>
                                                                </ContextMenu>
                                                            ) : cardBody}
                                                        </SortableHomeItem>
                                                    );
                                                })}
                                            </SortableContext>
                                        </div>
                                        <DragOverlay dropAnimation={null}>
                                            {activeHomeDragItem ? (
                                                <div
                                                    className={styles.homeDragPreview}
                                                    style={activeHomeDragRect
                                                        ? { width: activeHomeDragRect.width, height: activeHomeDragRect.height }
                                                        : undefined}
                                                >
                                                    <HomeCardShell
                                                        stylised={isStylisedHomeCards}
                                                        animateLayout={false}
                                                        className={styles.homeItem}
                                                        data-home-item={activeHomeDragItem}
                                                    >
                                                        {renderHomeItem(activeHomeDragItem, { preview: true })}
                                                    </HomeCardShell>
                                                </div>
                                            ) : null}
                                        </DragOverlay>
                                    </DndContext>
                                    {/* Freeform elements are authored against desktop card positions, so on a
                                        phone they land on top of unrelated cards. The layer is skipped entirely
                                        rather than hidden: the saved elements are untouched and come back on
                                        desktop. */}
                                    {canUseFreeformTools && (
                                        <div
                                            className={styles.homeFreeformLayer}
                                            data-active={isHomeEditing && homeCanvasTool !== 'select' ? 'true' : 'false'}
                                            data-editing={isHomeEditing ? 'true' : 'false'}
                                            aria-hidden={!isHomeEditing}
                                        >
                                            {homeLayout.canvasElements.map(renderCanvasElement)}
                                            {homeLassoPoints && homeLassoPoints.length > 1 && (
                                                <svg className={styles.homeCanvasLasso} aria-hidden>
                                                    <polygon
                                                        points={homeLassoPoints.map(point => `${point.x},${point.y}`).join(' ')}
                                                    />
                                                </svg>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                    </div>
                );
            }

            case 'assistant':
                return (
                    <div className={styles.contentWrapper} data-tour-id="page-assistant" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
                        {homeSettings.showAiAgent ? (
                            <AssistantChat mode="main" summarizeThinking={homeSettings.assistantSummarizeThinking} />
                        ) : (
                            <Empty className="h-full" role="status">
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <IconMessageCircle />
                                    </EmptyMedia>
                                    <EmptyTitle>AI Agent is disabled</EmptyTitle>
                                    <EmptyDescription>
                                        Re-enable AI Agent to start or continue a conversation.
                                    </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                    <Button onClick={() => updateHomeSettings({ showAiAgent: true })}>
                                        Enable AI Agent
                                    </Button>
                                </EmptyContent>
                            </Empty>
                        )}
                    </div>
                );

            case 'past-papers':
                return (
                    <PastPapersPage
                        key={session?.userId || session?.portalUid || session?.username || 'current-user'}
                        accountId={session?.userId || session?.portalUid || session?.username || 'current-user'}
                        detectedYearLevel={detectedPaperYearLevel}
                    />
                );

            case 'flashcards':
                return (
                    <StudyShell
                        key={session?.userId || session?.portalUid || session?.username || 'current-user'}
                        cacheKey={session?.userId || session?.portalUid || session?.username || 'current-user'}
                        onDueCountChange={setStudyDueCount}
                    />
                );

            case 'timetable':
                return (
                    <TimetablePage
                        timetable={portalData?.timetable}
                        dataLoading={dataLoading}
                        selectedWeek={selectedWeek}
                        currentWeek={getAutoWeekType(new Date())}
                        onSelectedWeekChange={setSelectedWeek}
                        mergeConsecutivePeriods={homeSettings.timetableMergeConsecutivePeriods}
                        showBothWeeks={homeSettings.timetableShowBothWeeks}
                        getSubjectColor={getSubjectColor}
                        onColorChange={handleColorChange}
                    />
                );

            case 'account':
                return (
                    <div className={styles.contentWrapper} data-tour-id="page-account">
                        <div className={cn(styles.contentWrapperInner, styles.settingsLayoutConstrained, styles.accountPageLayout)}>
                            <section className={styles.accountProfileCard}>
                                <div className={styles.accountProfileMain}>
                                    <div className={styles.accountAvatarShell}>
                                        <Avatar
                                            className={cn(
                                                styles.accountProfileAvatar,
                                                profileImage && styles.accountProfileAvatarWithImage,
                                            )}
                                        >
                                            {profileImage ? (
                                                <AvatarImage
                                                    src={profileImage}
                                                    alt="Profile"
                                                />
                                            ) : (
                                                <AvatarFallback className={styles.accountProfileFallback}>
                                                    {getUserInitials(portalUsername)}
                                                </AvatarFallback>
                                            )}
                                        </Avatar>
                                    </div>
                                    <div className={styles.accountProfileText}>
                                        <h2>{portalUsername}</h2>
                                        <div className={styles.accountProfileBadges}>
                                            <Badge variant={portalData?.lastUpdated ? 'outline' : 'secondary'}>
                                                {syncAgeLabel}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                                {!isPreviewMode ? (
                                    <div className={styles.accountProfileActions}>
                                        <ProfileImageDialog
                                            profileImage={profileImage}
                                            onProfileImageChange={setProfileImage}
                                        />
                                        <Button variant="outline" onClick={() => handleOpenSettings('general')}>
                                            <IconSettings size={14} />
                                            Preferences
                                        </Button>
                                    </div>
                                ) : null}
                            </section>

                            <div className={styles.accountMetricsGrid}>
                                <AccountMetric
                                    icon={<IconBell size={16} />}
                                    label="Notices"
                                    value={portalData?.notices?.length ?? 0}
                                />
                                <AccountMetric
                                    icon={<IconBook size={16} />}
                                    label="Classes"
                                    value={portalData?.classes?.length ?? 0}
                                />
                                <AccountMetric
                                    icon={<IconReportAnalytics size={16} />}
                                    label="Reports"
                                    value={portalData?.reports?.length ?? 0}
                                />
                                <AccountMetric
                                    icon={<IconCalendar size={16} />}
                                    label="Calendar Items"
                                    value={portalData?.calendar?.length ?? 0}
                                />
                            </div>

                            <AccountSection title="Account Information">
                                <AccountRow
                                    icon={<IconMail size={16} />}
                                    label="Username"
                                    value={portalUsername}
                                />
                                {portalData?.account?.firstName ? (
                                    <AccountRow
                                        icon={<IconUser size={16} />}
                                        label="First name"
                                        value={portalData.account.firstName}
                                    />
                                ) : null}
                                {portalData?.account?.lastName ? (
                                    <AccountRow
                                        icon={<IconUser size={16} />}
                                        label="Last name"
                                        value={portalData.account.lastName}
                                    />
                                ) : null}
                                <AccountRow
                                    icon={<IconClock size={16} />}
                                    label="Last login"
                                    value={lastLoginLabel}
                                />
                            </AccountSection>

                            <AccountSection title="Millennium account details">
                                <PortalAccountForm
                                    account={portalData?.account}
                                    disabled={dataLoading}
                                    onUpdated={(account) => {
                                        if (portalData) setPortalData({ ...portalData, account });
                                    }}
                                />
                            </AccountSection>

                            <AccountSection title="Auto-sync">
                                <AccountRow
                                    icon={<IconRefresh size={16} />}
                                    label="Last successful sync"
                                    value={lastSyncedLabel}
                                />
                                <AccountRow
                                    icon={<IconActivity size={16} />}
                                    label="Sync schedule"
                                    value={autoSyncLabel}
                                />
                            </AccountSection>

                            {!isPreviewMode ? (
                                <AccountSection title="Actions">
                                    <div className={styles.accountActionsGrid}>
                                        <Button variant="outline" onClick={() => void loadPortalData(true)} disabled={dataLoading}>
                                            <IconRefresh size={14} />
                                            {dataLoading ? 'Syncing now' : 'Refresh now'}
                                        </Button>
                                        <Button variant="destructive" onClick={(event) => requestLogout(event)}>
                                            <IconLogout size={14} />
                                            Log out
                                        </Button>
                                    </div>
                                </AccountSection>
                            ) : null}
                        </div>
                    </div>
                );

            case 'calendar':
                return (
                    <div className={styles.contentWrapper} data-tour-id="page-calendar" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
                        <div className={styles.contentWrapperInner} style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
                            {!isPreviewMode && googleCalendar.sessionStatus === 'unauthenticated' && homeSettings.calendarShowGoogleValidationBanner && (
                                <div style={{
                                    padding: '12px 16px',
                                    background: 'var(--hover-bg)',
                                    borderBottom: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    flexShrink: 0,
                                }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        Connect Google Calendar to sync your events
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => setShowGoogleConnectInfo(true)}
                                            style={{
                                                background: 'var(--accent-gradient)',
                                                color: 'white',
                                                border: 'none',
                                                padding: '8px 16px',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Connect Google
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Hide Google validation banner"
                                            onClick={() => setShowGoogleHideConfirm(true)}
                                            style={{
                                                width: 30,
                                                height: 30,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 'var(--radius-sm)',
                                                background: 'transparent',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <IconX size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <AlertDialog open={showGoogleHideConfirm} onOpenChange={setShowGoogleHideConfirm}>
                                <AlertDialogContent className="border-[var(--border-default)] bg-[var(--bg-elevated)]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Hide Google validation banner?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This hides the validation notice permanently. You can turn it back on later from General Settings under Calendar.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={hideGoogleValidationBanner}
                                            style={{
                                                background: 'var(--accent-gradient)',
                                                borderColor: 'transparent',
                                                color: '#fff',
                                            }}
                                        >
                                            Hide permanently
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Dialog open={showGoogleConnectInfo} onOpenChange={setShowGoogleConnectInfo}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Validation Pending</DialogTitle>
                                        <DialogDescription>
                                            Google Calendar sync is not yet approved by Google. We're currently in the review process. This feature will be available soon.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button
                                            className="bg-[image:var(--accent-gradient)] hover:opacity-90"
                                            onClick={() => setShowGoogleConnectInfo(false)}
                                        >
                                            Got it
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <div style={{ flex: 1, minHeight: 0 }}>
                                <Calendar
                                    events={allEvents}
                                    classEvents={visibleClassEvents}
                                    calendars={allCalendars}
                                    onCreateEvent={handleCreateEvent}
                                    onUpdateEvent={handleUpdateEvent}
                                    onDeleteEvent={handleDeleteEvent}
                                    onToggleCalendar={handleToggleCalendar}
                                    onCreateCalendar={handleCreateCalendar}
                                    onRemoveCalendar={handleRemoveCalendar}
                                    onRenameCalendar={handleRenameCalendar}
                                    onChangeCalendarColor={handleChangeCalendarColor}
                                    onChangeCalendarIcon={handleChangeCalendarIcon}
                                    onVisibleRangeChange={googleCalendar.setVisibleRange}
                                    duplicateCount={homeSettings.calendarSmartCleanerEnabled ? duplicateCount : 0}
                                    onSmartClean={homeSettings.calendarSmartCleanerEnabled ? handleSmartClean : undefined}
                                    smartCleanBusy={isSmartCleaning}
                                    smartCleanHint={smartCleanHint}
                                    isLoading={googleCalendar.isLoading}
                                    notices={todaysNotices}
                                    onNoticeClick={handleCalendarNoticeClick}
                                    hasNotification={googleCalendar.sessionStatus === 'unauthenticated'}
                                    firstDayOfWeek={homeSettings.calendarFirstDayOfWeek}
                                    eventColorMode={homeSettings.calendarEventColorMode}
                                    showTimelineSeconds={homeSettings.calendarShowTimelineSeconds}
                                    monthDayClickView={homeSettings.calendarMonthDayClickView}
                                    externalViewMode={calendarViewMode}
                                    onViewModeChange={setCalendarViewMode}
                                    externalGoToToday={calendarGoToToday}
                                    externalGoToPrev={calendarGoToPrev}
                                    externalGoToNext={calendarGoToNext}
                                    showCreateModal={showCreateEventModal}
                                    onCreateModalClose={() => setShowCreateEventModal(false)}
                                />
                            </div>
                        </div>
                    </div>
                );

            case 'classes':
                return (
                    <ClassesPage
                        classes={portalData?.classes || []}
                        timetable={portalData?.timetable}
                        attendance={portalData?.attendance}
                        dataLoading={dataLoading}
                        locallyUnenrolledClassKeys={locallyUnenrolledClassKeys}
                        getSubjectColor={getSubjectColor}
                        onColorChange={handleColorChange}
                        onRestoreClass={handleRestoreClass}
                    />
                );

            case 'attendance':
                return (
                    <AttendancePage
                        attendance={portalData?.attendance}
                        enrolledClassCodes={classColorOptions.filter((item: any) => item.enrolled).map((item: any) => item.classCode)}
                        perfectEffectEnabled={attendanceSettings.perfectEffectEnabled}
                        attendanceFillingEnabled={attendanceSettings.fillingEnabled}
                        attendanceThresholds={attendanceThresholds}
                        schoolTerms={schoolTerms}
                    />
                );

            case 'reports':
                return <ReportsPage reports={portalData?.reports || []} />;

            case 'classroom':
                return <ClassroomPage classroom={classroom} />;

            default:
                return (
                    <div className={styles.contentWrapper}>
                        <div className={styles.contentWrapperInner}>
                            <div className={`${styles.card} ${styles.placeholderCard}`}>
                                <div className={styles.placeholderMessage}>
                                    <div className={styles.placeholderIcon}>
                                        <IconAlertCircle size={48} stroke={1.25} aria-hidden="true" />
                                    </div>
                                    <h3>Section unavailable</h3>
                                    <p>This dashboard section is not available in the current web release.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    const dashboardTabs = useMemo(() => (
        openDashboardTabs.map(tab => {
            const isSettingsTarget = tab.target === 'settings' || tab.target.startsWith('settings/');
            const definition = isSettingsTarget
                ? getSettingsSectionDefinition(tab.target === 'settings' ? 'general' : tab.target.slice('settings/'.length))
                : getDashboardSectionDefinition(tab.target);
            const TabIcon = definition?.icon ?? IconFileText;
            return {
                id: tab.id,
                label: isSettingsTarget && tab.target === 'settings' ? 'Settings' : definition?.label ?? 'Home',
                icon: <TabIcon size={14} />,
                pinned: tab.pinned,
            };
        })
    ), [openDashboardTabs]);

    const commandMenuTabs = useMemo(() => dashboardTabs.map(tab => ({
        id: tab.id,
        label: tab.label,
        active: tab.id === activeDashboardTabId,
    })), [activeDashboardTabId, dashboardTabs]);

    const activateDashboardTab = useCallback((tab: DashboardTab) => {
        const delay = navigationTransitionDelay;
        const switchesSidebar = isInSettings !== tab.target.startsWith('settings');
        // Only one content wrapper is mounted at a time, so the first match is the live scroller.
        const scroller = document.querySelector<HTMLElement>(`.${styles.contentWrapper}`);
        if (scroller) tabScrollPositionsRef.current[activeDashboardTabId] = scroller.scrollTop;

        setPageTransitioning(true);
        if (switchesSidebar) setSidebarTransitioning(true);
        window.setTimeout(() => {
            setActiveDashboardTabId(tab.id);
            window.location.hash = tab.target;
            window.setTimeout(() => {
                setPageTransitioning(false);
                if (switchesSidebar) setSidebarTransitioning(false);
                const nextScroller = document.querySelector<HTMLElement>(`.${styles.contentWrapper}`);
                if (nextScroller) nextScroller.scrollTop = tabScrollPositionsRef.current[tab.id] ?? 0;
            }, 50);
        }, delay);
    }, [activeDashboardTabId, isInSettings, navigationTransitionDelay]);

    const handleDashboardTabChange = useCallback((tabId: string) => {
        if (tabId === activeDashboardTabId) return;
        const tab = openDashboardTabs.find(candidate => candidate.id === tabId);
        if (tab) activateDashboardTab(tab);
    }, [activateDashboardTab, activeDashboardTabId, openDashboardTabs]);

    const handleAddDashboardTab = useCallback(() => {
        tabSequenceRef.current += 1;
        const tab: DashboardTab = { id: `tab-${tabSequenceRef.current}`, target: 'home', pinned: false };
        setOpenDashboardTabs(tabs => [...tabs, tab]);
        setSelectedDashboardTabIds([tab.id]);
        activateDashboardTab(tab);
    }, [activateDashboardTab]);

    const closeDashboardTabs = useCallback((tabIds: string[]) => {
        const closingIds = new Set(tabIds);
        if (!openDashboardTabs.some(tab => closingIds.has(tab.id))) return;

        const remaining = openDashboardTabs.filter(tab => !closingIds.has(tab.id));
        if (remaining.length === 0) {
            tabSequenceRef.current += 1;
            const replacement: DashboardTab = { id: `tab-${tabSequenceRef.current}`, target: 'home', pinned: false };
            setOpenDashboardTabs([replacement]);
            setSelectedDashboardTabIds([replacement.id]);
            activateDashboardTab(replacement);
            return;
        }

        setOpenDashboardTabs(remaining);
        if (!closingIds.has(activeDashboardTabId)) {
            setSelectedDashboardTabIds(selectedIds => {
                const remainingIds = new Set(remaining.map(tab => tab.id));
                const nextSelection = selectedIds.filter(id => remainingIds.has(id));
                return nextSelection.length ? nextSelection : [activeDashboardTabId];
            });
            return;
        }

        const activeIndex = openDashboardTabs.findIndex(tab => tab.id === activeDashboardTabId);
        const nextTab = openDashboardTabs.slice(activeIndex + 1).find(tab => !closingIds.has(tab.id))
            || [...openDashboardTabs.slice(0, activeIndex)].reverse().find(tab => !closingIds.has(tab.id))
            || remaining[0];
        setSelectedDashboardTabIds([nextTab.id]);
        activateDashboardTab(nextTab);
    }, [activateDashboardTab, activeDashboardTabId, openDashboardTabs]);

    const handleCloseDashboardTab = useCallback((tabId: string) => {
        closeDashboardTabs([tabId]);
    }, [closeDashboardTabs]);

    const handleDuplicateDashboardTabs = useCallback((tabIds: string[]) => {
        const duplicateIds = new Set(tabIds);
        const createdTabs: DashboardTab[] = [];
        const nextTabs = openDashboardTabs.flatMap(tab => {
            if (!duplicateIds.has(tab.id)) return [tab];
            tabSequenceRef.current += 1;
            const duplicate = { ...tab, id: `tab-${tabSequenceRef.current}` };
            createdTabs.push(duplicate);
            return [tab, duplicate];
        });
        if (!createdTabs.length) return;
        setOpenDashboardTabs(nextTabs);
        setSelectedDashboardTabIds(createdTabs.map(tab => tab.id));
        activateDashboardTab(createdTabs[0]);
    }, [activateDashboardTab, openDashboardTabs]);

    const handleDashboardTabAction = useCallback((action: ContentTabAction, tabIds: string[]) => {
        const selectedIds = new Set(tabIds);
        if (action === 'new') {
            handleAddDashboardTab();
            return;
        }
        if (action === 'pin' || action === 'unpin') {
            const pinned = action === 'pin';
            setOpenDashboardTabs(tabs => {
                const updatedTabs = tabs.map(tab => selectedIds.has(tab.id) ? { ...tab, pinned } : tab);
                return [...updatedTabs.filter(tab => tab.pinned), ...updatedTabs.filter(tab => !tab.pinned)];
            });
            return;
        }
        if (action === 'close') {
            closeDashboardTabs(tabIds);
            return;
        }
        if (action === 'close-below') {
            const lastSelectedIndex = Math.max(...openDashboardTabs.map((tab, index) => selectedIds.has(tab.id) ? index : -1));
            closeDashboardTabs(openDashboardTabs.slice(lastSelectedIndex + 1).filter(tab => !tab.pinned).map(tab => tab.id));
            return;
        }
        if (action === 'close-others') {
            closeDashboardTabs(openDashboardTabs.filter(tab => !selectedIds.has(tab.id) && !tab.pinned).map(tab => tab.id));
            return;
        }
        handleDuplicateDashboardTabs(tabIds);
    }, [closeDashboardTabs, handleAddDashboardTab, handleDuplicateDashboardTabs, openDashboardTabs]);

    /**
     * Restores one settings section to its defaults. Each section owns a disjoint slice of
     * state, so resetting one never touches another section's preferences.
     */
    const resetSettingsSection = useCallback((section: SettingsSectionId) => {
        const homeDefaults = defaultHomeSettingsForSection(section);
        if (homeDefaults) updateHomeSettings(homeDefaults);

        if (section === 'general') {
            setAttendanceSettings({
                perfectEffectEnabled: true,
                fillingEnabled: true,
                ...DEFAULT_ATTENDANCE_THRESHOLDS,
            });
        }
        if (section === 'notifications') setRelativeNotificationDates(false);
        if (section === 'animations') animationSettings.resetSettings();
        if (section === 'shortcuts') resetAllBindings();
        if (section === 'class-colors') handleResetAllClassColors();
    }, [
        animationSettings,
        handleResetAllClassColors,
        resetAllBindings,
        setAttendanceSettings,
        setRelativeNotificationDates,
        updateHomeSettings,
    ]);

    const cycleDashboardTab = useCallback((offset: number) => {
        if (openDashboardTabs.length < 2) return;
        const activeIndex = openDashboardTabs.findIndex(tab => tab.id === activeDashboardTabId);
        if (activeIndex < 0) return;
        const nextIndex = (activeIndex + offset + openDashboardTabs.length) % openDashboardTabs.length;
        setSelectedDashboardTabIds([openDashboardTabs[nextIndex].id]);
        activateDashboardTab(openDashboardTabs[nextIndex]);
    }, [activateDashboardTab, activeDashboardTabId, openDashboardTabs]);

    useEffect(() => {
        tabActionsRef.current = {
            newTab: handleAddDashboardTab,
            closeActiveTab: () => closeDashboardTabs([activeDashboardTabId]),
            cycleTab: cycleDashboardTab,
            switchToTab: handleDashboardTabChange,
        };
    }, [activeDashboardTabId, closeDashboardTabs, cycleDashboardTab, handleAddDashboardTab, handleDashboardTabChange]);

    const handleReorderDashboardTab = useCallback((fromId: string, toId: string) => {
        setOpenDashboardTabs(tabs => {
            const fromIndex = tabs.findIndex(tab => tab.id === fromId);
            const toIndex = tabs.findIndex(tab => tab.id === toId);
            if (fromIndex < 0 || toIndex < 0) return tabs;
            if (tabs[fromIndex].pinned !== tabs[toIndex].pinned) return tabs;
            const next = [...tabs];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    }, []);

    const showHomeDockActions = !isPhone && currentSection === 'home' && currentView === 'dashboard' && !isInSettings;
    const showNotificationsDockActions = !isPhone && currentView === 'notifications' && !isInSettings;
    const showDockEditActions = showHomeDockActions || showNotificationsDockActions;

    // Navigating away closes the customiser, so returning later starts in reading mode.
    useEffect(() => {
        if (!showNotificationsDockActions) setIsNotificationsEditing(false);
    }, [showNotificationsDockActions]);

    // The dock also hosts the persistent Settings/Search shortcuts, so it must stay mounted
    // even when the AI Agent launcher is disabled.
    const showDockSettingsSlot = isPhone || !isInSettings;
    const showAssistantDock = !isPreviewMode && (isPhone || homeSettings.showAiAgent || showDockEditActions || showDockSettingsSlot);
    const currentSectionDefinition = currentSection
        ? getDashboardSectionDefinition(currentSection)
        : undefined;
    const CurrentSectionIcon = currentSectionDefinition?.icon;
    const currentSettingsDefinition = getSettingsSectionDefinition(settingsSection);

    if (isLoading) {
        return <DashboardLoadingSkeleton />;
    }

    if (!session) {
        return <DashboardLoadingSkeleton />;
    }

    return (
        <FeedbackProvider enabled={!isPreviewMode}>
        <DashboardTour
            userId={session.userId || session.portalUid || session.username || 'current-user'}
            accountCreatedAt={session.createdAt}
            navigation={tourNavigation}
            /* Marketing preview frames must never surface the welcome / what's new announcement. */
            enabled={!isPreviewMode}
        >
            {clientReady ? (
                <>
                    <UpcomingAnnouncement
                        userId={session.userId || session.portalUid || session.username || null}
                        /* Marketing preview frames must never read or write browser storage. */
                        enabled={!isPreviewMode}
                    />
                    <FeedbackAnnouncementSlot
                        userId={session.userId || session.portalUid || session.username || null}
                        enabled={!isPreviewMode}
                    />
                    {/* Waiting reports are shown to every administrator, oldest first. */}
                    <AdminFeedbackQueue enabled={!isPreviewMode && session.role === 'admin'} />
                    <PortalSyncStatusToasts />
                    {!isDesktopApp() ? <Toaster position="bottom-center" richColors closeButton /> : null}
                </>
            ) : null}

            <div
                className={styles.dashboardBody}
                data-dashboard-shell="true"
                data-tour-id="dashboard-shell"
                data-preview-mode={isPreviewMode ? 'true' : 'false'}
                style={{ '--right-sidebar-offset': themeCreateMode && !isPhone ? '480px' : '0px' } as CSSProperties}
            >
                <TooltipProvider delay={0}>
                    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
                        {/* Sidebar - conditionally show Settings or Main sidebar */}
                        <div style={{
                            opacity: sidebarTransitioning ? 0 : 1,
                            transform: sidebarTransitioning ? 'translateX(-8px)' : 'translateX(0)',
                            transition: 'opacity var(--anim-duration-fast) var(--anim-sidebarAnimations-easing, cubic-bezier(0.4, 0, 0.2, 1)), transform var(--anim-duration-fast) var(--anim-sidebarAnimations-easing, cubic-bezier(0.4, 0, 0.2, 1))',
                        }}>
                            {isInSettings ? (
                                <SettingsSidebar
                                    currentSection={settingsSection}
                                    isAdministrator={session.role === 'admin'}
                                    onSectionChange={handleSettingsSectionChange}
                                    onBackToApp={handleCloseSettings}
                                />
                            ) : (
                                <Sidebar
                                    variant="inset"
                                    collapsible="icon"
                                    data-tour-id="main-navigation"
                                    data-desktop-window-controls-offset="content"
                                >
                                    <SidebarContent>
                                        {/* Essentials Group */}
                                        <SidebarGroup>
                                            <SidebarGroupLabel
                                                onClick={() => toggleSection('essentials')}
                                                data-collapsible
                                                data-collapsed={collapsedSections.includes('essentials')}
                                                className="cursor-pointer"
                                            >
                                                <IconChevronDown className="size-3 shrink-0" />
                                                <span>Essentials</span>
                                            </SidebarGroupLabel>
                                            <SidebarGroupContent
                                                data-collapsed={collapsedSections.includes('essentials')}
                                            >
                                                <SidebarMenu>
                                                    {getOrderedSidebarItems(essentialSidebarIds).map((itemId) => {
                                                        if (!isSidebarItemVisible(itemId)) return null;
                                                        if (itemId === 'home') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'home' && currentView === 'dashboard'}
                                                                        onClick={() => handleSectionClick('home')}
                                                                        tooltip="Home"
                                                                    >
                                                                        <IconHome />
                                                                        <span>Home</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'notifications') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentView === 'notifications'}
                                                                        onClick={handleNavigateToNotifications}
                                                                        tooltip="Notifications"
                                                                    >
                                                                        <IconBell />
                                                                        <span>Notifications</span>
                                                                    </SidebarMenuButton>
                                                                    {renderSidebarBadge(notificationCounts.unreadTotal)}
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'account') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'account'}
                                                                        onClick={() => handleSectionClick('account')}
                                                                        tooltip="Account"
                                                                    >
                                                                        <IconUser />
                                                                        <span>Account</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'calendar') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'calendar'}
                                                                        onClick={() => handleSectionClick('calendar')}
                                                                        tooltip="Calendar"
                                                                    >
                                                                        <IconCalendar />
                                                                        <span>Calendar</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </SidebarMenu>
                                            </SidebarGroupContent>
                                        </SidebarGroup>

                                        <div className="h-2" />

                                        {/* Register Group */}
                                        <SidebarGroup>
                                            <SidebarGroupLabel
                                                onClick={() => toggleSection('register')}
                                                data-collapsible
                                                data-collapsed={collapsedSections.includes('register')}
                                                className="cursor-pointer"
                                            >
                                                <IconChevronDown className="size-3 shrink-0" />
                                                <span>Register</span>
                                            </SidebarGroupLabel>
                                            <SidebarGroupContent
                                                data-collapsed={collapsedSections.includes('register')}
                                            >
                                                <SidebarMenu>
                                                    {getOrderedSidebarItems(registerSidebarIds).map((itemId) => {
                                                        if (!isSidebarItemVisible(itemId)) return null;
                                                        if (itemId === 'classes') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'classes'}
                                                                        onClick={() => handleSectionClick('classes')}
                                                                        tooltip="Classes"
                                                                    >
                                                                        <IconBook />
                                                                        <span>Classes</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'timetable') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'timetable'}
                                                                        onClick={() => handleSectionClick('timetable')}
                                                                        tooltip="Timetable"
                                                                    >
                                                                        <IconClock />
                                                                        <span>Timetable</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'reports') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'reports'}
                                                                        onClick={() => handleSectionClick('reports')}
                                                                        tooltip="Reports"
                                                                    >
                                                                        <IconFileText />
                                                                        <span>Reports</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'attendance') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'attendance'}
                                                                        onClick={() => handleSectionClick('attendance')}
                                                                        tooltip="Attendance"
                                                                    >
                                                                        <IconClipboardCheck />
                                                                        <span>Attendance</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'classroom') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'classroom'}
                                                                        onClick={() => handleSectionClick('classroom')}
                                                                        tooltip="Google Classroom"
                                                                    >
                                                                        <IconSchool />
                                                                        <span>Classroom</span>
                                                                    </SidebarMenuButton>
                                                                    {renderSidebarBadge(classroom.missingItems.length)}
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </SidebarMenu>
                                            </SidebarGroupContent>
                                        </SidebarGroup>

                                        <div className="h-2" />

                                        <SidebarGroup>
                                            <SidebarGroupLabel
                                                onClick={() => toggleSection('study')}
                                                data-collapsible
                                                data-collapsed={collapsedSections.includes('study')}
                                                className="cursor-pointer"
                                            >
                                                <IconChevronDown className="size-3 shrink-0" />
                                                <span>Study</span>
                                            </SidebarGroupLabel>
                                            <SidebarGroupContent data-collapsed={collapsedSections.includes('study')}>
                                                <SidebarMenu>
                                                    {getOrderedSidebarItems(studySidebarIds).map((itemId) => {
                                                        if (!isSidebarItemVisible(itemId)) return null;
                                                        if (itemId === 'flashcards') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'flashcards'}
                                                                        onClick={() => handleSectionClick('flashcards')}
                                                                        tooltip="Flashcards"
                                                                    >
                                                                        <IconCards />
                                                                        <span>Flashcards</span>
                                                                    </SidebarMenuButton>
                                                                    {renderSidebarBadge(studyDueCount)}
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        if (itemId === 'past-papers') {
                                                            return (
                                                                <SidebarMenuItem key={itemId}>
                                                                    <SidebarMenuButton
                                                                        isActive={currentSection === 'past-papers'}
                                                                        onClick={() => handleSectionClick('past-papers')}
                                                                        tooltip="Past papers"
                                                                    >
                                                                        <IconFileText />
                                                                        <span>Past papers</span>
                                                                    </SidebarMenuButton>
                                                                </SidebarMenuItem>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </SidebarMenu>
                                            </SidebarGroupContent>
                                        </SidebarGroup>

                                        <div className="h-2" />

                                    </SidebarContent>
                                    <SidebarFooter>
                                        {!isPreviewMode ? (
                                            <SidebarMenu>
                                                <DesktopUpdateButton />
                                                <SidebarMenuItem>
                                                    <SidebarMenuButton
                                                        data-tour-id="command-search"
                                                        onClick={() => setShowCommandMenu(true)}
                                                        tooltip={isPhone ? 'Search' : `Search (${SEARCH_SHORTCUT_LABEL})`}
                                                    >
                                                        <IconSearch />
                                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                            Search
                                                            <kbd data-shortcut-hint style={{
                                                                marginLeft: 'auto',
                                                                padding: '3px 8px',
                                                                fontSize: '11px',
                                                                fontWeight: 500,
                                                                color: 'var(--text-tertiary)',
                                                                backgroundColor: 'var(--bg-surface)',
                                                                borderRadius: '4px',
                                                                fontFamily: 'inherit',
                                                            }}>{SEARCH_SHORTCUT_LABEL}</kbd>
                                                        </span>
                                                    </SidebarMenuButton>
                                                </SidebarMenuItem>
                                                <FeedbackSidebarButton />
                                            </SidebarMenu>
                                        ) : null}
                                        <SidebarMenu>
                                            <SidebarMenuItem>
                                                <SidebarProfileCard
                                                    name={displayName}
                                                    school={displaySchool}
                                                    profileImage={profileImage}
                                                    initials={getUserInitials(displayName)}
                                                    isAdministrator={session.role === 'admin'}
                                                    isPreviewMode={isPreviewMode}
                                                    onOpenSettings={handleOpenSettings}
                                                    onLogout={requestLogout}
                                                />
                                            </SidebarMenuItem>
                                        </SidebarMenu>
                                    </SidebarFooter>

                                    <SidebarRail />
                                </Sidebar>
                            )}
                        </div>

                        {/* Main Content with SidebarInset */}
                        <SidebarInset
                            className={styles.mainInset}
                            data-assistant-rail={showAssistantDock ? "true" : "false"}
                        >
                            <div className={styles.mainContent}>
                                <div className={styles.mainContentFrame}>
                                    {isInSettings ? (
                                        /* Settings Content */
                                        <>
                                            <ContentTopbar
                                                title={
                                                    currentSettingsDefinition?.label ?? 'Settings'
                                                }
                                                icon={<IconSettings size={16} />}
                                                tabs={dashboardTabs}
                                                activeTabId={activeDashboardTabId}
                                                selectedTabIds={selectedDashboardTabIds}
                                                onTabSelectionChange={setSelectedDashboardTabIds}
                                                onTabAction={handleDashboardTabAction}
                                                onTabChange={handleDashboardTabChange}
                                                onAddTab={handleAddDashboardTab}
                                                onTabClose={handleCloseDashboardTab}
                                                onTabReorder={handleReorderDashboardTab}
                                            />
                                            <PageTransition isLoading={pageTransitioning}>
                                            <div className={styles.contentWrapper}>
                                                <div className={cn(styles.contentWrapperInner, settingsSection !== 'theme-builder' && styles.settingsLayoutConstrained)}>
                                                    {isResettableSettingsSection(settingsSection) && (
                                                        <SettingsSectionReset
                                                            sectionLabel={currentSettingsDefinition?.label ?? 'this section'}
                                                            onReset={() => resetSettingsSection(settingsSection)}
                                                        />
                                                    )}
                                                    {settingsSection === 'general' && (
                                                        <GeneralSettings
                                                            isMobile={isPhone}
                                                            homeSettings={homeSettings}
                                                            updateHomeSettings={updateHomeSettings}
                                                            timetableMergeConsecutivePeriods={homeSettings.timetableMergeConsecutivePeriods}
                                                            onTimetableMergeConsecutivePeriodsChange={(timetableMergeConsecutivePeriods) => updateHomeSettings({ timetableMergeConsecutivePeriods })}
                                                            timetableShowBothWeeks={homeSettings.timetableShowBothWeeks}
                                                            onTimetableShowBothWeeksChange={(timetableShowBothWeeks) => updateHomeSettings({ timetableShowBothWeeks })}
                                                            hasPerfectAttendance={hasPerfectAttendance}
                                                            attendanceSettings={attendanceSettings}
                                                            onAttendanceSettingsChange={setAttendanceSettings}
                                                            onReplayFullTour={() => window.dispatchEvent(new Event(REPLAY_FULL_TOUR_EVENT))}
                                                            onReplayUpdateTour={() => window.dispatchEvent(new Event(REPLAY_UPDATE_TOUR_EVENT))}
                                                        />
                                                    )}
                                                    {/* AI Agent behaviour and the provider credentials it runs on are one
                                                        setting page: choosing a provider is meaningless without the agent
                                                        controls, and they used to sit two sections apart. */}
                                                    {settingsSection === 'assistant' && (
                                                        <>
                                                            <AssistantSettings
                                                                showAiAgent={homeSettings.showAiAgent}
                                                                onShowAiAgentChange={(showAiAgent) => updateHomeSettings({ showAiAgent })}
                                                                assistantSummarizeThinking={homeSettings.assistantSummarizeThinking}
                                                                onAssistantSummarizeThinkingChange={(assistantSummarizeThinking) => updateHomeSettings({ assistantSummarizeThinking })}
                                                                assistantTone={homeSettings.assistantTone}
                                                                onAssistantToneChange={(assistantTone) => updateHomeSettings({ assistantTone })}
                                                            />
                                                            <AssistantProvidersSettings />
                                                        </>
                                                    )}
                                                    {settingsSection === 'past-papers' && <PastPapersSettings />}
                                                    {settingsSection === 'flashcards' && (
                                                        <FlashcardsSettings
                                                            homeSettings={homeSettings}
                                                            updateHomeSettings={updateHomeSettings}
                                                        />
                                                    )}
                                                    {settingsSection === 'theme-builder' && (
                                                        <ThemeBuilder
                                                            onCreateTheme={handleCreateTheme}
                                                            isAdministrator={session.role === 'admin'}
                                                        />
                                                    )}
                                                    {settingsSection === 'shortcuts' && (
                                                        <ShortcutsSettings
                                                            bindings={shortcutBindings}
                                                            onSetBinding={setShortcutBinding}
                                                            onResetBinding={resetBinding}
                                                            onResetAll={resetAllBindings}
                                                            contextAwareCategories={contextAwareCategories}
                                                            onToggleContextAware={toggleContextAware}
                                                            isRecording={isRecordingShortcut}
                                                            onRecordingChange={setIsRecordingShortcut}
                                                            notificationFolders={notificationFolders}
                                                        />
                                                    )}
                                                    {settingsSection === 'animations' && (
                                                        <AnimationsSettings
                                                            settings={animationSettings.settings}
                                                            onUpdateSetting={animationSettings.updateSetting}
                                                            onResetSettings={animationSettings.resetSettings}
                                                            onToggleAll={animationSettings.toggleAllAnimations}
                                                        />
                                                    )}
                                                    {settingsSection === 'notifications' && (
                                                        <NotificationsSettings
                                                            homeSettings={homeSettings}
                                                            notificationFolders={notificationFolders}
                                                            updateHomeSettings={updateHomeSettings}
                                                            relativeNotificationDates={relativeNotificationDates}
                                                            setRelativeNotificationDates={setRelativeNotificationDates}
                                                        />
                                                    )}
                                                    {settingsSection === 'admin' && session.role === 'admin' && session.userId && (
                                                        <AdminSettings currentUserId={session.userId} />
                                                    )}
                                                    {settingsSection === 'feedback' && (
                                                        <FeedbackHistorySettings />
                                                    )}
                                                    {settingsSection === 'sync' && (
                                                        <DataSettings
                                                            portalData={portalData}
                                                            onPortalDataUpdated={setPortalData}
                                                            isSyncRunning={dataLoading || isExternalSyncRunning}
                                                            onSyncNow={() => loadPortalData(true)}
                                                        />
                                                    )}
                                                    {settingsSection === 'class-colors' && (
                                                        <ClassColorsSettings
                                                            classes={classColorOptions}
                                                            onChange={handleColorChange}
                                                            onReset={handleResetClassColor}
                                                            onResetAll={handleResetAllClassColors}
                                                        />
                                                    )}
                                                    {settingsSection === 'export' && (
                                                        <div className="grid gap-4">
                                                            <ExportSettings />
                                                            <AccountDeletionSettings />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            </PageTransition>
                                        </>
                                    ) : currentView === 'notifications' ? (
                                        <>
                                            {/* Desktop-style Topbar */}
                                            <ContentTopbar
                                                title="Notifications"
                                                icon={<IconBell size={16} />}
                                                borderInsetStart={59}
                                                tabs={dashboardTabs}
                                                activeTabId={activeDashboardTabId}
                                                selectedTabIds={selectedDashboardTabIds}
                                                onTabSelectionChange={setSelectedDashboardTabIds}
                                                onTabAction={handleDashboardTabAction}
                                                onTabChange={handleDashboardTabChange}
                                                onAddTab={handleAddDashboardTab}
                                                onTabClose={handleCloseDashboardTab}
                                                onTabReorder={handleReorderDashboardTab}
                                            />
                                            <PageTransition isLoading={pageTransitioning}>
                                            <div
                                                className={styles.notificationsContainer}
                                                data-mobile-detail={selectedNotification && selectedNotificationIds.length <= 1 ? 'true' : 'false'}
                                                data-tour-id="page-notifications"
                                                style={{
                                                    ['--notifications-sidebar-width' as string]: `${homeSettings.notificationSidebarWidth}px`,
                                                    ['--notifications-list-width' as string]: `${homeSettings.notificationListWidth}px`,
                                                }}
                                            >
                                                {/* Left sidebar - categories and folders */}
                                                <NotificationsSidebar
                                                    items={notificationSidebarItems}
                                                    hiddenItems={notificationHiddenSidebarItems}
                                                    selectedId={selectedCategory}
                                                    onSelect={setSelectedCategory}
                                                    isEditing={isNotificationsEditing}
                                                    onReorder={(notificationSidebarOrder) => updateHomeSettings({ notificationSidebarOrder })}
                                                    onRemove={(id) => setNotificationEntryVisible(id, false)}
                                                    onAdd={(id) => setNotificationEntryVisible(id, true)}
                                                />

                                                <NotificationsResizer
                                                    label="Notification sidebar width"
                                                    width={homeSettings.notificationSidebarWidth}
                                                    min={MIN_NOTIFICATION_SIDEBAR_WIDTH}
                                                    max={MAX_NOTIFICATION_SIDEBAR_WIDTH}
                                                    enabled={isNotificationsEditing}
                                                    onChange={(notificationSidebarWidth) => updateHomeSettings({ notificationSidebarWidth })}
                                                />

                                                {/* Middle panel - notification list */}
                                                {/* Notifications Content */}
                                                <div className={styles.notificationsList}>
                                                    <div className={styles.listHeader}>
                                                        <div className={styles.searchContainer}>
                                                            <IconSearch size={16} className={styles.searchIcon} />
                                                            <input
                                                                type="text"
                                                                placeholder="Search notifications..."
                                                                value={notificationSearchQuery}
                                                                onChange={(e) => setNotificationSearchQuery(e.target.value)}
                                                                className={styles.searchInput}
                                                            />
                                                        </div>

                                                        {isMultiSelectKeyActive && (
                                                            <div className={styles.multiSelectHint} aria-label="Multi-select active" title="Multi-select active">
                                                                <span>Multi-select</span>
                                                            </div>
                                                        )}

                                                        <div className={styles.listActions}>
                                                            <CustomTooltip text="Mark all as read" position="bottom">
                                                                <button
                                                                    className={styles.actionBtn}
                                                                    onClick={markAllAsRead}
                                                                >
                                                                    <IconMailOpened size={16} />
                                                                </button>
                                                            </CustomTooltip>
                                                            <CustomTooltip text={allSelectedInList ? "Clear selection" : "Select all"} position="bottom">
                                                                <button
                                                                    className={styles.actionBtn}
                                                                    onClick={() => {
                                                                        if (preparedNotifications.length === 0) return;
                                                                        if (allSelectedInList) {
                                                                            clearSelection();
                                                                        } else {
                                                                            setSelectedNotificationIds(preparedNotifications.map(item => item.notificationId));
                                                                            setSelectionAnchorIndex(preparedNotifications.length - 1);
                                                                            setSelectedNotification(null);
                                                                        }
                                                                    }}
                                                                >
                                                                    <IconChecks size={16} />
                                                                </button>
                                                            </CustomTooltip>
                                                        </div>
                                                    </div>

                                                    {selectedNotificationIds.length > 1 && (
                                                        <div className={styles.bulkActions}>
                                                            <div className={styles.bulkSummary}>
                                                                {selectedNotificationIds.length} selected
                                                            </div>
                                                            <div className={styles.bulkButtons}>
                                                                {selectionStats.hasUnread && (
                                                                    <button
                                                                        className={styles.bulkActionBtn}
                                                                        onClick={() => bulkSetRead(true)}
                                                                    >
                                                                        <IconMailOpened size={14} />
                                                                        Mark read
                                                                    </button>
                                                                )}
                                                                {selectionStats.hasRead && (
                                                                    <button
                                                                        className={styles.bulkActionBtn}
                                                                        onClick={() => bulkSetRead(false)}
                                                                    >
                                                                        <IconMail size={14} />
                                                                        Mark unread
                                                                    </button>
                                                                )}
                                                                {selectionStats.hasUnpinned && (
                                                                    <button
                                                                        className={styles.bulkActionBtn}
                                                                        onClick={() => bulkSetPinned(true)}
                                                                    >
                                                                        <IconPinFilled size={14} />
                                                                        Pin
                                                                    </button>
                                                                )}
                                                                {selectionStats.hasPinned && (
                                                                    <button
                                                                        className={styles.bulkActionBtn}
                                                                        onClick={() => bulkSetPinned(false)}
                                                                    >
                                                                        <IconPin size={14} />
                                                                        Unpin
                                                                    </button>
                                                                )}
                                                                {selectionStats.hasUnarchived && (
                                                                    <button
                                                                        className={styles.bulkActionBtn}
                                                                        onClick={() => bulkSetArchived(true)}
                                                                    >
                                                                        <IconArchive size={14} />
                                                                        Archive
                                                                    </button>
                                                                )}
                                                                {selectionStats.hasArchived && (
                                                                    <button
                                                                        className={styles.bulkActionBtn}
                                                                        onClick={() => bulkSetArchived(false)}
                                                                    >
                                                                        <IconArchive size={14} />
                                                                        Restore
                                                                    </button>
                                                                )}
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger render={<button className={styles.bulkActionBtn} />}>
                                                                            <IconAlertTriangle size={14} />
                                                                            Importance
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="start">
                                                                        <DropdownMenuItem onClick={() => bulkSetImportance('low')}>
                                                                            <IconArrowDown size={14} />
                                                                            Low
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => bulkSetImportance('medium')}>
                                                                            <IconMinus size={14} />
                                                                            Medium
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => bulkSetImportance('high')}>
                                                                            <IconArrowUp size={14} />
                                                                            High
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={() => bulkSetImportance(undefined)}>
                                                                            <IconX size={14} />
                                                                            Clear importance
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger render={<button className={styles.bulkActionBtn} />}>
                                                                            <IconFolder size={14} />
                                                                            Move to
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="start">
                                                                        <DropdownMenuItem onClick={() => bulkMoveToCategory('inbox')}>
                                                                            <IconInbox size={14} />
                                                                            Inbox
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => bulkMoveToCategory('alerts')}>
                                                                            <IconAlertCircle size={14} />
                                                                            Alerts
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => bulkMoveToCategory('events')}>
                                                                            <IconCalendarEvent size={14} />
                                                                            Events
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => bulkMoveToCategory('assignments')}>
                                                                            <IconClipboardCheck size={14} />
                                                                            Assignments
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                                {notificationFolders.length > 0 && (
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger render={<button className={styles.bulkActionBtn} />}>
                                                                                <IconFolders size={14} />
                                                                                Folder
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="start">
                                                                            <DropdownMenuItem onClick={() => bulkMoveToFolder(undefined)}>
                                                                                <IconFolder size={14} />
                                                                                No folder
                                                                            </DropdownMenuItem>
                                                                            {notificationFolders.map((folder) => {
                                                                                return (
                                                                                    <DropdownMenuItem key={folder.id} onClick={() => bulkMoveToFolder(folder.id)}>
                                                                                        <IconExplorerIcon name={folder.icon} size={14} />
                                                                                        {folder.title}
                                                                                    </DropdownMenuItem>
                                                                                );
                                                                            })}
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className={styles.foldersPanel}>
                                                        <div className={styles.foldersHeader}>
                                                            <button
                                                                className={styles.foldersToggle}
                                                                onClick={() => setFoldersExpanded(prev => !prev)}
                                                                aria-label={foldersExpanded ? 'Collapse folders' : 'Expand folders'}
                                                            >
                                                                <IconChevronDown className={cn(styles.foldersChevron, !foldersExpanded && styles.foldersChevronCollapsed)} size={16} />
                                                            </button>
                                                            <span className={styles.foldersTitle}>Folders</span>
                                                            <button
                                                                className={styles.foldersAdd}
                                                                onClick={() => setIsCreatingFolder(true)}
                                                                aria-label="Add folder"
                                                            >
                                                                <IconFolderPlus size={16} />
                                                            </button>
                                                        </div>
                                                        {foldersExpanded && (
                                                            <>
                                                                {notificationFolders.length > 0 ? (
                                                                    <div className={styles.foldersList}>
                                                                        {notificationFolders.map((folder, folderIndex) => {
                                                                            const count = folderCounts[folder.id]?.unread || 0;

                                                                            return (
                                                                                <ContextMenu key={folder.id}>
                                                                                    <ContextMenuTrigger>
                                                                                        <button
                                                                                            className={cn(styles.folderItem, activeFolderId === folder.id && styles.folderItemActive)}
                                                                                            onClick={() => setSelectedCategory(`folder:${folder.id}`)}
                                                                                        >
                                                                                            <IconExplorerIcon name={folder.icon} size={16} className={styles.folderIcon} />
                                                                                            <span className={styles.folderText}>
                                                                                                <span className={styles.folderTitle}>{folder.title}</span>
                                                                                                {folder.subtitle && (
                                                                                                    <span className={styles.folderSubtitle}>{folder.subtitle}</span>
                                                                                                )}
                                                                                            </span>
                                                                                            {count > 0 && (
                                                                                                <span className={styles.folderCount}>{count}</span>
                                                                                            )}
                                                                                        </button>
                                                                                    </ContextMenuTrigger>
                                                                                    <ContextMenuContent>
                                                                                        <ContextMenuItem onClick={() => handleStartEditFolder(folder)}>
                                                                                            <IconPencil size={14} />
                                                                                            Edit folder
                                                                                        </ContextMenuItem>
                                                                                        <ContextMenuSeparator />
                                                                                        <ContextMenuItem
                                                                                            onClick={() => handleMoveFolderUp(folder.id)}
                                                                                            disabled={folderIndex === 0}
                                                                                        >
                                                                                            <IconChevronUp size={14} />
                                                                                            Move up
                                                                                        </ContextMenuItem>
                                                                                        <ContextMenuItem
                                                                                            onClick={() => handleMoveFolderDown(folder.id)}
                                                                                            disabled={folderIndex === notificationFolders.length - 1}
                                                                                        >
                                                                                            <IconChevronDown size={14} />
                                                                                            Move down
                                                                                        </ContextMenuItem>
                                                                                        <ContextMenuSeparator />
                                                                                        <ContextMenuItem
                                                                                            onClick={(event) => requestDeleteFolder(folder.id, event)}
                                                                                            className={styles.contextMenuDestructive}
                                                                                        >
                                                                                            <IconTrash size={14} />
                                                                                            Delete folder
                                                                                        </ContextMenuItem>
                                                                                    </ContextMenuContent>
                                                                                </ContextMenu>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <div className={styles.foldersEmpty}>
                                                                        No folders yet. Add one to declutter your notifications.
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>

                                                    <Dialog
                                                        open={isCreatingFolder || editingFolderId !== null}
                                                        onOpenChange={(open) => {
                                                            if (open) return;
                                                            if (editingFolderId) {
                                                                handleCancelEditFolder();
                                                            } else {
                                                                handleCancelFolder();
                                                            }
                                                        }}
                                                    >
                                                        <DialogContent className={styles.folderDialogContent}>
                                                            <DialogHeader>
                                                                <DialogTitle>{editingFolderId ? 'Edit folder' : 'Create folder'}</DialogTitle>
                                                                <DialogDescription>
                                                                    {editingFolderId ? 'Update this custom notification folder.' : 'Group related notifications into a custom sidebar folder.'}
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            <div className={styles.folderDialogFields}>
                                                                <label className={styles.folderDialogField}>
                                                                    <span>Title</span>
                                                                    <input
                                                                        className={styles.folderInput}
                                                                        placeholder="Assessments"
                                                                        value={editingFolderId ? editFolderTitle : newFolderTitle}
                                                                        onChange={(event) => editingFolderId ? setEditFolderTitle(event.target.value) : setNewFolderTitle(event.target.value)}
                                                                        autoFocus
                                                                    />
                                                                </label>
                                                                <label className={styles.folderDialogField}>
                                                                    <span>Subtitle</span>
                                                                    <input
                                                                        className={styles.folderInput}
                                                                        placeholder="Optional"
                                                                        value={editingFolderId ? editFolderSubtitle : newFolderSubtitle}
                                                                        onChange={(event) => editingFolderId ? setEditFolderSubtitle(event.target.value) : setNewFolderSubtitle(event.target.value)}
                                                                    />
                                                                </label>
                                                                <div className={styles.folderDialogField}>
                                                                    <span>Icon</span>
                                                                    <IconExplorer
                                                                        value={editingFolderId ? editFolderIcon : newFolderIcon}
                                                                        onSelect={(iconName) => editingFolderId ? setEditFolderIcon(iconName) : setNewFolderIcon(iconName)}
                                                                        className={styles.folderIconPickerTrigger}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <DialogFooter>
                                                                <Button variant="outline" onClick={editingFolderId ? handleCancelEditFolder : handleCancelFolder}>
                                                                    Cancel
                                                                </Button>
                                                                <Button
                                                                    onClick={editingFolderId ? handleSaveEditFolder : handleCreateFolder}
                                                                    disabled={editingFolderId ? !editFolderTitle.trim() : !newFolderTitle.trim()}
                                                                >
                                                                    {editingFolderId ? 'Save folder' : 'Create folder'}
                                                                </Button>
                                                            </DialogFooter>
                                                        </DialogContent>
                                                    </Dialog>

                                                    <div className={styles.listContent} ref={notificationListContentRef}>
                                                        {!notificationStateLoaded ? (
                                                            <div className={styles.emptyState} aria-label="Loading notification status">
                                                                <InlineLoader />
                                                            </div>
                                                        ) : preparedNotifications.length > 0 ? (
                                                            <div key={selectedCategory}>
                                                                {notificationGroups.map((group) => {
                                                                    const isCollapsed = collapsedNotificationDateKeySet.has(group.key);
                                                                    const hasUnread = group.items.some(({ notificationId }) => !notificationStates[notificationId]?.read);

                                                                    return (
                                                                        <div key={group.key} className={styles.notificationGroup} data-collapsed={isCollapsed}>
                                                                            <button
                                                                                className={styles.groupHeader}
                                                                                data-has-unread={hasUnread ? 'true' : 'false'}
                                                                                onClick={() => toggleNotificationDateGroup(group.key)}
                                                                                aria-expanded={!isCollapsed}
                                                                            >
                                                                                <span className={styles.groupHeaderLabel}>
                                                                                    <IconChevronDown size={14} className={styles.groupChevron} />
                                                                                    {group.label}
                                                                                </span>
                                                                            <span className={styles.groupCount}>{group.total}</span>
                                                                        </button>
                                                                            {!isCollapsed && (
                                                                            <div className={styles.notificationGroupBody}>
                                                                                <div className={styles.notificationGroupBodyInner}>
                                                                                    {group.items.map(({ notice, notificationId, index }) => {
                                                                        const isRead = notificationStates[notificationId]?.read || false;
                                                                        const isPinned = notificationStates[notificationId]?.pinned || false;
                                                                        const isArchived = notificationStates[notificationId]?.archived || false;
                                                                        const category = getNoticeCategory(notice, notificationId);
                                                                        const importance = getNoticeImportance(notificationId);
                                                                        const importanceClass = importance === 'high'
                                                                            ? styles.importanceHigh
                                                                            : importance === 'low'
                                                                                ? styles.importanceLow
                                                                                : styles.importanceMedium;
                                                                        const CategoryIcon = category === 'alerts'
                                                                            ? IconAlertCircle
                                                                            : category === 'events'
                                                                                ? IconCalendarEvent
                                                                                : category === 'assignments'
                                                                                    ? IconClipboardCheck
                                                                                    : IconMail;
                                                                        const isMultiSelected = selectedNotificationIdSet.has(notificationId);

                                                                        return (
                                                                            <ContextMenu key={notificationId}>
                                                                                <ContextMenuTrigger
                                                                                    render={
                                                                                        <div
                                                                                            className={`${styles.notificationItem} ${isMultiSelected ? styles.multiSelected : ''} ${selectedNotification === notice ? styles.selected : ''} ${isRead ? styles.read : ''}`}
                                                                                            onClick={(event) => handleNotificationClick(event, notice, notificationId, index, orderedNotificationIds)}
                                                                                        />
                                                                                    }
                                                                                >
                                                                                        <div className={styles.notificationMeta}>
                                                                                            {!isRead && <div className={styles.unreadDot}></div>}
                                                                                            <div className={styles.notificationIcon} style={{ color: getCategoryIconColor(category) }}>
                                                                                                <CategoryIcon size={16} stroke={1.8} />
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className={styles.notificationBody}>
                                                                                            <div className={styles.notificationHeader}>
                                                                                                <span className={styles.notificationTitle}>{notice.title}</span>
                                                                                                {importance && (
                                                                                                    <button
                                                                                                        className={`${styles.notificationImportance} ${importanceClass}`}
                                                                                                        onClick={(event) => {
                                                                                                            event.stopPropagation();
                                                                                                            setImportance(notificationId, undefined);
                                                                                                        }}
                                                                                                        aria-label={`Remove ${importance} importance`}
                                                                                                        title={`Remove ${importance} importance`}
                                                                                                    >
                                                                                                        <span>{importance}</span>
                                                                                                        <IconX size={12} />
                                                                                                    </button>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className={styles.notificationPreview}>{notice.preview}</div>
                                                                                        </div>
                                                                                </ContextMenuTrigger>
                                                                                <ContextMenuContent>
                                                                                    <ContextMenuItem onClick={() => {
                                                                                        setSelectedNotificationIds([notificationId]);
                                                                                        setSelectionAnchorIndex(index);
                                                                                        handleSelectNotification(notice, notificationId);
                                                                                    }}>
                                                                                        <IconEye size={14} />
                                                                                        Open
                                                                                    </ContextMenuItem>
                                                                                    <ContextMenuItem onClick={() => toggleRead(notificationId)}>
                                                                                        {isRead ? <IconMailOpened size={14} /> : <IconMail size={14} />}
                                                                                        {isRead ? 'Mark as unread' : 'Mark as read'}
                                                                                    </ContextMenuItem>
                                                                                    <ContextMenuItem onClick={() => togglePin(notificationId)}>
                                                                                        {isPinned ? <IconPinFilled size={14} /> : <IconPin size={14} />}
                                                                                        {isPinned ? 'Unpin' : 'Pin'}
                                                                                    </ContextMenuItem>
                                                                                    <ContextMenuItem onClick={() => toggleArchive(notificationId)}>
                                                                                        <IconArchive size={14} />
                                                                                        {isArchived ? 'Restore from archive' : 'Archive'}
                                                                                    </ContextMenuItem>
                                                                                    <ContextMenuSeparator />
                                                                                    <ContextMenuSub>
                                                                                        <ContextMenuSubTrigger>
                                                                                            <IconAlertTriangle size={14} />
                                                                                            Importance
                                                                                        </ContextMenuSubTrigger>
                                                                                        <ContextMenuSubContent>
                                                                                            <ContextMenuRadioGroup
                                                                                                value={getNoticeImportance(notificationId) || ''}
                                                                                                onValueChange={(value) => setImportance(notificationId, value as 'low' | 'medium' | 'high')}
                                                                                            >
                                                                                                <ContextMenuRadioItem value="low">
                                                                                                    <IconArrowDown size={14} />
                                                                                                    Low
                                                                                                </ContextMenuRadioItem>
                                                                                                <ContextMenuRadioItem value="medium">
                                                                                                    <IconMinus size={14} />
                                                                                                    Medium
                                                                                                </ContextMenuRadioItem>
                                                                                                <ContextMenuRadioItem value="high">
                                                                                                    <IconArrowUp size={14} />
                                                                                                    High
                                                                                                </ContextMenuRadioItem>
                                                                                            </ContextMenuRadioGroup>
                                                                                            <ContextMenuSeparator />
                                                                                            <ContextMenuItem onClick={() => setImportance(notificationId, undefined)}>
                                                                                                <IconX size={14} />
                                                                                                Clear importance
                                                                                            </ContextMenuItem>
                                                                                        </ContextMenuSubContent>
                                                                                    </ContextMenuSub>
                                                                                    <ContextMenuSub>
                                                                                        <ContextMenuSubTrigger>
                                                                                            <IconFolder size={14} />
                                                                                            Move to
                                                                                        </ContextMenuSubTrigger>
                                                                                        <ContextMenuSubContent>
                                                                                            <ContextMenuRadioGroup
                                                                                                value={category}
                                                                                                onValueChange={(value) => handleMoveToCategory(notificationId, value as 'inbox' | 'alerts' | 'events' | 'assignments')}
                                                                                            >
                                                                                                <ContextMenuRadioItem value="inbox">
                                                                                                    <IconInbox size={14} />
                                                                                                    Inbox
                                                                                                </ContextMenuRadioItem>
                                                                                                <ContextMenuRadioItem value="alerts">
                                                                                                    <IconAlertCircle size={14} />
                                                                                                    Alerts
                                                                                                </ContextMenuRadioItem>
                                                                                                <ContextMenuRadioItem value="events">
                                                                                                    <IconCalendarEvent size={14} />
                                                                                                    Events
                                                                                                </ContextMenuRadioItem>
                                                                                                <ContextMenuRadioItem value="assignments">
                                                                                                    <IconClipboardCheck size={14} />
                                                                                                    Assignments
                                                                                                </ContextMenuRadioItem>
                                                                                            </ContextMenuRadioGroup>
                                                                                        </ContextMenuSubContent>
                                                                                    </ContextMenuSub>
                                                                                    {notificationFolders.length > 0 && (
                                                                                        <ContextMenuSub>
                                                                                            <ContextMenuSubTrigger>
                                                                                                <IconFolders size={14} />
                                                                                                Folder
                                                                                            </ContextMenuSubTrigger>
                                                                                            <ContextMenuSubContent>
                                                                                                <ContextMenuRadioGroup
                                                                                                    value={notificationStates[notificationId]?.folderId || ''}
                                                                                                    onValueChange={(value) => handleMoveToFolder(notificationId, value || undefined)}
                                                                                                >
                                                                                                    <ContextMenuRadioItem value="">
                                                                                                        <IconFolder size={14} />
                                                                                                        No folder
                                                                                                    </ContextMenuRadioItem>
                                                                                                    {notificationFolders.map((folder) => {
                                                                                                        return (
                                                                                                            <ContextMenuRadioItem key={folder.id} value={folder.id}>
                                                                                                                <IconExplorerIcon name={folder.icon} size={14} />
                                                                                                                {folder.title}
                                                                                                            </ContextMenuRadioItem>
                                                                                                        );
                                                                                                    })}
                                                                                                </ContextMenuRadioGroup>
                                                                                            </ContextMenuSubContent>
                                                                                        </ContextMenuSub>
                                                                                    )}
                                                                                </ContextMenuContent>
                                                                            </ContextMenu>
                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                                {hiddenNotificationCount > 0 && (
                                                                    <div
                                                                        ref={notificationLoadMoreRef}
                                                                        className={styles.notificationLoadMore}
                                                                        role="status"
                                                                        aria-live="polite"
                                                                    >
                                                                        <span>Loading more notifications</span>
                                                                        <span>{hiddenNotificationCount} remaining</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className={styles.emptyState}>
                                                                <IconInbox size={48} style={{ color: 'var(--text-tertiary)', opacity: 0.6 }} />
                                                                <h3>No notifications</h3>
                                                                <p>{selectedCategory.startsWith('folder:') ? 'No notifications in this folder' : 'No notifications in this category'}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <NotificationsResizer
                                                    label="Notification list width"
                                                    width={homeSettings.notificationListWidth}
                                                    min={MIN_NOTIFICATION_LIST_WIDTH}
                                                    max={MAX_NOTIFICATION_LIST_WIDTH}
                                                    enabled={isNotificationsEditing}
                                                    onChange={(notificationListWidth) => updateHomeSettings({ notificationListWidth })}
                                                />

                                                {/* Right panel - notification details */}
                                                <div className={styles.notificationDetails}>
                                                    {selectedNotification && selectedNotificationIds.length <= 1 ? (() => {
                                                        const selectedIndex = portalData?.notices?.findIndex(n => n === selectedNotification);
                                                        const resolvedIndex = selectedIndex === undefined || selectedIndex < 0 ? 0 : selectedIndex;
                                                        const selectedId = getNotificationId(selectedNotification, resolvedIndex);
                                                        const isSelectedRead = notificationStates[selectedId]?.read || false;
                                                        const isSelectedPinned = notificationStates[selectedId]?.pinned || false;
                                                        const isSelectedArchived = notificationStates[selectedId]?.archived || false;
                                                        const selectedCategory = getNoticeCategory(selectedNotification, selectedId);
                                                        const selectedImportance = getNoticeImportance(selectedId);
                                                        const SelectedCategoryIcon = selectedCategory === 'alerts'
                                                            ? IconAlertCircle
                                                            : selectedCategory === 'events'
                                                                ? IconCalendarEvent
                                                                : selectedCategory === 'assignments'
                                                                    ? IconClipboardCheck
                                                                    : IconMail;
                                                        const selectedImportanceClass = selectedImportance === 'high'
                                                            ? styles.importanceHigh
                                                            : selectedImportance === 'low'
                                                                ? styles.importanceLow
                                                                : styles.importanceMedium;

                                                        return (
                                                            <div className={styles.detailsContent}>
                                                                <div className={styles.detailsHeader}>
                                                                    <div className={styles.detailsTitle}>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            className={styles.mobileNotificationBack}
                                                                            onClick={() => {
                                                                                clearSelection();
                                                                                setSelectedNotification(null);
                                                                            }}
                                                                            aria-label="Back to notifications"
                                                                        >
                                                                            <IconArrowLeft size={18} />
                                                                        </Button>
                                                                        <h3>{selectedNotification.title}</h3>
                                                                    </div>
                                                                    <div className={styles.detailsActions}>
                                                                        <CustomTooltip text={isSelectedRead ? "Mark as unread" : "Mark as read"} position="top">
                                                                            <button
                                                                                className={styles.detailActionBtn}
                                                                                onClick={() => toggleRead(selectedId)}
                                                                            >
                                                                                {isSelectedRead ? <IconMailOpened size={16} /> : <IconMail size={16} />}
                                                                            </button>
                                                                        </CustomTooltip>
                                                                        <CustomTooltip text={isSelectedPinned ? "Unpin notification" : "Pin notification"} position="top">
                                                                            <button
                                                                                className={styles.detailActionBtn}
                                                                                onClick={() => togglePin(selectedId)}
                                                                            >
                                                                                {isSelectedPinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
                                                                            </button>
                                                                        </CustomTooltip>
                                                                        <CustomTooltip text={isSelectedArchived ? "Restore from archive" : "Archive"} position="top">
                                                                            <button
                                                                                className={styles.detailActionBtn}
                                                                                onClick={() => toggleArchive(selectedId)}
                                                                            >
                                                                                <IconArchive size={16} />
                                                                            </button>
                                                                        </CustomTooltip>
                                                                    </div>
                                                                </div>
                                                                <div className={styles.detailsMeta}>
                                                                    <div className={styles.metaPill}>
                                                                        <SelectedCategoryIcon size={14} style={{ color: getCategoryIconColor(selectedCategory) }} />
                                                                        <span>{selectedCategory}</span>
                                                                    </div>
                                                                    {selectedImportance && (
                                                                        <button
                                                                            className={`${styles.metaPill} ${styles.metaImportance} ${styles.metaPillAction} ${selectedImportanceClass}`}
                                                                            onClick={() => setImportance(selectedId, undefined)}
                                                                            aria-label={`Remove ${selectedImportance} importance`}
                                                                        >
                                                                            <span>{selectedImportance}</span>
                                                                            <IconX size={12} />
                                                                        </button>
                                                                    )}
                                                                    <div className={styles.metaPill}>
                                                                        <span>{`Dates: ${formatNoticeDateRange(selectedNotification)}`}</span>
                                                                    </div>
                                                                    {isSelectedPinned && (
                                                                        <div className={styles.metaPill}>
                                                                            <IconPinFilled size={14} />
                                                                            <span>Pinned</span>
                                                                        </div>
                                                                    )}
                                                                    {isSelectedArchived && (
                                                                        <div className={styles.metaPill}>
                                                                            <IconArchive size={14} />
                                                                            <span>Archived</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className={styles.detailsBody}>
                                                                    {selectedNotification.contentHtml ? (
                                                                        <div
                                                                            className={styles.descriptionHtml}
                                                                            dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(selectedNotification.contentHtml) }}
                                                                        />
                                                                    ) : (
                                                                        <p>{renderLinkedText(selectedNotification.content)}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div className={styles.emptyState}>
                                                            <IconInbox size={64} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                                                            <h3>{selectedNotificationIds.length > 1 ? 'More than one notification is selected' : 'No notification selected'}</h3>
                                                            <p>{selectedNotificationIds.length > 1 ? 'Select a single notification to view details.' : 'Select a notification to view its details'}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            </PageTransition>
                                        </>
                                    ) : (
                                        <>
                                            <ContentTopbar
                                                    title={currentSectionDefinition?.label ?? ''}
                                                    tabs={dashboardTabs}
                                                    activeTabId={activeDashboardTabId}
                                                    selectedTabIds={selectedDashboardTabIds}
                                                    onTabSelectionChange={setSelectedDashboardTabIds}
                                                    onTabAction={handleDashboardTabAction}
                                                    onTabChange={handleDashboardTabChange}
                                                    onAddTab={handleAddDashboardTab}
                                                    onTabClose={handleCloseDashboardTab}
                                                    onTabReorder={handleReorderDashboardTab}
                                                    icon={CurrentSectionIcon ? <CurrentSectionIcon size={16} /> : null}
                                            />

                                            <PageTransition isLoading={pageTransitioning}>
                                                {renderCurrentSection()}
                                            </PageTransition>
                                        </>
                                        )}
                                </div>
                            </div>
                        </SidebarInset >
                        {showAssistantDock ? (
                            <AssistantDock
                                summarizeThinking={homeSettings.assistantSummarizeThinking}
                                onOpenInMain={() => handleSectionClick('assistant')}
                                showLauncher={homeSettings.showAiAgent}
                                beforeVisible={showDockEditActions}
                                before={showNotificationsDockActions ? (
                                    <div className={styles.bottomActions} data-visible="true">
                                        <Button
                                            variant={isNotificationsEditing ? 'default' : 'ghost'}
                                            size="sm"
                                            className={styles.bottomCustomiseButton}
                                            data-editing={isNotificationsEditing ? 'true' : 'false'}
                                            onClick={() => setIsNotificationsEditing(prev => !prev)}
                                        >
                                            <IconPencil size={15} />
                                            {isNotificationsEditing ? 'Done' : 'Customise Notifications'}
                                        </Button>
                                        <div
                                            className={styles.bottomResetSlot}
                                            data-visible={isNotificationsEditing ? 'true' : 'false'}
                                            aria-hidden={!isNotificationsEditing}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                tabIndex={isNotificationsEditing ? 0 : -1}
                                                onClick={() => setResetCustomiseTarget('notifications')}
                                            >
                                                <IconRestore size={15} />
                                                Reset
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.bottomActions} data-visible={showHomeDockActions ? 'true' : 'false'} aria-hidden={!showHomeDockActions}>
                                        <Button
                                            variant={isHomeEditing ? 'default' : 'ghost'}
                                            size="sm"
                                            className={styles.bottomCustomiseButton}
                                            data-tour-id="home-customise"
                                            data-editing={isHomeEditing ? 'true' : 'false'}
                                            tabIndex={showHomeDockActions ? 0 : -1}
                                            onClick={() => {
                                                if (isHomeEditing) setIsNoteEditing(false);
                                                setIsHomeEditing(prev => !prev);
                                            }}
                                        >
                                            <IconPencil size={15} />
                                            {isHomeEditing ? 'Done' : 'Customise Home'}
                                        </Button>
                                        <div
                                            className={styles.bottomResetSlot}
                                            data-visible={isHomeEditing && showHomeDockActions ? 'true' : 'false'}
                                            aria-hidden={!isHomeEditing || !showHomeDockActions}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                tabIndex={isHomeEditing && showHomeDockActions ? 0 : -1}
                                                onClick={() => setResetCustomiseTarget('home')}
                                            >
                                                <IconRestore size={15} />
                                                Reset
                                            </Button>
                                        </div>
                                        <div
                                            className={styles.bottomAddItemSlot}
                                            data-visible={isHomeEditing && showHomeDockActions ? 'true' : 'false'}
                                            aria-hidden={!isHomeEditing || !showHomeDockActions}
                                        >
                                            <DropdownMenu>
                                                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" data-tour-id="home-add-item" tabIndex={isHomeEditing && showHomeDockActions ? 0 : -1} />}>
                                                    <IconPlus size={15} />
                                                    Add Item
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent data-tour-id="home-add-item-menu" align="end" side="top">
                                                    {availableHomeItems.length === 0 ? (
                                                        <DropdownMenuItem disabled>All items added</DropdownMenuItem>
                                                    ) : availableHomeItems.map(item => (
                                                        <DropdownMenuItem key={item.key} onClick={() => addHomeItem(item.key)}>
                                                            {item.label}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                )}
                                after={(
                                    <div
                                        className={styles.bottomSettingsSlot}
                                        data-visible={showDockSettingsSlot ? 'true' : 'false'}
                                        aria-hidden={!showDockSettingsSlot}
                                    >
                                        {isPhone ? (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className={styles.bottomSearchButton}
                                                onClick={() => setShowCommandMenu(true)}
                                                aria-label="Search"
                                                title={`Search (${SEARCH_SHORTCUT_LABEL})`}
                                            >
                                                <IconSearch size={15} />
                                            </Button>
                                        ) : null}
                                        {!isInSettings ? (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className={styles.bottomSettingsButton}
                                                onClick={() => handleOpenSettings('general')}
                                                aria-label="Settings"
                                                title="Settings"
                                            >
                                                <IconSettings size={15} />
                                            </Button>
                                        ) : isPhone ? (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className={styles.bottomSettingsButton}
                                                data-tour-id="settings-exit-mobile"
                                                onClick={handleCloseSettings}
                                                aria-label="Exit settings"
                                                title="Exit settings"
                                            >
                                                <IconArrowLeft size={15} />
                                            </Button>
                                        ) : null}
                                    </div>
                                )}
                            />
                        ) : null}
                        {themeCreateMode ? (
                            <ThemeCreationSidebar
                                mode={themeCreateMode}
                                initialTheme={themeEditDraft}
                                onClose={() => {
                                    setThemeCreateMode(null);
                                    setThemeEditDraft(null);
                                }}
                            />
                        ) : null}
                    </SidebarProvider >
                </TooltipProvider >

                <AlertDialog
                    open={!!activeSyncReview}
                    onOpenChange={(open) => {
                        if (!open && activeSyncReview) acknowledgeSyncReview(activeSyncReview);
                    }}
                >
                    <AlertDialogContent className="border-[var(--border-default)] bg-[var(--bg-elevated)]">
                        {activeSyncReview?.type === 'room-change' ? (
                            <>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Room Change Detected</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {activeSyncReview.item.course} now appears in {activeSyncReview.item.toRoom} instead of {activeSyncReview.item.fromRoom} for {activeSyncReview.item.week === 'weekA' ? 'Week A' : 'Week B'} {activeSyncReview.item.day} {activeSyncReview.item.period}.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className={styles.syncReviewChange}>
                                    <span>{activeSyncReview.item.fromRoom}</span>
                                    <IconArrowRight size={16} />
                                    <strong>{activeSyncReview.item.toRoom}</strong>
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogAction onClick={() => acknowledgeSyncReview(activeSyncReview)}>
                                        Got it
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </>
                        ) : activeSyncReview?.type === 'unenroll' ? (
                            <>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Class Missing From Timetable</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {activeSyncReview.item.course} ({activeSyncReview.item.classCode}) is still listed in Classes, but the latest timetable sync does not include it. Do you want to unenroll it locally?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => acknowledgeSyncReview(activeSyncReview)}>
                                        Keep Class
                                    </AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleLocalUnenroll(activeSyncReview)}>
                                        Unenroll
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </>
                        ) : null}
                    </AlertDialogContent>
                </AlertDialog>

                <Dialog
                    open={homeNotificationGlanceOpen}
                    onOpenChange={(open) => {
                        if (open) {
                            setHomeNotificationGlanceOpen(true);
                        } else {
                            closeHomeNotificationGlance();
                        }
                    }}
                >
                    <DialogContent
                        className={styles.notificationGlanceDialog}
                        style={homeNotificationGlanceStyle}
                        showCloseButton
                    >
                        {homeNotificationGlance ? (() => {
                            const { notice, notificationId } = homeNotificationGlance;
                            const isRead = notificationStates[notificationId]?.read || false;
                            const isPinned = notificationStates[notificationId]?.pinned || false;
                            const isArchived = notificationStates[notificationId]?.archived || false;
                            const category = getNoticeCategory(notice, notificationId);
                            const importance = getNoticeImportance(notificationId);
                            const CategoryIcon = category === 'alerts'
                                ? IconAlertCircle
                                : category === 'events'
                                    ? IconCalendarEvent
                                    : category === 'assignments'
                                        ? IconClipboardCheck
                                        : IconMail;
                            const importanceClass = importance === 'high'
                                ? styles.importanceHigh
                                : importance === 'low'
                                    ? styles.importanceLow
                                    : styles.importanceMedium;

                            return (
                                <div className={`${styles.detailsContent} ${styles.notificationGlanceContent}`}>
                                    <DialogHeader className={styles.notificationGlanceHeader}>
                                        <DialogTitle>{notice.title}</DialogTitle>
                                    </DialogHeader>
                                    <div className={styles.detailsMeta}>
                                        <div className={styles.notificationGlanceMetaLeft}>
                                            <div className={styles.metaPill}>
                                                <CategoryIcon size={14} style={{ color: getCategoryIconColor(category) }} />
                                                <span>{category}</span>
                                            </div>
                                            <div className={styles.metaPill}>
                                                <span>{`Dates: ${formatNoticeDateRange(notice)}`}</span>
                                            </div>
                                            {importance && (
                                                <button
                                                    type="button"
                                                    className={`${styles.metaPill} ${styles.metaImportance} ${styles.metaPillAction} ${importanceClass}`}
                                                    onClick={() => setImportance(notificationId, undefined)}
                                                    aria-label={`Remove ${importance} importance`}
                                                >
                                                    <span>{importance}</span>
                                                    <IconX size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <div className={styles.notificationGlanceMetaActions}>
                                            <CustomTooltip text={isRead ? "Mark as unread" : "Mark as read"} position="top">
                                                <button
                                                    type="button"
                                                    className={styles.detailActionBtn}
                                                    onClick={() => toggleRead(notificationId)}
                                                    aria-label={isRead ? "Mark as unread" : "Mark as read"}
                                                >
                                                    {isRead ? <IconMailOpened size={16} /> : <IconMail size={16} />}
                                                </button>
                                            </CustomTooltip>
                                            <CustomTooltip text={isPinned ? "Unpin notification" : "Pin notification"} position="top">
                                                <button
                                                    type="button"
                                                    className={styles.detailActionBtn}
                                                    onClick={() => togglePin(notificationId)}
                                                    aria-label={isPinned ? "Unpin notification" : "Pin notification"}
                                                >
                                                    {isPinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
                                                </button>
                                            </CustomTooltip>
                                            <CustomTooltip text={isArchived ? "Restore from archive" : "Archive"} position="top">
                                                <button
                                                    type="button"
                                                    className={styles.detailActionBtn}
                                                    onClick={() => toggleArchive(notificationId)}
                                                    aria-label={isArchived ? "Restore from archive" : "Archive"}
                                                >
                                                    <IconArchive size={16} />
                                                </button>
                                            </CustomTooltip>
                                            <DropdownMenu>
                                                <CustomTooltip text="Set importance" position="top">
                                                    <DropdownMenuTrigger render={<button type="button" className={styles.notificationGlanceMenuButton} aria-label="Set importance" />}>
                                                        <IconAlertTriangle size={16} />
                                                    </DropdownMenuTrigger>
                                                </CustomTooltip>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setImportance(notificationId, 'low')}>
                                                        <IconArrowDown size={14} />
                                                        Low
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setImportance(notificationId, 'medium')}>
                                                        <IconMinus size={14} />
                                                        Medium
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setImportance(notificationId, 'high')}>
                                                        <IconArrowUp size={14} />
                                                        High
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => setImportance(notificationId, undefined)}>
                                                        <IconX size={14} />
                                                        Clear importance
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <DropdownMenu>
                                                <CustomTooltip text="Move to category" position="top">
                                                    <DropdownMenuTrigger render={<button type="button" className={styles.notificationGlanceMenuButton} aria-label="Move to category" />}>
                                                        <IconFolder size={16} />
                                                    </DropdownMenuTrigger>
                                                </CustomTooltip>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleMoveToCategory(notificationId, 'inbox')}>
                                                        <IconInbox size={14} />
                                                        Inbox
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleMoveToCategory(notificationId, 'alerts')}>
                                                        <IconAlertCircle size={14} />
                                                        Alerts
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleMoveToCategory(notificationId, 'events')}>
                                                        <IconCalendarEvent size={14} />
                                                        Events
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleMoveToCategory(notificationId, 'assignments')}>
                                                        <IconClipboardCheck size={14} />
                                                        Assignments
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            {notificationFolders.length > 0 && (
                                                <DropdownMenu>
                                                    <CustomTooltip text="Move to folder" position="top">
                                                        <DropdownMenuTrigger render={<button type="button" className={styles.notificationGlanceMenuButton} aria-label="Move to folder" />}>
                                                            <IconFolders size={16} />
                                                        </DropdownMenuTrigger>
                                                    </CustomTooltip>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleMoveToFolder(notificationId, undefined)}>
                                                            <IconFolder size={14} />
                                                            No folder
                                                        </DropdownMenuItem>
                                                        {notificationFolders.map((folder) => {
                                                            return (
                                                                <DropdownMenuItem key={folder.id} onClick={() => handleMoveToFolder(notificationId, folder.id)}>
                                                                    <IconExplorerIcon name={folder.icon} size={14} />
                                                                    {folder.title}
                                                                </DropdownMenuItem>
                                                            );
                                                        })}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </div>
                                    <div className={styles.detailsBody}>
                                        {notice.contentHtml ? (
                                            <div
                                                className={styles.descriptionHtml}
                                                dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(notice.contentHtml) }}
                                            />
                                        ) : (
                                            <p>{renderLinkedText(notice.content)}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })() : null}
                    </DialogContent>
                </Dialog>

                {/* Command Menu */}
                {!isPreviewMode ? (
                    < CommandMenu
                        open={showCommandMenu}
                        onClose={() => setShowCommandMenu(false)
                        }
                        onNavigate={handleCommandNavigate}
                        onAction={handleCommandAction}
                        currentSection={currentSection}
                        currentView={currentView}
                        shortcutBindings={shortcutBindings}
                        notificationFolders={notificationFolders}
                        openTabs={commandMenuTabs}
                    />
                ) : null}

                {/* Logout Confirmation Dialog */}
                < AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm} >
                    <AlertDialogContent style={{
                        maxWidth: '450px',
                        padding: '24px',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '12px',
                        outline: 'none',
                        boxShadow: '0 25px 50px -12px rgb(var(--shadow-color) / calc(0.5 * var(--shadow-strength)))',
                    }}>
                        <AlertDialogHeader style={{ marginBottom: '16px' }}>
                            <AlertDialogTitle style={{
                                fontSize: '18px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '8px',
                            }}>
                                Log Out?
                            </AlertDialogTitle>
                            <AlertDialogDescription style={{
                                fontSize: '14px',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                            }}>
                                Are you sure you want to log out? You'll need to sign in again to access your data.
                                Hold Shift while clicking destructive actions to skip confirmation.
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
                                onClick={() => {
                                    setShowLogoutConfirm(false);
                                    handleLogout();
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
                                Log Out
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog >

                {/* Reset customisation confirmation. Both resets throw away arrangement work that
                    cannot be recovered once the preferences save, so the button only opens this. */}
                <AlertDialog
                    open={resetCustomiseTarget !== null}
                    onOpenChange={(open) => { if (!open) setResetCustomiseTarget(null); }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {resetCustomiseTarget === 'notifications'
                                    ? 'Reset notifications layout?'
                                    : 'Reset home layout?'}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {resetCustomiseTarget === 'notifications'
                                    ? 'Sidebar order, which entries are shown, and both column widths go back to their defaults. Your folders, notices, and everything you have filed stay exactly as they are.'
                                    : 'Cards, their order and widths, quick access shortcuts, and anything drawn on the board go back to the default arrangement. Your note is kept, and you can undo this with Cmd-Z while you stay on the page.'}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                onClick={() => {
                                    if (resetCustomiseTarget === 'notifications') resetNotificationsCustomisation();
                                    else if (resetCustomiseTarget === 'home') resetHomeCustomisation();
                                    setResetCustomiseTarget(null);
                                }}
                            >
                                <IconRestore size={15} />
                                Reset
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Delete Folder Confirmation Dialog */}
                < AlertDialog open={!!deleteFolderConfirmId} onOpenChange={(open) => !open && setDeleteFolderConfirmId(null)}>
                    <AlertDialogContent style={{
                        maxWidth: '450px',
                        padding: '24px',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '12px',
                        outline: 'none',
                        boxShadow: '0 25px 50px -12px rgb(var(--shadow-color) / calc(0.5 * var(--shadow-strength)))',
                    }}>
                        <AlertDialogHeader style={{ marginBottom: '16px' }}>
                            <AlertDialogTitle style={{
                                fontSize: '18px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '8px',
                            }}>
                                Delete Folder?
                            </AlertDialogTitle>
                            <AlertDialogDescription style={{
                                fontSize: '14px',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                            }}>
                                This will delete the folder. Any notifications in this folder will be moved back to the Inbox.
                                Hold Shift while clicking destructive actions to skip confirmation.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end',
                        }}>
                            <AlertDialogCancel
                                style={{
                                    padding: '10px 16px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (deleteFolderConfirmId) {
                                        handleDeleteFolder(deleteFolderConfirmId);
                                    }
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
                                Delete Folder
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog >

            </div >
        </DashboardTour>
        </FeedbackProvider>
    );
}
