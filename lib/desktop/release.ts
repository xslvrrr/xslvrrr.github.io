import {
  detectDesktopPlatform,
  parseDesktopReleaseManifest,
  selectRecommendedArtifact,
} from '@/lib/desktop-downloads'
import type { DesktopArtifact } from '@/types/desktop-downloads'

import { isNewerDesktopVersion } from './version'

export interface DesktopManualUpdate {
  version: string
  downloadUrl: string
  downloadPageUrl: string
  artifact: DesktopArtifact | null
}

interface ReleaseResponse {
  success?: unknown
  data?: {
    version?: unknown
    publishedAt?: unknown
    downloadPageUrl?: unknown
    artifacts?: unknown
  } | null
}

/**
 * Reads the release published on the install page.
 *
 * This is the fallback path for the in-app updater. When the signed update feed cannot be
 * reached — no published release, offline release host, or a signature the installation cannot
 * verify — the app still has to tell the user that a newer build exists and hand them the exact
 * package the install page offers.
 */
export async function loadManualDesktopUpdate(
  currentVersion: string,
): Promise<DesktopManualUpdate | null> {
  const response = await fetch('/api/desktop/release', {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Release lookup failed with status ${response.status}`)

  const payload = (await response.json()) as ReleaseResponse
  const data = payload?.data
  if (!data || typeof data.version !== 'string') {
    throw new Error('Release lookup returned an unusable payload.')
  }

  const manifest = parseDesktopReleaseManifest({
    version: data.version,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
    artifacts: Array.isArray(data.artifacts)
      ? data.artifacts.map((artifact) => normalizeArtifactUrl(artifact))
      : [],
  })
  if (!manifest || !isNewerDesktopVersion(manifest.version, currentVersion)) return null

  const downloadPageUrl = typeof data.downloadPageUrl === 'string'
    ? data.downloadPageUrl
    : new URL('/download', window.location.origin).toString()
  const platform = await detectDesktopPlatform()
  const artifact = selectRecommendedArtifact(manifest.artifacts, platform)

  return {
    version: manifest.version,
    downloadUrl: artifact ? absoluteArtifactUrl(artifact.url, downloadPageUrl) : downloadPageUrl,
    downloadPageUrl,
    artifact,
  }
}

/**
 * The endpoint returns absolute artifact URLs, while manifest validation expects the canonical
 * `/downloads/desktop/...` form. Normalizing back to a path keeps one validation path for both
 * the install page and the desktop updater.
 */
function normalizeArtifactUrl(artifact: unknown): unknown {
  if (!artifact || typeof artifact !== 'object') return artifact
  const candidate = artifact as { url?: unknown }
  if (typeof candidate.url !== 'string') return artifact
  try {
    const url = new URL(candidate.url, window.location.origin)
    return { ...artifact, url: `${url.pathname}${url.search}${url.hash}` }
  } catch {
    return artifact
  }
}

function absoluteArtifactUrl(path: string, base: string): string {
  try {
    return new URL(path, base).toString()
  } catch {
    return base
  }
}
