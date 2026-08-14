export type DesktopOperatingSystem = 'macos' | 'windows' | 'linux'
export type DesktopArchitecture = 'universal' | 'arm64' | 'x64'
export type DesktopArtifactFormat = 'dmg' | 'exe' | 'appimage' | 'deb'

export interface DesktopArtifact {
  id: string
  label: string
  os: DesktopOperatingSystem
  architecture: DesktopArchitecture
  format: DesktopArtifactFormat
  url: string
  filename: string
  sha256: string | null
  byteSize: number | null
  available: boolean
  signed: boolean
  notarized: boolean
  minimumOs?: string
}

export interface DesktopReleaseManifest {
  version: string
  publishedAt: string | null
  artifacts: DesktopArtifact[]
}

export interface DetectedDesktopPlatform {
  os: DesktopOperatingSystem | null
  architecture: Exclude<DesktopArchitecture, 'universal'> | null
  isMobile: boolean
}
