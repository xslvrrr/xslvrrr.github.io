import type {
  DesktopArchitecture,
  DesktopArtifact,
  DesktopOperatingSystem,
  DesktopReleaseManifest,
  DetectedDesktopPlatform,
} from '@/types/desktop-downloads'

interface NavigatorUserAgentData {
  architecture?: string
  bitness?: string
  mobile?: boolean
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<NavigatorUserAgentData>
}

function getUserAgentData(): NavigatorUserAgentData | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { userAgentData?: NavigatorUserAgentData }).userAgentData || null
}

function detectArchitecture(architecture: string, bitness: string): 'arm64' | 'x64' | null {
  const normalizedArchitecture = architecture.toLowerCase()
  if (/arm64|aarch64/.test(normalizedArchitecture)) return 'arm64'
  if (normalizedArchitecture === 'arm' && bitness === '64') return 'arm64'
  if (/x86_64|amd64|x64/.test(normalizedArchitecture)) return 'x64'
  if (/x86/.test(normalizedArchitecture) && bitness === '64') return 'x64'
  return null
}

export async function detectDesktopPlatform(): Promise<DetectedDesktopPlatform> {
  if (typeof navigator === 'undefined') {
    return { os: null, architecture: null, isMobile: false }
  }

  const userAgentData = getUserAgentData()
  const highEntropy = userAgentData?.getHighEntropyValues
    ? await userAgentData.getHighEntropyValues(['architecture', 'bitness', 'platform']).catch(() => userAgentData)
    : userAgentData
  const userAgent = navigator.userAgent || ''
  const platform = `${highEntropy?.platform || navigator.platform || ''} ${userAgent}`
  const isMobile = Boolean(userAgentData?.mobile)
    || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
  const isChromeOs = /CrOS/i.test(platform)

  let os: DesktopOperatingSystem | null = null
  if (!isMobile && !isChromeOs) {
    if (/Windows|Win32|Win64/i.test(platform)) os = 'windows'
    else if (/Macintosh|MacIntel|Mac OS X/i.test(platform)) os = 'macos'
    else if (/Linux|X11/i.test(platform)) os = 'linux'
  }

  return {
    os,
    architecture: detectArchitecture(highEntropy?.architecture || '', highEntropy?.bitness || ''),
    isMobile: isMobile || isChromeOs,
  }
}

function isStringOrUndefined(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isValidArtifactCombination(artifact: Partial<DesktopArtifact>): boolean {
  if (artifact.os === 'macos') return artifact.format === 'dmg'
    && ['universal', 'arm64', 'x64'].includes(artifact.architecture || '')
  if (artifact.os === 'windows') return artifact.format === 'exe'
    && ['arm64', 'x64'].includes(artifact.architecture || '')
  if (artifact.os === 'linux') return ['appimage', 'deb'].includes(artifact.format || '')
    && ['arm64', 'x64'].includes(artifact.architecture || '')
  return false
}

function hasCanonicalArtifactUrl(urlValue: string, filename: string): boolean {
  try {
    const decoded = decodeURIComponent(urlValue)
    if (decoded.split('/').some((segment) => segment === '.' || segment === '..')) return false
    const url = new URL(urlValue, 'http://localhost')
    return url.origin === 'http://localhost'
      && url.pathname.startsWith('/downloads/desktop/')
      && url.search === ''
      && url.hash === ''
      && url.pathname.split('/').pop() === filename
  } catch {
    return false
  }
}

function isDesktopArtifact(value: unknown): value is DesktopArtifact {
  if (!value || typeof value !== 'object') return false
  const artifact = value as Partial<DesktopArtifact>
  const hasValidHash = artifact.sha256 === null
    || (typeof artifact.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(artifact.sha256))
  const hasValidSize = artifact.byteSize === null
    || (Number.isSafeInteger(artifact.byteSize) && Number(artifact.byteSize) > 0)
  const hasRequiredFields = typeof artifact.id === 'string'
    && artifact.id.trim().length > 0
    && typeof artifact.label === 'string'
    && artifact.label.trim().length > 0
    && ['macos', 'windows', 'linux'].includes(artifact.os || '')
    && ['universal', 'arm64', 'x64'].includes(artifact.architecture || '')
    && ['dmg', 'exe', 'appimage', 'deb'].includes(artifact.format || '')
    && typeof artifact.url === 'string'
    && typeof artifact.filename === 'string'
    && typeof artifact.available === 'boolean'
    && typeof artifact.signed === 'boolean'
    && typeof artifact.notarized === 'boolean'
    && isStringOrUndefined(artifact.minimumOs)
    && hasValidHash
    && hasValidSize
    && isValidArtifactCombination(artifact)
    && hasCanonicalArtifactUrl(artifact.url || '', artifact.filename || '')
  if (!hasRequiredFields) return false

  if (artifact.available) {
    if (!artifact.sha256 || !artifact.byteSize) return false
  }
  if (artifact.notarized && !artifact.signed) return false
  return true
}

export function parseDesktopReleaseManifest(value: unknown): DesktopReleaseManifest | null {
  if (!value || typeof value !== 'object') return null
  const manifest = value as Partial<DesktopReleaseManifest>
  if (
    typeof manifest.version !== 'string'
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)
    || !Array.isArray(manifest.artifacts)
    || !manifest.artifacts.every(isDesktopArtifact)
  ) {
    return null
  }
  if (
    manifest.publishedAt !== null
    && (
      typeof manifest.publishedAt !== 'string'
      || Number.isNaN(Date.parse(manifest.publishedAt))
    )
  ) {
    return null
  }
  const ids = manifest.artifacts.map((artifact) => artifact.id)
  if (new Set(ids).size !== ids.length) return null
  return manifest as DesktopReleaseManifest
}

export async function loadDesktopReleaseManifest(): Promise<DesktopReleaseManifest | null> {
  try {
    const response = await fetch('/downloads/desktop/manifest.json', { cache: 'no-store' })
    if (!response.ok) return null
    return parseDesktopReleaseManifest(await response.json())
  } catch {
    return null
  }
}

function compatibleArchitectures(platform: DetectedDesktopPlatform): DesktopArchitecture[] {
  if (!platform.os || platform.isMobile) return []
  if (platform.os === 'macos') {
    if (platform.architecture === 'arm64') return ['arm64', 'universal']
    if (platform.architecture === 'x64') return ['x64', 'universal']
    return ['universal']
  }
  return platform.architecture ? [platform.architecture] : []
}

export function selectPreferredArtifact(
  artifacts: DesktopArtifact[],
  platform: DetectedDesktopPlatform,
  availableOnly = false
): DesktopArtifact | null {
  if (!platform.os || platform.isMobile) return null
  const candidates = artifacts.filter((artifact) => artifact.os === platform.os && (!availableOnly || artifact.available))
  const formatOrder = platform.os === 'linux' ? ['appimage', 'deb'] : ['dmg', 'exe']

  for (const architecture of compatibleArchitectures(platform)) {
    for (const format of formatOrder) {
      const match = candidates.find((artifact) => artifact.architecture === architecture && artifact.format === format)
      if (match) return match
    }
  }
  return null
}

export function selectRecommendedArtifact(
  artifacts: DesktopArtifact[],
  platform: DetectedDesktopPlatform
): DesktopArtifact | null {
  return selectPreferredArtifact(artifacts, platform, true)
}

export function formatArtifactSize(byteSize: number | null): string | null {
  if (!byteSize || byteSize <= 0) return null
  const megabytes = byteSize / (1024 * 1024)
  return `${megabytes >= 100 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`
}
