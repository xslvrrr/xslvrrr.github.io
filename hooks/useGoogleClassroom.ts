import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ClassroomItem,
    ClassroomFilters,
    ClassroomSettings,
    defaultClassroomSettings,
} from '../types/classroom';

// Scraped course type (from extension)
interface ScrapedCourse {
    id: string;
    name: string;
    section?: string;
    teacher?: string;
    link?: string;
}

// Scraped item type (from extension)
interface ScrapedItem {
    id: string;
    courseId: string;
    courseName: string;
    type: 'assignment' | 'material' | 'announcement';
    title: string;
    description?: string;
    descriptionHtml?: string;
    dueDate?: string | null;
    maxPoints?: number | null;
    link?: string;
    submissionState?: string;
}

interface UseGoogleClassroomReturn {
    // Data
    courses: ScrapedCourse[];
    items: ClassroomItem[];
    filteredItems: ClassroomItem[];
    missingItems: ClassroomItem[];
    recentActivity: ClassroomItem[];

    // State
    isLoading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    lastSynced: string | null;

    // Filters & Settings
    filters: ClassroomFilters;
    setFilters: (filters: Partial<ClassroomFilters>) => void;
    settings: ClassroomSettings;
    setSettings: (settings: Partial<ClassroomSettings>) => void;

    // Actions
    refresh: () => Promise<void>;
    openClassroomToSync: () => void;
    togglePinned: (itemId: string) => void;
    isPinned: (itemId: string) => boolean;

    // Course helpers
    getCourseById: (courseId: string) => ScrapedCourse | undefined;
    getCourseColor: (courseId: string) => string;
}

// Predefined colors for courses
const courseColors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#8b5cf6', // violet
    '#f59e0b', // amber
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
    '#6366f1', // indigo
    '#14b8a6', // teal
];

export function useGoogleClassroom(): UseGoogleClassroomReturn {
    const CLASSROOM_SCOPE_KEY = 'millennium_classroom_scope';
    // Core state
    const [courses, setCourses] = useState<ScrapedCourse[]>([]);
    const [items, setItems] = useState<ClassroomItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSynced, setLastSynced] = useState<string | null>(null);

    // Data is considered "authenticated" if we have synced classroom data
    const isAuthenticated = courses.length > 0 || items.length > 0;

    // Load settings from localStorage
    const [settings, setSettingsState] = useState<ClassroomSettings>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('classroomSettings');
            if (saved) {
                try {
                    return { ...defaultClassroomSettings, ...JSON.parse(saved) };
                } catch {
                    return defaultClassroomSettings;
                }
            }
        }
        return defaultClassroomSettings;
    });

    // Filters state
    const [filters, setFiltersState] = useState<ClassroomFilters>(settings.defaultFilters);

    // Course color mapping
    const [courseColorMap, setCourseColorMap] = useState<Record<string, string>>({});

    // Persist settings
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('classroomSettings', JSON.stringify(settings));
        }
    }, [settings]);

    // Assign colors to courses
    useEffect(() => {
        const colorMap: Record<string, string> = {};
        courses.forEach((course, index) => {
            colorMap[course.id] = courseColors[index % courseColors.length];
        });
        setCourseColorMap(colorMap);
    }, [courses]);

    // Transform scraped items to ClassroomItem format
    const transformItems = useCallback((scrapedItems: ScrapedItem[]): ClassroomItem[] => {
        return scrapedItems.map(item => {
            const dueDate = item.dueDate ? new Date(item.dueDate) : undefined;
            const now = new Date();
            const isLate = item.submissionState === 'MISSING' ||
                (item.submissionState === 'LATE');
            const isMissing = dueDate && dueDate < now &&
                (!item.submissionState ||
                    item.submissionState === 'NEW' ||
                    item.submissionState === 'ASSIGNED');

            return {
                id: item.id,
                courseId: item.courseId,
                courseName: item.courseName,
                type: item.type,
                title: item.title,
                description: item.description,
                descriptionHtml: item.descriptionHtml,
                materials: [], // Extension doesn't scrape attachments deeply
                creationTime: '', // Not available from scraping
                updateTime: '',
                alternateLink: item.link || `https://classroom.google.com/c/${item.courseId}`,
                dueDate,
                maxPoints: item.maxPoints || undefined,
                submission: item.submissionState ? {
                    state: item.submissionState as any,
                    late: isLate,
                } as any : undefined,
                isLate,
                isMissing: isMissing || false,
            };
        });
    }, []);

    // Fetch data from our API (which stores extension-synced data)
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const storedScope = typeof window !== 'undefined' ? localStorage.getItem(CLASSROOM_SCOPE_KEY) : null;
            const url = storedScope ? `/api/extension/classroom-sync?userNumber=${encodeURIComponent(storedScope)}` : '/api/extension/classroom-sync';
            const res = await fetch(url);

            if (!res.ok) {
                throw new Error('Failed to fetch classroom data');
            }

            const result = await res.json();

            if (result.success && result.data) {
                setCourses(result.data.courses || []);
                setItems(transformItems(result.data.items || []));
                setLastSynced(result.data.lastUpdated || null);
                if (result.scope && typeof window !== 'undefined') {
                    localStorage.setItem(CLASSROOM_SCOPE_KEY, result.scope);
                }
            } else {
                // No data yet - user needs to sync
                setCourses([]);
                setItems([]);
            }
        } catch (err) {
            console.error('Failed to fetch classroom data:', err);
            setError('No classroom data available. Visit Google Classroom with the extension to sync.');
        } finally {
            setIsLoading(false);
        }
    }, [transformItems]);

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Refresh - re-fetch from stored data
    const refresh = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    // Open Google Classroom to trigger sync
    const openClassroomToSync = useCallback(() => {
        window.open('https://classroom.google.com/', '_blank');
    }, []);

    // Filtered items based on current filters
    const filteredItems = useMemo(() => {
        let result = [...items];

        // Filter by course
        if (filters.courses.length > 0) {
            result = result.filter(item => filters.courses.includes(item.courseId));
        }

        // Filter by type
        if (filters.types.length > 0) {
            result = result.filter(item => filters.types.includes(item.type));
        }

        // Filter completed (for assignments)
        if (!filters.showCompleted) {
            result = result.filter(item => {
                if (item.type !== 'assignment') return true;
                return !item.submission ||
                    item.submission.state === 'NEW' ||
                    item.submission.state === 'ASSIGNED';
            });
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;

            switch (filters.sortBy) {
                case 'dueDate':
                    const aDate = a.dueDate?.getTime() || Infinity;
                    const bDate = b.dueDate?.getTime() || Infinity;
                    comparison = aDate - bDate;
                    break;
                case 'creationTime':
                    // Since we don't have creation time, sort by due date
                    const aTime = a.dueDate?.getTime() || 0;
                    const bTime = b.dueDate?.getTime() || 0;
                    comparison = bTime - aTime;
                    break;
                case 'courseName':
                    comparison = a.courseName.localeCompare(b.courseName);
                    break;
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
            }

            return filters.sortOrder === 'asc' ? comparison : -comparison;
        });

        // Put pinned items first
        const pinnedIds = new Set(settings.pinnedAssignments);
        result.sort((a, b) => {
            const aPinned = pinnedIds.has(a.id);
            const bPinned = pinnedIds.has(b.id);
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return 0;
        });

        return result;
    }, [items, filters, settings.pinnedAssignments]);

    // Missing items (late or not submitted past due date)
    const missingItems = useMemo(() => {
        return items.filter(item => item.isMissing || item.isLate);
    }, [items]);

    // Recent activity (items with due dates in next 7 days or past 7 days)
    const recentActivity = useMemo(() => {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAhead = new Date(now);
        sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

        return items
            .filter(item => {
                if (!item.dueDate) return false;
                return item.dueDate >= sevenDaysAgo && item.dueDate <= sevenDaysAhead;
            })
            .sort((a, b) => {
                const aTime = a.dueDate?.getTime() || 0;
                const bTime = b.dueDate?.getTime() || 0;
                return aTime - bTime;
            })
            .slice(0, 20);
    }, [items]);

    // Setters
    const setFilters = useCallback((newFilters: Partial<ClassroomFilters>) => {
        setFiltersState(prev => ({ ...prev, ...newFilters }));
    }, []);

    const setSettings = useCallback((newSettings: Partial<ClassroomSettings>) => {
        setSettingsState(prev => ({ ...prev, ...newSettings }));
    }, []);

    // Pin toggle
    const togglePinned = useCallback((itemId: string) => {
        setSettingsState(prev => {
            const isPinned = prev.pinnedAssignments.includes(itemId);
            return {
                ...prev,
                pinnedAssignments: isPinned
                    ? prev.pinnedAssignments.filter(id => id !== itemId)
                    : [...prev.pinnedAssignments, itemId],
            };
        });
    }, []);

    const isPinned = useCallback((itemId: string) => {
        return settings.pinnedAssignments.includes(itemId);
    }, [settings.pinnedAssignments]);

    // Helpers
    const getCourseById = useCallback((courseId: string) => {
        return courses.find(c => c.id === courseId);
    }, [courses]);

    const getCourseColor = useCallback((courseId: string) => {
        return courseColorMap[courseId] || '#6366f1';
    }, [courseColorMap]);

    return {
        courses,
        items,
        filteredItems,
        missingItems,
        recentActivity,
        isLoading,
        error,
        isAuthenticated,
        lastSynced,
        filters,
        setFilters,
        settings,
        setSettings,
        refresh,
        openClassroomToSync,
        togglePinned,
        isPinned,
        getCourseById,
        getCourseColor,
    };
}
