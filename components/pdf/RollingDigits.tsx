import { motion, useReducedMotion } from 'motion/react'
import { Fragment } from 'react'

import { cn } from '@/lib/utils'

interface RollingDigitsProps {
  /** Pre-formatted clock string. Digits roll; separators are drawn statically. */
  value: string
  /** Off falls back to a plain readout, for reduced-motion users and by user preference. */
  animated?: boolean
  className?: string
  /** Announced to screen readers in place of the digit columns. */
  label?: string
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * A clock whose digits roll when they change.
 *
 * Each digit is a full 0-9 column translated to the right row, so only the digits that actually
 * changed move — a seconds tick rolls one column, and the minute rolls two at the turn. Animating
 * the whole string instead would make the entire clock twitch every second, which is exactly the
 * kind of motion that pulls a reader's eye off the paper they are supposed to be sitting.
 *
 * The column is `aria-hidden` and the value is announced once as text, because a screen reader
 * walking ten digits per column produces noise rather than a time.
 */
export function RollingDigits({ value, animated = true, className, label }: RollingDigitsProps) {
  const prefersReducedMotion = useReducedMotion()
  const rolling = animated && !prefersReducedMotion

  return (
    <span className={cn('inline-flex items-center tabular-nums', className)} role="timer">
      <span className="sr-only">{label ?? value}</span>
      <span aria-hidden className="inline-flex items-center">
        {/*
          * Keyed by position, counted from the right.
          *
          * Keyed by character — as this was — every tick produces a new key, so React unmounts the
          * old column and mounts a new one already translated to the new digit. The transition
          * never runs and the clock snaps instead of rolling, which is the whole feature gone.
          *
          * Counting from the right rather than the left keeps the seconds and minutes columns
          * across the one point where the string changes length: 1:00:00 to 59:59 drops the hours,
          * and left-counted keys would shift every remaining column onto a neighbour's identity and
          * roll the entire clock at once.
          */}
        {value.split('').map((character, index) => (
          <Fragment key={value.length - index}>
            {DIGITS.includes(character)
              ? <RollingDigit digit={Number(character)} rolling={rolling} />
              : <span className="px-[0.02em]">{character}</span>}
          </Fragment>
        ))}
      </span>
    </span>
  )
}

function RollingDigit({ digit, rolling }: { digit: number; rolling: boolean }) {
  return (
    // `1em` tall and `ch` wide: the window is exactly one glyph, so the column shows one digit and
    // the clock keeps a fixed width as the numbers change.
    <span data-rolling-digit className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-baseline">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={false}
        // A percentage translate resolves against the column's own height, and the column is all
        // ten digits tall — so one digit is 10%, not 100%. At 100% every non-zero digit was driven
        // a multiple of the whole column out of the window and the clock read blank.
        animate={{ y: `${-digit * 10}%` }}
        transition={rolling
          ? { type: 'spring', bounce: 0.18, duration: 0.42 }
          : { duration: 0 }}
      >
        {DIGITS.map((candidate) => (
          <span key={candidate} className="flex h-[1em] items-center justify-center leading-none">
            {candidate}
          </span>
        ))}
      </motion.span>
    </span>
  )
}
