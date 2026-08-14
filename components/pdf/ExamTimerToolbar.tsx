import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { IconBook, IconPlayerPause, IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  buildDialTicks, crossedAlert, formatClock, MAX_TIMER_MINUTES, MIN_TIMER_MINUTES,
  pauseTimer, readTimer, resetTimer, setDuration, setReadingTime, snapDialMinutes, startTimer,
  type ExamTimerPhase, type ExamTimerState,
} from '@/lib/past-papers/timer'
import { RollingDigits } from './RollingDigits'

export interface ExamTimerToolbarProps {
  state: ExamTimerState
  onStateChange: (next: ExamTimerState) => void
  /** Where the suggested length came from, shown so the student can trust or override it. */
  durationSource?: 'document' | 'subject-default' | 'unknown' | 'manual'
  /** The paper's own reading allowance, offered as a chip even when the setting is off. */
  suggestedReadingMinutes?: number
  /** 0-1. Zero silences the chimes entirely. */
  volume?: number
  /** Rolling digits can be turned off in past papers settings. */
  rollingDigits?: boolean
  /** The elapsed bar and percentage. Off leaves the clock alone, for readers a filling bar rushes. */
  showProgress?: boolean
  onFinished?: (state: ExamTimerState) => void
  className?: string
}

/** Pixels between adjacent minute ticks. The dial is dragged in these units, not in ticks. */
const TICK_SPACING_PX = 9
const DIAL_SPRING = { type: 'spring', bounce: 0, duration: 0.4 } as const

/**
 * The exam timer.
 *
 * Two shapes, one component. Before it starts it is a tall strip: a minute dial you drag to set
 * the length, a start button, and the time you are about to sit. Once running it collapses to the
 * same height as the annotation toolbar below it — the setup affordance has done its job and the
 * paper is what matters — leaving a rolling clock, a bar that fills across the attempt, and the
 * share of the time already gone.
 *
 * The length is pre-filled from the paper itself wherever the paper states one, which is the
 * common case for NSW papers; `durationSource` says so, because a detected time the student cannot
 * verify is a time they will not trust. Where the paper also grants reading time, that runs as its
 * own phase before the working clock rather than being folded into it.
 */
export function ExamTimerToolbar({
  state,
  onStateChange,
  durationSource = 'manual',
  suggestedReadingMinutes = 0,
  volume = 0.6,
  rollingDigits = true,
  showProgress = true,
  onFinished,
  className,
}: ExamTimerToolbarProps) {
  const prefersReducedMotion = useReducedMotion()
  const [now, setNow] = useState(() => Date.now())
  const previousRemainingRef = useRef<number | null>(null)
  const previousPhaseRef = useRef<ExamTimerPhase | null>(null)
  const finishedRef = useRef(false)

  const reading = readTimer(state, now)
  const running = state.status === 'running'
  const expanded = state.status === 'idle'

  // Ticking at 250ms rather than 1s: a 1s interval drifts against the wall clock and the seconds
  // digit visibly stutters, skipping or repeating a value roughly once a minute.
  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [running])

  useEffect(() => {
    const previous = previousRemainingRef.current
    const previousPhase = previousPhaseRef.current
    previousRemainingRef.current = reading.remainingSeconds
    previousPhaseRef.current = reading.phase
    if (previous === null || !running) return

    const alert = crossedAlert(previous, reading.remainingSeconds)
    if (alert) playChime(volume, alert.remainingSeconds === 0)
    // The end of reading time is called in a real exam room too, and it is the moment the student
    // is allowed to start writing — it earns its own tone.
    else if (previousPhase === 'reading' && reading.phase === 'working') playChime(volume, false)

    if (reading.remainingSeconds === 0 && !finishedRef.current) {
      finishedRef.current = true
      onFinished?.(state)
    }
  }, [onFinished, reading.phase, reading.remainingSeconds, running, state, volume])

  useEffect(() => {
    if (state.status === 'idle') finishedRef.current = false
  }, [state.status])

  const handleStart = useCallback(() => {
    setNow(Date.now())
    onStateChange(startTimer(state, Date.now()))
  }, [onStateChange, state])

  const handleReset = useCallback(() => {
    // The clock is re-read from the reset state on the same frame, so the digits roll from where
    // they were to the full allowance instead of passing through a stale value first.
    previousRemainingRef.current = null
    previousPhaseRef.current = null
    setNow(Date.now())
    onStateChange(resetTimer(state))
  }, [onStateChange, state])

  const clock = formatClock(reading.phaseRemainingSeconds)
  const inReading = reading.phase === 'reading'

  return (
    <motion.div
      layout={!prefersReducedMotion}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
      transition={DIAL_SPRING}
      className={cn(
        'relative flex max-w-full flex-col overflow-hidden rounded-xl border border-border/70',
        'bg-background/90 shadow-xl backdrop-blur-xl',
        className
      )}
      role="group"
      aria-label="Exam timer"
    >
      {/* `popLayout` takes the leaving shape out of flow and the parent's own layout animation
          carries the box between the two sizes. The children must not animate height as well:
          two animations racing on the same box is what made a reset stutter. */}
      <AnimatePresence initial={false} mode="popLayout">
        {expanded ? (
          <motion.div
            key="setup"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <TimerSetup
              minutes={Math.round(state.durationSeconds / 60)}
              readingMinutes={Math.round(state.readingSeconds / 60)}
              suggestedReadingMinutes={suggestedReadingMinutes}
              durationSource={durationSource}
              onMinutesChange={(minutes) => onStateChange(setDuration(state, minutes * 60))}
              onReadingMinutesChange={(minutes) => onStateChange(setReadingTime(state, minutes * 60))}
              onStart={handleStart}
              rollingDigits={rollingDigits}
            />
          </motion.div>
        ) : (
          <motion.div
            key="running"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3 p-1.5"
          >
            {inReading ? (
              <span className="ml-1 flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium leading-none text-primary">
                <IconBook className="size-3.5" /> Reading
              </span>
            ) : null}

            <RollingDigits
              value={clock}
              animated={rollingDigits}
              label={inReading ? `${clock} of reading time remaining` : `${clock} remaining`}
              className={cn(
                'px-2 text-lg font-semibold leading-none',
                inReading ? 'text-primary'
                  : reading.remainingSeconds === 0 ? 'text-destructive'
                  : reading.remainingSeconds <= 300 ? 'text-amber-500'
                  : 'text-foreground'
              )}
            />

            {showProgress ? (
              <>
                <div
                  className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted sm:w-48"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={reading.percentElapsed}
                  aria-label="Time elapsed"
                >
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={false}
                    animate={{ width: `${reading.progress * 100}%` }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25, ease: 'linear' }}
                  />
                </div>

                <span className="min-w-[3.5ch] text-right text-xs tabular-nums text-muted-foreground">
                  {reading.percentElapsed}%
                </span>
              </>
            ) : null}

            <div className="flex items-center gap-1">
              <TimerButton
                title={running ? 'Pause' : 'Resume'}
                onClick={() => onStateChange(running ? pauseTimer(state, Date.now()) : startTimer(state, Date.now()))}
              >
                {running ? <IconPlayerPause /> : <IconPlayerPlay />}
              </TimerButton>
              <TimerButton title="Reset" onClick={handleReset}>
                <IconRotateClockwise />
              </TimerButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TimerButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg [&_svg]:size-4"
            aria-label={title}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

const SOURCE_LABELS: Record<NonNullable<ExamTimerToolbarProps['durationSource']>, string | null> = {
  document: 'Read from the paper',
  'subject-default': 'Official time for this course',
  unknown: null,
  manual: null,
}

function TimerSetup({
  minutes,
  readingMinutes,
  suggestedReadingMinutes,
  durationSource,
  onMinutesChange,
  onReadingMinutesChange,
  onStart,
  rollingDigits,
}: {
  minutes: number
  readingMinutes: number
  suggestedReadingMinutes: number
  durationSource: NonNullable<ExamTimerToolbarProps['durationSource']>
  onMinutesChange: (minutes: number) => void
  onReadingMinutesChange: (minutes: number) => void
  onStart: () => void
  rollingDigits: boolean
}) {
  const sourceLabel = SOURCE_LABELS[durationSource]
  // The dial sets working time, so the big readout is working time; reading is stated beneath it.
  const clock = formatClock(minutes * 60)
  // A paper with no stated reading allowance still gets the standard NSW five minutes on offer,
  // because a student sitting it in exam conditions will be given reading time in the real room.
  const offeredReading = suggestedReadingMinutes > 0 ? suggestedReadingMinutes : 5
  const readingOn = readingMinutes > 0

  return (
    <div className="flex w-[min(92vw,44rem)] flex-col gap-2 p-3">
      <MinuteDial minutes={minutes} onChange={onMinutesChange} />

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="rounded-full px-5" onClick={onStart}>
              Start timer
            </Button>

            <Button
              type="button"
              size="sm"
              variant={readingOn ? 'secondary' : 'outline'}
              className="gap-1.5 rounded-full px-3"
              aria-pressed={readingOn}
              onClick={() => onReadingMinutesChange(readingOn ? 0 : offeredReading)}
            >
              <IconBook className="size-3.5" />
              {readingOn ? `${readingMinutes} min reading` : `Add ${offeredReading} min reading`}
            </Button>
          </div>

          {sourceLabel ? (
            <span className="px-1 text-[11px] leading-tight text-muted-foreground">{sourceLabel}</span>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <RollingDigits
            value={clock}
            animated={rollingDigits}
            label={`${clock} of working time selected`}
            className="text-3xl font-semibold leading-none text-primary"
          />
          {readingOn ? (
            <span className="text-[11px] leading-tight text-muted-foreground">
              after {readingMinutes} min reading
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * The minute dial.
 *
 * A horizontal rule of ticks that slides under a fixed centre pointer, so setting a length is a
 * drag rather than a number field — which matters because the common action is nudging a detected
 * time by a few minutes, not typing one from scratch.
 *
 * The strip is rendered once and moved by a motion value, never re-rendered per frame: it follows
 * the pointer continuously rather than jumping tick to tick, and glides onto the nearest whole
 * minute when the drag ends. The value is clamped rather than the window, so the ends of the range
 * come to rest dead centre under the pointer instead of stranding it at an edge. A change from
 * outside — the detected length arriving once preferences load — animates the same way, so the
 * dial visibly travels to the paper's own time rather than teleporting there.
 */
function MinuteDial({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const prefersReducedMotion = useReducedMotion()
  const dragRef = useRef<{ pointerId: number; startX: number; startMinutes: number } | null>(null)
  /** The dial's own position, in fractional minutes. Whole minutes are what leave the component. */
  const valueRef = useRef(minutes)
  const x = useMotionValue(offsetFor(minutes))

  const ticks = useMemo(() => buildDialTicks(MIN_TIMER_MINUTES, MAX_TIMER_MINUTES, 1, 5), [])

  const moveTo = useCallback((next: number, glide: boolean) => {
    const clamped = Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, next))
    valueRef.current = clamped
    const target = offsetFor(clamped)
    if (glide && !prefersReducedMotion) void animate(x, target, DIAL_SPRING)
    else x.set(target)
  }, [prefersReducedMotion, x])

  // Follows the value when it changes anywhere but here: the detected length landing, a reset, or
  // the arrow keys. Skipped mid-drag, where the pointer is the authority.
  useEffect(() => {
    if (dragRef.current) return
    if (Math.round(valueRef.current) === minutes) return
    moveTo(minutes, true)
  }, [minutes, moveTo])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startMinutes: valueRef.current }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // Dragging left advances the dial, matching a physical wheel scrolling under the pointer.
    const next = drag.startMinutes - (event.clientX - drag.startX) / TICK_SPACING_PX
    moveTo(next, false)

    const rounded = snapDialMinutes(valueRef.current)
    if (rounded !== minutes) onChange(rounded)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const settled = snapDialMinutes(valueRef.current)
    moveTo(settled, true)
    if (settled !== minutes) onChange(settled)
  }

  const step = (delta: number) => {
    const next = snapDialMinutes(Math.round(valueRef.current) + delta)
    moveTo(next, true)
    if (next !== minutes) onChange(next)
  }

  return (
    <div
      className="relative h-14 cursor-ew-resize touch-none select-none overflow-hidden"
      role="slider"
      tabIndex={0}
      aria-label="Exam length in minutes"
      aria-valuemin={MIN_TIMER_MINUTES}
      aria-valuemax={MAX_TIMER_MINUTES}
      aria-valuenow={minutes}
      aria-valuetext={`${minutes} minutes`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(event) => {
        const size = event.shiftKey ? 5 : 1
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); step(size) }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); step(-size) }
      }}
      onWheel={(event) => step(Math.sign(event.deltaY))}
      style={{
        // The rule fades out at both ends rather than being cut off, so the strip reads as
        // continuing past the frame instead of stopping at it.
        maskImage: 'linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)',
      }}
    >
      <motion.div className="absolute inset-y-0 left-1/2" style={{ x }} aria-hidden>
        {ticks.map((tick) => (
          <div
            key={tick.minutes}
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ left: (tick.minutes - MIN_TIMER_MINUTES) * TICK_SPACING_PX }}
          >
            {tick.labelled ? (
              <span className="text-[10px] font-medium leading-none tabular-nums text-muted-foreground">
                {tick.minutes}
              </span>
            ) : null}
            <span
              className="w-px rounded-full bg-foreground"
              style={{ height: tick.labelled ? 22 : 12, opacity: tick.labelled ? 0.55 : 0.3 }}
            />
          </div>
        ))}
      </motion.div>

      {/* The pointer. Fixed width, so translating it half its own width lands it on the exact
          centre — a zero-width triangle would sit half a border off to one side. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 flex w-3 -translate-x-1/2 flex-col items-center"
      >
        <span
          className="size-0 border-x-[6px] border-t-[7px] border-x-transparent"
          style={{ borderTopColor: 'var(--primary)' }}
        />
        <span className="w-[2px] flex-1 rounded-full bg-primary/70" />
      </div>
    </div>
  )
}

function offsetFor(minutes: number): number {
  return -(minutes - MIN_TIMER_MINUTES) * TICK_SPACING_PX
}

/**
 * A short tone at each invigilator call.
 *
 * Synthesised rather than shipped as an audio file: it is two oscillator notes, it needs no
 * network request at the exact moment a student is mid-question, and the volume is the user's own
 * setting rather than the file's mastering. A browser that blocks audio without a gesture simply
 * does nothing here, which is the correct silent failure for a timer chime.
 */
function playChime(volume: number, final: boolean): void {
  if (volume <= 0 || typeof window === 'undefined') return

  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const gain = context.createGain()
    gain.connect(context.destination)

    const notes = final ? [880, 660, 440] : [660, 880]
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      const start = context.currentTime + index * 0.18
      oscillator.start(start)
      oscillator.stop(start + 0.16)
    })

    // Ramped rather than switched, because a square-edged gate on a sine wave clicks.
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(Math.min(1, volume) * 0.3, context.currentTime + 0.02)
    gain.gain.linearRampToValueAtTime(0, context.currentTime + notes.length * 0.18 + 0.16)

    setTimeout(() => void context.close(), (notes.length * 0.18 + 0.4) * 1000)
  } catch {
    // Audio is a courtesy; a blocked or unavailable context must never interrupt the attempt.
  }
}
