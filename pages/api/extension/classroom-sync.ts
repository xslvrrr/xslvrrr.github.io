import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../../../lib/logger';
import {
    upsertClassroomData,
    getClassroomData,
    getLatestClassroomData,
    ClassroomItem,
    ClassroomCourse
} from '../../../lib/users';

interface SyncRequest {
    courses: ClassroomCourse[];
    items: ClassroomItem[];
    userNumber?: string;
    syncMode?: 'full' | 'incremental' | 'deep';
    lastSyncTime?: string | null;
    lastUpdated: string;
    syncResults?: {
        courseId: string;
        courseName: string;
        itemCount: number;
        success: boolean;
        error?: string;
    }[];
}

// Calculate similarity between two items (for edit detection)
function calculateSimilarity(a: ClassroomItem, b: ClassroomItem): number {
    let score = 0;

    // Same ID is a strong match
    if (a.id === b.id && a.courseId === b.courseId) {
        score += 50;
    }

    // Title similarity
    if (a.title && b.title) {
        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();
        if (titleA === titleB) {
            score += 30;
        } else if (titleA.includes(titleB) || titleB.includes(titleA)) {
            score += 15;
        }
    }

    // Same type
    if (a.type === b.type) {
        score += 10;
    }

    // Same course
    if (a.courseId === b.courseId) {
        score += 10;
    }

    return score;
}

// Find the most similar existing item for a new item
function findMostSimilarItem(
    newItem: ClassroomItem,
    existingItems: ClassroomItem[]
): { item: ClassroomItem | null; score: number } {
    let bestMatch: ClassroomItem | null = null;
    let bestScore = 0;

    for (const existing of existingItems) {
        const score = calculateSimilarity(newItem, existing);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = existing;
        }
    }

    return { item: bestMatch, score: bestScore };
}

// Merge items with edit detection
function mergeItemsWithDiff(
    existingItems: ClassroomItem[],
    newItems: ClassroomItem[],
    syncMode: string
): { merged: ClassroomItem[]; stats: { added: number; updated: number; unchanged: number } } {
    const stats = { added: 0, updated: 0, unchanged: 0 };

    // Create a map of existing items by composite key
    const existingMap = new Map<string, ClassroomItem>();
    for (const item of existingItems) {
        const key = `${item.courseId}-${item.id}`;
        existingMap.set(key, item);
    }

    // Process new items
    for (const newItem of newItems) {
        const key = `${newItem.courseId}-${newItem.id}`;
        const existing = existingMap.get(key);

        if (!existing) {
            // New item
            existingMap.set(key, newItem);
            stats.added++;
        } else {
            // Check if item has changed using content hash
            const existingHash = existing.contentHash;
            const newHash = newItem.contentHash;

            if (existingHash && newHash && existingHash !== newHash) {
                // Item was edited - update it
                existingMap.set(key, {
                    ...existing,
                    ...newItem,
                    // Preserve some existing fields if new ones are empty
                    description: newItem.description || existing.description,
                    descriptionHtml: newItem.descriptionHtml || existing.descriptionHtml,
                    postedTime: newItem.postedTime || existing.postedTime,
                });
                stats.updated++;
            } else if (!existingHash || !newHash) {
                // No hash available, check by title/description change
                const titleChanged = existing.title !== newItem.title;
                const descChanged = existing.description !== newItem.description;
                const dueDateChanged = existing.dueDate !== newItem.dueDate;
                const pointsChanged = existing.maxPoints !== newItem.maxPoints;

                if (titleChanged || descChanged || dueDateChanged || pointsChanged) {
                    existingMap.set(key, {
                        ...existing,
                        ...newItem,
                        description: newItem.description || existing.description,
                        descriptionHtml: newItem.descriptionHtml || existing.descriptionHtml,
                        postedTime: newItem.postedTime || existing.postedTime,
                    });
                    stats.updated++;
                } else {
                    stats.unchanged++;
                }
            } else {
                stats.unchanged++;
            }
        }
    }

    return { merged: Array.from(existingMap.values()), stats };
}

// API endpoint to receive Google Classroom data from the browser extension
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Enable CORS for extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        // Return stored classroom data with last sync time
        try {
            const scopeParam = typeof req.query.userNumber === 'string' && req.query.userNumber.trim().length > 0
                ? req.query.userNumber.trim()
                : null;

            const result = scopeParam
                ? { scope: scopeParam, data: await getClassroomData(scopeParam) }
                : await getLatestClassroomData();

            const scope = result?.scope || 'global';
            const data = result?.data || { courses: [], items: [], lastUpdated: '' };
            return res.status(200).json({
                success: true,
                scope,
                data: {
                    ...data,
                    // Include sync metadata
                    coursesCount: data.courses?.length || 0,
                    itemsCount: data.items?.length || 0,
                }
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const data: SyncRequest = req.body;

        const syncMode = data.syncMode || 'full';
        const scope = data.userNumber && data.userNumber.trim().length > 0 ? data.userNumber.trim() : 'global';

        logger.info('[Classroom Sync] Received data from extension:', {
            coursesCount: data.courses?.length || 0,
            itemsCount: data.items?.length || 0,
            syncMode,
            lastUpdated: data.lastUpdated
        });

        // Validate the data
        if (!data || !data.lastUpdated) {
            return res.status(400).json({ message: 'Invalid data format: missing lastUpdated' });
        }

        // Get existing data for merging
        const existingData = await getClassroomData(scope);

        // Merge courses (always replace/update by ID)
        const courseMap = new Map<string, ClassroomCourse>();
        for (const course of existingData.courses || []) {
            courseMap.set(course.id, course);
        }
        for (const course of data.courses || []) {
            courseMap.set(course.id, {
                ...courseMap.get(course.id),
                ...course,
            });
        }
        const mergedCourses = Array.from(courseMap.values());

        // Merge items with diff detection
        const { merged: mergedItems, stats: itemStats } = mergeItemsWithDiff(
            existingData.items || [],
            data.items || [],
            syncMode
        );

        // Store the merged data with sync stats
        const savedData = await upsertClassroomData({
            scope,
            courses: mergedCourses,
            items: mergedItems,
            lastUpdated: data.lastUpdated,
            syncMode: syncMode as 'full' | 'incremental' | 'deep',
            itemsAdded: itemStats.added,
            itemsUpdated: itemStats.updated,
        });

        logger.info('[Classroom Sync] Data stored successfully:', {
            syncMode,
            courses: mergedCourses.length,
            items: mergedItems.length,
            itemStats,
        });

        // Count by type
        const assignments = mergedItems.filter(i => i.type === 'assignment').length;
        const materials = mergedItems.filter(i => i.type === 'material').length;
        const announcements = mergedItems.filter(i => i.type === 'announcement').length;

        return res.status(200).json({
            success: true,
            message: 'Classroom data synced successfully',
            scope,
            syncMode,
            counts: {
                courses: mergedCourses.length,
                items: mergedItems.length,
                assignments,
                materials,
                announcements,
            },
            changes: itemStats,
            lastUpdated: data.lastUpdated,
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[Classroom Sync] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to sync classroom data',
            error: errorMessage
        });
    }
}
