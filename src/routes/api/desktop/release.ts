import { createFileRoute } from '@tanstack/react-router';

import { internalErrorResponse } from '../../../../lib/api-response';
import { parseDesktopReleaseManifest } from '../../../../lib/desktop-downloads';
import releaseManifest from '../../../../public/downloads/desktop/manifest.json';

const cacheHeaders = {
  'Cache-Control': 'public, max-age=300, must-revalidate',
  'Vercel-CDN-Cache-Control': 'public, max-age=300',
};

/**
 * Publishes the desktop release listed on the install page.
 *
 * The packaged desktop application serves its own bundled assets from a loopback port, so it
 * cannot read `/downloads/desktop/manifest.json` directly. This endpoint reaches it through the
 * same `/api/*` proxy every other desktop request uses, which lets the in-app updater fall back
 * to the published install-page version whenever the signed update feed is unreachable.
 */
export const Route = createFileRoute('/api/desktop/release')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const manifest = parseDesktopReleaseManifest(releaseManifest);
          if (!manifest) {
            return Response.json(
              { success: false, data: null, error: 'DESKTOP_RELEASE_MANIFEST_INVALID' },
              { status: 500, headers: { 'Cache-Control': 'no-store' } },
            );
          }

          const origin = new URL(request.url).origin;
          const artifacts = manifest.artifacts
            .filter((artifact) => artifact.available)
            .map((artifact) => ({ ...artifact, url: new URL(artifact.url, origin).toString() }));

          return Response.json(
            {
              success: true,
              data: {
                version: manifest.version,
                publishedAt: manifest.publishedAt,
                downloadPageUrl: new URL('/download', origin).toString(),
                artifacts,
              },
              error: null,
            },
            { headers: cacheHeaders },
          );
        } catch (error) {
          return internalErrorResponse(
            'desktop_release_manifest_failed',
            'Desktop release information is unavailable.',
            error,
            { 'Cache-Control': 'no-store' },
            { success: false, data: null },
          );
        }
      },
    },
  },
});
