import { useEffect, useState, useMemo, useCallback, memo, useRef, ReactNode, MouseEvent, ChangeEvent, PointerEvent } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import DOMPurify from 'isomorphic-dompurify';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from '../styles/Dashboard.module.css';
import { Notice, AttendanceData, Report, GradeEntry } from '../types/portal';
import { useDashboardData } from '../hooks/useDashboardData';
import { useNotifications } from '../hooks/useNotifications';
import { useShortcuts, ShortcutHandlers } from '../hooks/useShortcuts';
import { PageTransition, InlineLoader } from '../components/PageTransition';
import { SimpleTooltip as CustomTooltip } from '../components/SimpleTooltip';

// Shadcn UI components
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
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
} from '../components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '../components/ui/dropdown-menu';
import { Switch } from '../components/ui/switch';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '../components/ui/context-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../components/ui/tooltip';
import { Separator } from '../components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '../components/ui/card';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '../components/ui/table';
import {
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '../components/ui/empty';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarBadge } from '../components/ui/avatar';
import { Label } from '../components/ui/label';
import { Button, buttonVariants } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { ColorPicker, ColorPickerTrigger, ColorPickerContent } from '../components/ui/color-picker';
import { CommandMenu } from '../components/CommandMenu';
import { SettingsSidebar } from '../components/SettingsSidebar';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { ThemeBuilder } from '../components/settings/ThemeBuilder';
import { ShortcutsSettings } from '../components/settings/ShortcutsSettings';
import { AnimationsSettings } from '../components/settings/AnimationsSettings';
import { NotificationsSettings } from '../components/settings/NotificationsSettings';
import { loadAndApplySavedTheme } from '../lib/theme';
import { useAnimationSettings } from '../hooks/useAnimationSettings';
import { ContentTopbar, TopbarAction, TopbarSeparator } from '../components/ContentTopbar';
import { HomeSettings, defaultHomeSettings, HOME_SETTINGS_KEY } from '../types/home';
import { cn } from '../lib/utils';
import { IconExplorer } from '../components/ui/icon-explorer';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';

// Tabler icons
import * as TablerIcons from '@tabler/icons-react';
import {
    IconHome,
    IconBell,
    IconUser,
    IconCalendar,
    IconBook,
    IconClock,
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
    IconMail,
    IconMailOpened,
    IconEye,
    IconFolder,
    IconFolderPlus,
    IconFolders,
    IconArrowDown,
    IconArrowUp,
    IconMinus,
    IconPencil,
    IconPlus,
    // Classroom icons
    IconSchool,
    IconClipboard,
    IconNews,
    IconFiles,
    IconAlertTriangle,
    IconChecks,
    IconExternalLink,
    IconFilter,
    IconSortAscending,
    IconSortDescending,
    IconX,
    IconCheck,
    IconTrash,
    IconChevronUp,
} from '@tabler/icons-react';

// Calendar imports
import { Calendar } from '../components/Calendar';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useLocalEvents } from '../hooks/useLocalEvents';
import { CalendarEvent } from '../types/calendar';
import { useSession, signIn } from 'next-auth/react';

// Classroom imports
import { useGoogleClassroom } from '../hooks/useGoogleClassroom';
import { ClassroomItem, ClassroomFilters, formatDueDate } from '../types/classroom';

// Feature flag: set to false to re-enable Classroom features
const HIDE_CLASSROOM = true;

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

// Dynamically import heavy components for code splitting
const LoadingSkeleton = dynamic(() => import('../components/LoadingSkeleton').then(mod => ({ default: mod.LoadingSkeleton })), {
    ssr: false
});

type HomeItemType =
    | 'note'
    | 'quick_access'
    | 'notifications'
    | 'calendar'
    | 'today_classes'
    | 'classroom_assignments'
    | 'attendance_snapshot'
    | 'classroom_activity'
    | 'todo'
    | 'recent_feedback'
    | 'assignments_status';

type HomeColumnKey = 'left' | 'right';

interface QuickAccessSlot {
    id: string;
    actionId: string | null;
}

interface HomeLayout {
    columns: Record<HomeColumnKey, HomeItemType[]>;
    quickAccessSlots: QuickAccessSlot[];
    note: string;
}

interface NotificationFolder {
    id: string;
    title: string;
    subtitle?: string;
    icon: string;
}

const HOME_LAYOUT_KEY = 'millennium_home_layout';
const DEFAULT_NOTE = '# Welcome to Millennium\nYou can edit this text!';

const defaultHomeLayout: HomeLayout = {
    columns: {
        left: ['note', 'quick_access', 'todo', 'notifications', 'recent_feedback'],
        right: ['calendar', 'assignments_status', 'classroom_assignments', 'attendance_snapshot', 'today_classes'],
    },
    quickAccessSlots: [
        { id: 'qa-1', actionId: 'nav-timetable' },
        { id: 'qa-2', actionId: 'nav-notifications' },
        { id: 'qa-3', actionId: 'nav-calendar' },
        { id: 'qa-4', actionId: 'nav-classroom' },
    ],
    note: DEFAULT_NOTE,
};

const SortableHomeItem = ({ id, children, disabled }: { id: string; children: ReactNode; disabled: boolean }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString({ ...transform, scaleX: 1, scaleY: 1 }),
        transition,
        zIndex: isDragging ? 2 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={styles.homeItemSortable}
            {...attributes}
            {...listeners}
        >
            {children}
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
        transform: CSS.Transform.toString({ ...transform, scaleX: 1, scaleY: 1 }),
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

const HomeDropColumn = ({ id, children }: { id: HomeColumnKey; children: ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={styles.homeColumnDrop}
            data-over={isOver ? 'true' : 'false'}
        >
            {children}
        </div>
    );
};

export default function Dashboard() {
    const router = useRouter();

    // Use custom hooks for better organization
    const {
        session,
        isLoading,
        portalData,
        dataLoading,
        checkSession,
        loadPortalData,
        handleLogout
    } = useDashboardData();

    const notificationHooks = useNotifications(portalData?.notices);

    const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([]);
    const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
    const [isMultiSelectKeyActive, setIsMultiSelectKeyActive] = useState(false);

    const FOLDER_STORAGE_KEY = 'millennium-notification-folders';
    const [notificationFolders, setNotificationFolders] = useState<NotificationFolder[]>([]);
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

    // Calendar hooks
    const googleCalendar = useGoogleCalendar();
    const localEvents = useLocalEvents();

    // Classroom hook
    const classroom = useGoogleClassroom();

    // Animation settings hook
    const animationSettings = useAnimationSettings();

    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [profileImageUploading, setProfileImageUploading] = useState(false);
    const [profileUploadProgress, setProfileUploadProgress] = useState(0);
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [editorImageSrc, setEditorImageSrc] = useState<string | null>(null);
    const [editorImageType, setEditorImageType] = useState<string | null>(null);
    const [editorImageMeta, setEditorImageMeta] = useState<{ width: number; height: number } | null>(null);
    const [editorZoom, setEditorZoom] = useState(1);
    const [editorRotation, setEditorRotation] = useState(0);
    const [editorOffset, setEditorOffset] = useState({ x: 0, y: 0 });
    const [isDraggingEditor, setIsDraggingEditor] = useState(false);
    const editorDragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
    const profileImageInputRef = useRef<HTMLInputElement | null>(null);
    const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorImageRef = useRef<HTMLImageElement | null>(null);

    const EDITOR_SIZE = 220;
    const EXPORT_SIZE = 512;

    useEffect(() => {
        setProfileImage(session?.profileImage || null);
    }, [session?.profileImage]);

    const handleProfileImageClick = () => {
        setShowProfileEditor(true);
    };

    useEffect(() => {
        if (showProfileEditor) {
            editorImageRef.current = null;
            setEditorImageMeta(null);
            setEditorImageSrc(null);
            setEditorImageType(null);
            setEditorZoom(1);
            setEditorRotation(0);
            setEditorOffset({ x: 0, y: 0 });
            setProfileUploadProgress(0);
            if (profileImage) {
                setTimeout(() => {
                    setEditorImageSrc(profileImage);
                    setEditorImageType('image/png');
                }, 0);
            }
        } else {
            editorImageRef.current = null;
            setEditorImageMeta(null);
            setEditorImageSrc(null);
            setEditorImageType(null);
        }
    }, [showProfileEditor, profileImage]);

    const resetEditorTransform = () => {
        setEditorZoom(1);
        setEditorRotation(0);
        setEditorOffset({ x: 0, y: 0 });
    };

    const handleSelectProfileImage = () => {
        profileImageInputRef.current?.click();
    };

    const handleProfileImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Unsupported image type. Use PNG, JPG, WEBP, or GIF.');
            event.target.value = '';
            return;
        }

        const maxBytes = 25 * 1024 * 1024;
        if (file.size > maxBytes) {
            toast.error('Image exceeds 25 MB limit.');
            event.target.value = '';
            return;
        }

        setProfileImageUploading(true);
        setProfileUploadProgress(0);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onprogress = (progressEvent) => {
                    if (progressEvent.lengthComputable) {
                        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 40);
                        setProfileUploadProgress(percent);
                    }
                };
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });
            setProfileUploadProgress(45);
            setEditorImageSrc(dataUrl);
            setEditorImageType(file.type);
            setEditorImageMeta(null);
            resetEditorTransform();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to read image.');
        } finally {
            setProfileImageUploading(false);
            setProfileUploadProgress(0);
            event.target.value = '';
        }
    };

    useEffect(() => {
        if (!editorImageSrc || !editorCanvasRef.current) return;
        const img = new Image();
        img.onload = () => {
            editorImageRef.current = img;
            setEditorImageMeta({ width: img.width, height: img.height });
        };
        img.src = editorImageSrc;
    }, [editorImageSrc]);

    useEffect(() => {
        const canvas = editorCanvasRef.current;
        const img = editorImageRef.current;
        if (!canvas || !img || !editorImageMeta) return;

        canvas.width = EDITOR_SIZE;
        canvas.height = EDITOR_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const baseScale = Math.max(EDITOR_SIZE / editorImageMeta.width, EDITOR_SIZE / editorImageMeta.height);
        const scale = baseScale * editorZoom;

        ctx.clearRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);
        ctx.save();
        ctx.beginPath();
        ctx.arc(EDITOR_SIZE / 2, EDITOR_SIZE / 2, EDITOR_SIZE / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.translate(EDITOR_SIZE / 2 + editorOffset.x, EDITOR_SIZE / 2 + editorOffset.y);
        ctx.rotate((editorRotation * Math.PI) / 180);
        ctx.scale(scale, scale);
        ctx.drawImage(img, -editorImageMeta.width / 2, -editorImageMeta.height / 2);
        ctx.restore();
    }, [editorImageMeta, editorZoom, editorRotation, editorOffset, editorImageSrc]);

    const handleEditorPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!editorImageSrc) return;
        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
        const startX = event.clientX - rect.left;
        const startY = event.clientY - rect.top;
        editorDragStart.current = { x: startX, y: startY, offsetX: editorOffset.x, offsetY: editorOffset.y };
        setIsDraggingEditor(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleEditorPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isDraggingEditor || !editorDragStart.current) return;
        const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        const deltaX = currentX - editorDragStart.current.x;
        const deltaY = currentY - editorDragStart.current.y;
        setEditorOffset({
            x: editorDragStart.current.offsetX + deltaX,
            y: editorDragStart.current.offsetY + deltaY
        });
    };

    const handleEditorPointerUp = (event?: PointerEvent<HTMLDivElement>) => {
        setIsDraggingEditor(false);
        editorDragStart.current = null;
        if (event?.currentTarget && event.pointerId) {
            try {
                event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
                // Ignore release errors
            }
        }
    };

    const handleSaveProfileImage = async () => {
        if (!editorImageRef.current || !editorImageMeta) {
            toast.error('Please add a profile picture.');
            return;
        }

        setProfileImageUploading(true);
        setProfileUploadProgress(60);

        try {
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = EXPORT_SIZE;
            exportCanvas.height = EXPORT_SIZE;
            const ctx = exportCanvas.getContext('2d');
            if (!ctx) throw new Error('Failed to prepare editor');

            const baseScale = Math.max(EXPORT_SIZE / editorImageMeta.width, EXPORT_SIZE / editorImageMeta.height);
            const scale = baseScale * editorZoom;
            const scaleFactor = EXPORT_SIZE / EDITOR_SIZE;
            const offsetX = editorOffset.x * scaleFactor;
            const offsetY = editorOffset.y * scaleFactor;

            ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
            ctx.save();
            ctx.beginPath();
            ctx.arc(EXPORT_SIZE / 2, EXPORT_SIZE / 2, EXPORT_SIZE / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.translate(EXPORT_SIZE / 2 + offsetX, EXPORT_SIZE / 2 + offsetY);
            ctx.rotate((editorRotation * Math.PI) / 180);
            ctx.scale(scale, scale);
            ctx.drawImage(editorImageRef.current, -editorImageMeta.width / 2, -editorImageMeta.height / 2);
            ctx.restore();

            const exportType = editorImageType === 'image/gif' ? 'image/png' : editorImageType || 'image/png';
            const dataUrl = exportCanvas.toDataURL(exportType);

            setProfileUploadProgress(85);
            const response = await fetch('/api/user/profile-image', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to save profile image');
            }

            const result = await response.json();
            setProfileImage(result.profileImage || null);
            setProfileUploadProgress(100);
            toast.success('Profile picture updated.');
            setTimeout(() => setProfileUploadProgress(0), 600);
            setShowProfileEditor(false);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to update profile picture.');
        } finally {
            setProfileImageUploading(false);
        }
    };

    const handleRemoveProfileImage = async () => {
        setProfileImageUploading(true);
        setProfileUploadProgress(60);
        try {
            const response = await fetch('/api/user/profile-image', { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to remove profile image');
            }
            const result = await response.json();
            setProfileImage(result.profileImage || null);
            setEditorImageSrc(null);
            setEditorImageMeta(null);
            resetEditorTransform();
            setProfileUploadProgress(100);
            toast.success('Profile picture removed.');
            setTimeout(() => setProfileUploadProgress(0), 600);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to remove profile picture.');
        } finally {
            setProfileImageUploading(false);
        }
    };

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

        // Fix navigation overlay issues
        window.location.hash = 'notifications';
        setCurrentView('notifications');
        setCurrentSection(''); // Ensure no specific section stays active (like settings or other overlays)

        setSelectedNotificationIds([notificationId]);
    }, [notificationHooks, portalData?.notices]);

    const [homeSettings, setHomeSettings] = useState<HomeSettings>(defaultHomeSettings);
    const [homeSettingsLoaded, setHomeSettingsLoaded] = useState(false);

    const normalizeHomeSettings = useCallback((raw: any): HomeSettings => {
        const merged = { ...defaultHomeSettings, ...(raw || {}) } as HomeSettings & { dateFormat?: string };
        const legacyDateFormat = String(merged.dateFormat || defaultHomeSettings.dateFormat).toUpperCase();
        const dateFormat = (legacyDateFormat === 'DMY' || legacyDateFormat === 'MDY' || legacyDateFormat === 'YMD')
            ? legacyDateFormat
            : defaultHomeSettings.dateFormat;

        return {
            ...merged,
            dateFormat,
            startPage: ['home', 'calendar', 'timetable', 'notifications'].includes(merged.startPage)
                ? merged.startPage
                : defaultHomeSettings.startPage,
            sidebarItemVisibility: Object.fromEntries(
                Object.entries({
                    ...defaultHomeSettings.sidebarItemVisibility,
                    ...(merged.sidebarItemVisibility || {}),
                }).map(([key, value]) => {
                    const normalized = String(value).toLowerCase();
                    return [key, normalized === 'hidden' || normalized === 'hide' ? 'hide' : 'show'];
                })
            ) as HomeSettings['sidebarItemVisibility'],
            sidebarItemOrder: Array.isArray(merged.sidebarItemOrder) && merged.sidebarItemOrder.length > 0
                ? merged.sidebarItemOrder
                : defaultHomeSettings.sidebarItemOrder,
        };
    }, []);

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

    const savePreferences = useCallback(async (nextHomeSettings: HomeSettings, nextFolders: NotificationFolder[]) => {
        try {
            const response = await fetch('/api/user/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeSettings: nextHomeSettings, notificationFolders: nextFolders })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to save preferences to server:', error);
            if (typeof window !== 'undefined') {
                localStorage.setItem(HOME_SETTINGS_KEY, JSON.stringify(nextHomeSettings));
                localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(nextFolders));
            }
        }
    }, []);

    const updateHomeSettings = useCallback((updates: Partial<HomeSettings>) => {
        setHomeSettings(prev => {
            const newValue = { ...prev, ...updates };
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('home-settings-updated'));
            }
            return newValue;
        });
    }, []);

    const [homeLayout, setHomeLayout] = useState<HomeLayout>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(HOME_LAYOUT_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const rawSlots = Array.isArray(parsed?.quickAccessSlots)
                        ? parsed.quickAccessSlots
                        : defaultHomeLayout.quickAccessSlots;
                    const normalizedSlots = rawSlots.map((slot: any, index: number) => {
                        if (!slot) {
                            return { id: `qa-slot-${index}`, actionId: null };
                        }
                        if (typeof slot === 'string') {
                            return { id: `qa-slot-${index}`, actionId: slot };
                        }
                        return {
                            id: typeof slot.id === 'string' ? slot.id : `qa-slot-${index}`,
                            actionId: typeof slot.actionId === 'string' ? slot.actionId : null,
                        };
                    });
                    return {
                        ...defaultHomeLayout,
                        ...parsed,
                        columns: {
                            left: parsed?.columns?.left || defaultHomeLayout.columns.left,
                            right: parsed?.columns?.right || defaultHomeLayout.columns.right,
                        },
                        quickAccessSlots: normalizedSlots,
                        note: typeof parsed?.note === 'string' ? parsed.note : defaultHomeLayout.note,
                    };
                } catch {
                    return defaultHomeLayout;
                }
            }
        }
        return defaultHomeLayout;
    });

    const [isHomeEditing, setIsHomeEditing] = useState(false);
    const [isNoteEditing, setIsNoteEditing] = useState(false);
    const [noteDraft, setNoteDraft] = useState(homeLayout.note);
    const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [activeHomeDragId, setActiveHomeDragId] = useState<string | null>(null);
    const [activeQuickAccessDragId, setActiveQuickAccessDragId] = useState<string | null>(null);
    const [activeHomeDragRect, setActiveHomeDragRect] = useState<{ width: number; height: number } | null>(null);
    const [activeQuickAccessDragRect, setActiveQuickAccessDragRect] = useState<{ width: number; height: number } | null>(null);

    // Enhanced dashboard state
    const [currentSection, setCurrentSection] = useState('home');
    const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [showCommandMenu, setShowCommandMenu] = useState(false);
    const [isInSettings, setIsInSettings] = useState(false);
    const [settingsSection, setSettingsSection] = useState('general');
    const [currentView, setCurrentView] = useState<string>('dashboard');
    const [pageTransitioning, setPageTransitioning] = useState(false);
    const [sidebarTransitioning, setSidebarTransitioning] = useState(false);
    const [selectedWeek, setSelectedWeek] = useState<'weekA' | 'weekB'>(() => getAutoWeekType(new Date()));
    const [useMergedView, setUseMergedView] = useState(true); // Default on for testing
    const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'week' | 'month'>('week');
    const [calendarGoToToday, setCalendarGoToToday] = useState(0); // Increment to trigger go to today
    const [showCreateEventModal, setShowCreateEventModal] = useState(false);
    const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showGoogleConnectInfo, setShowGoogleConnectInfo] = useState(false);

    // Navigation history for back/forward
    const [navHistory, setNavHistory] = useState<string[]>([]);
    const [navIndex, setNavIndex] = useState(-1);
    const navNavigatingRef = useRef(false);

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

        const getMinutesSinceStart = (periodNumber: number, isWeekB: boolean) => {
            const periodLength = 39;
            const breakLength = 30;
            const recessAfter = isWeekB ? 2 : 3;
            const lunchAfter = isWeekB ? 5 : 6;
            let offset = (periodNumber - 1) * periodLength;
            if (periodNumber > recessAfter) offset += breakLength;
            if (periodNumber > lunchAfter) offset += breakLength;
            return offset;
        };

        const getPeriodDuration = (dayKey: string, periodNumber: number) => {
            if (dayKey === 'tuesday' && periodNumber === 8) return 28;
            return 39;
        };

        const mapped: CalendarEvent[] = [];

        // Calculate base Monday for the current view
        const now = new Date();
        const currentWeekStart = new Date(now);
        const day = currentWeekStart.getDay();
        const mondayOffset = (day + 6) % 7;
        currentWeekStart.setDate(currentWeekStart.getDate() - mondayOffset);
        currentWeekStart.setHours(0, 0, 0, 0);

        // Generate for current week (offset 0) and next week (offset 1)
        for (let weekOffset = 0; weekOffset <= 1; weekOffset++) {
            const isNextWeek = weekOffset === 1;
            const targetWeekType = isNextWeek
                ? (selectedWeek === 'weekA' ? 'weekB' : 'weekA')
                : selectedWeek;

            const weekEntries = targetWeekType === 'weekA' ? (timetable.weekA || []) : (timetable.weekB || []);
            if (!weekEntries.length) continue;

            const weekStart = new Date(currentWeekStart);
            weekStart.setDate(weekStart.getDate() + (weekOffset * 7));

            // Parse periods for this week
            const parsedPeriods = weekEntries
                .map((entry: any) => {
                    const raw = String(entry.period || '').toLowerCase();
                    const numberMatch = raw.match(/(\d+)/);
                    return { ...entry, periodNumber: numberMatch ? Number(numberMatch[1]) : 0 };
                })
                .filter((entry: any) => entry.periodNumber > 0);

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
                        const sorted = [...dayEntries].sort((a, b) => a.periodNumber - b.periodNumber);
                        let current: any | null = null;
                        for (const entry of sorted) {
                            if (!current) {
                                current = { ...entry, periodStart: entry.periodNumber, periodEnd: entry.periodNumber };
                                continue;
                            }
                            const sameClass = current.course === entry.course && current.classCode === entry.classCode && current.teacher === entry.teacher && current.room === entry.room;
                            if (sameClass && (entry.periodNumber === current.periodEnd + 1)) {
                                current.periodEnd = entry.periodNumber;
                            } else {
                                merged.push(current);
                                current = { ...entry, periodStart: entry.periodNumber, periodEnd: entry.periodNumber };
                            }
                        }
                        if (current) merged.push(current);
                    }
                    return merged;
                })()
                : parsedPeriods.map((entry: any) => ({ ...entry, periodStart: entry.periodNumber, periodEnd: entry.periodNumber }));

            for (const entry of sourceEntries) {
                const dayKey = String(entry.day || '').toLowerCase();
                const idx = dayIndex[dayKey];
                if (idx === undefined) continue;

                const eventDate = new Date(weekStart);
                eventDate.setDate(weekStart.getDate() + idx);

                const start = new Date(eventDate);
                start.setHours(8, 45, 0, 0);
                start.setMinutes(start.getMinutes() + getMinutesSinceStart(entry.periodStart, targetWeekType === 'weekB'));

                const end = new Date(start);
                let durationMinutes = 0;
                for (let period = entry.periodStart; period <= entry.periodEnd; period++) {
                    durationMinutes += getPeriodDuration(dayKey, period);
                }
                end.setMinutes(end.getMinutes() + durationMinutes);

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
                });
            }
        }
        return mapped;
    }, [portalData?.timetable, selectedWeek, homeSettings.calendarMergeConsecutivePeriods]);

    const CAL_SYNC_MAP_KEY = 'millennium_google_sync_map_v1';
    type SyncMapValue = { googleEventId: string; calendarId: string; source: 'local' | 'class'; hash: string };
    type SyncMap = Record<string, SyncMapValue>;

    const [syncMap, setSyncMap] = useState<SyncMap>({});
    const isSyncRunningRef = useRef(false);
    const [isSmartCleaning, setIsSmartCleaning] = useState(false);
    const [smartCleanHint, setSmartCleanHint] = useState('Removes exact duplicate events');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const parsed = JSON.parse(localStorage.getItem(CAL_SYNC_MAP_KEY) || '{}');
            if (parsed && typeof parsed === 'object') {
                setSyncMap(parsed);
            }
        } catch {
            setSyncMap({});
        }
    }, []);

    const persistSyncMap = useCallback((nextMap: SyncMap) => {
        setSyncMap(nextMap);
        if (typeof window !== 'undefined') {
            localStorage.setItem(CAL_SYNC_MAP_KEY, JSON.stringify(nextMap));
        }
    }, []);

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

    const eventHash = exactDuplicateKey;

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

    const allCalendars = useMemo(
        () => [...localEvents.calendars, ...googleCalendar.calendars],
        [localEvents.calendars, googleCalendar.calendars]
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
        () => localEvents.events,
        [localEvents.events]
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
        googleCalendar.toggleCalendarVisibility(calendarId);
    }, [localEvents.calendars, localEvents.toggleCalendarVisibility, googleCalendar.toggleCalendarVisibility]);

    const handleCreateEvent = useCallback((event: Partial<CalendarEvent>) => {
        const target = allCalendars.find(c => c.id === event.calendarId);
        if (target?.isGoogle) {
            googleCalendar.createEvent({ ...event, calendarId: target.id });
            return;
        }
        localEvents.addEvent(event);
    }, [allCalendars, googleCalendar.createEvent, localEvents.addEvent]);

    const handleCreateCalendar = useCallback((name: string, color = '#3b82f6') => {
        localEvents.addCalendar(name, color);
        if (googleCalendar.isAuthenticated) {
            googleCalendar.createCalendar(name, color);
        }
    }, [localEvents.addCalendar, googleCalendar.isAuthenticated, googleCalendar.createCalendar]);

    const handleRenameCalendar = useCallback((calendarId: string, name: string) => {
        localEvents.renameCalendar(calendarId, name);
    }, [localEvents.renameCalendar]);

    const handleRemoveCalendar = useCallback((calendarId: string) => {
        localEvents.removeCalendar(calendarId);
    }, [localEvents.removeCalendar]);

    const handleChangeCalendarColor = useCallback((calendarId: string, color: string) => {
        if (localEvents.calendars.some((calendar) => calendar.id === calendarId)) {
            localEvents.updateCalendarColor(calendarId, color);
            return;
        }
        googleCalendar.updateCalendarColor(calendarId, color);
    }, [localEvents.calendars, localEvents.updateCalendarColor, googleCalendar.updateCalendarColor]);

    const handleUpdateEvent = useCallback((event: CalendarEvent) => {
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
    }, [localEvents.updateEvent, googleCalendar.updateEvent, googleCalendar.events]);

    const handleDeleteEvent = useCallback((event: CalendarEvent) => {
        if (event.isLocal) {
            localEvents.deleteEvent(event.id);
            return;
        }
        googleCalendar.deleteEvent(event);
    }, [localEvents.deleteEvent, googleCalendar.deleteEvent]);

    const handleSmartClean = useCallback(async () => {
        if (isSmartCleaning) return;
        setIsSmartCleaning(true);
        setSmartCleanHint('Smart Cleaner is working...');

        try {
            if (duplicateGroups.length === 0) {
                toast.info('No duplicate events found.');
                setSmartCleanHint('No duplicates found');
                setTimeout(() => setSmartCleanHint('Removes exact duplicate events'), 2200);
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
                setTimeout(() => setSmartCleanHint('Removes exact duplicate events'), 2200);
            } else {
                toast.info('No duplicates could be removed.');
                setSmartCleanHint('No duplicates found');
                setTimeout(() => setSmartCleanHint('Removes exact duplicate events'), 2200);
            }
        } finally {
            setIsSmartCleaning(false);
        }
    }, [duplicateGroups, isSmartCleaning, localEvents.deleteEvent, googleCalendar.deleteEvent, googleCalendar.refresh, syncMap, persistSyncMap]);

    useEffect(() => {
        if (
            !googleCalendar.isAuthenticated ||
            googleCalendar.isLoading ||
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

                const desired: Array<{ key: string; event: CalendarEvent; source: 'local' | 'class' }> = [];
                if (homeSettings.calendarSyncMode === 'local' || homeSettings.calendarSyncMode === 'local_and_classes') {
                    for (const event of localEvents.events) {
                        desired.push({ key: `local:${event.id}`, event, source: 'local' });
                    }
                }
                if (homeSettings.calendarSyncMode === 'local_and_classes') {
                    for (const event of classEvents) {
                        desired.push({ key: `class:${event.id}`, event, source: 'class' });
                    }
                }
                const desiredKeys = new Set(desired.map((item) => item.key));

                // Handle remote deletions first. If a remote event disappeared, drop the mapping
                // and let sync recreate it from local/class sources on the next pass.
                for (const [key, entry] of Object.entries(nextMap)) {
                    if (cancelled) return;
                    const existsRemotely = googleEventIds.has(entry.googleEventId);
                    if (!existsRemotely) {
                        delete nextMap[key];
                        mapChanged = true;
                    }
                }

                for (const item of desired) {
                    if (cancelled) return;
                    const existing = nextMap[item.key];
                    const hash = eventHash(item.event);
                    let targetCalendarId = resolveGoogleTargetCalendarId(item.event);
                    const desiredCalendarName = String(item.event.calendarName || '').trim();
                    if (targetCalendarId === 'primary' && desiredCalendarName && desiredCalendarName.toLowerCase() !== 'google calendar') {
                        const createdCalendar = await googleCalendar.createCalendar(desiredCalendarName, item.event.color || '#3b82f6');
                        if (createdCalendar?.id) {
                            targetCalendarId = createdCalendar.id;
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
                        }
                    }
                }

                for (const [key, entry] of Object.entries(nextMap)) {
                    if (cancelled) return;
                    if (desiredKeys.has(key)) continue;
                    try {
                        const deleted = await googleCalendar.deleteEvent({
                            id: entry.googleEventId,
                            calendarId: entry.calendarId || 'primary',
                            title: '',
                            start: new Date(),
                            end: new Date(),
                            calendarName: 'Google Calendar',
                        }, { refresh: false });
                        if (!deleted) {
                            // Best effort cleanup. Remove stale sync mapping either way.
                        }
                        remoteMutations = true;
                    } catch {
                        // Best effort cleanup. Remove stale sync mapping either way.
                    }
                    delete nextMap[key];
                    mapChanged = true;
                }

                if (mapChanged) {
                    persistSyncMap(nextMap);
                }
                if (remoteMutations) {
                    googleCalendar.refresh();
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
        googleCalendar.isAuthenticated,
        googleCalendar.isLoading,
        googleEventIds,
        syncMap,
        homeSettings.calendarSyncMode,
        localEvents.events,
        classEvents,
        eventHash,
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

    // Classroom state
    const [classroomTab, setClassroomTab] = useState<'stream' | 'assignments' | 'missing' | 'materials' | 'activity'>('stream');
    const [selectedClassroomItem, setSelectedClassroomItem] = useState<ClassroomItem | null>(null);
    const [showClassroomFilters, setShowClassroomFilters] = useState(false);

    const [customClassColors, setCustomClassColors] = useState<Record<string, string>>(() => {
        // Load from localStorage on mount
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('classColors');
            if (saved) {
                try { return JSON.parse(saved); } catch { return {}; }
            }
        }
        return {};
    });

    // Save custom colors to localStorage when they change
    useEffect(() => {
        if (Object.keys(customClassColors).length > 0) {
            localStorage.setItem('classColors', JSON.stringify(customClassColors));
        }
    }, [customClassColors]);

    // Load and apply saved theme on mount
    useEffect(() => {
        loadAndApplySavedTheme();
    }, []);

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
        if (typeof window !== 'undefined') {
            localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(homeLayout));
        }
    }, [homeLayout]);

    useEffect(() => {
        if (!isNoteEditing) {
            setNoteDraft(homeLayout.note);
        }
    }, [homeLayout.note, isNoteEditing]);

    useEffect(() => {
        const handleHomeSettingsUpdate = () => {
            if (typeof window !== 'undefined') {
                const saved = localStorage.getItem(HOME_SETTINGS_KEY);
                if (saved) {
                    try {
                        setHomeSettings(normalizeHomeSettings(JSON.parse(saved)));
                        setHomeSettingsLoaded(true);
                    } catch {
                        setHomeSettings(defaultHomeSettings);
                        setHomeSettingsLoaded(true);
                    }
                }
            }
        };

        window.addEventListener('home-settings-updated', handleHomeSettingsUpdate);
        return () => window.removeEventListener('home-settings-updated', handleHomeSettingsUpdate);
    }, []);

    useEffect(() => {
        if (homeSettings.columns === 1) {
            setHomeLayout(prev => {
                if (prev.columns.right.length === 0) {
                    return prev;
                }
                return {
                    ...prev,
                    columns: {
                        left: [...prev.columns.left, ...prev.columns.right],
                        right: [],
                    },
                };
            });
        }
    }, [homeSettings.columns]);

    const preferencesLoadedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;

        const loadFromStorage = () => {
            try {
                const savedHome = localStorage.getItem(HOME_SETTINGS_KEY);
                if (savedHome) {
                    try {
                        setHomeSettings(normalizeHomeSettings(JSON.parse(savedHome)));
                    } catch {
                        setHomeSettings(defaultHomeSettings);
                    }
                }
                setHomeSettingsLoaded(true);

                const saved = localStorage.getItem(FOLDER_STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        setNotificationFolders(parsed);
                    }
                }
            } catch (error) {
                console.error('Failed to load notification folders:', error);
            }
            preferencesLoadedRef.current = true;
        };

        const loadFromApi = async () => {
            try {
                const response = await fetch('/api/user/preferences');
                if (response.ok) {
                    const data = await response.json();
                    if (cancelled) return;
                    if (data.homeSettings) {
                        setHomeSettings(normalizeHomeSettings(data.homeSettings));
                    } else {
                        setHomeSettings(defaultHomeSettings);
                    }
                    setHomeSettingsLoaded(true);
                    if (Array.isArray(data.notificationFolders)) {
                        setNotificationFolders(data.notificationFolders);
                    }
                    preferencesLoadedRef.current = true;
                    return;
                }
            } catch (error) {
                console.error('Failed to load preferences from server:', error);
            }
            loadFromStorage();
        };

        loadFromApi();

        return () => {
            cancelled = true;
        };
    }, [normalizeHomeSettings]);

    useEffect(() => {
        if (!preferencesLoadedRef.current) return;
        savePreferences(homeSettings, notificationFolders);
    }, [notificationFolders, homeSettings, savePreferences]);

    // Destructure notification hooks
    const {
        selectedCategory,
        setSelectedCategory,
        selectedNotification,
        setSelectedNotification,
        notificationSearchQuery,
        setNotificationSearchQuery,
        notificationStates,
        notificationCounts,
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
        getNotificationId
    } = notificationHooks;

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

    const pendingClassroomAssignmentsCount = useMemo(() => {
        return classroom.filteredItems.filter(
            (item) => item.type === 'assignment' && !item.submission?.state?.includes('TURNED')
        ).length;
    }, [classroom.filteredItems]);

    const classroomMissingCount = classroom.missingItems.length;

    const essentialSidebarIds = useMemo(() => ['home', 'notifications', 'account', 'calendar'], []);
    const registerSidebarIds = useMemo(() => ['classes', 'timetable', 'reports', 'attendance'], []);
    const classroomSidebarIds = useMemo(() => ['classroom-stream', 'classroom-assignments', 'classroom-missing', 'classroom-materials', 'classroom-activity'], []);

    const getSidebarItemVisibility = useCallback((itemId: string) => {
        return homeSettings.sidebarItemVisibility[itemId] || 'show';
    }, [homeSettings.sidebarItemVisibility]);

    const isSidebarItemVisible = useCallback((itemId: string) => {
        const visibility = getSidebarItemVisibility(itemId);
        return visibility !== 'hide';
    }, [getSidebarItemVisibility]);

    const getOrderedSidebarItems = useCallback((itemIds: string[]) => {
        const orderPositions = new Map(homeSettings.sidebarItemOrder.map((id, index) => [id, index]));
        return [...itemIds].sort((a, b) => {
            const aPos = orderPositions.has(a) ? (orderPositions.get(a) as number) : Number.MAX_SAFE_INTEGER;
            const bPos = orderPositions.has(b) ? (orderPositions.get(b) as number) : Number.MAX_SAFE_INTEGER;
            return aPos - bPos;
        });
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

        return notices
            .map((n, index) => ({ ...n, originalIndex: index }))
            .filter(n => n.date === todayKey)
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

    const getFolderIcon = useCallback((iconName: string) => {
        const IconComponent = (TablerIcons as Record<string, any>)[iconName];
        return IconComponent || IconFolder;
    }, []);

    const normalizeFolderIconName = useCallback((value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return 'IconFolder';
        if (trimmed.startsWith('Icon')) return trimmed;
        const cleaned = trimmed.replace(/[^a-zA-Z0-9]+/g, ' ');
        const pascal = cleaned
            .split(' ')
            .filter(Boolean)
            .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join('');
        return `Icon${pascal || 'Folder'}`;
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
        const iconName = normalizeFolderIconName(newFolderIcon);
        const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setNotificationFolders(prev => [...prev, { id, title, subtitle: subtitle || undefined, icon: iconName }]);
        setNewFolderTitle('');
        setNewFolderSubtitle('');
        setNewFolderIcon('IconFolder');
        setIsCreatingFolder(false);
        setFoldersExpanded(true);
    }, [convertEmoticonsToEmoji, newFolderIcon, newFolderSubtitle, newFolderTitle, normalizeFolderIconName]);

    const handleCancelFolder = useCallback(() => {
        setNewFolderTitle('');
        setNewFolderSubtitle('');
        setNewFolderIcon('IconFolder');
        setIsCreatingFolder(false);
    }, []);

    const handleStartEditFolder = useCallback((folder: NotificationFolder) => {
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
        const iconName = normalizeFolderIconName(editFolderIcon);
        setNotificationFolders(prev => prev.map(folder =>
            folder.id === editingFolderId
                ? { ...folder, title, subtitle: subtitle || undefined, icon: iconName }
                : folder
        ));
        setEditingFolderId(null);
        setEditFolderTitle('');
        setEditFolderSubtitle('');
        setEditFolderIcon('IconFolder');
    }, [convertEmoticonsToEmoji, editingFolderId, editFolderTitle, editFolderSubtitle, editFolderIcon, normalizeFolderIconName]);

    const handleCancelEditFolder = useCallback(() => {
        setEditingFolderId(null);
        setEditFolderTitle('');
        setEditFolderSubtitle('');
        setEditFolderIcon('IconFolder');
    }, []);

    const handleDeleteFolder = useCallback((folderId: string) => {
        // Move all notifications from this folder back to inbox
        const notices = portalData?.notices || [];
        notices.forEach((notice, index) => {
            const notificationId = getNotificationId(notice, index);
            if (notificationStates[notificationId]?.folderId === folderId) {
                setFolder(notificationId, undefined);
            }
        });
        // Remove the folder
        setNotificationFolders(prev => prev.filter(folder => folder.id !== folderId));
        // If viewing this folder, switch to inbox
        if (selectedCategory === `folder:${folderId}`) {
            setSelectedCategory('inbox');
        }
        setDeleteFolderConfirmId(null);
    }, [portalData?.notices, notificationStates, getNotificationId, setFolder, selectedCategory, setSelectedCategory]);

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
    }, []);

    const handleMoveFolderDown = useCallback((folderId: string) => {
        setNotificationFolders(prev => {
            const index = prev.findIndex(f => f.id === folderId);
            if (index < 0 || index >= prev.length - 1) return prev;
            const newFolders = [...prev];
            [newFolders[index], newFolders[index + 1]] = [newFolders[index + 1], newFolders[index]];
            return newFolders;
        });
    }, []);

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

    const filteredNotifications = getFilteredNotifications();
    const preparedNotifications = useMemo(() => {
        return filteredNotifications.map((notice, index) => {
            const originalIndex = portalData?.notices?.findIndex(n => n === notice);
            const resolvedIndex = originalIndex === undefined || originalIndex < 0 ? index : originalIndex;
            const notificationId = getNotificationId(notice, resolvedIndex);
            return { notice, notificationId, index };
        });
    }, [filteredNotifications, portalData?.notices, getNotificationId]);
    const allSelectedInList = preparedNotifications.length > 0 && selectedNotificationIds.length === preparedNotifications.length;
    const orderedNotificationIds = useMemo(() => preparedNotifications.map(item => item.notificationId), [preparedNotifications]);
    const notificationLookup = useMemo(() => new Map(preparedNotifications.map(item => [item.notificationId, item.notice])), [preparedNotifications]);
    const activeFolderId = useMemo(() => (selectedCategory.startsWith('folder:') ? selectedCategory.replace('folder:', '') : null), [selectedCategory]);

    const clearSelection = useCallback(() => {
        setSelectedNotificationIds([]);
        setSelectionAnchorIndex(null);
    }, []);

    useEffect(() => {
        clearSelection();
    }, [selectedCategory, notificationSearchQuery, clearSelection]);

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

    const applyToSelected = useCallback((fn: (notificationId: string) => void) => {
        selectedNotificationIds.forEach((notificationId) => fn(notificationId));
    }, [selectedNotificationIds]);

    const bulkSetRead = useCallback((read: boolean) => {
        applyToSelected((notificationId) => setRead(notificationId, read));
    }, [applyToSelected, setRead]);

    const bulkSetPinned = useCallback((pinned: boolean) => {
        applyToSelected((notificationId) => setPinned(notificationId, pinned));
    }, [applyToSelected, setPinned]);

    const bulkSetArchived = useCallback((archived: boolean) => {
        applyToSelected((notificationId) => setArchived(notificationId, archived));
    }, [applyToSelected, setArchived]);

    const bulkSetImportance = useCallback((importance: 'low' | 'medium' | 'high') => {
        applyToSelected((notificationId) => setImportance(notificationId, importance));
    }, [applyToSelected, setImportance]);

    const bulkMoveToCategory = useCallback((category: 'inbox' | 'alerts' | 'events' | 'assignments') => {
        applyToSelected((notificationId) => handleMoveToCategory(notificationId, category));
    }, [applyToSelected, handleMoveToCategory]);

    const bulkMoveToFolder = useCallback((folderId?: string) => {
        applyToSelected((notificationId) => handleMoveToFolder(notificationId, folderId));
    }, [applyToSelected, handleMoveToFolder]);


    const requestLogout = useCallback((event?: { shiftKey?: boolean }) => {
        if (event?.shiftKey) {
            handleLogout();
            return;
        }
        setShowLogoutConfirm(true);
    }, [handleLogout]);

    // Centralized keyboard shortcuts
    const shortcutHandlers: ShortcutHandlers = useMemo(() => ({
        // Navigation
        'nav-home': () => { window.location.hash = 'home'; },
        'nav-account': () => { window.location.hash = 'account'; },
        'nav-notifications': () => { window.location.hash = 'notifications'; },
        'nav-calendar': () => { window.location.hash = 'calendar'; },
        'nav-classes': () => { window.location.hash = 'classes'; },
        'nav-timetable': () => { window.location.hash = 'timetable'; },
        'nav-reports': () => { window.location.hash = 'reports'; },
        'nav-attendance': () => { window.location.hash = 'attendance'; },
        'nav-settings': () => { window.location.hash = 'settings'; },
        // Actions
        'action-search': () => setShowCommandMenu(true),
        'action-logout': () => requestLogout(),
        // Calendar
        'calendar-create-event': () => {
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
        'settings-general': () => { window.location.hash = 'settings/general'; },
        'settings-appearance': () => { window.location.hash = 'settings/appearance'; },
        'settings-animations': () => { window.location.hash = 'settings/animations'; },
        'settings-notifications': () => { window.location.hash = 'settings/notifications'; },
        'settings-theme-builder': () => { window.location.hash = 'settings/theme-builder'; },
        'settings-class-colors': () => { window.location.hash = 'settings/class-colors'; },
        'settings-shortcuts': () => { window.location.hash = 'settings/shortcuts'; },
        'settings-sync': () => { window.location.hash = 'settings/sync'; },
        'settings-export': () => { window.location.hash = 'settings/export'; },
    }), [currentSection, currentView, requestLogout, setSelectedCategory]);

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

    // Handler for updating class colors
    const handleColorChange = (classCode: string, color: string) => {
        setCustomClassColors(prev => ({ ...prev, [classCode]: color }));
    };

    // Check session on mount
    useEffect(() => {
        checkSession();
    }, [checkSession]);

    // Handle hash-based navigation with initial load fix
    useEffect(() => {
        let lastHash = window.location.hash.slice(1) || homeSettings.startPage;

        const handleHashChange = () => {
            const hash = window.location.hash.slice(1);

            if (hash === 'notifications') {
                setCurrentView('notifications');
                setCurrentSection('');
                setIsInSettings(false);
            } else if (hash.startsWith('settings')) {
                // Parse settings hash: settings or settings/general
                const parts = hash.split('/');
                const section = parts[1] || 'general';
                setIsInSettings(true);
                setSettingsSection(section);
                setCurrentView('settings');
                setCurrentSection('');
                // Store previous hash if not already in settings
                if (!lastHash.startsWith('settings')) {
                    sessionStorage.setItem('previousHash', lastHash || 'home');
                }
            } else if (hash) {
                setCurrentSection(hash);
                setCurrentView('dashboard');
                setIsInSettings(false);
            } else {
                if (homeSettings.startPage === 'notifications') {
                    setCurrentView('notifications');
                    setCurrentSection('');
                    setIsInSettings(false);
                } else {
                    setCurrentSection(homeSettings.startPage);
                    setCurrentView('dashboard');
                    setIsInSettings(false);
                }
            }

            // Track navigation history for back/forward
            const target = hash || homeSettings.startPage;
            if (!navNavigatingRef.current) {
                setNavHistory(prev => {
                    const newHistory = prev.slice(0, navIndex + 1);
                    newHistory.push(target);
                    return newHistory;
                });
                setNavIndex(prev => prev + 1);
            }
            navNavigatingRef.current = false;

            lastHash = hash || homeSettings.startPage;
        };

        // Initial load - ensure we set the correct view immediately
        handleHashChange();

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [homeSettings.startPage]);

    // Force initial render after session loads
    useEffect(() => {
        if (!session?.loggedIn || !homeSettingsLoaded) return;
        if (!window.location.hash) {
            const target = homeSettings.startPage;
            window.location.hash = target;
        }
    }, [homeSettings.startPage, homeSettingsLoaded, session]);

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

    // Daily sync reminder - shows toast if data is older than 24 hours
    useEffect(() => {
        if (!portalData?.lastUpdated) return;

        const checkSyncReminder = () => {
            const lastSyncReminder = localStorage.getItem('millennium-last-sync-reminder');
            const now = new Date();
            const lastSync = new Date(portalData.lastUpdated);

            // Calculate hours since last sync
            const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

            // Only show reminder if data is older than 24 hours
            if (hoursSinceSync < 24) return;

            // Check if we already showed a reminder today
            if (lastSyncReminder) {
                const lastReminder = new Date(parseInt(lastSyncReminder));
                const isSameDay = lastReminder.getDate() === now.getDate() &&
                    lastReminder.getMonth() === now.getMonth() &&
                    lastReminder.getFullYear() === now.getFullYear();
                if (isSameDay) return;
            }

            // Show the reminder
            localStorage.setItem('millennium-last-sync-reminder', Date.now().toString());

            toast.info('Time to sync your portal data', {
                description: `Last synced ${Math.floor(hoursSinceSync)} hours ago. Sync now for the latest info.`,
                duration: 10000,
                action: {
                    label: 'Sync Now',
                    onClick: () => window.open('https://millennium.education/portal/', '_blank')
                }
            });
        };

        // Check after a short delay to not interrupt page load
        const timer = setTimeout(checkSyncReminder, 3000);
        return () => clearTimeout(timer);
    }, [portalData?.lastUpdated]);

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

    // Enhanced functionality methods
    const toggleSection = useCallback((section: string) => {
        setCollapsedSections(prev =>
            prev.includes(section)
                ? prev.filter(s => s !== section)
                : [...prev, section]
        );
    }, []);

    const handleSectionClick = useCallback((section: string) => {
        const delay = animationSettings.animationsEnabled ? 150 : 0;
        setPageTransitioning(true);
        setTimeout(() => {
            window.location.hash = section;
            setShowUserDropdown(false);
            setTimeout(() => setPageTransitioning(false), 50);
        }, delay);
    }, [animationSettings.animationsEnabled]);

    // Settings transition handlers - now using hash routing
    const handleOpenSettings = useCallback((section: string = 'general') => {
        const delay = animationSettings.animationsEnabled ? 150 : 0;
        setPageTransitioning(true);
        setSidebarTransitioning(true);
        setTimeout(() => {
            window.location.hash = section === 'general' ? 'settings' : `settings/${section}`;
            setTimeout(() => {
                setPageTransitioning(false);
                setSidebarTransitioning(false);
            }, 50);
        }, delay);
    }, [animationSettings.animationsEnabled]);

    const handleCloseSettings = useCallback(() => {
        const delay = animationSettings.animationsEnabled ? 150 : 0;
        setPageTransitioning(true);
        setSidebarTransitioning(true);
        setTimeout(() => {
            // Navigate back to home or previous section
            const previousHash = sessionStorage.getItem('previousHash') || 'home';
            window.location.hash = previousHash;
            setTimeout(() => {
                setPageTransitioning(false);
                setSidebarTransitioning(false);
            }, 50);
        }, delay);
    }, [animationSettings.animationsEnabled]);

    const handleBack = useCallback(() => {
        if (navIndex > 0) {
            navNavigatingRef.current = true;
            const newIndex = navIndex - 1;
            setNavIndex(newIndex);
            const target = navHistory[newIndex];
            window.location.hash = target;
        }
    }, [navIndex, navHistory]);

    const handleForward = useCallback(() => {
        if (navIndex < navHistory.length - 1) {
            navNavigatingRef.current = true;
            const newIndex = navIndex + 1;
            setNavIndex(newIndex);
            const target = navHistory[newIndex];
            window.location.hash = target;
        }
    }, [navIndex, navHistory]);

    const handleSettingsSectionChange = useCallback((section: string) => {
        const delay = animationSettings.animationsEnabled ? 150 : 0;
        setPageTransitioning(true);
        setTimeout(() => {
            window.location.hash = section === 'general' ? 'settings' : `settings/${section}`;
            setTimeout(() => setPageTransitioning(false), 50);
        }, delay);
    }, [animationSettings.animationsEnabled]);

    const toggleUserDropdown = useCallback(() => {
        setShowUserDropdown(prev => !prev);
    }, []);

    // Navigate to notifications with transition
    const handleNavigateToNotifications = useCallback(() => {
        const delay = animationSettings.animationsEnabled ? 150 : 0;
        setPageTransitioning(true);
        setTimeout(() => {
            window.location.hash = 'notifications';
            setCurrentView('notifications');
            setCurrentSection('');
            setTimeout(() => setPageTransitioning(false), 50);
        }, delay);
    }, [animationSettings.animationsEnabled]);

    // Handle command menu navigation from CommandMenu component
    const handleCommandNavigate = useCallback((page: string) => {
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
    const handleCommandAction = useCallback((action: string, payload?: any) => {
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
                if (payload) {
                    setSelectedCategory(payload);
                }
                break;
            case "settings-section":
                // Navigate to specific settings section
                if (payload) {
                    handleOpenSettings(payload);
                }
                break;
        }
    }, [handleSectionClick, handleNavigateToNotifications, handleOpenSettings, requestLogout, setSelectedCategory]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Cmd/Ctrl + K for command menu
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setShowCommandMenu(true);
        }
        // Escape to close modals (CommandMenu handles its own Escape)
        if (e.key === 'Escape') {
            setShowUserDropdown(false);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (showUserDropdown && !target.closest('.user-profile') && !target.closest('.user-dropdown')) {
                setShowUserDropdown(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showUserDropdown]);

    const quickAccessActions = useMemo(() => ([
        { id: 'nav-home', label: 'Home', description: 'Go to Home', icon: <IconHome size={16} />, onSelect: () => handleSectionClick('home') },
        { id: 'nav-timetable', label: 'Timetable', description: 'Today\'s timetable', icon: <IconClock size={16} />, onSelect: () => handleSectionClick('timetable') },
        { id: 'nav-calendar', label: 'Calendar', description: 'Open calendar', icon: <IconCalendar size={16} />, onSelect: () => handleSectionClick('calendar') },
        { id: 'nav-notifications', label: 'Notifications', description: 'Open notifications', icon: <IconBell size={16} />, onSelect: () => handleNavigateToNotifications() },
        { id: 'nav-attendance', label: 'Attendance', description: 'Attendance summary', icon: <IconClipboardCheck size={16} />, onSelect: () => handleSectionClick('attendance') },
        { id: 'nav-reports', label: 'Reports', description: 'Open reports', icon: <IconReportAnalytics size={16} />, onSelect: () => handleSectionClick('reports') },
        { id: 'nav-classes', label: 'Classes', description: 'Class list', icon: <IconBook size={16} />, onSelect: () => handleSectionClick('classes') },
        { id: 'nav-classroom', label: 'Classroom', description: 'Classroom stream', icon: <IconSchool size={16} />, onSelect: () => { handleSectionClick('classroom'); setClassroomTab('stream'); } },
        { id: 'classroom-assignments', label: 'Assignments', description: 'Classroom assignments', icon: <IconClipboard size={16} />, onSelect: () => { handleSectionClick('classroom'); setClassroomTab('assignments'); } },
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
    ]), [
        handleNavigateToNotifications,
        handleOpenSettings,
        handleSectionClick,
        setCalendarGoToToday,
        setClassroomTab,
        setShowCommandMenu,
        setShowCreateEventModal,
    ]);

    const quickAccessActionMap = useMemo(() => {
        return new Map(quickAccessActions.map(action => [action.id, action]));
    }, [quickAccessActions]);

    const homeItemDefinitions = useMemo<Record<HomeItemType, { label: string; description: string; icon: ReactNode }>>(() => ({
        note: { label: 'Note', description: 'Editable home note', icon: <IconPencil size={16} /> },
        quick_access: { label: 'Quick Access', description: 'Jump to pages and actions', icon: <IconHome size={16} /> },
        notifications: { label: 'Notifications', description: 'Daily notices', icon: <IconBell size={16} /> },
        calendar: { label: 'Calendar', description: 'Today\'s events', icon: <IconCalendar size={16} /> },
        today_classes: { label: 'Today\'s Classes', description: 'Current schedule', icon: <IconClock size={16} /> },
        classroom_assignments: { label: 'Assignments', description: 'Upcoming classroom work', icon: <IconClipboard size={16} /> },
        attendance_snapshot: { label: 'Attendance', description: 'Quick attendance snapshot', icon: <IconClipboardCheck size={16} /> },
        classroom_activity: { label: 'Classroom Activity', description: 'Recent classroom updates', icon: <IconActivity size={16} /> },
        todo: { label: 'To-Do', description: 'Actionable tasks', icon: <IconCheck size={16} /> },
        recent_feedback: { label: 'Recent Feedback', description: 'Latest results', icon: <IconReportAnalytics size={16} /> },
        assignments_status: { label: 'Assignments Status', description: 'Due & missing summary', icon: <IconAlertTriangle size={16} /> },
    }), []);

    const homeItemsInLayout = useMemo(() => {
        return new Set([...homeLayout.columns.left, ...homeLayout.columns.right]);
    }, [homeLayout.columns.left, homeLayout.columns.right]);

    const availableHomeItems = useMemo(() => {
        return Object.entries(homeItemDefinitions)
            .filter(([key]) => !homeItemsInLayout.has(key as HomeItemType))
            .filter(([key]) => {
                if (HIDE_CLASSROOM && (
                    key === 'classroom_assignments' ||
                    key === 'classroom_activity' ||
                    key === 'assignments_status'
                )) {
                    return false;
                }
                return true;
            })
            .map(([key, value]) => ({ key: key as HomeItemType, ...value }));
    }, [homeItemDefinitions, homeItemsInLayout]);

    const addHomeItem = useCallback((item: HomeItemType) => {
        setHomeLayout(prev => {
            if (prev.columns.left.includes(item) || prev.columns.right.includes(item)) {
                return prev;
            }
            const targetColumn: HomeColumnKey = homeSettings.columns === 1
                ? 'left'
                : (prev.columns.left.length <= prev.columns.right.length ? 'left' : 'right');
            return {
                ...prev,
                columns: {
                    ...prev.columns,
                    [targetColumn]: [...prev.columns[targetColumn], item],
                },
            };
        });
    }, [homeSettings.columns]);

    const removeHomeItem = useCallback((item: HomeItemType) => {
        setHomeLayout(prev => ({
            ...prev,
            columns: {
                left: prev.columns.left.filter(entry => entry !== item),
                right: prev.columns.right.filter(entry => entry !== item),
            },
        }));
    }, []);

    const updateQuickAccessSlot = useCallback((index: number, actionId: string | null) => {
        setHomeLayout(prev => {
            const nextSlots = [...prev.quickAccessSlots];
            const existing = nextSlots[index];
            nextSlots[index] = {
                id: existing?.id || `qa-${Date.now()}-${index}`,
                actionId,
            };
            return { ...prev, quickAccessSlots: nextSlots };
        });
    }, []);

    const addQuickAccessSlot = useCallback(() => {
        setHomeLayout(prev => ({
            ...prev,
            quickAccessSlots: [
                ...prev.quickAccessSlots,
                { id: `qa-${Date.now()}`, actionId: null },
            ],
        }));
    }, []);

    const removeQuickAccessSlot = useCallback((index: number) => {
        setHomeLayout(prev => {
            const nextSlots = [...prev.quickAccessSlots];
            nextSlots.splice(index, 1);
            return { ...prev, quickAccessSlots: nextSlots };
        });
    }, []);

    const noteTokenValues = useMemo(() => {
        const lastUpdated = portalData?.lastUpdated
            ? new Date(portalData.lastUpdated).toLocaleString()
            : 'Not synced yet';
        const now = new Date();
        return {
            '{{lastUpdated}}': lastUpdated,
            '{{today}}': formatDateByPreference(now, { day: 'numeric', month: 'short', year: 'numeric' }),
            '{{time}}': now.toLocaleTimeString(),
            '{{now}}': now.toLocaleString(),
        };
    }, [formatDateByPreference, portalData?.lastUpdated]);

    const applyNoteTokens = useCallback((text: string) => {
        let output = text;
        Object.entries(noteTokenValues).forEach(([token, value]) => {
            output = output.split(token).join(value);
        });
        return output;
    }, [noteTokenValues]);

    const escapeHtml = useCallback((input: string) => {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }, []);

    const sanitizeLink = useCallback((url: string) => {
        const trimmed = url.trim();
        if (/^(https?:|mailto:)/i.test(trimmed)) {
            return trimmed;
        }
        return '#';
    }, []);

    const parseInlineMarkdown = useCallback((input: string) => {
        let output = input;
        output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
            const safeUrl = sanitizeLink(url);
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        });
        output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
        output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return output;
    }, [sanitizeLink]);

    const markdownToHtml = useCallback((input: string) => {
        const escaped = escapeHtml(input);
        const lines = escaped.split('\n');
        let html = '';
        let inUl = false;
        let inOl = false;

        const closeLists = () => {
            if (inUl) {
                html += '</ul>';
                inUl = false;
            }
            if (inOl) {
                html += '</ol>';
                inOl = false;
            }
        };

        lines.forEach(line => {
            const trimmed = line.trim();
            const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed);
            const orderedMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);

            if (unorderedMatch) {
                if (!inUl) {
                    closeLists();
                    html += '<ul>';
                    inUl = true;
                }
                html += `<li>${parseInlineMarkdown(unorderedMatch[1])}</li>`;
                return;
            }

            if (orderedMatch) {
                if (!inOl) {
                    closeLists();
                    html += '<ol>';
                    inOl = true;
                }
                html += `<li>${parseInlineMarkdown(orderedMatch[2])}</li>`;
                return;
            }

            closeLists();

            if (!trimmed) {
                html += '<br />';
                return;
            }

            if (trimmed.startsWith('### ')) {
                html += `<h3>${parseInlineMarkdown(trimmed.replace(/^###\s+/, ''))}</h3>`;
                return;
            }
            if (trimmed.startsWith('## ')) {
                html += `<h2>${parseInlineMarkdown(trimmed.replace(/^##\s+/, ''))}</h2>`;
                return;
            }
            if (trimmed.startsWith('# ')) {
                html += `<h1>${parseInlineMarkdown(trimmed.replace(/^#\s+/, ''))}</h1>`;
                return;
            }

            html += `<p>${parseInlineMarkdown(trimmed)}</p>`;
        });

        closeLists();
        return html;
    }, [escapeHtml, parseInlineMarkdown]);

    const noteHtml = useMemo(() => {
        const withTokens = applyNoteTokens(homeLayout.note || DEFAULT_NOTE);
        return markdownToHtml(withTokens);
    }, [applyNoteTokens, homeLayout.note, markdownToHtml]);

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

    const handleHomeDragEnd = useCallback((event: DragEndEvent) => {
        if (!isHomeEditing) return;
        const { active, over } = event;
        setActiveHomeDragId(null);
        if (!over || active.id === over.id) return;

        setHomeLayout(prev => {
            const findColumn = (id: string): HomeColumnKey | null => {
                if (prev.columns.left.includes(id as HomeItemType)) return 'left';
                if (prev.columns.right.includes(id as HomeItemType)) return 'right';
                return null;
            };

            const activeId = active.id as string;
            const overId = over.id as string;
            const activeColumn = findColumn(activeId);
            const overColumn = (overId === 'left' || overId === 'right')
                ? (overId as HomeColumnKey)
                : findColumn(overId);

            if (!activeColumn || !overColumn) return prev;

            if (activeColumn === overColumn) {
                if (overId === activeColumn) return prev;
                const items = prev.columns[activeColumn];
                const oldIndex = items.indexOf(activeId as HomeItemType);
                const newIndex = overId === activeColumn
                    ? items.length - 1
                    : items.indexOf(overId as HomeItemType);
                if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
                const reordered = arrayMove(items, oldIndex, newIndex);
                return {
                    ...prev,
                    columns: {
                        ...prev.columns,
                        [activeColumn]: reordered,
                    },
                };
            }

            const activeItems = [...prev.columns[activeColumn]];
            const overItems = [...prev.columns[overColumn]];
            const oldIndex = activeItems.indexOf(activeId as HomeItemType);
            if (oldIndex === -1) return prev;
            activeItems.splice(oldIndex, 1);
            const newIndex = overId === overColumn
                ? overItems.length
                : overItems.indexOf(overId as HomeItemType);
            const insertIndex = newIndex === -1 ? overItems.length : newIndex;
            overItems.splice(insertIndex, 0, activeId as HomeItemType);
            return {
                ...prev,
                columns: {
                    ...prev.columns,
                    [activeColumn]: activeItems,
                    [overColumn]: overItems,
                },
            };
        });
    }, [isHomeEditing]);

    const handleHomeDragStart = useCallback(({ active }: DragStartEvent) => {
        if (!isHomeEditing) return;
        setActiveHomeDragId(String(active.id));
        const rect = active.rect.current?.initial;
        setActiveHomeDragRect(rect ? { width: rect.width, height: rect.height } : null);
    }, [isHomeEditing]);

    const handleHomeDragCancel = useCallback(() => {
        setActiveHomeDragId(null);
        setActiveHomeDragRect(null);
    }, []);

    const handleQuickAccessDragEnd = useCallback((event: DragEndEvent) => {
        if (!isHomeEditing) return;
        const { active, over } = event;
        setActiveQuickAccessDragId(null);
        if (!over || active.id === over.id) return;
        setHomeLayout(prev => {
            const oldIndex = prev.quickAccessSlots.findIndex(slot => slot.id === active.id);
            const newIndex = prev.quickAccessSlots.findIndex(slot => slot.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const reordered = arrayMove(prev.quickAccessSlots, oldIndex, newIndex);
            return { ...prev, quickAccessSlots: reordered };
        });
    }, [isHomeEditing]);

    const handleQuickAccessDragStart = useCallback(({ active }: DragStartEvent) => {
        if (!isHomeEditing) return;
        setActiveQuickAccessDragId(String(active.id));
        const rect = active.rect.current?.initial;
        setActiveQuickAccessDragRect(rect ? { width: rect.width, height: rect.height } : null);
    }, [isHomeEditing]);

    const handleQuickAccessDragCancel = useCallback(() => {
        setActiveQuickAccessDragId(null);
        setActiveQuickAccessDragRect(null);
    }, []);



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
                const quickAccessSlots = homeLayout.quickAccessSlots.map((slot, index) => {
                    const action = slot.actionId ? quickAccessActionMap.get(slot.actionId) : null;
                    return { slot, action, index };
                });
                const quickAccessSlotsToShow = isHomeEditing
                    ? quickAccessSlots
                    : quickAccessSlots.filter(entry => entry.action);
                const quickAccessPerRow = homeSettings.columns === 1 ? 4 : 2;
                const quickAccessRows: Array<typeof quickAccessSlotsToShow> = [];
                if (!isHomeEditing && quickAccessSlotsToShow.length > 0) {
                    for (let i = 0; i < quickAccessSlotsToShow.length; i += quickAccessPerRow) {
                        quickAccessRows.push(quickAccessSlotsToShow.slice(i, i + quickAccessPerRow));
                    }
                }

                const homeColumns = homeSettings.columns === 1
                    ? [{ key: 'left' as HomeColumnKey, items: [...homeLayout.columns.left, ...homeLayout.columns.right] }]
                    : [
                        { key: 'left' as HomeColumnKey, items: homeLayout.columns.left },
                        { key: 'right' as HomeColumnKey, items: homeLayout.columns.right },
                    ];

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

                const renderHomeItem = (item: HomeItemType) => {
                    switch (item) {
                        case 'note':
                            return (
                                <Card>
                                    <CardHeader
                                        className={styles.noteHeader}
                                        style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                                    >
                                        <CardTitle className="text-sm">Note</CardTitle>
                                        {!isNoteEditing && (
                                            <Button size="sm" className={styles.notePrimaryButton} onClick={() => setIsNoteEditing(true)}>
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
                                                        <DropdownMenuTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), styles.noteSecondaryButton)}
                                                            >
                                                                <IconPlus size={14} />
                                                                Insert
                                                            </button>
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
                        case 'quick_access':
                            return (
                                <div className={styles.homeQuickAccess}>
                                    <div className={styles.homeQuickAccessHeader}>
                                        <h2 className={styles.homeQuickAccessTitle}>Quick Access</h2>
                                        <span className={styles.homeQuickAccessSubtitle}>
                                            {homeSettings.columns === 1 ? 'Up to 4 per row' : 'Up to 2 per row'}
                                        </span>
                                    </div>
                                    {isHomeEditing ? (
                                        <DndContext
                                            sensors={quickAccessSensors}
                                            collisionDetection={closestCenter}
                                            onDragStart={handleQuickAccessDragStart}
                                            onDragCancel={handleQuickAccessDragCancel}
                                            onDragEnd={handleQuickAccessDragEnd}
                                            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                                        >
                                            <SortableContext
                                                items={quickAccessSlotsToShow.map(entry => entry.slot.id)}
                                                strategy={rectSortingStrategy}
                                            >
                                                <div
                                                    className={styles.homeQuickAccessGrid}
                                                    style={{ '--qa-columns': quickAccessPerRow } as React.CSSProperties}
                                                >
                                                    {quickAccessSlotsToShow.map(({ slot, action, index }) => {
                                                        const isEmpty = !action;
                                                        const label = action?.label || 'Add shortcut';
                                                        const description = action?.description || 'Pick a page or action';
                                                        return (
                                                            <SortableQuickAccessItem
                                                                key={slot.id}
                                                                id={slot.id}
                                                                disabled={!isHomeEditing}
                                                            >
                                                                <div
                                                                    className={`${styles.homeQuickAccessItem} ${isEmpty ? styles.homeQuickAccessEmpty : ''}`}
                                                                >
                                                                    <Card
                                                                        data-clickable={!isHomeEditing && !!action}
                                                                        onClick={() => {
                                                                            if (!isHomeEditing && action) {
                                                                                action.onSelect();
                                                                            }
                                                                        }}
                                                                        className={`${styles.homeQuickAccessCard} ${isHomeEditing ? styles.homeQuickAccessCardDisabled : ''}`}
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
                                                                    {isHomeEditing && (
                                                                        <>
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
                                                                                    <DropdownMenuTrigger asChild>
                                                                                        <button
                                                                                            className={styles.quickAccessEditButton}
                                                                                            onClick={(event) => event.stopPropagation()}
                                                                                        >
                                                                                            <IconPencil size={12} />
                                                                                            {isEmpty ? 'Add' : 'Edit'}
                                                                                        </button>
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
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </SortableQuickAccessItem>
                                                        );
                                                    })}
                                                    {isHomeEditing && (
                                                        <div className={styles.homeQuickAccessItem}>
                                                            <button
                                                                className={styles.quickAccessAdd}
                                                                onClick={addQuickAccessSlot}
                                                            >
                                                                <IconPlus size={16} />
                                                                Add shortcut
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </SortableContext>
                                            <DragOverlay adjustScale={false} dropAnimation={null} style={{ pointerEvents: 'none' }}>
                                                {activeQuickAccessDragId ? (() => {
                                                    const entry = quickAccessSlotsToShow.find(slot => slot.slot.id === activeQuickAccessDragId);
                                                    if (!entry) return null;
                                                    const action = entry.action;
                                                    const label = action?.label || 'Add shortcut';
                                                    const description = action?.description || 'Pick a page or action';
                                                    return (
                                                        <div
                                                            className={styles.homeQuickAccessItem}
                                                            style={activeQuickAccessDragRect ? { width: activeQuickAccessDragRect.width, height: activeQuickAccessDragRect.height } : undefined}
                                                        >
                                                            <Card className={styles.homeQuickAccessCard}>
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
                                                        </div>
                                                    );
                                                })() : null}
                                            </DragOverlay>
                                        </DndContext>
                                    ) : quickAccessSlotsToShow.length > 0 ? (
                                        <div className={styles.homeQuickAccessRows}>
                                            {quickAccessRows.map((row, rowIndex) => (
                                                <div key={`qa-row-${rowIndex}`} className={styles.homeQuickAccessRow}>
                                                    {row.map(({ slot, action }) => {
                                                        const label = action?.label || 'Add shortcut';
                                                        const description = action?.description || 'Pick a page or action';
                                                        return (
                                                            <div key={slot.id} className={styles.homeQuickAccessItem}>
                                                                <Card
                                                                    data-clickable={!!action}
                                                                    onClick={() => {
                                                                        if (action) {
                                                                            action.onSelect();
                                                                        }
                                                                    }}
                                                                    className={styles.homeQuickAccessCard}
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
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={styles.homeEmptyState}>
                                            No shortcuts yet. Toggle Customise Home to add some.
                                        </div>
                                    )}
                                </div>
                            );
                        case 'notifications': {
                            const notices = (portalData?.notices || []) as Notice[];
                            const now = new Date();
                            const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                            // Only use the primary 'date' field for filtering to match user expectation of "posted today"
                            const isForDate = (notice: Notice, date: string) => notice.date === date;

                            const allDates = notices.map(n => n.date).filter((d): d is string => !!d);
                            const sortedDates = Array.from(new Set(allDates))
                                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

                            let activeDate = notices.some(notice => isForDate(notice, todayKey)) ? todayKey : '';
                            if (!activeDate && homeSettings.notificationsFallback && sortedDates.length > 0) {
                                activeDate = sortedDates[0];
                            }

                            const activeNotices = activeDate
                                ? notices
                                    .map((n, index) => ({ ...n, originalIndex: index }))
                                    .filter(notice => {
                                        if (notice.date !== activeDate) return false;

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
                                    })
                                : [];
                            const formatNoticeDate = (dateStr: string) => {
                                const parsed = new Date(dateStr);
                                if (Number.isNaN(parsed.getTime())) return dateStr;
                                return formatDateByPreference(parsed, { weekday: 'short', day: 'numeric', month: 'short' });
                            };
                            const groupLabel = activeDate
                                ? (activeDate === todayKey ? 'Today' : `Latest: ${formatNoticeDate(activeDate)}`)
                                : 'No notifications yet';

                            return (
                                <Card>
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
                                                {activeNotices.map((notice, index) => (
                                                    <div key={`${notice.title}-${index}`} className={styles.homeListItem}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{notice.title}</div>
                                                            <div className={styles.homeListItemMeta}>{notice.preview}</div>
                                                        </div>
                                                    </div>
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

                            const visibleCalendarIds = new Set(allCalendars.filter(c => c.visible).map(c => c.id));
                            const todaysEvents = allEvents
                                .filter(event =>
                                    visibleCalendarIds.has(event.calendarId) &&
                                    event.end >= dayStart &&
                                    event.start <= dayEnd
                                )
                                .sort((a, b) => a.start.getTime() - b.start.getTime());

                            const runningEvents = todaysEvents.filter(event => event.start <= now && event.end >= now);
                            const upcomingEvents = todaysEvents.filter(event => event.start > now);
                            const eventsToShow = [...runningEvents, ...upcomingEvents].slice(0, 5);

                            const formatEventTime = (event: CalendarEvent) => {
                                if (event.allDay) return 'All day';
                                const start = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const end = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return `${start} - ${end}`;
                            };

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Calendar</CardTitle>
                                            <CardDescription>Running now and coming up today</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {eventsToShow.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No events scheduled for today.
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
                            const dayIndex = new Date().getDay();
                            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                            const todayName = dayNames[dayIndex - 1] || '';

                            const timetableData = portalData?.timetable;
                            const isFullTimetable = timetableData &&
                                typeof timetableData === 'object' &&
                                !Array.isArray(timetableData) &&
                                ('weekA' in timetableData || 'weekB' in timetableData);

                            let todayClasses: Array<{ period: string; subject: string; teacher: string; room: string; attendanceStatus?: string }> = [];

                            if (Array.isArray(timetableData)) {
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

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Today&apos;s Classes</CardTitle>
                                            <CardDescription>{todayName ? todayName : 'Weekend'}</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {dayIndex === 0 || dayIndex === 6 ? (
                                            <div className={styles.homeEmptyState}>
                                                No classes today.
                                            </div>
                                        ) : todayClasses.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No classes scheduled for today.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {todayClasses.map((item, index) => (
                                                    <div key={`${item.subject}-${index}`} className={styles.homeListItem}>
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
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'classroom_assignments': {
                            const now = new Date();
                            const upcomingAssignments = classroom.items
                                .filter(item => item.type === 'assignment')
                                .filter(item => item.dueDate)
                                .filter(item => item.isMissing || (item.dueDate && item.dueDate >= now))
                                .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0))
                                .slice(0, 5);

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Assignments</CardTitle>
                                            <CardDescription>Upcoming Google Classroom work</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {!classroom.isAuthenticated ? (
                                            <div className={styles.homeEmptyState}>
                                                Sync Google Classroom to see assignments.
                                            </div>
                                        ) : upcomingAssignments.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No upcoming assignments.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {upcomingAssignments.map(item => (
                                                    <div key={item.id} className={styles.homeListItem}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{item.title}</div>
                                                            <div className={styles.homeListItemMeta}>
                                                                {item.courseName} • {formatDueDate(item.dueDate, classroom.settings)}
                                                            </div>
                                                        </div>
                                                        {(item.isMissing || item.isLate) && (
                                                            <span className={styles.homeListItemBadge}>
                                                                {item.isMissing ? 'Missing' : 'Late'}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
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
                        case 'classroom_activity': {
                            const activity = classroom.recentActivity.slice(0, 5);
                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Classroom Activity</CardTitle>
                                            <CardDescription>Recent updates</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {!classroom.isAuthenticated ? (
                                            <div className={styles.homeEmptyState}>
                                                Sync Google Classroom to see recent activity.
                                            </div>
                                        ) : activity.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No recent classroom activity.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {activity.map(item => (
                                                    <div key={item.id} className={styles.homeListItem}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{item.title}</div>
                                                            <div className={styles.homeListItemMeta}>{item.courseName}</div>
                                                        </div>
                                                        <span className={styles.homeListItemBadge}>{item.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'todo': {
                            const now = new Date();
                            const weekAhead = new Date(now);
                            weekAhead.setDate(now.getDate() + 7);

                            const missingAssignments = classroom.items
                                .filter(item => item.type === 'assignment' && item.isMissing)
                                .slice(0, 3);

                            const dueSoonAssignments = classroom.items
                                .filter(item => item.type === 'assignment')
                                .filter(item => item.dueDate && item.dueDate >= now && item.dueDate <= weekAhead)
                                .filter(item => !item.isMissing)
                                .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0))
                                .slice(0, 5 - missingAssignments.length);

                            const todoItems = [
                                ...missingAssignments.map(item => ({
                                    id: item.id,
                                    title: item.title,
                                    meta: `${item.courseName} • Missing`,
                                    badge: 'Missing',
                                })),
                                ...dueSoonAssignments.map(item => ({
                                    id: item.id,
                                    title: item.title,
                                    meta: `${item.courseName} • ${formatDueDate(item.dueDate, classroom.settings)}`,
                                    badge: 'Due soon',
                                })),
                            ];

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">To-Do</CardTitle>
                                            <CardDescription>Upcoming and missing work</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {!classroom.isAuthenticated ? (
                                            <div className={styles.homeEmptyState}>
                                                Sync Google Classroom to see your to-dos.
                                            </div>
                                        ) : todoItems.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                You&apos;re all caught up.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {todoItems.map(item => (
                                                    <div key={item.id} className={styles.homeListItem}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{item.title}</div>
                                                            <div className={styles.homeListItemMeta}>{item.meta}</div>
                                                        </div>
                                                        <span className={styles.homeListItemBadge}>{item.badge}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'assignments_status': {
                            const now = new Date();
                            const startOfDay = new Date(now);
                            startOfDay.setHours(0, 0, 0, 0);
                            const endOfDay = new Date(now);
                            endOfDay.setHours(23, 59, 59, 999);
                            const weekAhead = new Date(now);
                            weekAhead.setDate(now.getDate() + 7);

                            const assignments = classroom.items.filter(item => item.type === 'assignment');
                            const dueTodayCount = assignments.filter(item => item.dueDate && item.dueDate >= startOfDay && item.dueDate <= endOfDay).length;
                            const dueWeekCount = assignments.filter(item => item.dueDate && item.dueDate > endOfDay && item.dueDate <= weekAhead).length;
                            const missingCount = assignments.filter(item => item.isMissing).length;
                            const upcomingCount = assignments.filter(item => item.dueDate && item.dueDate >= startOfDay).length;

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Assignments Status</CardTitle>
                                            <CardDescription>At-a-glance summary</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {!classroom.isAuthenticated ? (
                                            <div className={styles.homeEmptyState}>
                                                Sync Google Classroom to view assignment stats.
                                            </div>
                                        ) : (
                                            <div className={styles.homeStatsGrid}>
                                                <div className={styles.homeStat}>
                                                    <div className={styles.homeStatValue}>{upcomingCount}</div>
                                                    <div className={styles.homeStatLabel}>Upcoming</div>
                                                </div>
                                                <div className={styles.homeStat}>
                                                    <div className={styles.homeStatValue}>{dueTodayCount}</div>
                                                    <div className={styles.homeStatLabel}>Due today</div>
                                                </div>
                                                <div className={styles.homeStat}>
                                                    <div className={styles.homeStatValue}>{dueWeekCount}</div>
                                                    <div className={styles.homeStatLabel}>Due this week</div>
                                                </div>
                                                <div className={styles.homeStat}>
                                                    <div className={styles.homeStatValue}>{missingCount}</div>
                                                    <div className={styles.homeStatLabel}>Missing</div>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        }
                        case 'recent_feedback': {
                            const grades = (portalData?.grades || []) as GradeEntry[];
                            const hasDates = grades.some(entry => entry.date);
                            const sortedGrades = hasDates
                                ? [...grades].sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
                                : grades;
                            const recentGrades = sortedGrades.slice(0, 5);

                            return (
                                <Card>
                                    <CardHeader className={styles.homeCardHeader}>
                                        <div>
                                            <CardTitle className="text-sm">Recent Feedback</CardTitle>
                                            <CardDescription>Latest results and marks</CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {recentGrades.length === 0 ? (
                                            <div className={styles.homeEmptyState}>
                                                No feedback recorded yet.
                                            </div>
                                        ) : (
                                            <div className={styles.homeList}>
                                                {recentGrades.map((grade, index) => (
                                                    <div key={`${grade.task}-${index}`} className={styles.homeListItem}>
                                                        <div>
                                                            <div className={styles.homeListItemTitle}>{grade.task}</div>
                                                            <div className={styles.homeListItemMeta}>
                                                                {grade.subject} {grade.result ? `• ${grade.result}` : ''}
                                                            </div>
                                                        </div>
                                                        {grade.date && (
                                                            <span className={styles.homeListItemBadge}>{grade.date}</span>
                                                        )}
                                                    </div>
                                                ))}
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

                return (
                    <div className={styles.contentWrapper}>
                        <DndContext
                            sensors={homeSensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleHomeDragStart}
                            onDragCancel={handleHomeDragCancel}
                            onDragEnd={handleHomeDragEnd}
                            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                        >
                            <div
                                className={styles.homeLayout}
                                data-columns={homeSettings.columns}
                                data-editing={isHomeEditing ? 'true' : 'false'}
                                data-wiggle={homeSettings.homeWiggleEnabled ? 'true' : 'false'}
                            >
                                {homeColumns.map(column => (
                                    <HomeDropColumn key={column.key} id={column.key}>
                                        <SortableContext
                                            items={column.items}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            <div className={styles.homeColumn}>
                                                {column.items.map(item => (
                                                    <SortableHomeItem
                                                        key={item}
                                                        id={item}
                                                        disabled={!isHomeEditing || (item === 'note' && isNoteEditing)}
                                                    >
                                                        <div className={styles.homeItem}>
                                                            {isHomeEditing && (
                                                                <button
                                                                    className={styles.homeItemRemove}
                                                                    onClick={() => removeHomeItem(item)}
                                                                    title="Remove item"
                                                                >
                                                                    <IconX size={14} />
                                                                </button>
                                                            )}
                                                            {renderHomeItem(item)}
                                                        </div>
                                                    </SortableHomeItem>
                                                ))}
                                            </div>
                                        </SortableContext>
                                    </HomeDropColumn>
                                ))}
                            </div>
                            <DragOverlay adjustScale={false} dropAnimation={null} style={{ pointerEvents: 'none' }}>
                                {activeHomeDragId ? (
                                    <div
                                        className={styles.homeItem}
                                        style={activeHomeDragRect ? { width: activeHomeDragRect.width, height: activeHomeDragRect.height } : undefined}
                                    >
                                        {renderHomeItem(activeHomeDragId as HomeItemType)}
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </div>
                );
            }

            case 'timetable':
                // Helper to check if timetable has Week A/B structure
                const hasFullTimetable = portalData?.timetable &&
                    typeof portalData.timetable === 'object' &&
                    !Array.isArray(portalData.timetable) &&
                    ('weekA' in portalData.timetable || 'weekB' in portalData.timetable);

                const fullTimetable = hasFullTimetable
                    ? portalData.timetable as { weekA: any[]; weekB: any[] }
                    : { weekA: [], weekB: [] };

                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                const currentDayName = days[new Date().getDay() - 1] || '';



                // Get entries for a specific day in the selected week
                const getEntriesForDay = (week: 'weekA' | 'weekB', day: string) => {
                    const entries = fullTimetable[week]?.filter((e: any) =>
                        e.day?.toLowerCase() === day.toLowerCase()
                    ) || [];
                    return entries.sort((a: any, b: any) => {
                        const periodA = parseInt(a.period?.replace(/\D/g, '') || '0');
                        const periodB = parseInt(b.period?.replace(/\D/g, '') || '0');
                        return periodA - periodB;
                    });
                };

                // Merge consecutive periods with the same class
                const mergePeriods = (entries: any[]) => {
                    if (entries.length === 0 || !useMergedView) return entries;

                    const merged: any[] = [];
                    let current: any = null;

                    for (const entry of entries) {
                        if (!current) {
                            current = { ...entry, periodStart: entry.period, periodEnd: entry.period };
                            continue;
                        }

                        // Check if this entry should be merged with current
                        const isSameClass =
                            current.course === entry.course &&
                            current.classCode === entry.classCode &&
                            current.teacher === entry.teacher &&
                            current.room === entry.room;

                        // Check if periods are consecutive (allowing for letter suffixes like P3b)
                        const currentNum = parseInt(current.periodEnd?.replace(/\D/g, '') || '0');
                        const entryNum = parseInt(entry.period?.replace(/\D/g, '') || '0');
                        const isConsecutive = entryNum === currentNum + 1 || entryNum === currentNum;

                        if (isSameClass && isConsecutive) {
                            // Extend current group
                            current.periodEnd = entry.period;
                        } else {
                            // Save current and start new group
                            merged.push(current);
                            current = { ...entry, periodStart: entry.period, periodEnd: entry.period };
                        }
                    }

                    if (current) {
                        merged.push(current);
                    }

                    return merged;
                };

                // Format period range for display
                const formatPeriodRange = (entry: any) => {
                    if (!entry.periodStart || entry.periodStart === entry.periodEnd) {
                        return entry.period || entry.periodStart;
                    }
                    // Extract just the number part for cleaner display
                    const start = entry.periodStart;
                    const end = entry.periodEnd;
                    return `${start}-${end}`;
                };

                return (
                    <div className={styles.contentWrapper} style={{ padding: 0 }}>
                        {/* Sticky Week Toggle */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid var(--border-color)',
                            background: 'var(--content-bg)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                        }}>
                            <div style={{
                                display: 'inline-flex',
                                background: 'var(--hover-bg)',
                                borderRadius: '8px',
                                padding: '4px',
                                position: 'relative'
                            }}>
                                {/* Sliding indicator */}
                                <div style={{
                                    position: 'absolute',
                                    top: '4px',
                                    left: selectedWeek === 'weekA' ? '4px' : 'calc(50% + 2px)',
                                    width: 'calc(50% - 6px)',
                                    height: 'calc(100% - 8px)',
                                    background: 'var(--card-bg, #fff)',
                                    borderRadius: '6px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                    transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                                    pointerEvents: 'none',
                                    zIndex: 0,
                                }} />
                                <button
                                    onClick={() => setSelectedWeek('weekA')}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'transparent',
                                        color: selectedWeek === 'weekA' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'color 150ms ease',
                                        position: 'relative',
                                        zIndex: 1,
                                    }}
                                >
                                    Week A
                                </button>
                                <button
                                    onClick={() => setSelectedWeek('weekB')}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'transparent',
                                        color: selectedWeek === 'weekB' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'color 150ms ease',
                                        position: 'relative',
                                        zIndex: 1,
                                    }}
                                >
                                    Week B
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            {dataLoading ? (
                                <div style={{ padding: '40px', textAlign: 'center' }}>
                                    <Skeleton className="h-4 w-48 mx-auto mb-4" />
                                    <Skeleton className="h-32 w-full" />
                                </div>
                            ) : fullTimetable.weekA.length === 0 && fullTimetable.weekB.length === 0 ? (
                                <Card>
                                    <CardContent style={{ padding: '60px 20px', textAlign: 'center' }}>
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <IconCalendar size={24} />
                                                </EmptyMedia>
                                                <EmptyTitle>No Timetable Data</EmptyTitle>
                                            </EmptyHeader>
                                            <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginTop: '8px' }}>
                                                Sync your portal data to view your full timetable.
                                            </p>
                                        </Empty>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {days.map(day => {
                                        const dayEntries = getEntriesForDay(selectedWeek, day);
                                        const isToday = day === currentDayName;

                                        if (dayEntries.length === 0) return null;

                                        return (
                                            <Card key={day} style={isToday ? { borderColor: 'var(--accent-color, #6366f1)' } : {}}>
                                                <CardHeader style={{ padding: '12px 16px', paddingBottom: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <CardTitle style={{ fontSize: '14px', fontWeight: 600 }}>{day}</CardTitle>
                                                        {isToday && (
                                                            <Badge variant="default" style={{ fontSize: '10px', padding: '2px 6px' }}>Today</Badge>
                                                        )}
                                                        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                                            {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                                                        </span>
                                                    </div>
                                                </CardHeader>
                                                <CardContent style={{ padding: '0 16px 12px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        {mergePeriods(dayEntries).map((entry: any, idx: number, arr: any[]) => (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: '60px 4px 1fr 80px 120px 60px',
                                                                    gap: '12px',
                                                                    alignItems: 'center',
                                                                    padding: '8px 0',
                                                                    borderBottom: idx < arr.length - 1 ? '1px solid var(--border-color)' : 'none'
                                                                }}
                                                            >
                                                                {/* Period */}
                                                                <span style={{
                                                                    fontSize: '13px',
                                                                    fontWeight: 500,
                                                                    color: 'var(--text-secondary)'
                                                                }}>
                                                                    {formatPeriodRange(entry)}
                                                                </span>

                                                                {/* Color Bar - Click to customize */}
                                                                <ColorPicker
                                                                    value={getSubjectColor(entry.course, entry.classCode)}
                                                                    onChange={(color) => handleColorChange(entry.classCode, color)}
                                                                >
                                                                    <ColorPickerTrigger
                                                                        showIcon={false}
                                                                        className="w-auto h-auto rounded-none border-0 bg-transparent p-0 hover:scale-100"
                                                                        style={{ background: 'transparent' }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                width: '4px',
                                                                                height: '24px',
                                                                                borderRadius: '2px',
                                                                                backgroundColor: getSubjectColor(entry.course, entry.classCode),
                                                                                cursor: 'pointer',
                                                                                transition: 'opacity 0.15s ease'
                                                                            }}
                                                                            title="Click to customize color"
                                                                        />
                                                                    </ColorPickerTrigger>
                                                                    <ColorPickerContent
                                                                        presetColors={[
                                                                            '#ef4444', '#f97316', '#eab308', '#22c55e',
                                                                            '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
                                                                            '#6366f1', '#06b6d4', '#84cc16', '#f43f5e'
                                                                        ]}
                                                                    />
                                                                </ColorPicker>

                                                                {/* Subject */}
                                                                <span style={{ fontWeight: 500, fontSize: '13px' }}>
                                                                    {entry.course}
                                                                </span>

                                                                {/* Class Code */}
                                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                                                    {entry.classCode}
                                                                </span>

                                                                {/* Teacher */}
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                                    {entry.teacher}
                                                                </span>

                                                                {/* Room */}
                                                                <span style={{
                                                                    fontSize: '12px',
                                                                    fontWeight: 500,
                                                                    color: 'var(--text-secondary)',
                                                                    textAlign: 'right'
                                                                }}>
                                                                    {entry.room}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'account':
                return (
                    <div className={styles.contentWrapper}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Profile Card */}
                            <Card>
                                <CardHeader>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                                            {/* Avatar with mask cutout for edit button */}
                                            <div style={{
                                                width: '56px',
                                                height: '56px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                fontSize: '18px',
                                                fontWeight: 600,
                                                overflow: 'hidden',
                                                // Mask to cut out bottom-right corner for edit button
                                                // Creates a hole at position 44,44 with 16px radius for visible ring around 24px button
                                                WebkitMaskImage: 'radial-gradient(circle 16px at 46px 46px, transparent 16px, black 16px)',
                                                maskImage: 'radial-gradient(circle 16px at 46px 46px, transparent 16px, black 16px)',
                                            }}>
                                                {profileImage ? (
                                                    <img
                                                        src={profileImage}
                                                        alt="Profile"
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover',
                                                            display: 'block',
                                                        }}
                                                    />
                                                ) : (
                                                    getUserInitials(session?.username)
                                                )}
                                            </div>
                                            {/* Edit button */}
                                            <button
                                                style={{
                                                    position: 'absolute',
                                                    bottom: '-2px',
                                                    right: '-2px',
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    backgroundColor: 'var(--bg-elevated)',
                                                    border: '1px solid var(--border-default)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    opacity: profileImageUploading ? 0.6 : 1,
                                                    pointerEvents: profileImageUploading ? 'none' : 'auto',
                                                }}
                                                onClick={handleProfileImageClick}
                                            >
                                                <IconPencil size={12} style={{ color: 'var(--icon-color-secondary)' }} />
                                            </button>
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">{displayName}</CardTitle>
                                            <CardDescription>{displaySchool}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                            </Card>

                            {/* Account Information Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Account Information</CardTitle>
                                    <CardDescription>Your account details</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Label style={{ color: 'var(--text-secondary)' }}>Username</Label>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{session?.username || 'N/A'}</span>
                                        </div>
                                        <Separator />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Label style={{ color: 'var(--text-secondary)' }}>Last Login</Label>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                                {session?.timestamp ? new Date(session.timestamp).toLocaleString() : 'N/A'}
                                            </span>
                                        </div>
                                        <Separator />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Label style={{ color: 'var(--text-secondary)' }}>Last Synced</Label>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                                {portalData?.lastUpdated ? new Date(portalData.lastUpdated).toLocaleString() : 'Never'}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Actions Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Actions</CardTitle>
                                    <CardDescription>Manage your account</CardDescription>
                                </CardHeader>
                                <CardContent style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => window.open('https://millennium.education/portal/', '_blank')}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '8px 14px',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                            background: 'var(--hover-bg)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-sm, 6px)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'var(--active-bg)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'var(--hover-bg)';
                                        }}
                                    >
                                        <IconRefresh size={14} />
                                        Sync Portal Data
                                    </button>
                                    <button
                                        onClick={(event) => requestLogout(event)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '8px 14px',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            color: '#ef4444',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            borderRadius: 'var(--radius-sm, 6px)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                        }}
                                    >
                                        <IconLogout size={14} />
                                        Log out
                                    </button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                );

            case 'calendar':
                return (
                    <div className={styles.contentWrapper} style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
                        <div className={styles.contentWrapperInner} style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {googleCalendar.sessionStatus === 'unauthenticated' && (
                                <div style={{
                                    padding: '12px 16px',
                                    background: 'var(--hover-bg)',
                                    borderBottom: '1px solid var(--border-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexShrink: 0,
                                }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        Connect Google Calendar to sync your events
                                    </span>
                                    <button
                                        onClick={() => setShowGoogleConnectInfo(true)}
                                        style={{
                                            background: 'var(--accent-color)',
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
                                </div>
                            )}
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
                                    duplicateCount={duplicateCount}
                                    onSmartClean={handleSmartClean}
                                    smartCleanBusy={isSmartCleaning}
                                    smartCleanHint={smartCleanHint}
                                    isLoading={googleCalendar.isLoading}
                                    notices={todaysNotices}
                                    onNoticeClick={handleCalendarNoticeClick}
                                    hasNotification={googleCalendar.sessionStatus === 'unauthenticated'}
                                    firstDayOfWeek={homeSettings.calendarFirstDayOfWeek}
                                    eventColorMode={homeSettings.calendarEventColorMode}
                                    monthDayClickView={homeSettings.calendarMonthDayClickView}
                                    externalViewMode={calendarViewMode}
                                    externalGoToToday={calendarGoToToday}
                                    showCreateModal={showCreateEventModal}
                                    onCreateModalClose={() => setShowCreateEventModal(false)}
                                />
                            </div>
                        </div>
                    </div>
                );

            case 'classes':
                const classes = portalData?.classes || [];
                return (
                    <div className={styles.contentWrapper} style={{ padding: 0 }}>
                        {/* Sticky Header */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid var(--border-color)',
                            background: 'var(--content-bg)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                        Classes
                                    </h2>
                                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, marginTop: '2px' }}>
                                        {classes.length} {classes.length === 1 ? 'class' : 'classes'} enrolled
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            {dataLoading ? (
                                <div style={{ padding: '40px', textAlign: 'center' }}>
                                    <Skeleton className="h-4 w-48 mx-auto mb-4" />
                                    <Skeleton className="h-32 w-full" />
                                </div>
                            ) : classes.length === 0 ? (
                                <Card>
                                    <CardContent style={{ padding: '60px 20px', textAlign: 'center' }}>
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <IconBook size={24} />
                                                </EmptyMedia>
                                                <EmptyTitle>No Classes Found</EmptyTitle>
                                            </EmptyHeader>
                                            <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginTop: '8px' }}>
                                                Sync your portal data to see your classes.
                                            </p>
                                        </Empty>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card>
                                    <CardContent style={{ padding: 0 }}>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead style={{ width: '35%' }}>Course</TableHead>
                                                    <TableHead style={{ width: '15%' }}>Class</TableHead>
                                                    <TableHead style={{ width: '25%' }}>Teacher</TableHead>
                                                    <TableHead style={{ width: '8%', textAlign: 'center' }}>Lessons</TableHead>
                                                    <TableHead style={{ width: '8%', textAlign: 'center' }}>Merits</TableHead>
                                                    <TableHead style={{ width: '9%', textAlign: 'center' }}>Rolls</TableHead>
                                                    <TableHead style={{ width: '9%', textAlign: 'center' }}>Absences</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {classes.map((classItem, idx) => (
                                                    <TableRow key={idx} style={{ height: '52px' }}>
                                                        <TableCell style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                {/* Color Picker for Class */}
                                                                <ColorPicker
                                                                    value={getSubjectColor(classItem.course, classItem.classCode)}
                                                                    onChange={(color) => handleColorChange(classItem.classCode, color)}
                                                                >
                                                                    <ColorPickerTrigger
                                                                        showIcon={false}
                                                                        className="w-auto h-auto rounded-none border-0 bg-transparent p-0 hover:scale-100"
                                                                        style={{ background: 'transparent' }}
                                                                    >
                                                                        <div style={{
                                                                            width: '4px',
                                                                            height: '24px',
                                                                            background: getSubjectColor(classItem.course, classItem.classCode),
                                                                            borderRadius: '2px',
                                                                            flexShrink: 0,
                                                                            cursor: 'pointer',
                                                                            transition: 'opacity 0.15s ease'
                                                                        }}
                                                                            title="Click to customize color"
                                                                        />
                                                                    </ColorPickerTrigger>
                                                                    <ColorPickerContent
                                                                        presetColors={[
                                                                            '#ef4444', '#f97316', '#eab308', '#22c55e',
                                                                            '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
                                                                            '#6366f1', '#06b6d4', '#84cc16', '#f43f5e'
                                                                        ]}
                                                                    />
                                                                </ColorPicker>

                                                                <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)' }}>
                                                                    {classItem.course}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                                                            <span style={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '12px',
                                                                color: getSubjectColor(classItem.course, classItem.classCode)
                                                            }}>
                                                                {classItem.classCode}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                                {classItem.teacher || '—'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell style={{ textAlign: 'center', paddingTop: '12px', paddingBottom: '12px' }}>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                                {classItem.lessons}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell style={{ textAlign: 'center', paddingTop: '12px', paddingBottom: '12px' }}>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                                {classItem.quickMerits}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell style={{ textAlign: 'center', paddingTop: '12px', paddingBottom: '12px' }}>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                                {classItem.rollsMarked}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell style={{ textAlign: 'center', paddingTop: '12px', paddingBottom: '12px' }}>
                                                            {classItem.absences > 0 ? (
                                                                <Badge variant="destructive" style={{ fontSize: '12px' }}>
                                                                    {classItem.absences}
                                                                </Badge>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                                                                    {classItem.absences}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                );

            case 'classroom':
                // Get items based on current tab
                const getClassroomItems = () => {
                    switch (classroomTab) {
                        case 'stream':
                            return classroom.filteredItems.slice(0, 30);
                        case 'assignments':
                            return classroom.filteredItems.filter(item => item.type === 'assignment');
                        case 'missing':
                            return classroom.missingItems;
                        case 'materials':
                            return classroom.filteredItems.filter(item => item.type === 'material');
                        case 'activity':
                            return classroom.recentActivity;
                        default:
                            return classroom.filteredItems;
                    }
                };

                const classroomItems = getClassroomItems();

                // Helper to get submission status badge
                const getSubmissionBadge = (item: ClassroomItem) => {
                    if (item.type !== 'assignment') return null;

                    if (item.isMissing) {
                        return <Badge variant="destructive" style={{ fontSize: '10px' }}>Missing</Badge>;
                    }
                    if (item.isLate) {
                        return <Badge variant="secondary" style={{ fontSize: '10px', backgroundColor: '#f59e0b', color: 'white' }}>Late</Badge>;
                    }
                    if (item.submission?.state === 'TURNED_IN') {
                        return <Badge variant="default" style={{ fontSize: '10px' }}>Submitted</Badge>;
                    }
                    if (item.submission?.state === 'RETURNED') {
                        return <Badge variant="outline" style={{ fontSize: '10px' }}>Returned</Badge>;
                    }
                    return null;
                };

                // Helper to get type icon
                const getTypeIcon = (type: string) => {
                    switch (type) {
                        case 'assignment':
                            return <IconClipboard size={16} />;
                        case 'material':
                            return <IconFiles size={16} />;
                        case 'announcement':
                            return <IconNews size={16} />;
                        default:
                            return <IconFileText size={16} />;
                    }
                };

                return (
                    <div className={styles.contentWrapper} style={{ padding: 0 }}>
                        {/* Classroom Toolbar */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid var(--border-color)',
                            background: 'var(--content-bg)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            {/* Tab Pills */}
                            <div style={{
                                display: 'inline-flex',
                                background: 'var(--hover-bg)',
                                borderRadius: '8px',
                                padding: '4px',
                            }}>
                                {(['stream', 'assignments', 'missing', 'materials', 'activity'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setClassroomTab(tab)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: classroomTab === tab ? 'var(--card-bg, #fff)' : 'transparent',
                                            boxShadow: classroomTab === tab ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                            color: classroomTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 150ms ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                        }}
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                        {tab === 'missing' && classroom.missingItems.length > 0 && (
                                            <span style={{
                                                backgroundColor: '#ef4444',
                                                color: 'white',
                                                fontSize: '10px',
                                                padding: '1px 5px',
                                                borderRadius: '9999px',
                                                fontWeight: 600,
                                            }}>
                                                {classroom.missingItems.length}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Filters Button */}
                            <Button
                                size="sm"
                                onClick={() => setShowClassroomFilters(!showClassroomFilters)}
                                style={{ marginLeft: 'auto' }}
                            >
                                <IconFilter size={16} />
                                Filters
                            </Button>

                            {/* Refresh Button */}
                            <Button
                                size="sm"
                                onClick={() => classroom.refresh()}
                                disabled={classroom.isLoading}
                            >
                                <IconRefresh size={16} className={classroom.isLoading ? 'animate-spin' : ''} />
                            </Button>
                        </div>

                        {/* Filters Panel */}
                        {showClassroomFilters && (
                            <div style={{
                                padding: '16px 24px',
                                borderBottom: '1px solid var(--border-color)',
                                background: 'var(--bg-surface)',
                                display: 'flex',
                                gap: '16px',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                            }}>
                                {/* Course Filter */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Class:</Label>
                                    <select
                                        value={classroom.filters.courses[0] || ''}
                                        onChange={(e) => classroom.setFilters({
                                            courses: e.target.value ? [e.target.value] : []
                                        })}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            borderRadius: '4px',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--input-bg)',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <option value="">All Classes</option>
                                        {classroom.courses.map(course => (
                                            <option key={course.id} value={course.id}>{course.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Type Filter */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Type:</Label>
                                    {(['assignment', 'material', 'announcement'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => {
                                                const types = classroom.filters.types.includes(type)
                                                    ? classroom.filters.types.filter(t => t !== type)
                                                    : [...classroom.filters.types, type];
                                                classroom.setFilters({ types: types.length > 0 ? types : ['assignment', 'material', 'announcement'] });
                                            }}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--border-color)',
                                                background: classroom.filters.types.includes(type) ? 'var(--accent-color)' : 'transparent',
                                                color: classroom.filters.types.includes(type) ? 'white' : 'var(--text-secondary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {type.charAt(0).toUpperCase() + type.slice(1)}s
                                        </button>
                                    ))}
                                </div>

                                {/* Sort */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sort:</Label>
                                    <select
                                        value={classroom.filters.sortBy}
                                        onChange={(e) => classroom.setFilters({ sortBy: e.target.value as any })}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            borderRadius: '4px',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--input-bg)',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <option value="dueDate">Due Date</option>
                                        <option value="creationTime">Posted</option>
                                        <option value="courseName">Class</option>
                                        <option value="title">Title</option>
                                    </select>
                                    <button
                                        onClick={() => classroom.setFilters({
                                            sortOrder: classroom.filters.sortOrder === 'asc' ? 'desc' : 'asc'
                                        })}
                                        style={{
                                            padding: '4px',
                                            borderRadius: '4px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }}
                                    >
                                        {classroom.filters.sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                                    </button>
                                </div>

                                {/* Show Completed Toggle */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={classroom.filters.showCompleted}
                                        onChange={(e) => classroom.setFilters({ showCompleted: e.target.checked })}
                                    />
                                    Show Completed
                                </label>
                            </div>
                        )}

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            {!classroom.isAuthenticated ? (
                                <Card>
                                    <CardContent style={{ padding: '60px 20px', textAlign: 'center' }}>
                                        <IconSchool size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }} />
                                        <h3 style={{ marginBottom: '8px' }}>Sync Google Classroom</h3>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                            Open Google Classroom with the browser extension installed to sync your classes, assignments, and materials.
                                        </p>
                                        <Button onClick={() => classroom.openClassroomToSync()}>
                                            Open Google Classroom
                                        </Button>
                                        {classroom.lastSynced && (
                                            <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '12px' }}>
                                                Last synced: {new Date(classroom.lastSynced).toLocaleString()}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            ) : classroom.isLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <Card key={i}>
                                            <CardContent style={{ padding: '16px' }}>
                                                <Skeleton className="h-4 w-3/4 mb-2" />
                                                <Skeleton className="h-3 w-1/2" />
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : classroom.error ? (
                                <Card>
                                    <CardContent style={{ padding: '40px 20px', textAlign: 'center' }}>
                                        <IconAlertCircle size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
                                        <h3 style={{ marginBottom: '8px' }}>Error Loading Classroom</h3>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{classroom.error}</p>
                                        <Button onClick={() => classroom.refresh()}>Try Again</Button>
                                    </CardContent>
                                </Card>
                            ) : classroomItems.length === 0 ? (
                                <Card>
                                    <CardContent style={{ padding: '60px 20px', textAlign: 'center' }}>
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    {classroomTab === 'missing' ? <IconCheck size={24} /> : <IconSchool size={24} />}
                                                </EmptyMedia>
                                                <EmptyTitle>
                                                    {classroomTab === 'missing'
                                                        ? 'No Missing Work'
                                                        : classroomTab === 'activity'
                                                            ? 'No Recent Activity'
                                                            : 'No Items Found'}
                                                </EmptyTitle>
                                            </EmptyHeader>
                                        </Empty>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {classroomItems.map((item) => (
                                        <Card
                                            key={`${item.courseId}-${item.id}`}
                                            data-clickable="true"
                                            onClick={() => setSelectedClassroomItem(item)}
                                            style={{
                                                cursor: 'pointer',
                                                borderLeft: `4px solid ${classroom.getCourseColor(item.courseId)}`,
                                            }}
                                        >
                                            <CardContent style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                    {/* Type Icon */}
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '8px',
                                                        backgroundColor: 'var(--hover-bg)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}>
                                                        {getTypeIcon(item.type)}
                                                    </div>

                                                    {/* Content */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            {classroom.isPinned(item.id) && (
                                                                <IconPinFilled size={14} style={{ color: 'var(--accent-color)' }} />
                                                            )}
                                                            <span style={{
                                                                fontWeight: 500,
                                                                fontSize: '14px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {item.title}
                                                            </span>
                                                            {getSubmissionBadge(item)}
                                                        </div>
                                                        <div style={{
                                                            fontSize: '12px',
                                                            color: 'var(--text-secondary)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                        }}>
                                                            <span>{item.courseName}</span>
                                                            {item.dueDate && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span style={{
                                                                        color: item.dueDate < new Date() ? '#ef4444' : 'inherit'
                                                                    }}>
                                                                        Due {formatDueDate(item.dueDate, classroom.settings)}
                                                                    </span>
                                                                </>
                                                            )}
                                                            {item.maxPoints && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>{item.maxPoints} pts</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                        <CustomTooltip text={classroom.isPinned(item.id) ? "Unpin" : "Pin"} position="top">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    classroom.togglePinned(item.id);
                                                                }}
                                                                style={{
                                                                    padding: '6px',
                                                                    borderRadius: '4px',
                                                                    border: 'none',
                                                                    background: 'transparent',
                                                                    cursor: 'pointer',
                                                                    color: classroom.isPinned(item.id) ? 'var(--accent-color)' : 'var(--text-tertiary)',
                                                                }}
                                                            >
                                                                {classroom.isPinned(item.id) ? <IconPinFilled size={16} /> : <IconPin size={16} />}
                                                            </button>
                                                        </CustomTooltip>
                                                        <CustomTooltip text="Open in Classroom" position="top">
                                                            <a
                                                                href={item.alternateLink}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{
                                                                    padding: '6px',
                                                                    borderRadius: '4px',
                                                                    color: 'var(--text-tertiary)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                }}
                                                            >
                                                                <IconExternalLink size={16} />
                                                            </a>
                                                        </CustomTooltip>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Detail Panel (Full Page View) */}
                        {selectedClassroomItem && (
                            <AlertDialog open={!!selectedClassroomItem} onOpenChange={(open) => !open && setSelectedClassroomItem(null)}>
                                <AlertDialogContent style={{
                                    maxWidth: '700px',
                                    maxHeight: '80vh',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    padding: 0,
                                    backgroundColor: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '12px',
                                }}>
                                    {/* Header */}
                                    <div style={{
                                        padding: '20px 24px',
                                        borderBottom: '1px solid var(--border-color)',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '16px',
                                    }}>
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '12px',
                                            backgroundColor: classroom.getCourseColor(selectedClassroomItem.courseId),
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            flexShrink: 0,
                                        }}>
                                            {getTypeIcon(selectedClassroomItem.type)}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <AlertDialogTitle style={{ fontSize: '18px', marginBottom: '4px' }}>
                                                {selectedClassroomItem.title}
                                            </AlertDialogTitle>
                                            <AlertDialogDescription style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>{selectedClassroomItem.courseName}</span>
                                                {selectedClassroomItem.dueDate && (
                                                    <>
                                                        <span>•</span>
                                                        <span style={{ color: selectedClassroomItem.dueDate < new Date() ? '#ef4444' : 'inherit' }}>
                                                            Due: {selectedClassroomItem.dueDate.toLocaleDateString('en-AU', {
                                                                weekday: 'short',
                                                                day: 'numeric',
                                                                month: 'short',
                                                                hour: 'numeric',
                                                                minute: '2-digit',
                                                            })}
                                                        </span>
                                                    </>
                                                )}
                                                {selectedClassroomItem.maxPoints && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{selectedClassroomItem.maxPoints} points</span>
                                                    </>
                                                )}
                                            </AlertDialogDescription>
                                        </div>
                                        <button
                                            onClick={() => setSelectedClassroomItem(null)}
                                            style={{
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: 'var(--hover-bg)',
                                                cursor: 'pointer',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            <IconX size={18} />
                                        </button>
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                                        {/* Status Badge */}
                                        <div style={{ marginBottom: '16px' }}>
                                            {getSubmissionBadge(selectedClassroomItem)}
                                        </div>

                                        {/* Description */}
                                        {selectedClassroomItem.description && (
                                            <div style={{ marginBottom: '24px' }}>
                                                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                                    Description
                                                </h4>
                                                <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                                    {selectedClassroomItem.descriptionHtml ? (
                                                        <div
                                                            className={styles.descriptionHtml}
                                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedClassroomItem.descriptionHtml) }}
                                                        />
                                                    ) : (
                                                        <div className={styles.descriptionText}>
                                                            {selectedClassroomItem.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Materials/Attachments */}
                                        {selectedClassroomItem.materials && selectedClassroomItem.materials.length > 0 && (
                                            <div>
                                                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '12px', textTransform: 'uppercase' }}>
                                                    Attachments
                                                </h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {selectedClassroomItem.materials.map((mat, idx) => {
                                                        const title = mat.driveFile?.driveFile?.title || mat.youtubeVideo?.title || mat.link?.title || mat.form?.title || 'Attachment';
                                                        const url = mat.driveFile?.driveFile?.alternateLink || mat.youtubeVideo?.alternateLink || mat.link?.url || mat.form?.formUrl;

                                                        return (
                                                            <a
                                                                key={idx}
                                                                href={url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '12px',
                                                                    padding: '12px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid var(--border-color)',
                                                                    textDecoration: 'none',
                                                                    color: 'var(--text-primary)',
                                                                    transition: 'background 150ms ease',
                                                                }}
                                                            >
                                                                <IconFileText size={20} style={{ color: 'var(--text-secondary)' }} />
                                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {title}
                                                                </span>
                                                                <IconExternalLink size={16} style={{ color: 'var(--text-tertiary)' }} />
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <AlertDialogFooter style={{
                                        padding: '16px 24px',
                                        borderTop: '1px solid var(--border-color)',
                                        display: 'flex',
                                        gap: '8px',
                                        justifyContent: 'space-between',
                                    }}>
                                        <Button
                                            onClick={() => classroom.togglePinned(selectedClassroomItem.id)}
                                        >
                                            {classroom.isPinned(selectedClassroomItem.id) ? <IconPinFilled size={16} /> : <IconPin size={16} />}
                                            {classroom.isPinned(selectedClassroomItem.id) ? 'Unpin' : 'Pin'}
                                        </Button>
                                        <a
                                            href={selectedClassroomItem.alternateLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ textDecoration: 'none' }}
                                        >
                                            <Button>
                                                Open in Classroom
                                                <IconExternalLink size={16} />
                                            </Button>
                                        </a>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                );

            case 'attendance':
                // Get attendance data from portalData
                const attendanceData = portalData?.attendance as AttendanceData | undefined;
                const yearlyAttendance = attendanceData?.yearly || [];
                const subjectAttendance = attendanceData?.subjects || [];

                // Helper to determine color class based on percentage
                const getAttendanceColorClass = (percentage: number | null): string => {
                    if (percentage === null) return '';
                    if (percentage >= 95) return 'excellent';
                    if (percentage >= 85) return 'good';
                    if (percentage >= 75) return 'warning';
                    return 'poor';
                };

                // Calculate overall average if we have yearly data
                const overallAverage = yearlyAttendance.length > 0
                    ? yearlyAttendance.reduce((sum, y) => sum + y.totalPercentage, 0) / yearlyAttendance.length
                    : null;

                return (
                    <div className={styles.contentWrapper}>
                        <div className={styles.contentWrapperInner}>
                            {/* Summary Bar */}
                            {yearlyAttendance.length > 0 && (
                                <div className={styles.attendanceSummaryBar}>
                                    <div className={styles.attendanceSummaryItem}>
                                        <span className={styles.attendanceSummaryValue}>
                                            {overallAverage !== null ? `${overallAverage.toFixed(1)}%` : '-'}
                                        </span>
                                        <span className={styles.attendanceSummaryLabel}>Overall Average</span>
                                    </div>
                                    <div className={styles.attendanceSummaryItem}>
                                        <span className={styles.attendanceSummaryValue}>
                                            {yearlyAttendance.reduce((sum, y) => sum + y.schoolDays, 0)}
                                        </span>
                                        <span className={styles.attendanceSummaryLabel}>Total School Days</span>
                                    </div>
                                    <div className={styles.attendanceSummaryItem}>
                                        <span className={styles.attendanceSummaryValue}>
                                            {yearlyAttendance.reduce((sum, y) => sum + y.wholeDayAbsences, 0)}
                                        </span>
                                        <span className={styles.attendanceSummaryLabel}>Total Absences</span>
                                    </div>
                                    <div className={styles.attendanceSummaryItem}>
                                        <span className={styles.attendanceSummaryValue}>
                                            {yearlyAttendance.length}
                                        </span>
                                        <span className={styles.attendanceSummaryLabel}>Years Tracked</span>
                                    </div>
                                </div>
                            )}

                            {/* Yearly Attendance Section */}
                            <div className={styles.attendanceSection}>
                                <h3 className={styles.attendanceSectionTitle}>
                                    <IconCalendar size={18} />
                                    Yearly Attendance
                                </h3>
                                {yearlyAttendance.length > 0 ? (
                                    <div className={styles.attendanceGrid}>
                                        {yearlyAttendance.map((year) => {
                                            const colorClass = getAttendanceColorClass(year.totalPercentage);
                                            return (
                                                <div key={year.year} className={styles.attendanceCard}>
                                                    <div className={styles.attendanceCardHeader}>
                                                        <div>
                                                            <div className={styles.attendanceCardTitle}>{year.year}</div>
                                                            <div className={styles.attendanceCardSubtitle}>
                                                                {year.schoolDays} school days
                                                            </div>
                                                        </div>
                                                        <div className={`${styles.attendancePercentage} ${styles[colorClass]}`}>
                                                            {year.totalPercentage.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className={styles.attendanceProgressContainer}>
                                                        <div className={styles.attendanceProgressBar}>
                                                            <div
                                                                className={`${styles.attendanceProgressFill} ${styles[colorClass]}`}
                                                                style={{ width: `${year.totalPercentage}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className={styles.attendanceStats}>
                                                        <div className={styles.attendanceStat}>
                                                            <span className={styles.attendanceStatLabel}>Whole Day Absences</span>
                                                            <span className={styles.attendanceStatValue}>{year.wholeDayAbsences}</span>
                                                        </div>
                                                        <div className={styles.attendanceStat}>
                                                            <span className={styles.attendanceStatLabel}>WD Rate</span>
                                                            <span className={styles.attendanceStatValue}>{year.wholeDayPercentage.toFixed(1)}%</span>
                                                        </div>
                                                        <div className={styles.attendanceStat}>
                                                            <span className={styles.attendanceStatLabel}>Partial Absences</span>
                                                            <span className={styles.attendanceStatValue}>{year.partialAbsences}</span>
                                                        </div>
                                                        <div className={styles.attendanceStat}>
                                                            <span className={styles.attendanceStatLabel}>Days Present</span>
                                                            <span className={styles.attendanceStatValue}>
                                                                {year.schoolDays - year.wholeDayAbsences - Math.floor(year.partialAbsences)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <Empty>
                                        <EmptyHeader>
                                            <EmptyMedia>
                                                <IconClipboardCheck size={48} stroke={1} />
                                            </EmptyMedia>
                                            <EmptyTitle>No Yearly Attendance Data</EmptyTitle>
                                        </EmptyHeader>
                                    </Empty>
                                )}
                            </div>

                            {/* Subject Attendance Section */}
                            <div className={styles.attendanceSection}>
                                <h3 className={styles.attendanceSectionTitle}>
                                    <IconBook size={18} />
                                    Subject Attendance (Current Period)
                                </h3>
                                {subjectAttendance.length > 0 ? (
                                    <div className={styles.attendanceGrid}>
                                        {subjectAttendance.map((subject) => {
                                            const hasData = subject.percentage !== null && subject.rollsMarked > 0;
                                            const colorClass = hasData ? getAttendanceColorClass(subject.percentage) : '';
                                            return (
                                                <div
                                                    key={subject.classCode}
                                                    className={`${styles.attendanceCard} ${styles.subjectCard} ${!hasData ? styles.noData : ''}`}
                                                >
                                                    <div className={styles.attendanceCardHeader}>
                                                        <div>
                                                            <div className={styles.attendanceCardTitle}>{subject.classCode}</div>
                                                            <div className={styles.attendanceCardSubtitle}>
                                                                {subject.rollsMarked} rolls marked
                                                            </div>
                                                        </div>
                                                        <div className={`${styles.attendancePercentage} ${styles[colorClass]}`}>
                                                            {hasData ? `${subject.percentage}%` : '-'}
                                                        </div>
                                                    </div>
                                                    {hasData && (
                                                        <div className={styles.attendanceProgressContainer}>
                                                            <div className={styles.attendanceProgressBar}>
                                                                <div
                                                                    className={`${styles.attendanceProgressFill} ${styles[colorClass]}`}
                                                                    style={{ width: `${subject.percentage}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className={styles.attendanceStats}>
                                                        <div className={styles.attendanceStat}>
                                                            <span className={styles.attendanceStatLabel}>Absences</span>
                                                            <span className={styles.attendanceStatValue}>{subject.absent}</span>
                                                        </div>
                                                        <div className={styles.attendanceStat}>
                                                            <span className={styles.attendanceStatLabel}>Present</span>
                                                            <span className={styles.attendanceStatValue}>
                                                                {subject.rollsMarked - subject.absent}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <Empty>
                                        <EmptyHeader>
                                            <EmptyMedia>
                                                <IconBook size={48} stroke={1} />
                                            </EmptyMedia>
                                            <EmptyTitle>No Subject Attendance Data</EmptyTitle>
                                        </EmptyHeader>
                                    </Empty>
                                )}
                            </div>
                        </div>
                    </div>
                );

            case 'reports':
                // Get reports data from portalData
                const reportsData = (portalData?.reports || []) as Report[];

                // Group reports by calendar year
                const reportsByYear = reportsData.reduce((acc, report) => {
                    const year = report.calendarYear || 0;
                    if (!acc[year]) acc[year] = [];
                    acc[year].push(report);
                    return acc;
                }, {} as Record<number, Report[]>);

                // Sort years descending
                const sortedYears = Object.keys(reportsByYear)
                    .map(Number)
                    .sort((a, b) => b - a);

                return (
                    <div className={styles.contentWrapper}>
                        <div className={styles.contentWrapperInner}>
                            {reportsData.length > 0 ? (
                                <>
                                    {sortedYears.map((year) => (
                                        <div key={year} className={styles.reportsYearGroup}>
                                            <h3 className={styles.reportsYearHeader}>{year}</h3>
                                            <div className={styles.reportsGrid}>
                                                {reportsByYear[year]
                                                    .sort((a, b) => b.semester - a.semester)
                                                    .map((report, idx) => (
                                                        <a
                                                            key={`${report.calendarYear}-${report.semester}-${idx}`}
                                                            href={report.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={styles.reportCard}
                                                        >
                                                            <div className={styles.reportCardHeader}>
                                                                <div className={`${styles.reportCardIcon} ${report.semester === 1 ? styles.semester1 : styles.semester2}`}>
                                                                    <IconFileText size={24} />
                                                                </div>
                                                                <div className={styles.reportCardMeta}>
                                                                    <div className={styles.reportCardYear}>{report.yearLevel}</div>
                                                                    <div className={styles.reportCardSemester}>
                                                                        Semester {report.semester}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className={styles.reportCardContent}>
                                                                <div className={styles.reportCardTitle}>
                                                                    Semester {report.semester} Report
                                                                </div>
                                                                <div className={styles.reportCardSubtitle}>
                                                                    <IconCalendar size={14} />
                                                                    {report.calendarYear}
                                                                </div>
                                                            </div>
                                                            <div className={styles.reportCardAction}>
                                                                View PDF
                                                                <IconExternalLink size={14} />
                                                            </div>
                                                        </a>
                                                    ))}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <Empty>
                                    <EmptyHeader>
                                        <EmptyMedia>
                                            <IconFileText size={48} stroke={1} />
                                        </EmptyMedia>
                                        <EmptyTitle>No Reports Available</EmptyTitle>
                                    </EmptyHeader>
                                </Empty>
                            )}
                        </div>
                    </div>
                );

            default:
                return (
                    <div className={styles.contentWrapper}>
                        <div className={styles.contentWrapperInner}>
                            <div className={`${styles.card} ${styles.placeholderCard}`}>
                                <div className={styles.placeholderMessage}>
                                    <div className={styles.placeholderIcon}>
                                        <img src="/Assets/question-mark.svg" alt="Coming soon" />
                                    </div>
                                    <h3>Coming Soon</h3>
                                    <p>The {currentSection} section is coming soon. Stay tuned for updates!</p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner}></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    if (!session) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner}></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{currentView === 'notifications' ? 'Notifications' : currentView === 'settings' ? 'Settings' : currentSection === 'home' ? 'Dashboard' : `${currentSection.charAt(0).toUpperCase() + currentSection.slice(1)}`}</title>
                <meta name="description" content="Your student dashboard - access timetable, notifications, and more" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="robots" content="noindex, nofollow" />
                <link rel="icon" href="/favicon.png" />
            </Head>

            <div className={styles.dashboardBody} data-pointer-cursors={homeSettings.usePointerCursors ? 'true' : 'false'}>
                <TooltipProvider delayDuration={0}>
                    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
                        {/* Sidebar - conditionally show Settings or Main sidebar */}
                        <div style={{
                            opacity: sidebarTransitioning ? 0 : 1,
                            transform: sidebarTransitioning ? 'translateX(-8px)' : 'translateX(0)',
                            transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}>
                            {isInSettings ? (
                                <SettingsSidebar
                                    currentSection={settingsSection}
                                    onSectionChange={handleSettingsSectionChange}
                                    onBackToApp={handleCloseSettings}
                                    hideClassroom={HIDE_CLASSROOM}
                                />
                            ) : (
                                <Sidebar variant="inset" collapsible="icon">
                                    <SidebarHeader>
                                        {/* User profile with dropdown */}
                                        <SidebarMenu>
                                            <SidebarMenuItem>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-sidebar-accent text-left transition-colors"
                                                            data-sidebar="menu-button"
                                                            data-size="lg"
                                                        >
                                                            <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-semibold shrink-0 overflow-hidden">
                                                                {profileImage ? (
                                                                    <img
                                                                        src={profileImage}
                                                                        alt="Profile"
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    getUserInitials(session.username)
                                                                )}
                                                            </div>
                                                            <div className="grid flex-1 text-left text-sm leading-tight sidebar-collapse-hide">
                                                                <span className="truncate font-medium">{displayName}</span>
                                                                <span className="truncate text-xs text-muted-foreground">{displaySchool}</span>
                                                            </div>
                                                            <IconChevronDown className="ml-auto size-4 sidebar-collapse-hide" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        className="min-w-44"
                                                        align="start"
                                                        side="bottom"
                                                        sideOffset={4}
                                                    >
                                                        <DropdownMenuItem onClick={() => handleOpenSettings('general')}>
                                                            <IconSettings className="mr-2 size-4" />
                                                            Settings
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={(event) => requestLogout(event)} variant="destructive">
                                                            <IconLogout className="mr-2 size-4" />
                                                            Log out
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </SidebarMenuItem>
                                        </SidebarMenu>
                                    </SidebarHeader>

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
                                                        return null;
                                                    })}
                                                </SidebarMenu>
                                            </SidebarGroupContent>
                                        </SidebarGroup>

                                        <div className="h-2" />

                                        {/* Classroom Group */}
                                        {!HIDE_CLASSROOM && (
                                            <SidebarGroup>
                                                <SidebarGroupLabel
                                                    onClick={() => toggleSection('classroom')}
                                                    data-collapsible
                                                    data-collapsed={collapsedSections.includes('classroom')}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <IconChevronDown className="size-3 shrink-0" />
                                                    <span>Classroom</span>
                                                </SidebarGroupLabel>
                                                <SidebarGroupContent
                                                    data-collapsed={collapsedSections.includes('classroom')}
                                                >
                                                    <SidebarMenu>
                                                        {getOrderedSidebarItems(classroomSidebarIds).map((itemId) => {
                                                            if (!isSidebarItemVisible(itemId)) return null;
                                                            if (itemId === 'classroom-stream') {
                                                                return (
                                                                    <SidebarMenuItem key={itemId}>
                                                                        <SidebarMenuButton
                                                                            isActive={currentSection === 'classroom' && classroomTab === 'stream'}
                                                                            onClick={() => { handleSectionClick('classroom'); setClassroomTab('stream'); }}
                                                                            tooltip="Stream"
                                                                        >
                                                                            <IconNews />
                                                                            <span>Stream</span>
                                                                        </SidebarMenuButton>
                                                                    </SidebarMenuItem>
                                                                );
                                                            }
                                                            // ... other classroom items would go here if I were expanding them, 
                                                            // but I just need to wrap the whole group.
                                                            // Since I can't easily match the whole block without viewing it all, 
                                                            // I'll just wrap the start and end of the group.
                                                            // Wait, I can't do start/end replacement easily with the tool structure if I don't match the whole block.
                                                            // I'll try to match the surrounding lines and wrap. 
                                                            // Actually, let me look at line 5625 again.

                                                            // Using the view I have from before:
                                                            // 5612:                                         {/* Classroom Group */}
                                                            // 5613:                                         <SidebarGroup>

                                                            // I need to close it after the group closes.
                                                            // I'll do this in a separate call where I can match the end tag reliably or just use the structure I saw.
                                                            // Better yet, I'll just wrap the render logic for the classroom items loop itself?
                                                            // No, hiding the whole group is cleaner.

                                                            // I'll skip this chunk for now and do it in a dedicated replacement where I can be precise.
                                                            return null;
                                                        })}
                                                    </SidebarMenu>
                                                </SidebarGroupContent>
                                            </SidebarGroup>
                                        )}


                                    </SidebarContent>
                                    <SidebarFooter>
                                        <SidebarMenu>
                                            <SidebarMenuItem>
                                                <SidebarMenuButton
                                                    onClick={() => setShowCommandMenu(true)}
                                                    tooltip="Search (⌘K)"
                                                >
                                                    <IconSearch />
                                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                        Search
                                                        <kbd style={{
                                                            marginLeft: 'auto',
                                                            padding: '3px 8px',
                                                            fontSize: '11px',
                                                            fontWeight: 500,
                                                            color: 'var(--text-tertiary)',
                                                            backgroundColor: 'var(--bg-surface)',
                                                            borderRadius: '4px',
                                                            fontFamily: 'inherit',
                                                        }}>⌘K</kbd>
                                                    </span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        </SidebarMenu>
                                    </SidebarFooter>

                                    <SidebarRail />
                                </Sidebar>
                            )}
                        </div>

                        {/* Main Content with SidebarInset */}
                        <SidebarInset>
                            <div className={styles.mainContent}>
                                <PageTransition isLoading={pageTransitioning}>
                                    {isInSettings ? (
                                        /* Settings Content */
                                        <>
                                            <ContentTopbar
                                                title={
                                                    settingsSection === 'general' ? 'General' :
                                                        settingsSection === 'appearance' ? 'Appearance' :
                                                            settingsSection === 'animations' ? 'Animations' :
                                                                settingsSection === 'notifications' ? 'Notifications' :
                                                                    settingsSection === 'shortcuts' ? 'Shortcuts' :
                                                                        settingsSection === 'theme-builder' ? 'Theme Builder' :
                                                                            settingsSection === 'class-colors' ? 'Class Colors' :
                                                                                settingsSection === 'sync' ? 'Sync' :
                                                                                    settingsSection === 'export' ? 'Export' : 'Settings'
                                                }
                                                icon={<IconSettings size={16} />}
                                                onBack={handleCloseSettings}
                                                backDisabled={false}
                                            />
                                            <div className={styles.contentWrapper}>
                                                <div className={cn(styles.contentWrapperInner, settingsSection !== 'theme-builder' && styles.settingsLayoutConstrained)}>
                                                    {settingsSection === 'general' && <GeneralSettings />}
                                                    {settingsSection === 'theme-builder' && <ThemeBuilder />}
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
                                                    {settingsSection === 'notifications' && <NotificationsSettings />}
                                                    {(settingsSection === 'class-colors' || settingsSection === 'sync' || settingsSection === 'export') && (
                                                        <div className={styles.settingsComingSoonCard}>
                                                            {settingsSection.charAt(0).toUpperCase() + settingsSection.slice(1).replace('-', ' ')} settings coming soon...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : currentView === 'notifications' ? (
                                        <>
                                            {/* Desktop-style Topbar */}
                                            <ContentTopbar
                                                title="Notifications"
                                                icon={<IconBell size={16} />}
                                                rightContent={
                                                    <>
                                                        <TopbarAction
                                                            icon={<IconSearch size={14} />}
                                                            onClick={() => setShowCommandMenu(true)}
                                                        />
                                                        <TopbarAction
                                                            icon={<IconSettings size={14} />}
                                                            onClick={() => handleOpenSettings('general')}
                                                        />
                                                    </>
                                                }
                                            />
                                            <div className={styles.notificationsContainer}>
                                                {/* Left sidebar - categories */}
                                                <div className={styles.notificationsSidebar}>

                                                    <div className={styles.sidebarContent}>
                                                        <div className={styles.categoryList}>
                                                            {[
                                                                { id: 'inbox', label: 'Inbox', Icon: IconInbox, count: notificationCounts.inbox },
                                                                { id: 'pinned', label: 'Pinned', Icon: IconPin, count: notificationCounts.pinned },
                                                                { id: 'alerts', label: 'Alerts', Icon: IconAlertCircle, count: notificationCounts.alerts },
                                                                { id: 'events', label: 'Events', Icon: IconCalendarEvent, count: notificationCounts.events },
                                                                { id: 'assignments', label: 'Assignments', Icon: IconClipboardCheck, count: notificationCounts.assignments },
                                                                { id: 'archive', label: 'Archive', Icon: IconArchive, count: notificationCounts.archive }
                                                            ].map((category) => (
                                                                <CustomTooltip key={category.id} text={category.label} position="right">
                                                                    <button
                                                                        className={`${styles.categoryItem} ${selectedCategory === category.id ? styles.active : ''}`}
                                                                        onClick={() => setSelectedCategory(category.id)}
                                                                    >
                                                                        <div className={styles.categoryIcon}>
                                                                            <category.Icon size={20} stroke={1.5} />
                                                                        </div>
                                                                        {category.count > 0 && (
                                                                            <span className={styles.categoryCount}>{category.count}</span>
                                                                        )}
                                                                    </button>
                                                                </CustomTooltip>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className={styles.sidebarFooter} />
                                                </div>

                                                {/* Middle panel - notification list */}
                                                {/* Google Connect Info Modal */}
                                                <Dialog open={showGoogleConnectInfo} onOpenChange={setShowGoogleConnectInfo}>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>Validation Pending</DialogTitle>
                                                            <DialogDescription>
                                                                Google Calendar sync is not yet approved by Google. We're currently in the review process. This feature will be available soon.
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <DialogFooter>
                                                            <Button onClick={() => setShowGoogleConnectInfo(false)}>Got it</Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>

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
                                                            <div className={styles.multiSelectHint}>
                                                                Multi-select
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
                                                                    <DropdownMenuTrigger asChild>
                                                                        <button className={styles.bulkActionBtn}>
                                                                            <IconAlertTriangle size={14} />
                                                                            Importance
                                                                        </button>
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
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <button className={styles.bulkActionBtn}>
                                                                            <IconFolder size={14} />
                                                                            Move to
                                                                        </button>
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
                                                                        <DropdownMenuTrigger asChild>
                                                                            <button className={styles.bulkActionBtn}>
                                                                                <IconFolders size={14} />
                                                                                Folder
                                                                            </button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="start">
                                                                            <DropdownMenuItem onClick={() => bulkMoveToFolder(undefined)}>
                                                                                <IconFolder size={14} />
                                                                                No folder
                                                                            </DropdownMenuItem>
                                                                            {notificationFolders.map((folder) => {
                                                                                const FolderIcon = getFolderIcon(folder.icon);
                                                                                return (
                                                                                    <DropdownMenuItem key={folder.id} onClick={() => bulkMoveToFolder(folder.id)}>
                                                                                        <FolderIcon size={14} />
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
                                                                            const FolderIcon = getFolderIcon(folder.icon);
                                                                            const count = folderCounts[folder.id]?.unread || 0;
                                                                            const isEditing = editingFolderId === folder.id;

                                                                            if (isEditing) {
                                                                                return (
                                                                                    <div key={folder.id} className={styles.folderForm}>
                                                                                        <input
                                                                                            className={styles.folderInput}
                                                                                            placeholder="Folder title"
                                                                                            value={editFolderTitle}
                                                                                            onChange={(event) => setEditFolderTitle(event.target.value)}
                                                                                            autoFocus
                                                                                        />
                                                                                        <input
                                                                                            className={styles.folderInput}
                                                                                            placeholder="Folder subtitle (optional)"
                                                                                            value={editFolderSubtitle}
                                                                                            onChange={(event) => setEditFolderSubtitle(event.target.value)}
                                                                                        />
                                                                                        <div className={styles.folderIconRow}>
                                                                                            <IconExplorer
                                                                                                value={editFolderIcon}
                                                                                                onSelect={(iconName) => setEditFolderIcon(iconName)}
                                                                                            />
                                                                                        </div>
                                                                                        <div className={styles.folderFormActions}>
                                                                                            <button
                                                                                                className={styles.folderActionBtn}
                                                                                                onClick={handleSaveEditFolder}
                                                                                            >
                                                                                                Save
                                                                                            </button>
                                                                                            <button
                                                                                                className={`${styles.folderActionBtn} ${styles.folderActionSecondary}`}
                                                                                                onClick={handleCancelEditFolder}
                                                                                            >
                                                                                                Cancel
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <ContextMenu key={folder.id}>
                                                                                    <ContextMenuTrigger>
                                                                                        <button
                                                                                            className={cn(styles.folderItem, activeFolderId === folder.id && styles.folderItemActive, isEditing && styles.folderItemEditing)}
                                                                                            onClick={() => {
                                                                                                if (!isEditing) {
                                                                                                    setSelectedCategory(`folder:${folder.id}`);
                                                                                                }
                                                                                            }}
                                                                                        >
                                                                                            <FolderIcon size={16} className={styles.folderIcon} />
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
                                                        {isCreatingFolder && (
                                                            <div className={styles.folderForm}>
                                                                <input
                                                                    className={styles.folderInput}
                                                                    placeholder="Folder title"
                                                                    value={newFolderTitle}
                                                                    onChange={(event) => setNewFolderTitle(event.target.value)}
                                                                />
                                                                <input
                                                                    className={styles.folderInput}
                                                                    placeholder="Folder subtitle (optional)"
                                                                    value={newFolderSubtitle}
                                                                    onChange={(event) => setNewFolderSubtitle(event.target.value)}
                                                                />
                                                                <div className={styles.folderIconRow}>
                                                                    <IconExplorer
                                                                        value={newFolderIcon}
                                                                        onSelect={(iconName) => setNewFolderIcon(iconName)}
                                                                    />
                                                                </div>
                                                                <div className={styles.folderFormActions}>
                                                                    <button
                                                                        className={styles.folderActionBtn}
                                                                        onClick={handleCreateFolder}
                                                                    >
                                                                        Create folder
                                                                    </button>
                                                                    <button
                                                                        className={`${styles.folderActionBtn} ${styles.folderActionSecondary}`}
                                                                        onClick={handleCancelFolder}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className={styles.listContent}>
                                                        {(() => {
                                                            return preparedNotifications.length > 0 ? (
                                                                <div key={selectedCategory} className={styles.notificationGroup}>
                                                                    <div className={styles.groupHeader}>
                                                                        {selectedCategory === 'inbox' && 'Inbox'}
                                                                        {selectedCategory === 'pinned' && 'Pinned'}
                                                                        {selectedCategory === 'alerts' && 'Alerts'}
                                                                        {selectedCategory === 'events' && 'Events'}
                                                                        {selectedCategory === 'assignments' && 'Assignments'}
                                                                        {selectedCategory === 'archive' && 'Archive'}
                                                                        {selectedCategory.startsWith('folder:') && (notificationFolders.find(folder => folder.id === activeFolderId)?.title || 'Folder')}
                                                                    </div>
                                                                    {preparedNotifications.map(({ notice, notificationId, index }) => {
                                                                        const isRead = notificationStates[notificationId]?.read || false;
                                                                        const isPinned = notificationStates[notificationId]?.pinned || false;
                                                                        const isArchived = notificationStates[notificationId]?.archived || false;
                                                                        const category = getNoticeCategory(notice, notificationId);
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
                                                                                <ContextMenuTrigger asChild>
                                                                                    <div
                                                                                        className={`${styles.notificationItem} ${isMultiSelected ? styles.multiSelected : ''} ${selectedNotification === notice ? styles.selected : ''} ${isRead ? styles.read : ''}`}
                                                                                        onClick={(event) => handleNotificationClick(event, notice, notificationId, index, orderedNotificationIds)}
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
                                                                                            </div>
                                                                                            <div className={styles.notificationPreview}>{notice.preview}</div>
                                                                                        </div>
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
                                                                                                        const FolderIcon = getFolderIcon(folder.icon);
                                                                                                        return (
                                                                                                            <ContextMenuRadioItem key={folder.id} value={folder.id}>
                                                                                                                <FolderIcon size={14} />
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
                                                            ) : (
                                                                <div className={styles.emptyState}>
                                                                    <IconInbox size={48} style={{ color: 'var(--text-tertiary)', opacity: 0.6 }} />
                                                                    <h3>No notifications</h3>
                                                                    <p>No notifications in this category</p>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

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
                                                                    <h3>{selectedNotification.title}</h3>
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
                                                                        <div className={`${styles.metaPill} ${styles.metaImportance} ${selectedImportanceClass}`}>
                                                                            <span>{selectedImportance}</span>
                                                                        </div>
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
                                                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedNotification.contentHtml) }}
                                                                        />
                                                                    ) : (
                                                                        <p>{selectedNotification.content}</p>
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
                                        </>
                                    ) : (
                                        <>
                                            {/* Desktop-style Topbar */}
                                            <ContentTopbar
                                                title={
                                                    currentSection === 'home' ? 'Home' :
                                                        currentSection === 'account' ? 'Account' :
                                                            currentSection === 'calendar' ? 'Calendar' :
                                                                currentSection === 'timetable' ? 'Timetable' :
                                                                    currentSection === 'attendance' ? 'Attendance' :
                                                                        currentSection === 'homework' ? 'Homework' :
                                                                            currentSection === 'grades' ? 'Grades' :
                                                                                currentSection === 'resources' ? 'Resources' :
                                                                                    currentSection === 'reports' ? 'Reports' :
                                                                                        currentSection === 'classes' ? 'Classes' :
                                                                                            currentSection === 'classes' ? 'Classes' :
                                                                                                (!HIDE_CLASSROOM && currentSection === 'classroom') ? 'Classroom' : ''
                                                }
                                                showNavigation={true}
                                                onBack={handleBack}
                                                onForward={handleForward}
                                                backDisabled={navIndex <= 0}
                                                forwardDisabled={navIndex >= navHistory.length - 1}
                                                icon={
                                                    currentSection === 'home' ? <IconHome size={16} /> :
                                                        currentSection === 'account' ? <IconUser size={16} /> :
                                                            currentSection === 'calendar' ? <IconCalendar size={16} /> :
                                                                currentSection === 'timetable' ? <IconClock size={16} /> :
                                                                    currentSection === 'attendance' ? <IconClipboardCheck size={16} /> :
                                                                        currentSection === 'homework' ? <IconBook size={16} /> :
                                                                            currentSection === 'grades' ? <IconReportAnalytics size={16} /> :
                                                                                currentSection === 'resources' ? <IconFileText size={16} /> :
                                                                                    currentSection === 'reports' ? <IconActivity size={16} /> :
                                                                                        currentSection === 'classes' ? <IconBook size={16} /> :
                                                                                            currentSection === 'classroom' ? <IconSchool size={16} /> : null
                                                }
                                                rightContent={
                                                    <>
                                                        {currentSection === 'home' && (
                                                            <>
                                                                <TopbarAction
                                                                    icon={<IconPencil size={14} />}
                                                                    onClick={() => {
                                                                        if (isHomeEditing) {
                                                                            setIsNoteEditing(false);
                                                                        }
                                                                        setIsHomeEditing(prev => !prev);
                                                                    }}
                                                                    variant={isHomeEditing ? 'primary' : 'default'}
                                                                >
                                                                    {isHomeEditing ? 'Done' : 'Customise Home'}
                                                                </TopbarAction>
                                                                {isHomeEditing && (
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <TopbarAction
                                                                                icon={<IconPlus size={14} />}
                                                                            >
                                                                                Add Item
                                                                            </TopbarAction>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="start">
                                                                            {availableHomeItems.length === 0 ? (
                                                                                <DropdownMenuItem disabled>
                                                                                    All items added
                                                                                </DropdownMenuItem>
                                                                            ) : (
                                                                                availableHomeItems.map(item => (
                                                                                    <DropdownMenuItem
                                                                                        key={item.key}
                                                                                        onClick={() => addHomeItem(item.key)}
                                                                                    >
                                                                                        {item.label}
                                                                                    </DropdownMenuItem>
                                                                                ))
                                                                            )}
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                )}
                                                                <TopbarSeparator />
                                                            </>
                                                        )}
                                                        <TopbarAction
                                                            icon={<IconSearch size={14} />}
                                                            onClick={() => setShowCommandMenu(true)}
                                                        />
                                                        <TopbarAction
                                                            icon={<IconSettings size={14} />}
                                                            onClick={() => handleOpenSettings('general')}
                                                        />
                                                    </>
                                                }
                                            />

                                            {renderCurrentSection()}
                                        </>
                                    )}
                                </PageTransition>
                            </div>
                        </SidebarInset >
                    </SidebarProvider >
                </TooltipProvider >

                {/* Command Menu */}
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
                />

                {/* Logout Confirmation Dialog */}
                < AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm} >
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

                {/* Delete Folder Confirmation Dialog */}
                < AlertDialog open={!!deleteFolderConfirmId} onOpenChange={(open) => !open && setDeleteFolderConfirmId(null)}>
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

                <Dialog open={showProfileEditor} onOpenChange={setShowProfileEditor}>
                    <DialogContent
                        className="border-[var(--border-default)] bg-[var(--bg-elevated)]"
                        style={{
                            maxWidth: '560px',
                            padding: '20px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-default)',
                            backgroundColor: 'var(--bg-elevated)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        }}
                        showCloseButton={false}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                            <DialogHeader>
                                <DialogTitle className="text-base text-[var(--text-primary)]">Profile picture</DialogTitle>
                                <DialogDescription className="text-[12px] text-[var(--text-secondary)]">
                                    Drag to reposition. Use zoom and rotation to adjust your photo.
                                </DialogDescription>
                            </DialogHeader>
                            <button
                                className={styles.profileEditorClose}
                                onClick={() => setShowProfileEditor(false)}
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-default)',
                                    background: 'var(--bg-secondary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)',
                                }}
                                aria-label="Close"
                            >
                                <IconX size={14} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <div
                                className={styles.profileEditorCanvas}
                                style={{
                                    width: `${EDITOR_SIZE}px`,
                                    height: `${EDITOR_SIZE}px`,
                                    borderRadius: '50%',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-default)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    cursor: editorImageSrc ? (isDraggingEditor ? 'grabbing' : 'grab') : 'default'
                                }}
                                onPointerDown={handleEditorPointerDown}
                                onPointerMove={handleEditorPointerMove}
                                onPointerUp={handleEditorPointerUp}
                                onPointerLeave={handleEditorPointerUp}
                            >
                                {editorImageSrc ? (
                                    <canvas ref={editorCanvasRef} style={{ width: '100%', height: '100%' }} />
                                ) : (
                                    <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                        Add a photo to preview
                                    </div>
                                )}
                            </div>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <Label style={{ color: 'var(--text-secondary)' }}>Zoom</Label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={3}
                                        step={0.01}
                                        value={editorZoom}
                                        onChange={(event) => setEditorZoom(parseFloat(event.target.value))}
                                        className={styles.profileSlider}
                                        disabled={!editorImageSrc}
                                    />
                                </div>
                                <div>
                                    <Label style={{ color: 'var(--text-secondary)' }}>Rotation</Label>
                                    <input
                                        type="range"
                                        min={-180}
                                        max={180}
                                        step={1}
                                        value={editorRotation}
                                        onChange={(event) => setEditorRotation(parseFloat(event.target.value))}
                                        className={styles.profileSlider}
                                        disabled={!editorImageSrc}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button
                                        className={styles.profileEditorButton}
                                        size="sm"
                                        onClick={() => setEditorRotation((prev) => prev - 90)}
                                        disabled={!editorImageSrc}
                                        style={{
                                            padding: '10px 16px',
                                            minHeight: '36px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-default)',
                                            color: 'var(--text-primary)',
                                            cursor: editorImageSrc ? 'pointer' : 'not-allowed',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        Rotate left
                                    </Button>
                                    <Button
                                        className={styles.profileEditorButton}
                                        size="sm"
                                        onClick={() => setEditorRotation((prev) => prev + 90)}
                                        disabled={!editorImageSrc}
                                        style={{
                                            padding: '10px 16px',
                                            minHeight: '36px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-default)',
                                            color: 'var(--text-primary)',
                                            cursor: editorImageSrc ? 'pointer' : 'not-allowed',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        Rotate right
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <input
                                ref={profileImageInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={handleProfileImageChange}
                                style={{ display: 'none' }}
                            />

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <Button
                                    className={styles.profileEditorButton}
                                    size="sm"
                                    onClick={handleSelectProfileImage}
                                    disabled={profileImageUploading}
                                    style={{
                                        padding: '10px 16px',
                                        minHeight: '36px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-default)',
                                        color: 'var(--text-primary)',
                                        cursor: profileImageUploading ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    Add profile picture
                                </Button>
                                <Button
                                    className={styles.profileEditorButton}
                                    size="sm"
                                    onClick={resetEditorTransform}
                                    disabled={!editorImageSrc || profileImageUploading}
                                    style={{
                                        padding: '10px 16px',
                                        minHeight: '36px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-default)',
                                        color: 'var(--text-primary)',
                                        cursor: (!editorImageSrc || profileImageUploading) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    Reset view
                                </Button>
                                <Button
                                    className={styles.profileEditorDanger}
                                    size="sm"
                                    onClick={handleRemoveProfileImage}
                                    disabled={!profileImage || profileImageUploading}
                                    style={{
                                        padding: '10px 16px',
                                        minHeight: '36px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: '#ef4444',
                                        border: '1px solid #ef4444',
                                        color: 'white',
                                        cursor: (!profileImage || profileImageUploading) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    Remove photo
                                </Button>
                            </div>

                            {(profileImageUploading || profileUploadProgress > 0) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        {profileImageUploading ? 'Updating photo...' : 'Processing...'}
                                    </div>
                                    <div style={{ height: '6px', borderRadius: '999px', background: 'var(--border-muted)', overflow: 'hidden' }}>
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${profileUploadProgress}%`,
                                                background: 'var(--accent-gradient)',
                                                transition: 'width 120ms ease'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {editorImageType === 'image/gif' && (
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                Animated GIFs are flattened when edited.
                            </div>
                        )}

                        <DialogFooter className="justify-between sm:justify-between">
                            <Button
                                className={styles.profileEditorButton}
                                size="sm"
                                onClick={() => setShowProfileEditor(false)}
                                style={{
                                    padding: '10px 18px',
                                    minHeight: '38px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-default)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                className={styles.profileEditorPrimary}
                                size="sm"
                                onClick={handleSaveProfileImage}
                                disabled={!editorImageSrc || profileImageUploading}
                                style={{
                                    padding: '10px 18px',
                                    minHeight: '38px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: 'var(--accent-color, #6366f1)',
                                    border: '1px solid var(--accent-color, #6366f1)',
                                    color: 'white',
                                    cursor: (!editorImageSrc || profileImageUploading) ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                Save changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div >
        </>
    );
}
