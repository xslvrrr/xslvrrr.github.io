import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconBrandApple,
  IconBrandUbuntu,
  IconBrandWindows,
  IconCalendarTime,
  IconChevronDown,
  IconClipboardList,
  IconCloudOff,
  IconDownload,
  IconLock,
  IconRefresh,
  IconSchool,
} from '@tabler/icons-react'

import { PublicHeader } from '@/components/public/PublicHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  detectDesktopPlatform,
  formatArtifactSize,
  loadDesktopReleaseManifest,
  selectPreferredArtifact,
  selectRecommendedArtifact,
} from '@/lib/desktop-downloads'
import type {
  DesktopArtifact,
  DesktopOperatingSystem,
  DesktopReleaseManifest,
  DetectedDesktopPlatform,
} from '@/types/desktop-downloads'
import styles from '@/styles/Download.module.css'

const OS_ORDER: DesktopOperatingSystem[] = ['macos', 'windows', 'linux']
const OS_LABELS: Record<DesktopOperatingSystem, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

function OperatingSystemIcon({ os }: { os: DesktopOperatingSystem }) {
  if (os === 'macos') return <IconBrandApple aria-hidden="true" />
  if (os === 'windows') return <IconBrandWindows aria-hidden="true" />
  return <IconBrandUbuntu aria-hidden="true" />
}

function artifactStatus(artifact: DesktopArtifact): string {
  if (!artifact.available) return 'Coming soon'
  if (!artifact.signed) return 'Unsigned engineering build'
  if (artifact.os === 'macos' && !artifact.notarized) return 'Signed, not notarized'
  return 'Ready to download'
}

type ManifestStatus = 'loading' | 'ready' | 'error'

export default function Download() {
  const [manifest, setManifest] = useState<DesktopReleaseManifest | null>(null)
  const [manifestStatus, setManifestStatus] = useState<ManifestStatus>('loading')
  const [platform, setPlatform] = useState<DetectedDesktopPlatform>({
    os: null,
    architecture: null,
    isMobile: false,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadRelease = useCallback(async () => {
    setManifestStatus('loading')
    const [nextManifest, nextPlatform] = await Promise.all([
      loadDesktopReleaseManifest(),
      detectDesktopPlatform(),
    ])
    setPlatform(nextPlatform)
    if (!nextManifest) {
      setManifest(null)
      setSelectedId(null)
      setManifestStatus('error')
      return
    }

    setManifest(nextManifest)
    const preferred = selectPreferredArtifact(nextManifest.artifacts, nextPlatform)
    setSelectedId(preferred?.id || null)
    setManifestStatus('ready')
  }, [])

  useEffect(() => {
    void loadRelease()
  }, [loadRelease])

  const artifacts = manifest?.artifacts || []
  const recommendedArtifact = useMemo(
    () => selectRecommendedArtifact(artifacts, platform),
    [artifacts, platform]
  )
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedId)
    || recommendedArtifact
    || selectPreferredArtifact(artifacts, platform)
    || null
  const selectedSize = formatArtifactSize(selectedArtifact?.byteSize || null)
  const detectedLabel = platform.isMobile
    ? 'Desktop operating system required'
    : platform.os
      ? `${OS_LABELS[platform.os]}${platform.architecture ? ` ${platform.architecture.toUpperCase()}` : ''} detected`
      : 'Choose your operating system'
  const hasAvailableArtifacts = artifacts.some((artifact) => artifact.available)
  const selectedBuildNeedsTrustWarning = Boolean(
    selectedArtifact?.available
      && (!selectedArtifact.signed || (selectedArtifact.os === 'macos' && !selectedArtifact.notarized))
  )
  // Ad-hoc signing makes the macOS install and permission steps non-obvious, so the guide follows
  // whichever package the visitor is actually looking at rather than only their detected platform.
  const showMacGuide = selectedArtifact?.os === 'macos' || platform.os === 'macos'
  const releaseNote = manifestStatus === 'error'
    ? 'Release information could not be loaded. Retry before choosing a package.'
    : hasAvailableArtifacts
      ? 'macOS engineering builds are available. Universal works on Apple Silicon and Intel; optimized packages are smaller.'
      : 'Engineering builds are being prepared. Downloads stay disabled until signed packages and checksums are published.'

  return (
    <div className={styles.page}>
      <PublicHeader />

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="desktop-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <Badge variant="outline" className={styles.eyebrow}>
                <IconSchool aria-hidden="true" />
                Millennium, closer to home
              </Badge>
              <h1 id="desktop-title">Introducing Millennium for desktop</h1>
              <p className={styles.subtitle}>
                A faster, calmer way to keep school in view—even when the connection drops.
              </p>

              <div className={styles.downloadArea}>
                <ButtonGroup className={styles.downloadGroup}>
                  {selectedArtifact?.available ? (
                    <Button
                      size="lg"
                      className={styles.primaryDownload}
                      render={<a href={selectedArtifact.url} download={selectedArtifact.filename} />}
                    >
                      <OperatingSystemIcon os={selectedArtifact.os} />
                      Download {selectedArtifact.label}
                    </Button>
                  ) : (
                    <Button size="lg" className={styles.primaryDownload} disabled>
                      <IconDownload aria-hidden="true" />
                      {selectedArtifact ? `${selectedArtifact.label} coming soon` : 'Desktop builds coming soon'}
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={(
                        <Button
                          size="icon-lg"
                          variant="outline"
                          className={styles.buildMenuTrigger}
                          aria-label="Choose an optimized desktop build"
                          disabled={artifacts.length === 0}
                        />
                      )}
                    >
                      <IconChevronDown aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={styles.buildMenu}>
                      <DropdownMenuRadioGroup
                        value={selectedArtifact?.id || ''}
                        onValueChange={(value) => setSelectedId(value)}
                      >
                        {OS_ORDER.map((os, osIndex) => {
                          const osArtifacts = artifacts.filter((artifact) => artifact.os === os)
                          if (osArtifacts.length === 0) return null
                          return (
                            <DropdownMenuGroup key={os}>
                              {osIndex > 0 ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuLabel>{OS_LABELS[os]}</DropdownMenuLabel>
                              {osArtifacts.map((artifact) => (
                                <DropdownMenuRadioItem
                                  key={artifact.id}
                                  value={artifact.id}
                                  className={styles.buildMenuItem}
                                >
                                  <OperatingSystemIcon os={artifact.os} />
                                  <span>
                                    <strong>{artifact.label}</strong>
                                    <small>{artifactStatus(artifact)}</small>
                                  </span>
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuGroup>
                          )
                        })}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ButtonGroup>

                <div className={styles.downloadMeta} aria-live="polite">
                  <Badge variant="secondary">{detectedLabel}</Badge>
                  {manifestStatus === 'loading' ? <span>Loading release information…</span> : null}
                  {manifestStatus === 'ready' && manifest ? <span>Version {manifest.version}</span> : null}
                  {selectedSize ? <span>{selectedSize}</span> : null}
                  {manifestStatus === 'ready' && selectedArtifact ? <span>{artifactStatus(selectedArtifact)}</span> : null}
                  {manifestStatus === 'error' ? (
                    <Button size="xs" variant="ghost" onClick={() => void loadRelease()}>
                      Retry release information
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className={styles.releaseNote}>{releaseNote}</p>

              {selectedBuildNeedsTrustWarning && selectedArtifact ? (
                <Alert variant="destructive" className={styles.releaseWarning}>
                  <IconAlertTriangle aria-hidden="true" />
                  <AlertTitle>Unsigned engineering build</AlertTitle>
                  <AlertDescription>
                    <span>This package uses ad-hoc signing and is not Apple-notarized. macOS may require manual approval in Privacy &amp; Security.</span>
                    <span className={styles.releaseChecksum}>SHA-256: <code>{selectedArtifact.sha256}</code></span>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className={styles.desktopVisual} role="img" aria-label="Millennium desktop showing a cached timetable and Google Classroom assignments">
              <div className={styles.windowChrome}>
                <div className={styles.trafficLights} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span>Millennium Desktop</span>
                <Badge variant="outline">Offline ready</Badge>
              </div>
              <div className={styles.windowBody}>
                <aside className={styles.previewSidebar} aria-hidden="true">
                  <div className={styles.previewMark}>M</div>
                  <span className={styles.activeNav}><IconCalendarTime /></span>
                  <span><IconClipboardList /></span>
                  <span><IconSchool /></span>
                </aside>
                <div className={styles.previewContent}>
                  <div className={styles.previewTopline}>
                    <div>
                      <small>Tuesday, 19 July</small>
                      <strong>Everything due, without noise.</strong>
                    </div>
                    <Badge variant="secondary"><IconCloudOff /> Cached</Badge>
                  </div>
                  <div className={styles.previewColumns}>
                    <Card className={styles.previewCard}>
                      <CardContent>
                        <span className={styles.previewCardLabel}>Today</span>
                        <div className={styles.lessonRow}><i className={styles.indigo} /><span><strong>English</strong><small>Period 1 · Room 14</small></span></div>
                        <div className={styles.lessonRow}><i className={styles.violet} /><span><strong>Mathematics</strong><small>Period 2 · Room 7</small></span></div>
                        <div className={styles.lessonRow}><i className={styles.blue} /><span><strong>Science</strong><small>Period 4 · Lab 2</small></span></div>
                      </CardContent>
                    </Card>
                    <Card className={styles.previewCard}>
                      <CardContent>
                        <span className={styles.previewCardLabel}>Classroom</span>
                        <div className={styles.assignmentRow}><IconClipboardList /><span><strong>Source analysis</strong><small>English · Assigned</small></span></div>
                        <div className={styles.assignmentRow}><IconClipboardList /><span><strong>Quadratics review</strong><small>Mathematics · Missing</small></span></div>
                        <div className={styles.assignmentRow}><IconClipboardList /><span><strong>Lab reflection</strong><small>Science · Turned in</small></span></div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.principles} aria-label="Desktop principles">
          <Card className={styles.principleCard}>
            <CardContent>
              <IconCloudOff />
              <h2>Useful without a signal</h2>
              <p>Last synced timetable, notices, portal data, and Classroom work stay available from encrypted local cache.</p>
            </CardContent>
          </Card>
          <Card className={styles.principleCard}>
            <CardContent>
              <IconLock />
              <h2>Local by design</h2>
              <p>Google sign-in happens in a visible browser. Millennium never captures your Google password.</p>
            </CardContent>
          </Card>
          <Card className={styles.principleCard}>
            <CardContent>
              <IconDownload />
              <h2>Built for your machine</h2>
              <p>Universal defaults and optimized ARM64 or x64 packages keep installation predictable across platforms.</p>
            </CardContent>
          </Card>
          <Card className={styles.principleCard}>
            <CardContent>
              <IconRefresh />
              <h2>Never behind the web app</h2>
              <p>Installed copies verify and load the interface from the current Millennium release, so you install once and keep getting features. Native updates download in the sidebar with live progress, then install on your word.</p>
            </CardContent>
          </Card>
        </section>

        {showMacGuide ? (
          <section className={styles.macGuide} aria-labelledby="macos-guide-title">
            <Card className={styles.macGuideCard}>
              <CardContent>
                <div className={styles.macGuideIntro}>
                  <h2 id="macos-guide-title">Installing and permitting Millennium on macOS</h2>
                  <p>
                    Millennium is ad-hoc signed rather than notarized by Apple, so macOS treats the
                    download as untrusted until you approve it once. Installing into Applications
                    matters: macOS runs an unapproved copy from a temporary path, and permissions
                    granted there are forgotten on the next launch.
                  </p>
                </div>

                <div className={styles.macGuideColumns}>
                  <div className={styles.macGuideStep}>
                    <h3>1. Install and open it once</h3>
                    <ol>
                      <li>Open the downloaded <code>.dmg</code> and drag Millennium into Applications.</li>
                      <li>Eject the disk image, then open your Applications folder.</li>
                      <li>
                        Right-click Millennium and choose <strong>Open</strong>, then confirm. A
                        plain double-click can be refused because the build is not notarized.
                      </li>
                      <li>
                        If macOS refuses anyway, open <strong>System Settings</strong> →{' '}
                        <strong>Privacy &amp; Security</strong>, scroll to the security notice, and
                        choose <strong>Open Anyway</strong>.
                      </li>
                    </ol>
                  </div>

                  <div className={styles.macGuideStep}>
                    <h3>2. Allow read-only browser access</h3>
                    <ol>
                      <li>In Millennium, open Classroom and start a sync so its dedicated browser window opens.</li>
                      <li>Choose <strong>Allow</strong> when macOS asks whether Millennium can control that browser.</li>
                      <li>
                        If no prompt appears, use <strong>Repair permission</strong> in Millennium&apos;s
                        permission dialog, then <strong>Ask macOS again</strong>.
                      </li>
                      <li>
                        Verify under <strong>System Settings</strong> → <strong>Privacy &amp;
                        Security</strong> → <strong>Automation</strong>.
                      </li>
                    </ol>
                  </div>
                </div>

                <p className={styles.macGuideNote}>
                  The Automation list has no button for adding an app, and Millennium only appears
                  there after it has asked at least once. An empty list means the request never
                  reached macOS — repair the permission from inside Millennium rather than looking
                  for a control that does not exist. As a last resort you can clear the download
                  flag yourself with{' '}
                  <code>xattr -dr com.apple.quarantine /Applications/Millennium.app</code>.
                </p>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </main>
    </div>
  )
}
