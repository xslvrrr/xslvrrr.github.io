import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef } from 'react'

async function setNativeWindowControlsVisible(visible: boolean) {
  await invoke('set_window_controls_visible', { visible })
}

export function DesktopWindowChrome() {
  const desiredVisibility = useRef(false)
  const appliedVisibility = useRef<boolean | null>(null)
  const isApplyingVisibility = useRef(false)
  const hoverZone = useRef<HTMLDivElement | null>(null)
  const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS X/i.test(navigator.userAgent)

  const reconcileNativeVisibility = useCallback(async () => {
    if (isApplyingVisibility.current) return
    isApplyingVisibility.current = true
    try {
      while (appliedVisibility.current !== desiredVisibility.current) {
        const next = desiredVisibility.current
        // A rejected invoke used to be recorded as applied, so a native call that never ran left
        // the traffic lights permanently hidden and every later hover short-circuited as a no-op.
        // Leave the applied state alone on failure and stop, so the next hover tries again.
        await setNativeWindowControlsVisible(next)
        appliedVisibility.current = next
      }
    } catch (error) {
      console.warn('Native window controls could not be updated', error)
    } finally {
      isApplyingVisibility.current = false
    }
  }, [])

  const setControlsVisible = useCallback((visible: boolean) => {
    if (desiredVisibility.current === visible && appliedVisibility.current === visible) return
    desiredVisibility.current = visible
    document.documentElement.classList.toggle('desktop-window-controls-visible', visible)
    void reconcileNativeVisibility()
  }, [reconcileNativeVisibility])

  useEffect(() => {
    if (!isMac) return
    setControlsVisible(false)

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = hoverZone.current?.getBoundingClientRect()
      if (!bounds) return
      setControlsVisible(
        event.clientX >= bounds.left
        && event.clientX <= bounds.right
        && event.clientY >= bounds.top
        && event.clientY <= bounds.bottom,
      )
    }
    const handleWindowBlur = () => setControlsVisible(false)

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('blur', handleWindowBlur)
      document.documentElement.classList.remove('desktop-window-controls-visible')
      desiredVisibility.current = true
      void reconcileNativeVisibility()
    }
  }, [isMac, reconcileNativeVisibility, setControlsVisible])

  if (!isMac) return null

  return (
    <>
      <div
        aria-hidden="true"
        className="desktop-window-drag-region"
        data-tauri-drag-region
      />
      <div
        ref={hoverZone}
        aria-hidden="true"
        className="desktop-window-controls-hover-zone"
      />
    </>
  )
}
