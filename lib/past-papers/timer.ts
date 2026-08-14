/**
 * Exam timer state.
 *
 * Kept as pure functions over an absolute deadline rather than a counter the UI decrements.
 * Browsers throttle timers in background tabs — often to once a minute — so a decrementing counter
 * runs slow by however long the student had another tab focused, and a student practising exam
 * pacing against a clock that quietly gives them extra time is being trained to fail. Every read
 * is derived from `Date.now()` against a stored deadline, so the clock is correct the instant the
 * tab is focused again, and remains correct across a reload.
 */

export type ExamTimerStatus = 'idle' | 'running' | 'paused' | 'finished'

/**
 * Which half of the allowance is running.
 *
 * NSW papers grant reading time before working time, and the two are not interchangeable: nothing
 * may be written during reading. A single undifferentiated countdown trains a student to start
 * writing at minute zero, which is the opposite of the exam they are practising for.
 */
export type ExamTimerPhase = 'reading' | 'working'

export interface ExamTimerState {
  status: ExamTimerStatus
  /** Configured working length of the attempt, in seconds. */
  durationSeconds: number
  /** Reading time that runs before the working allowance. Zero when the student does not use it. */
  readingSeconds: number
  /** Epoch milliseconds the timer runs out. Null unless running. */
  endsAt: number | null
  /** Seconds left at the moment of the last pause. Null unless paused. */
  pausedRemaining: number | null
  /** Epoch milliseconds the attempt first started, for recording how long it really took. */
  startedAt: number | null
}

export interface ExamTimerReading {
  status: ExamTimerStatus
  /** Seconds left in the whole attempt, reading time included. */
  remainingSeconds: number
  /** Reading time first, then working time. */
  phase: ExamTimerPhase
  /** Seconds left in the current phase — what the clock actually shows. */
  phaseRemainingSeconds: number
  elapsedSeconds: number
  /** 0-1 through the attempt. Drives the progress bar. */
  progress: number
  /** Whole percent elapsed, for the readout to the right of the bar. */
  percentElapsed: number
}

export const MIN_TIMER_MINUTES = 5
export const MAX_TIMER_MINUTES = 360
/** Reading allowances in NSW top out around ten minutes; the ceiling is generous, not meaningful. */
export const MAX_READING_MINUTES = 30

export function createExamTimer(durationSeconds: number, readingSeconds = 0): ExamTimerState {
  return {
    status: 'idle',
    durationSeconds: clampDuration(durationSeconds),
    readingSeconds: clampReading(readingSeconds),
    endsAt: null,
    pausedRemaining: null,
    startedAt: null,
  }
}

export function clampDuration(seconds: number): number {
  const bounded = Math.min(MAX_TIMER_MINUTES * 60, Math.max(MIN_TIMER_MINUTES * 60, Math.round(seconds)))
  return Number.isFinite(bounded) ? bounded : MIN_TIMER_MINUTES * 60
}

export function clampReading(seconds: number): number {
  const bounded = Math.min(MAX_READING_MINUTES * 60, Math.max(0, Math.round(seconds)))
  return Number.isFinite(bounded) ? bounded : 0
}

/** Reading plus working: the wall-clock length of the whole attempt. */
export function totalSeconds(state: ExamTimerState): number {
  return state.durationSeconds + readingOf(state)
}

/** Blobs written before reading time existed have no field; they are working-time-only attempts. */
function readingOf(state: ExamTimerState): number {
  return Number.isFinite(state.readingSeconds) ? Math.max(0, state.readingSeconds) : 0
}

export function startTimer(state: ExamTimerState, now: number): ExamTimerState {
  if (state.status === 'running') return state
  const remaining = state.status === 'paused' && state.pausedRemaining !== null
    ? state.pausedRemaining
    : totalSeconds(state)

  return {
    ...state,
    status: 'running',
    endsAt: now + remaining * 1000,
    pausedRemaining: null,
    startedAt: state.startedAt ?? now,
  }
}

export function pauseTimer(state: ExamTimerState, now: number): ExamTimerState {
  if (state.status !== 'running' || state.endsAt === null) return state
  return {
    ...state,
    status: 'paused',
    pausedRemaining: Math.max(0, Math.round((state.endsAt - now) / 1000)),
    endsAt: null,
  }
}

/** Reset keeps the reading allowance: it is part of how this paper is sat, not part of this run. */
export function resetTimer(state: ExamTimerState, durationSeconds = state.durationSeconds): ExamTimerState {
  return createExamTimer(durationSeconds, readingOf(state))
}

/** Changing the length mid-attempt would invalidate the pacing, so it only applies while idle. */
export function setDuration(state: ExamTimerState, durationSeconds: number): ExamTimerState {
  if (state.status !== 'idle') return state
  return { ...state, durationSeconds: clampDuration(durationSeconds) }
}

/** Same rule as the working length: the reading allowance is fixed once the clock is moving. */
export function setReadingTime(state: ExamTimerState, readingSeconds: number): ExamTimerState {
  if (state.status !== 'idle') return state
  return { ...state, readingSeconds: clampReading(readingSeconds) }
}

export function readTimer(state: ExamTimerState, now: number): ExamTimerReading {
  const total = totalSeconds(state)
  const remainingSeconds = remainingFor(state, now)
  const elapsedSeconds = Math.max(0, total - remainingSeconds)
  const progress = total > 0 ? Math.min(1, Math.max(0, elapsedSeconds / total)) : 0

  // Reading runs first, so anything left over above the working allowance is still reading time.
  const inReading = readingOf(state) > 0 && remainingSeconds > state.durationSeconds

  return {
    status: remainingSeconds === 0 && state.status === 'running' ? 'finished' : state.status,
    remainingSeconds,
    phase: inReading ? 'reading' : 'working',
    phaseRemainingSeconds: inReading ? remainingSeconds - state.durationSeconds : remainingSeconds,
    elapsedSeconds,
    progress,
    // Floored, so the readout only reaches 100% when the time is actually gone.
    percentElapsed: Math.floor(progress * 100),
  }
}

function remainingFor(state: ExamTimerState, now: number): number {
  if (state.status === 'running' && state.endsAt !== null) {
    return Math.max(0, Math.round((state.endsAt - now) / 1000))
  }
  if (state.status === 'paused' && state.pausedRemaining !== null) return state.pausedRemaining
  if (state.status === 'finished') return 0
  return totalSeconds(state)
}

/**
 * `MM:SS`, or `H:MM:SS` past an hour.
 *
 * Minutes are not zero-padded once an hour is showing, because `1:02:00` reads as a duration while
 * `01:02:00` reads as a wall clock.
 */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Alert thresholds, in seconds remaining.
 *
 * Chosen to match what invigilators actually call in a NSW exam room, so practising against them
 * builds the same instincts the real room will trigger.
 */
export const TIMER_ALERTS = [
  { remainingSeconds: 30 * 60, label: '30 minutes remaining' },
  { remainingSeconds: 10 * 60, label: '10 minutes remaining' },
  { remainingSeconds: 5 * 60, label: '5 minutes remaining' },
  { remainingSeconds: 0, label: "Pens down" },
] as const

/**
 * Which alert a tick crossed, if any.
 *
 * Compares the previous reading against the current one rather than testing equality, because a
 * backgrounded tab can jump several seconds and would skip an exact match entirely.
 */
export function crossedAlert(
  previousRemaining: number,
  currentRemaining: number
): (typeof TIMER_ALERTS)[number] | null {
  if (currentRemaining >= previousRemaining) return null
  return TIMER_ALERTS.find(
    (alert) => previousRemaining > alert.remainingSeconds && currentRemaining <= alert.remainingSeconds
  ) ?? null
}

/**
 * Tick marks for the dial.
 *
 * Labels are placed every `labelEvery` steps and the rest render as plain ticks, which is what
 * gives the dial a readable rhythm instead of a wall of numbers.
 */
export interface DialTick {
  minutes: number
  labelled: boolean
}

export function buildDialTicks(
  minMinutes = MIN_TIMER_MINUTES,
  maxMinutes = MAX_TIMER_MINUTES,
  step = 1,
  labelEvery = 5
): DialTick[] {
  const ticks: DialTick[] = []
  for (let minutes = minMinutes; minutes <= maxMinutes; minutes += step) {
    ticks.push({ minutes, labelled: minutes % labelEvery === 0 })
  }
  return ticks
}

/** Snaps a dragged dial position onto the nearest whole minute inside the allowed range. */
export function snapDialMinutes(minutes: number): number {
  return Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, Math.round(minutes)))
}
