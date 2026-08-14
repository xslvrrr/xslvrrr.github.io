import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { normalizeClassroomSnapshot } from './classroom-data';
import { assertUsefulPortalSyncData, getPortalDataCounts } from './portal-data-integrity';
import {
    buildPortalSyncDelta,
    isPortalSyncFingerprint,
    type PortalSyncFingerprint,
} from './portal-sync-diff';
import type { ClassroomSnapshot } from '../types/classroom';
import type { Notice, NotificationState, PortalAccount } from '../types/portal';

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
    home_layout?: any | null;
    animation_settings?: any | null;
    google_events?: any[] | null;
    google_calendars?: any[] | null;
    theme_builder_state?: any | null;
    theme_builder_custom?: any[] | null;
    assistant_chats?: any[] | null;
    assistant_skills?: any[] | null;
    annotations?: any[] | null;
    portal_credentials?: unknown | null;
}

export interface PortalSyncUserState {
    user: User;
    portalCredentialEnvelope: unknown | null;
    portalSyncFingerprint: PortalSyncFingerprint | null;
}

interface PersistedPortalUserRow {
    id: string;
    millennium_uid: string | null;
    name: string;
    school: string;
    settings: UserSettings | null;
    created_at: string;
    last_sync: string | null;
    changed: boolean;
    changed_sections: string[] | null;
}

export interface UserIdentity {
    id: string;
    millenniumUid: string;
    name: string;
    school: string;
}

export interface UserPortalData {
    millenniumUid: string;
    name: string;
    school: string;
    portalData: unknown | null;
    lastSync: string;
}

export type UserPortalManifest = Omit<UserPortalData, 'portalData'>;

// Keep large static profile image blobs out of recurring portal-data reads.
const USER_PORTAL_SELECT = 'id, millennium_uid, email, name, school, settings, created_at, last_sync, portal_data';
const USER_PORTAL_WITH_PROFILE_SELECT = 'id, millennium_uid, email, name, school, settings, created_at, last_sync, portal_data, profile_image';
const MAX_NOTICE_HTML_CHARS = 64 * 1024;

function compactNoticeHtml(value: unknown, plainText: string): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;

    const compacted = value
        // Inline base64 images made single notices several megabytes. Images are
        // decorative portal payload; keep surrounding text and markup.
        .replace(/<img\b[^>]*\bsrc\s*=\s*["']?data:[^>]*>/gi, '')
        .replace(/data:[^"'\s>]+/gi, '')
        .trim();
    if (!compacted || compacted === plainText) return undefined;
    return compacted.slice(0, MAX_NOTICE_HTML_CHARS);
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
        (notice.content || notice.preview)?.trim().toLowerCase() || '',
    ].join('::');
}

function normalizeNoticeShape(notice: Partial<Notice>): Notice {
    const dates = collectNoticeDates(notice);
    const content = typeof notice.content === 'string' ? notice.content : '';

    return {
        title: typeof notice.title === 'string' ? notice.title : '',
        preview: typeof notice.preview === 'string' ? notice.preview : '',
        content,
        contentHtml: compactNoticeHtml(notice.contentHtml, content),
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

function mergeRecordsByKey<T>(
    existing: T[] | undefined,
    incoming: T[] | undefined,
    getKey: (item: T) => string,
): T[] {
    const merged = new Map<string, T>();
    [...(existing || []), ...(incoming || [])].forEach((item) => {
        const key = getKey(item);
        if (!key) return;
        const previous = merged.get(key);
        merged.set(key, previous && typeof previous === 'object' && typeof item === 'object'
            ? { ...(previous as any), ...(item as any) }
            : item);
    });
    return Array.from(merged.values());
}

function mergeTimetable(existing: any, incoming: any): any {
    const keyFor = (entry: any) => [
        entry?.day || '',
        entry?.period || '',
        entry?.classCode || entry?.course || entry?.subject || '',
    ].join('::');

    if (Array.isArray(existing) || Array.isArray(incoming)) {
        return mergeRecordsByKey(
            Array.isArray(existing) ? existing : [],
            Array.isArray(incoming) ? incoming : [],
            keyFor,
        );
    }

    return {
        weekA: mergeRecordsByKey(existing?.weekA, incoming?.weekA, keyFor),
        weekB: mergeRecordsByKey(existing?.weekB, incoming?.weekB, keyFor),
    };
}

function mergeAttendance(existing: any, incoming: any): any {
    return {
        yearly: mergeRecordsByKey(existing?.yearly, incoming?.yearly, (entry: any) => String(entry?.year || '')),
        subjects: mergeRecordsByKey(
            existing?.subjects,
            incoming?.subjects,
            (entry: any) => String(entry?.classCode || entry?.course || ''),
        ),
        absences: incoming?.absences?.length ? incoming.absences : (existing?.absences || []),
        recentPeriods: incoming?.recentPeriods?.length ? incoming.recentPeriods : (existing?.recentPeriods || []),
        totals: incoming?.totals || existing?.totals,
    };
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
        .select(USER_PORTAL_SELECT)
        .eq('millennium_uid', millenniumUid)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data ? mapUser(data as UserRow) : null;
}

export async function findUserIdentityById(id: string): Promise<UserIdentity | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, millennium_uid, name, school')
        .eq('id', id)
        .maybeSingle();

    if (error && !isNotFoundError(error)) throw error;
    if (!data) return null;
    return {
        id: data.id,
        millenniumUid: data.millennium_uid || '',
        name: data.name,
        school: data.school,
    };
}

export async function getUserPortalManifest(id: string): Promise<UserPortalManifest | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('millennium_uid, name, school, last_sync')
        .eq('id', id)
        .maybeSingle();

    if (error && !isNotFoundError(error)) throw error;
    if (!data) return null;
    return {
        millenniumUid: data.millennium_uid || '',
        name: data.name,
        school: data.school,
        lastSync: data.last_sync || '',
    };
}

export async function findUserPortalDataById(id: string): Promise<UserPortalData | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('millennium_uid, name, school, portal_data, last_sync')
        .eq('id', id)
        .maybeSingle();

    if (error && !isNotFoundError(error)) throw error;
    if (!data) return null;
    return {
        millenniumUid: data.millennium_uid || '',
        name: data.name,
        school: data.school,
        portalData: data.portal_data ?? null,
        lastSync: data.last_sync || '',
    };
}

export async function getUserReports(userId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('reports:portal_data->reports')
        .eq('id', userId)
        .maybeSingle();
    if (error && !isNotFoundError(error)) throw error;
    return Array.isArray(data?.reports) ? data.reports : [];
}

// Find user by ID
export async function findUserById(id: string, options: { includeProfileImage?: boolean } = {}): Promise<User | null> {
    const query = supabaseAdmin.from('users');
    const { data, error } = options.includeProfileImage
        ? await query.select(USER_PORTAL_WITH_PROFILE_SELECT).eq('id', id).maybeSingle()
        : await query.select(USER_PORTAL_SELECT).eq('id', id).maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data ? mapUser(data as UserRow) : null;
}

export async function findUserSessionById(id: string): Promise<Pick<User, 'id' | 'millenniumUid' | 'name' | 'school' | 'profileImage'> | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, millennium_uid, name, school, profile_image')
        .eq('id', id)
        .maybeSingle();

    if (error && !isNotFoundError(error)) throw error;
    if (!data) return null;

    return {
        id: data.id,
        millenniumUid: data.millennium_uid || '',
        name: data.name,
        school: data.school,
        profileImage: data.profile_image || null,
    };
}

export async function getUserLastSync(id: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('last_sync')
        .eq('id', id)
        .maybeSingle();
    if (error && !isNotFoundError(error)) throw error;
    return data?.last_sync || null;
}

export async function getUserCreatedAt(id: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('created_at')
        .eq('id', id)
        .maybeSingle();
    if (error && !isNotFoundError(error)) throw error;
    return data?.created_at || null;
}

export async function findUserForPortalSync(id: string, syncSignature: string): Promise<PortalSyncUserState | null> {
    const [userResult, fingerprintResult] = await Promise.all([
        supabaseAdmin
            .from('users')
            .select('id, millennium_uid, email, name, school, settings, created_at, last_sync, portal_credentials, reports:portal_data->reports')
            .eq('id', id)
            .maybeSingle(),
        supabaseAdmin
            .from('portal_sync_fingerprints')
            .select('fingerprint')
            .eq('user_id', id)
            .eq('signature', syncSignature)
            .maybeSingle(),
    ]);
    const { data, error } = userResult;

    if (error && !isNotFoundError(error)) throw error;
    if (fingerprintResult.error && !isNotFoundError(fingerprintResult.error)) throw fingerprintResult.error;
    if (!data) return null;

    const fingerprint = isPortalSyncFingerprint(fingerprintResult.data?.fingerprint)
        ? fingerprintResult.data.fingerprint
        : null;
    return {
        user: {
            ...mapUser(data as unknown as UserRow),
            portalData: {
                reports: Array.isArray(data.reports) ? data.reports : [],
            },
        },
        portalCredentialEnvelope: data.portal_credentials ?? null,
        portalSyncFingerprint: fingerprint,
    };
}

export async function getUserPortalCredentialEnvelope(userId: string): Promise<unknown | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('portal_credentials')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return data?.portal_credentials ?? null;
}

export async function updateUserPortalCredentialEnvelope(userId: string, envelope: unknown): Promise<void> {
    const { error } = await supabaseAdmin
        .from('users')
        .update({
            portal_credentials: envelope,
            portal_credentials_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) {
        throw error;
    }
}

export async function clearUserPortalCredentialEnvelope(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('users')
        .update({ portal_credentials: null, portal_credentials_updated_at: null })
        .eq('id', userId);
    if (error) throw error;
}

// Create or update user from portal sync.
export async function persistPortalSyncSnapshot(data: {
    user: { name: string; school: string; uid: string };
    account?: PortalAccount;
    timetable?: any;
    notices?: any[];
    grades?: any[];
    attendance?: any;
    calendar?: any[];
    reports?: any[];
    classes?: any[];
    syncMeta?: any;
    lastUpdated: string;
}, options: {
    existingUser?: User | null;
    portalCredentialEnvelope?: unknown;
    syncSignature?: string;
    previousFingerprint?: PortalSyncFingerprint | null;
} = {}): Promise<User & { portalChanged: boolean }> {
    const millenniumUid = data.user.uid || '';
    const existing = Object.prototype.hasOwnProperty.call(options, 'existingUser')
        ? options.existingUser ?? null
        : null;
    if (existing?.millenniumUid && millenniumUid && existing.millenniumUid !== millenniumUid) {
        throw new Error('Portal account identity changed during sync');
    }
    assertUsefulPortalSyncData(data, 'Portal sync returned no usable data; keeping the last known good data instead');

    // Database RPC merges under a row lock. Existing multi-megabyte portal_data
    // never crosses PostgREST during recurring sync.
    const portalData: any = {
        ...(data.account ? { account: data.account } : {}),
        timetable: data.timetable,
        notices: mergeNotices([], data.notices),
        grades: data.grades || [],
        attendance: data.attendance,
        calendar: data.calendar || [],
        reports: data.reports || [],
        classes: data.classes || [],
        syncMeta: data.syncMeta,
    };
    portalData.syncCounts = getPortalDataCounts(portalData);
    const diff = options.syncSignature
        ? buildPortalSyncDelta(
            portalData,
            options.previousFingerprint,
            data.lastUpdated,
        )
        : null;
    const databaseDelta = diff
        ? Object.keys(diff.delta).length > 0
            ? {
                ...diff.delta,
                syncMeta: portalData.syncMeta,
                syncCounts: portalData.syncCounts,
            }
            : {}
        : portalData;

    const updateCredentials = Object.prototype.hasOwnProperty.call(options, 'portalCredentialEnvelope');
    const { data: persisted, error } = await supabaseAdmin.rpc('merge_portal_snapshot', {
        p_user_id: existing?.id || null,
        p_millennium_uid: millenniumUid || null,
        p_name: data.user.name,
        p_school: data.user.school,
        p_settings: existing?.settings || getDefaultSettings(),
        p_snapshot: databaseDelta,
        p_last_sync: data.lastUpdated,
        p_update_credentials: updateCredentials,
        p_portal_credentials: updateCredentials ? options.portalCredentialEnvelope ?? null : null,
        p_sync_signature: options.syncSignature || null,
        p_sync_fingerprint: diff?.fingerprint || null,
    });

    if (error) throw error;
    const row = (Array.isArray(persisted) ? persisted[0] : persisted) as PersistedPortalUserRow | null;
    if (!row) throw new Error('Portal snapshot merge returned no user');
    let accountChanged = false;
    if (data.account) {
        const accountResult = await supabaseAdmin.rpc('merge_portal_account', {
            p_user_id: row.id,
            p_account: data.account,
        });
        if (accountResult.error) {
            const code = String(accountResult.error.code || '');
            const message = String(accountResult.error.message || '');
            const migrationMissing = code === 'PGRST202'
                || code === '42883'
                || /merge_portal_account/i.test(message);
            if (!migrationMissing) throw accountResult.error;
            logger.warn('[Portal Sync] Account persistence RPC is unavailable until the latest migration is applied.');
        } else {
            accountChanged = accountResult.data === true;
        }
    }
    const changedSections = new Set(Array.isArray(row.changed_sections) ? row.changed_sections : []);
    const portalDelta = row.changed
        ? Object.fromEntries(Object.entries(databaseDelta).filter(([key]) => (
            changedSections.has(key) || key === 'syncMeta' || key === 'syncCounts'
        )))
        : {};
    if (data.account) portalDelta.account = data.account;

    return {
        id: row.id,
        millenniumUid: row.millennium_uid || '',
        name: row.name,
        school: row.school,
        settings: row.settings || getDefaultSettings(),
        createdAt: row.created_at,
        lastSync: row.last_sync || data.lastUpdated,
        portalData: portalDelta,
        profileImage: null,
        portalChanged: row.changed || accountChanged,
    };
}

export async function replaceUserPortalData(userId: string, portalData: any | null, lastSync?: string | null): Promise<User | null> {
    const existing = await findUserIdentityById(userId);
    if (!existing) return null;

    const nextLastSync = lastSync ?? portalData?.lastUpdated ?? new Date().toISOString();
    const { error } = await supabaseAdmin
        .from('users')
        .update({
            last_sync: nextLastSync,
            portal_data: portalData,
        })
        .eq('id', userId);

    if (error) throw error;
    return {
        ...existing,
        settings: getDefaultSettings(),
        createdAt: '',
        lastSync: nextLastSync,
        portalData: portalData ?? undefined,
        profileImage: null,
    };
}

export async function wipeUserPortalData(userId: string): Promise<User | null> {
    const existing = await findUserIdentityById(userId);
    if (!existing) return null;

    const { error } = await supabaseAdmin
        .from('users')
        .update({
            last_sync: null,
            portal_data: null,
            portal_credentials: null,
            portal_credentials_updated_at: null,
        })
        .eq('id', userId);

    if (error) throw error;
    return {
        ...existing,
        settings: getDefaultSettings(),
        createdAt: '',
        lastSync: '',
        portalData: undefined,
        profileImage: null,
    };
}

// Update user settings
export async function updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<User | null> {
    const { data: row, error: readError } = await supabaseAdmin
        .from('users')
        .select('id, millennium_uid, name, school, settings, created_at, last_sync')
        .eq('id', userId)
        .maybeSingle();
    if (readError && !isNotFoundError(readError)) throw readError;
    if (!row) return null;

    const mergedSettings = { ...(row.settings || getDefaultSettings()), ...settings };

    const { error } = await supabaseAdmin
        .from('users')
        .update({ settings: mergedSettings })
        .eq('id', userId);

    if (error) throw error;
    return {
        id: row.id,
        millenniumUid: row.millennium_uid || '',
        name: row.name,
        school: row.school,
        settings: mergedSettings,
        createdAt: row.created_at,
        lastSync: row.last_sync || '',
        profileImage: null,
    };
}

export async function updateUserProfileImage(userId: string, profileImage: string | null): Promise<User | null> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .update({ profile_image: profileImage })
        .eq('id', userId)
        .select('id, millennium_uid, name, school, profile_image')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    if (!data) return null;
    return {
        id: data.id,
        millenniumUid: data.millennium_uid || '',
        name: data.name,
        school: data.school,
        settings: getDefaultSettings(),
        createdAt: '',
        lastSync: '',
        profileImage: data.profile_image || null,
    };
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

export async function getUserPreferences(userId: string): Promise<{ homeSettings: any; homeLayout: any; notificationFolders: any[]; animationSettings: any; attendanceSettings: any; tourPreferences: unknown }> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('home_settings, home_layout, notification_folders, animation_settings, attendance_settings, tour_preferences')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        homeSettings: data?.home_settings || null,
        homeLayout: data?.home_layout || null,
        notificationFolders: (data?.notification_folders as any[]) || [],
        animationSettings: data?.animation_settings || null,
        attendanceSettings: data?.attendance_settings || { perfectEffectEnabled: true, fillingEnabled: true },
        tourPreferences: data?.tour_preferences || null
    };
}

export async function updateUserPreferences(
    userId: string,
    payload: { homeSettings?: any; homeLayout?: any; notificationFolders?: any[]; animationSettings?: any; attendanceSettings?: any; tourPreferences?: unknown }
): Promise<{ homeSettings: any; homeLayout: any; notificationFolders: any[]; animationSettings: any; attendanceSettings: any; tourPreferences: unknown }> {
    // Only update fields that are explicitly provided to avoid wiping the other
    const updatePayload: Record<string, any> = {};
    if (payload.homeSettings !== undefined) {
        updatePayload.home_settings = payload.homeSettings;
    }
    if (payload.homeLayout !== undefined) {
        updatePayload.home_layout = payload.homeLayout;
    }
    if (payload.notificationFolders !== undefined) {
        updatePayload.notification_folders = payload.notificationFolders;
    }
    if (payload.animationSettings !== undefined) {
        updatePayload.animation_settings = payload.animationSettings;
    }
    if (payload.attendanceSettings !== undefined) {
        updatePayload.attendance_settings = payload.attendanceSettings;
    }
    if (payload.tourPreferences !== undefined) {
        updatePayload.tour_preferences = payload.tourPreferences;
    }

    // Nothing to update — just return current state
    if (Object.keys(updatePayload).length === 0) {
        return getUserPreferences(userId);
    }

    const { data, error } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('home_settings, home_layout, notification_folders, animation_settings, attendance_settings, tour_preferences')
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    return {
        homeSettings: data?.home_settings || payload.homeSettings || null,
        homeLayout: data?.home_layout || payload.homeLayout || null,
        notificationFolders: (data?.notification_folders as any[]) || payload.notificationFolders || [],
        animationSettings: data?.animation_settings || payload.animationSettings || null,
        attendanceSettings: data?.attendance_settings || payload.attendanceSettings || { perfectEffectEnabled: true, fillingEnabled: true },
        tourPreferences: data?.tour_preferences || payload.tourPreferences || null
    };
}

// ============================================
// ANNOTATIONS (DESKTOP OFFLINE NOTES)
// ============================================

export async function getUserAnnotations(userId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('annotations, home_settings')
        .eq('id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    if (Array.isArray(data?.annotations)) {
        return data?.annotations || [];
    }

    const fallback = (data?.home_settings as any)?.annotations;
    return Array.isArray(fallback) ? fallback : [];
}

export async function updateUserAnnotations(userId: string, annotations: any[]): Promise<any[]> {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .update({ annotations })
            .eq('id', userId)
            .select('annotations')
            .maybeSingle();

        if (error && !isNotFoundError(error)) {
            throw error;
        }

        if (Array.isArray(data?.annotations)) {
            return data?.annotations || [];
        }
    } catch (error: any) {
        if (!String(error?.message || '').toLowerCase().includes('column')) {
            throw error;
        }
    }

    const { homeSettings } = await getUserPreferences(userId);
    const nextHome = { ...(homeSettings || {}), annotations };

    await updateUserPreferences(userId, { homeSettings: nextHome });
    return annotations;
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
// ASSISTANT CHAT THREADS / SKILLS
// ============================================

function isMissingColumnError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('column') || error?.code === '42703' || error?.code === 'PGRST204';
}

export async function getUserAssistantState(userId: string): Promise<{ threads: any[]; skills: any[] }> {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('assistant_chats, assistant_skills, home_settings')
            .eq('id', userId)
            .maybeSingle();

        if (error && !isNotFoundError(error)) {
            throw error;
        }

        return {
            threads: (data?.assistant_chats as any[]) || ((data?.home_settings as any)?.assistantChats as any[]) || [],
            skills: (data?.assistant_skills as any[]) || ((data?.home_settings as any)?.assistantSkills as any[]) || [],
        };
    } catch (error: any) {
        if (!isMissingColumnError(error)) {
            throw error;
        }

        const { homeSettings } = await getUserPreferences(userId);
        return {
            threads: Array.isArray(homeSettings?.assistantChats) ? homeSettings.assistantChats : [],
            skills: Array.isArray(homeSettings?.assistantSkills) ? homeSettings.assistantSkills : [],
        };
    }
}

export async function getUserAssistantPortalSnapshot(
    userId: string
): Promise<{ name?: string; school?: string; portalData: any | null }> {
    const { data, error } = await supabaseAdmin.rpc('get_assistant_portal_snapshot', {
        p_user_id: userId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
        name: typeof row?.name === 'string' ? row.name : undefined,
        school: typeof row?.school === 'string' ? row.school : undefined,
        portalData: row?.portal_data ?? null,
    };
}

export async function updateUserAssistantState(
    userId: string,
    payload: { threads?: any[]; skills?: any[] }
): Promise<{ threads: any[]; skills: any[] }> {
    const existing = await getUserAssistantState(userId);
    const next = {
        threads: payload.threads ?? existing.threads,
        skills: payload.skills ?? existing.skills,
    };

    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .update({
                assistant_chats: next.threads,
                assistant_skills: next.skills,
            })
            .eq('id', userId)
            .select('assistant_chats, assistant_skills')
            .maybeSingle();

        if (error && !isNotFoundError(error)) {
            throw error;
        }

        return {
            threads: (data?.assistant_chats as any[]) || next.threads,
            skills: (data?.assistant_skills as any[]) || next.skills,
        };
    } catch (error: any) {
        if (!isMissingColumnError(error)) {
            throw error;
        }
    }

    const { homeSettings } = await getUserPreferences(userId);
    await updateUserPreferences(userId, {
        homeSettings: {
            ...(homeSettings || {}),
            assistantChats: next.threads,
            assistantSkills: next.skills,
        },
    });
    return next;
}

// ============================================
// USER-OWNED CLASSROOM SNAPSHOTS
// ============================================

interface ClassroomDataRow {
    snapshot: unknown;
}

export async function getUserClassroomData(userId: string): Promise<ClassroomSnapshot | null> {
    const { data, error } = await supabaseAdmin
        .from('classroom_data')
        .select('snapshot')
        .eq('user_id', userId)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }
    if (!data) return null;

    return normalizeClassroomSnapshot((data as ClassroomDataRow).snapshot);
}

export async function getUserClassroomLastSyncedAt(userId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('classroom_data')
        .select('last_synced_at')
        .eq('user_id', userId)
        .maybeSingle();
    if (error && !isNotFoundError(error)) throw error;
    return data?.last_synced_at || null;
}

export class ClassroomSnapshotReplacementError extends Error {
    readonly reason: 'partial' | 'stale';

    constructor(reason: 'partial' | 'stale') {
        super(reason === 'partial'
            ? 'Partial Classroom data cannot replace the current snapshot.'
            : 'Older Classroom data cannot replace the current snapshot.');
        this.name = 'ClassroomSnapshotReplacementError';
        this.reason = reason;
    }
}

export async function replaceUserClassroomData(
    userId: string,
    snapshot: ClassroomSnapshot
): Promise<ClassroomSnapshot> {
    const normalized = normalizeClassroomSnapshot(snapshot);
    const retentionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('replace_classroom_snapshot', {
        p_user_id: userId,
        p_snapshot: normalized,
        p_schema_version: normalized.version,
        p_integrity: normalized.sync.integrity,
        p_course_count: normalized.sync.counts.courses,
        p_item_count: normalized.sync.counts.items,
        p_last_synced_at: normalized.sync.syncedAt,
        p_retention_expires_at: retentionExpiresAt,
    });

    if (error) throw error;
    const result: unknown = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Classroom snapshot replacement returned an invalid result');
    }
    const replaced = Reflect.get(result, 'replaced');
    const reason = Reflect.get(result, 'reason');
    if (replaced === true) return normalized;
    if (reason === 'partial' || reason === 'stale') {
        throw new ClassroomSnapshotReplacementError(reason);
    }
    throw new Error('Classroom snapshot replacement was not completed');
}

export async function deleteUserClassroomData(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('delete_classroom_snapshot', {
        p_user_id: userId,
    });
    if (error) throw error;

    const result: unknown = Array.isArray(data) ? data[0] : data;
    return Boolean(result && typeof result === 'object' && !Array.isArray(result) && Reflect.get(result, 'deleted') === true);
}
