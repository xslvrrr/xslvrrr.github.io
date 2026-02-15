// Google Classroom Type Definitions

// Google Classroom API Course type
export interface ClassroomCourse {
    id: string;
    name: string;
    section?: string;
    descriptionHeading?: string;
    description?: string;
    room?: string;
    ownerId?: string;
    creationTime?: string;
    updateTime?: string;
    enrollmentCode?: string;
    courseState?: 'ACTIVE' | 'ARCHIVED' | 'PROVISIONED' | 'DECLINED' | 'SUSPENDED';
    alternateLink?: string;
    teacherGroupEmail?: string;
    courseGroupEmail?: string;
    guardiansEnabled?: boolean;
    calendarId?: string;
    // Fields from extension scraping
    teacher?: string;
    link?: string;
    classworkLink?: string;
    streamLink?: string;
    lastSyncedAt?: string;
}

export interface ClassroomCoursework {
    courseId: string;
    id: string;
    title: string;
    description?: string;
    materials?: ClassroomMaterial[];
    state: 'PUBLISHED' | 'DRAFT' | 'DELETED';
    alternateLink: string;
    creationTime: string;
    updateTime: string;
    dueDate?: {
        year: number;
        month: number;
        day: number;
    };
    dueTime?: {
        hours?: number;
        minutes?: number;
        seconds?: number;
        nanos?: number;
    };
    scheduledTime?: string;
    maxPoints?: number;
    workType: 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION';
    assigneeMode?: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS';
    submissionModificationMode?: 'MODIFIABLE_UNTIL_TURNED_IN' | 'MODIFIABLE';
    creatorUserId: string;
    topicId?: string;
}

export interface ClassroomMaterial {
    driveFile?: {
        driveFile: {
            id: string;
            title: string;
            alternateLink: string;
            thumbnailUrl?: string;
        };
        shareMode: 'VIEW' | 'EDIT' | 'STUDENT_COPY';
    };
    youtubeVideo?: {
        id: string;
        title: string;
        alternateLink: string;
        thumbnailUrl?: string;
    };
    link?: {
        url: string;
        title?: string;
        thumbnailUrl?: string;
    };
    form?: {
        formUrl: string;
        responseUrl?: string;
        title: string;
        thumbnailUrl?: string;
    };
}

export interface ClassroomCourseworkMaterial {
    courseId: string;
    id: string;
    title: string;
    description?: string;
    materials?: ClassroomMaterial[];
    state: 'PUBLISHED' | 'DRAFT' | 'DELETED';
    alternateLink: string;
    creationTime: string;
    updateTime: string;
    scheduledTime?: string;
    topicId?: string;
    creatorUserId: string;
}

export interface ClassroomAnnouncement {
    courseId: string;
    id: string;
    text: string;
    materials?: ClassroomMaterial[];
    state: 'PUBLISHED' | 'DRAFT' | 'DELETED';
    alternateLink: string;
    creationTime: string;
    updateTime: string;
    scheduledTime?: string;
    assigneeMode?: 'ALL_STUDENTS' | 'INDIVIDUAL_STUDENTS';
    creatorUserId: string;
}

export interface ClassroomSubmission {
    courseId: string;
    courseWorkId: string;
    id: string;
    userId: string;
    creationTime: string;
    updateTime: string;
    state: 'NEW' | 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT';
    late?: boolean;
    draftGrade?: number;
    assignedGrade?: number;
    alternateLink: string;
    courseWorkType: 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION';
    associatedWithDeveloper?: boolean;
    assignmentSubmission?: {
        attachments?: ClassroomMaterial[];
    };
    shortAnswerSubmission?: {
        answer?: string;
    };
    multipleChoiceSubmission?: {
        answer?: string;
    };
}

// Combined/processed types for UI

export interface ClassroomItem {
    id: string;
    courseId: string;
    courseName: string;
    type: 'assignment' | 'material' | 'announcement';
    title: string;
    description?: string;
    descriptionHtml?: string;
    materials?: ClassroomMaterial[];
    creationTime: string;
    updateTime: string;
    alternateLink: string;
    dueDate?: Date;
    dueText?: string;
    maxPoints?: number;
    submission?: ClassroomSubmission;
    isLate?: boolean;
    isMissing?: boolean;
    // Fields from extension scraping
    contentHash?: string;
    scrapedAt?: string;
    postedTime?: string | null;
    submissionState?: string;
}

export interface ClassroomFilters {
    courses: string[]; // Course IDs to filter by (empty = all)
    types: ('assignment' | 'material' | 'announcement')[];
    showCompleted: boolean;
    sortBy: 'dueDate' | 'creationTime' | 'courseName' | 'title';
    sortOrder: 'asc' | 'desc';
}

export interface ClassroomSettings {
    dueDateFormat: 'relative' | 'absolute';
    dueDateDetail: 'seconds' | 'minutes' | 'hours' | 'days';
    showCourseColors: boolean;
    enableTimetableIntegration: boolean;
    defaultFilters: ClassroomFilters;
    pinnedAssignments: string[]; // Assignment IDs
}

export interface ClassroomState {
    courses: ClassroomCourse[];
    items: ClassroomItem[];
    submissions: Record<string, ClassroomSubmission>; // Keyed by coursework ID
    isLoading: boolean;
    error: string | null;
    lastFetched: string | null;
}

// Default settings
export const defaultClassroomSettings: ClassroomSettings = {
    dueDateFormat: 'relative',
    dueDateDetail: 'hours',
    showCourseColors: true,
    enableTimetableIntegration: false,
    defaultFilters: {
        courses: [],
        types: ['assignment', 'material', 'announcement'],
        showCompleted: false,
        sortBy: 'dueDate',
        sortOrder: 'asc',
    },
    pinnedAssignments: [],
};

// Helper to format due date based on settings
export function formatDueDate(
    dueDate: Date | undefined,
    settings: ClassroomSettings
): string {
    if (!dueDate) return 'No due date';

    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();
    const isPast = diff < 0;
    const absDiff = Math.abs(diff);

    if (settings.dueDateFormat === 'absolute') {
        return dueDate.toLocaleDateString('en-AU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    // Relative format
    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let value: number;
    let unit: string;

    switch (settings.dueDateDetail) {
        case 'seconds':
            if (seconds < 60) {
                value = seconds;
                unit = 'second';
            } else if (minutes < 60) {
                value = minutes;
                unit = 'minute';
            } else if (hours < 24) {
                value = hours;
                unit = 'hour';
            } else {
                value = days;
                unit = 'day';
            }
            break;
        case 'minutes':
            if (minutes < 60) {
                value = minutes;
                unit = 'minute';
            } else if (hours < 24) {
                value = hours;
                unit = 'hour';
            } else {
                value = days;
                unit = 'day';
            }
            break;
        case 'hours':
            if (hours < 24) {
                value = hours;
                unit = 'hour';
            } else {
                value = days;
                unit = 'day';
            }
            break;
        case 'days':
        default:
            value = days;
            unit = 'day';
            break;
    }

    const plural = value !== 1 ? 's' : '';

    if (isPast) {
        return `${value} ${unit}${plural} ago`;
    }
    return `in ${value} ${unit}${plural}`;
}

// Helper to parse Google's date/time format
export function parseGoogleDateTime(
    dueDate?: { year: number; month: number; day: number },
    dueTime?: { hours?: number; minutes?: number; seconds?: number }
): Date | undefined {
    if (!dueDate) return undefined;

    const date = new Date(
        dueDate.year,
        dueDate.month - 1, // JS months are 0-indexed
        dueDate.day,
        dueTime?.hours || 23,
        dueTime?.minutes || 59,
        dueTime?.seconds || 59
    );

    return date;
}
