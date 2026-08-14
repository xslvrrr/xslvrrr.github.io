import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../lib/api-response';
import {
  ClassroomDataValidationError,
  normalizeClassroomSnapshot,
} from '../../../../lib/classroom-data';
import { crossOriginMutationResponse } from '../../../../lib/csrf';
import { readJsonBody, requestBodyErrorResponse } from '../../../../lib/request-body';
import {
  EXPORT_SIGNATURE_VERSION,
  signExportPayload,
  verifyExportPayload,
} from '../../../../lib/export-signature';
import { readStartSession } from '../../../../lib/start-session';
import { StudyServiceError } from '../../../../lib/study/errors';
import { StudyImportService } from '../../../../lib/study/import-service';
import { SupabaseStudyRepository } from '../../../../lib/study/supabase-repository';
import {
  ClassroomSnapshotReplacementError,
  deleteUserClassroomData,
  findUserById,
  getUserAssistantState,
  getUserClassroomData,
  getUserLocalCalendar,
  getUserNotificationStates,
  getUserPreferences,
  getUserThemeBuilder,
  replaceUserClassroomData,
  replaceUserPortalData,
  updateUserAssistantState,
  updateUserLocalCalendar,
  updateUserNotificationStates,
  updateUserPreferences,
  updateUserSettings,
  updateUserThemeBuilder,
} from '../../../../lib/users';

const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const Route = createFileRoute('/api/user/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const [user, assistant, localCalendar, notifications, preferences, themeBuilder, classroomData] = await Promise.all([
            findUserById(session.userId, { includeProfileImage: true }),
            getUserAssistantState(session.userId),
            getUserLocalCalendar(session.userId),
            getUserNotificationStates(session.userId),
            getUserPreferences(session.userId),
            getUserThemeBuilder(session.userId),
            getUserClassroomData(session.userId),
          ]);
          if (!user) {
            return Response.json({ message: 'User not found' }, { status: 404, headers: noStoreHeaders });
          }

          // Study is exported best-effort: an account still on legacy storage has none to include.
          const study = await new StudyImportService(new SupabaseStudyRepository())
            .exportLibrary(session.userId, true)
            .catch(() => null);

          const exportedAt = new Date().toISOString();
          const payload = {
            schemaVersion: 2,
            exportedAt,
            account: {
              userId: user.id,
              millenniumUid: user.millenniumUid,
              email: user.email,
              name: user.name,
              school: user.school,
              createdAt: user.createdAt,
              lastSync: user.lastSync,
              settings: user.settings,
              profileImage: user.profileImage,
            },
            portalData: user.portalData || null,
            localCalendar,
            notifications,
            preferences,
            themeBuilder,
            assistant,
            classroomData,
            study,
          };
          const envelope = {
            signatureVersion: EXPORT_SIGNATURE_VERSION,
            payload,
            signature: signExportPayload(payload),
          };
          const date = exportedAt.slice(0, 10);
          return new Response(JSON.stringify(envelope, null, 2), {
            headers: {
              ...noStoreHeaders,
              'Content-Disposition': `attachment; filename="millennium-export-${date}.json"`,
              'Content-Type': 'application/json; charset=utf-8',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        } catch (error: unknown) {
          return internalErrorResponse(
            'User data export failed',
            'Failed to export account data',
            error,
            noStoreHeaders,
          );
        }
      },
      POST: async ({ request }) => {
        const crossOrigin = crossOriginMutationResponse(request);
        if (crossOrigin) {
          crossOrigin.headers.set('Cache-Control', 'no-store');
          return crossOrigin;
        }
        const session = readStartSession(request);
        if (!session.loggedIn || !session.userId) {
          return Response.json({ message: 'Not authenticated' }, { status: 401, headers: noStoreHeaders });
        }

        try {
          const envelope = await readJsonBody<unknown>(request, MAX_EXPORT_BYTES);
          if (
            !isRecord(envelope)
            || envelope.signatureVersion !== EXPORT_SIGNATURE_VERSION
            || !isRecord(envelope.payload)
            || typeof envelope.signature !== 'string'
          ) {
            return Response.json(
              { message: 'File is not a supported Millennium export' },
              { status: 400, headers: noStoreHeaders },
            );
          }
          if (!verifyExportPayload(envelope.payload, envelope.signature)) {
            return Response.json(
              { message: 'Export signature is invalid. The file may have been modified' },
              { status: 400, headers: noStoreHeaders },
            );
          }
          const payload = envelope.payload;
          // Schema v1 backups predate Study and stay restorable.
          if ((payload.schemaVersion !== 1 && payload.schemaVersion !== 2) || !isRecord(payload.account)) {
            return Response.json(
              { message: 'File is not a supported Millennium export' },
              { status: 400, headers: noStoreHeaders },
            );
          }
          if (typeof payload.account.userId !== 'string' || payload.account.userId !== session.userId) {
            return Response.json(
              { message: 'This export belongs to a different user and cannot be imported' },
              { status: 403, headers: noStoreHeaders },
            );
          }

          const classroomData = 'classroomData' in payload
            ? (payload.classroomData === null ? null : normalizeClassroomSnapshot(payload.classroomData))
            : undefined;
          if (classroomData === null) await deleteUserClassroomData(session.userId);
          if (classroomData) await replaceUserClassroomData(session.userId, classroomData);

          const tasks: Promise<unknown>[] = [];
          if (isRecord(payload.account.settings)) {
            tasks.push(updateUserSettings(
              session.userId,
              payload.account.settings as Parameters<typeof updateUserSettings>[1],
            ));
          }
          if ('portalData' in payload) tasks.push(replaceUserPortalData(session.userId, payload.portalData ?? null));
          if (isRecord(payload.localCalendar)) {
            tasks.push(updateUserLocalCalendar(
              session.userId,
              payload.localCalendar as Parameters<typeof updateUserLocalCalendar>[1],
            ));
          }
          if (isRecord(payload.notifications)) {
            tasks.push(updateUserNotificationStates(
              session.userId,
              payload.notifications as Parameters<typeof updateUserNotificationStates>[1],
            ));
          }
          if (isRecord(payload.preferences)) {
            tasks.push(updateUserPreferences(
              session.userId,
              payload.preferences as Parameters<typeof updateUserPreferences>[1],
            ));
          }
          if (isRecord(payload.themeBuilder)) {
            tasks.push(updateUserThemeBuilder(
              session.userId,
              payload.themeBuilder as Parameters<typeof updateUserThemeBuilder>[1],
            ));
          }
          if (isRecord(payload.assistant)) {
            tasks.push(updateUserAssistantState(
              session.userId,
              payload.assistant as Parameters<typeof updateUserAssistantState>[1],
            ));
          }
          await Promise.all(tasks);

          // Study restores last: it is revision-guarded and must not block the rest of the backup.
          let study = null;
          if (isRecord(payload.study)) {
            study = await new StudyImportService(new SupabaseStudyRepository())
              .restoreBackup(session.userId, payload.study);
          }

          return Response.json({ imported: true, study }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          const bodyError = requestBodyErrorResponse(error, noStoreHeaders);
          if (bodyError) return bodyError;
          if (error instanceof StudyServiceError) {
            return Response.json({
              message: error.message,
              error: { code: error.code, retryable: error.status >= 500 },
            }, { status: error.status, headers: noStoreHeaders });
          }
          if (error instanceof ClassroomDataValidationError) {
            return Response.json(
              { message: 'Export contains invalid Classroom data.' },
              { status: 400, headers: noStoreHeaders },
            );
          }
          if (error instanceof ClassroomSnapshotReplacementError) {
            return Response.json({
              message: error.message,
              error: {
                code: error.reason === 'partial' ? 'PARTIAL_SNAPSHOT_REJECTED' : 'STALE_SNAPSHOT_REJECTED',
                retryable: false,
              },
            }, { status: 409, headers: noStoreHeaders });
          }
          return internalErrorResponse(
            'User data import failed',
            'Failed to import account data',
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
