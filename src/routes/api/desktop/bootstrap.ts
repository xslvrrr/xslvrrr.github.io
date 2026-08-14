import { createFileRoute } from '@tanstack/react-router';
import { internalErrorResponse } from '../../../../lib/api-response';
import { getUserRole } from '../../../../lib/admin';
import { readStartSession } from '../../../../lib/start-session';
import {
  findUserPortalDataById,
  getUserClassroomData,
  getUserClassroomLastSyncedAt,
  getUserAnnotations,
  getUserGoogleCalendarMirror,
  getUserLocalCalendar,
  getUserNotificationStates,
  getUserPortalManifest,
  getUserPreferences,
  getUserThemeBuilder,
} from '../../../../lib/users';

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie',
};

export const Route = createFileRoute('/api/desktop/bootstrap')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = readStartSession(request);
          if (!session.loggedIn || !session.userId) {
            return Response.json({ message: 'Unauthorized' }, { status: 401, headers: noStoreHeaders });
          }

          const requestUrl = new URL(request.url);
          const portalSince = requestUrl.searchParams.get('portalSince');
          const classroomSince = requestUrl.searchParams.get('classroomSince');
          const [
            user,
            preferences,
            notificationStates,
            localCalendar,
            googleMirror,
            themeBuilder,
            annotations,
            classroomLastSyncedAt,
            role,
          ] = await Promise.all([
            getUserPortalManifest(session.userId),
            getUserPreferences(session.userId),
            getUserNotificationStates(session.userId),
            getUserLocalCalendar(session.userId),
            getUserGoogleCalendarMirror(session.userId),
            getUserThemeBuilder(session.userId),
            getUserAnnotations(session.userId),
            getUserClassroomLastSyncedAt(session.userId),
            getUserRole(session.userId),
          ]);
          if (!user) {
            return Response.json({ message: 'User not found' }, { status: 404, headers: noStoreHeaders });
          }

          const [portalUser, classroomData] = await Promise.all([
            user.lastSync && portalSince !== user.lastSync
              ? findUserPortalDataById(session.userId)
              : null,
            classroomLastSyncedAt && classroomSince !== classroomLastSyncedAt
              ? getUserClassroomData(session.userId)
              : null,
          ]);

          const bootstrapTime = new Date().toISOString();
          return Response.json({
            ownerId: session.userId,
            identity: {
              ownerId: session.userId,
              portalUid: user.millenniumUid || undefined,
              displayName: user.name,
              school: user.school,
              role: role || 'user',
              lastAuthenticatedAt: bootstrapTime,
              lastBootstrapAt: bootstrapTime,
              schemaVersion: 1,
            },
            portalData: portalUser?.portalData ? {
              ...portalUser.portalData,
              userId: session.userId,
              user: { name: user.name, school: user.school, uid: user.millenniumUid },
              lastUpdated: user.lastSync,
            } : null,
            preferences,
            notificationStates,
            localCalendar,
            googleMirror,
            themeBuilder,
            annotations,
            classroomData: classroomData ? { ...classroomData, ownerId: session.userId } : null,
            lastSync: user.lastSync || null,
          }, { headers: noStoreHeaders });
        } catch (error: unknown) {
          return internalErrorResponse(
            'Desktop bootstrap failed',
            'Failed to bootstrap desktop',
            error,
            noStoreHeaders,
          );
        }
      },
    },
  },
});
