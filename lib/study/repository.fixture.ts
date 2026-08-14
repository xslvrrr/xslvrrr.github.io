import { vi } from "vitest";

import type { StudyRepository } from "./repository";

/**
 * Full repository double for service tests. Every method is a stub by default so adding a
 * repository capability does not break unrelated tests; each test overrides what it exercises.
 */
export function createStudyRepositoryStub(
  overrides: Partial<StudyRepository> = {},
): StudyRepository {
  return {
    getBootstrap: vi.fn(),
    listDecks: vi.fn(),
    getDeck: vi.fn(),
    getNote: vi.fn(),
    getCard: vi.fn(),
    getPreferences: vi.fn(),
    getSchedulerProfile: vi.fn(),
    getDeckSchedulerProfile: vi.fn(),
    findReviewResult: vi.fn().mockResolvedValue(null),
    commitReview: vi.fn(),
    saveDeck: vi.fn(),
    deleteDeck: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
    getDeckContents: vi.fn(),
    getReviewQueue: vi.fn(),
    findUndoableReview: vi.fn(),
    commitUndo: vi.fn(),
    savePreferences: vi.fn(),
    pullSyncChanges: vi.fn(),
    getSyncSnapshot: vi.fn(),
    getDeckContentKeys: vi.fn().mockResolvedValue(new Set<string>()),
    createImportJob: vi.fn(async (_userId, job) => job.summary),
    commitImportJob: vi.fn(),
    rollbackImportJob: vi.fn(),
    getReviewHistoryPage: vi.fn().mockResolvedValue({ events: [], nextCursor: null }),
    restoreBackup: vi.fn(),
    searchCards: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    bulkUpdateCards: vi.fn().mockResolvedValue({ affected: 0 }),
    searchCompiledQuery: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listSmartSessions: vi.fn().mockResolvedValue([]),
    saveSmartSession: vi.fn(),
    deleteSmartSession: vi.fn(),
    getAnalytics: vi.fn(),
    ...overrides,
  };
}
