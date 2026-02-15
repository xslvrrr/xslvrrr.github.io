import { supabaseAdmin } from './supabase';
import type { Notice, NotificationState } from '../types/portal';

export interface UserSettings {
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
    autoSync: boolean;
    syncInterval: number; // minutes
}

export interface User {
    id: string;
    millenniumUid: string;
    email?: string;
    name: string;
    school: string;
    settings: UserSettings;
    createdAt: string;
    lastSync: string;
    portalData?: any;
    profileImage?: string | null;
}

interface UserRow {
    id: string;
    millennium_uid: string | null;
    email: string | null;
    name: string;
    school: string;
    settings: UserSettings | null;
    created_at: string;
    last_sync: string | null;
    portal_data: any | null;
    profile_image?: string | null;
    notification_states?: Record<string, NotificationState> | null;
    local_events?: any[] | null;
    local_calendars?: any[] | null;
    notification_folders?: any[] | null;
    home_settings?: any | null;
    google_events?: any[] | null;
    google_calendars?: any[] | null;
    theme_builder_state?: any | null;
    theme_builder_custom?: any[] | null;
}

function mapUser(row: UserRow): User {
    return {
        id: row.id,
        millenniumUid: row.millennium_uid || '',
        email: row.email || undefined,
        name: row.name,
        school: row.school,
        settings: row.settings || getDefaultSettings(),
        createdAt: row.created_at,
        lastSync: row.last_sync || '',
        portalData: row.portal_data || undefined,
        profileImage: row.profile_image || null
    };
}

function isNotFoundError(error: any): boolean {
    return error?.code === 'PGRST116';
}

function normalizeNoticeDate(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return trimmed;

    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function collectNoticeDates(notice: Partial<Notice>): string[] {
    const merged = new Set<string>();

    const primary = normalizeNoticeDate(notice.date);
    if (primary) {
        merged.add(primary);
    }

    if (Array.isArray(notice.dates)) {
        notice.dates
            .map(normalizeNoticeDate)
            .filter((date): date is string => !!date)
            .forEach((date) => merged.add(date));
    }

    return Array.from(merged).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

function getNoticeMergeKey(notice: Partial<Notice>): string {
    return [
        notice.title?.trim().toLowerCase() || '',
        notice.preview?.trim().toLowerCase() || '',
        notice.content?.trim().toLowerCase() || '',
        notice.contentHtml?.trim().toLowerCase() || ''
    ].join('::');
}

function normalizeNoticeShape(notice: Partial<Notice>): Notice {
    const dates = collectNoticeDates(notice);

    return {
        title: typeof notice.title === 'string' ? notice.title : '',
        preview: typeof notice.preview === 'string' ? notice.preview : '',
        content: typeof notice.content === 'string' ? notice.content : '',
        contentHtml: typeof notice.contentHtml === 'string' ? notice.contentHtml : undefined,
        date: dates.length > 0 ? dates[dates.length - 1] : normalizeNoticeDate(notice.date) || undefined,
        dates: dates.length > 0 ? dates : undefined,
        currentDay: typeof notice.currentDay === 'string' ? notice.currentDay : undefined
    };
}

function mergeNotices(existingNotices: unknown, incomingNotices: unknown): Notice[] {
    const merged = new Map<string, Notice>();

    const ingest = (source: unknown) => {
        if (!Array.isArray(source)) return;

        source.forEach((rawNotice) => {
            if (!rawNotice || typeof rawNotice !== 'object') return;

            const notice = normalizeNoticeShape(rawNotice as Partial<Notice>);
            const key = getNoticeMergeKey(notice);
            const existing = merged.get(key);

            if (!existing) {
                merged.set(key, notice);
                return;
            }

            const dateSet = new Set<string>([...collectNoticeDates(existing), ...collectNoticeDates(notice)]);
            const dates = Array.from(dateSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
            const latestDate = dates.length > 0 ? dates[dates.length - 1] : undefined;

            merged.set(key, {
                title: notice.title || existing.title,
                preview: notice.preview || existing.preview,
                content: notice.content || existing.content,
                contentHtml: notice.contentHtml || existing.contentHtml,
                currentDay: notice.currentDay || existing.currentDay,
                date: latestDate,
                dates: dates.length > 0 ? dates : undefined
            });
        });
    };

    ingest(existingNotices);
    ingest(incomingNotices);

    return Array.from(merged.values()).sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;

        if (aTime !== bTime) return bTime - aTime;
        return a.title.localeCompare(b.title);
    });
}

// Get default user settings
export function getDefaultSettings(): UserSettings {
    return {
        theme: 'dark',
        notifications: true,
        autoSync: true,
        syncInterval: 30
    };
}

// Find user by Millennium UID
export async function findUserByMillenniumUid(millenniumUid: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('millennium_uid', millenniumUid)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data ? mapUser(data as UserRow) : null;
}

// Find user by ID
export async function findUserById(id: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data ? mapUser(data as UserRow) : null;
}

// Create or update user from extension sync
export async function upsertUserFromSync(data: {
    user: { name: string; school: string; uid: string };
    timetable?: any[];
    notices?: any[];
    grades?: any[];
    attendance?: any[];
    calendar?: any[];
    reports?: any[];
    classes?: any[];
    lastUpdated: string;
}): Promise<User> {
    const millenniumUid = data.user.uid || '';

    const existing = millenniumUid ? await findUserByMillenniumUid(millenniumUid) : null;

    const mergedNotices = mergeNotices(existing?.portalData?.notices, data.notices);

    const portalData = {
        timetable: data.timetable || [],
        notices: mergedNotices,
        grades: data.grades || [],
        attendance: data.attendance || [],
        calendar: data.calendar || [],
        reports: data.reports || [],
        classes: data.classes || []
    };

    if (!existing) {
        const { data: inserted, error } = await supabaseAdmin
            .from('users')
            .insert({
                millennium_uid: millenniumUid || null,
                name: data.user.name,
                school: data.user.school,
                settings: getDefaultSettings(),
                last_sync: data.lastUpdated,
                portal_data: portalData
            })
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return mapUser(inserted as UserRow);
    }

    const { data: updated, error } = await supabaseAdmin
        .from('users')
        .update({
            name: data.user.name || existing.name,
            school: data.user.school || existing.school,
            last_sync: data.lastUpdated,
            portal_data: portalData
        })
        .eq('id', existing.id)
        .select('*')
        .single();

    if (error) {
        throw error;
    }

    return mapUser(updated as UserRow);
}

// Update user settings
export async function updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<User | null> {
    const existing = await findUserById(userId);
    if (!existing) return null;

    const mergedSettings = { ...existing.settings, ...settings };

    const { data, error } = await supabaseAdmin
        .from('users')
        .update({ settings: mergedSettings })
        .eq('id', userId)
        .select('*')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data ? mapUser(data as UserRow) : null;
}

export async function updateUserProfileImage(userId: string, profileImage: string | null): Promise<User | null> {
    const existing = await findUserById(userId);
    if (!existing) return null;

    const { data, error } = await supabaseAdmin
        .from('users')
        .update({ profile_image: profileImage })
        .eq('id', userId)
        .select('*')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data ? mapUser(data as UserRow) : null;
}

// Get all users (for admin purposes)
export async function getAllUsers(): Promise<User[]> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('*');

    if (error) {
        throw error;
    }

    return (data || []).map(row => mapUser(row as UserRow));
}

// Delete user
export async function deleteUser(userId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        throw error;
    }

    return true;
}

// ============================================
// USER-SCOPED PREFERENCES (NOTIFICATIONS/CALENDAR)
// ============================================

export async function getUserNotificationStates(userId: string): Promise<Record<string, NotificationState>> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('notification_states')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return (data?.notification_states as Record<string, NotificationState>) || {};
}

export async function updateUserNotificationStates(
    userId: string,
    states: Record<string, NotificationState>
): Promise<Record<string, NotificationState>> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .update({ notification_states: states })
        .eq('id', userId)
        .select('notification_states')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return (data?.notification_states as Record<string, NotificationState>) || {};
}

export async function getUserLocalCalendar(userId: string): Promise<{ events: any[]; calendars: any[] }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('local_events, local_calendars')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        events: (data?.local_events as any[]) || [],
        calendars: (data?.local_calendars as any[]) || []
    };
}

export async function updateUserLocalCalendar(
    userId: string,
    payload: { events: any[]; calendars: any[] }
): Promise<{ events: any[]; calendars: any[] }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .update({ local_events: payload.events, local_calendars: payload.calendars })
        .eq('id', userId)
        .select('local_events, local_calendars')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        events: (data?.local_events as any[]) || payload.events || [],
        calendars: (data?.local_calendars as any[]) || payload.calendars || []
    };
}

export async function getUserPreferences(userId: string): Promise<{ homeSettings: any; notificationFolders: any[] }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('home_settings, notification_folders')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        homeSettings: data?.home_settings || null,
        notificationFolders: (data?.notification_folders as any[]) || []
    };
}

export async function updateUserPreferences(
    userId: string,
    payload: { homeSettings?: any; notificationFolders?: any[] }
): Promise<{ homeSettings: any; notificationFolders: any[] }> {
    // Only update fields that are explicitly provided to avoid wiping the other
    const updatePayload: Record<string, any> = {};
    if (payload.homeSettings !== undefined) {
        updatePayload.home_settings = payload.homeSettings;
    }
    if (payload.notificationFolders !== undefined) {
        updatePayload.notification_folders = payload.notificationFolders;
    }

    // Nothing to update — just return current state
    if (Object.keys(updatePayload).length === 0) {
        return getUserPreferences(userId);
    }

    const { data, error } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('home_settings, notification_folders')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        homeSettings: data?.home_settings || payload.homeSettings || null,
        notificationFolders: (data?.notification_folders as any[]) || payload.notificationFolders || []
    };
}

export async function updateUserGoogleCalendarMirror(
    userId: string,
    payload: { events?: any[]; calendars?: any[] }
): Promise<{ events: any[]; calendars: any[] }> {
    const updatePayload: Record<string, any> = {};
    if (payload.events !== undefined) {
        updatePayload.google_events = payload.events;
    }
    if (payload.calendars !== undefined) {
        updatePayload.google_calendars = payload.calendars;
    }

    if (Object.keys(updatePayload).length === 0) {
        const { data: existing } = await supabaseAdmin
            .from('users')
            .select('google_events, google_calendars')
            .eq('id', userId)
            .maybeSingle();
        return {
            events: (existing?.google_events as any[]) || [],
            calendars: (existing?.google_calendars as any[]) || []
        };
    }

    const { data, error } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('google_events, google_calendars')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        events: (data?.google_events as any[]) || payload.events || [],
        calendars: (data?.google_calendars as any[]) || payload.calendars || []
    };
}

export async function getUserGoogleCalendarMirror(
    userId: string
): Promise<{ events: any[]; calendars: any[] }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('google_events, google_calendars')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        events: (data?.google_events as any[]) || [],
        calendars: (data?.google_calendars as any[]) || []
    };
}

// ============================================
// THEME BUILDER STORAGE
// ============================================

export async function getUserThemeBuilder(
    userId: string
): Promise<{ state: any | null; customThemes: any[] }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('theme_builder_state, theme_builder_custom')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        state: data?.theme_builder_state || null,
        customThemes: (data?.theme_builder_custom as any[]) || []
    };
}

export async function updateUserThemeBuilder(
    userId: string,
    payload: { state?: any | null; customThemes?: any[] }
): Promise<{ state: any | null; customThemes: any[] }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .update({
            theme_builder_state: payload.state ?? null,
            theme_builder_custom: payload.customThemes ?? []
        })
        .eq('id', userId)
        .select('theme_builder_state, theme_builder_custom')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        state: data?.theme_builder_state || payload.state || null,
        customThemes: (data?.theme_builder_custom as any[]) || payload.customThemes || []
    };
}

// ============================================
// GOOGLE CLASSROOM DATA STORAGE
// ============================================

export interface ClassroomCourse {
    id: string;
    name: string;
    section?: string;
    teacher?: string;
    link?: string;
    classworkLink?: string;
    streamLink?: string;
    scraped?: boolean;
    lastSyncedAt?: string;
}

export interface ClassroomItem {
    id: string;
    courseId: string;
    courseName: string;
    type: 'assignment' | 'material' | 'announcement';
    title: string;
    description?: string;
    descriptionHtml?: string;
    dueDate?: string | null;
    dueText?: string;
    maxPoints?: number | null;
    link?: string;
    postedTime?: string | null;
    submissionState?: string;
    contentHash?: string;
    scrapedAt?: string;
    scraped?: boolean;
}

export interface ClassroomData {
    courses: ClassroomCourse[];
    items: ClassroomItem[];
    lastUpdated: string;
    lastFullSync?: string;
    syncStats?: {
        totalSyncs: number;
        lastSyncMode?: 'full' | 'incremental' | 'deep';
        lastSyncItemsAdded?: number;
        lastSyncItemsUpdated?: number;
    };
}

interface ClassroomRow {
    scope: string;
    courses: ClassroomCourse[] | null;
    items: ClassroomItem[] | null;
    last_updated: string | null;
    last_full_sync: string | null;
    sync_stats: ClassroomData['syncStats'] | null;
}

// Get classroom data
export async function getClassroomData(scope: string = 'global'): Promise<ClassroomData> {
    const { data, error } = await supabaseAdmin
        .from('classroom_data')
        .select('*')
        .eq('scope', scope)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    if (!data) {
        return { courses: [], items: [], lastUpdated: '' };
    }

    const row = data as ClassroomRow;
    return {
        courses: row.courses || [],
        items: row.items || [],
        lastUpdated: row.last_updated || '',
        lastFullSync: row.last_full_sync || undefined,
        syncStats: row.sync_stats || undefined
    };
}

export async function getLatestClassroomData(): Promise<{ scope: string; data: ClassroomData } | null> {
    const { data, error } = await supabaseAdmin
        .from('classroom_data')
        .select('*')
        .order('last_updated', { ascending: false })
        .limit(1);

    if (error) {
        throw error;
    }

    if (!data || data.length === 0) {
        return null;
    }

    const row = data[0] as ClassroomRow;
    return {
        scope: row.scope,
        data: {
            courses: row.courses || [],
            items: row.items || [],
            lastUpdated: row.last_updated || '',
            lastFullSync: row.last_full_sync || undefined,
            syncStats: row.sync_stats || undefined
        }
    };
}

// Store/update classroom data from extension sync
export async function upsertClassroomData(data: {
    scope?: string;
    courses: ClassroomCourse[];
    items: ClassroomItem[];
    lastUpdated: string;
    syncMode?: 'full' | 'incremental' | 'deep';
    itemsAdded?: number;
    itemsUpdated?: number;
}): Promise<ClassroomData> {
    const scope = data.scope || 'global';

    const existing = await getClassroomData(scope);

    // Update sync stats
    const syncStats = existing.syncStats || { totalSyncs: 0 };
    syncStats.totalSyncs = (syncStats.totalSyncs || 0) + 1;
    syncStats.lastSyncMode = data.syncMode || 'full';
    syncStats.lastSyncItemsAdded = data.itemsAdded || 0;
    syncStats.lastSyncItemsUpdated = data.itemsUpdated || 0;

    const merged: ClassroomData = {
        courses: data.courses,
        items: data.items,
        lastUpdated: data.lastUpdated,
        lastFullSync: data.syncMode === 'full' || data.syncMode === 'deep'
            ? data.lastUpdated
            : existing.lastFullSync,
        syncStats,
    };

    const { data: saved, error } = await supabaseAdmin
        .from('classroom_data')
        .upsert({
            scope,
            courses: merged.courses,
            items: merged.items,
            last_updated: merged.lastUpdated,
            last_full_sync: merged.lastFullSync || null,
            sync_stats: merged.syncStats || null
        }, { onConflict: 'scope' })
        .select('*')
        .single();

    if (error) {
        throw error;
    }

    const row = saved as ClassroomRow;
    return {
        courses: row.courses || [],
        items: row.items || [],
        lastUpdated: row.last_updated || '',
        lastFullSync: row.last_full_sync || undefined,
        syncStats: row.sync_stats || undefined
    };
}
