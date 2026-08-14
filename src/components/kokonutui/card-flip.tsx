"use client";

/**
 * Adapted from Kokonut UI's Card Flip for Millennium.
 * Click/keyboard driven so it works for both desktop and touch study sessions.
 */

import { IconRefresh } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface CardFlipProps {
  front: ReactNode;
  back: ReactNode;
  className?: string;
  isFlipped?: boolean;
  onFlip?: (isFlipped: boolean) => void;
  frontLabel?: string;
  backLabel?: string;
}

export default function CardFlip({
  front,
  back,
  className,
  isFlipped,
  onFlip,
  frontLabel = "Question. Select to reveal the answer.",
  backLabel = "Answer. Select to show the question.",
}: CardFlipProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const flipped = isFlipped ?? internalFlipped;

  const toggle = () => {
    const next = !flipped;
    if (isFlipped === undefined) setInternalFlipped(next);
    onFlip?.(next);
  };

  const faceClasses = cn(
    "absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-2xl",
    "border border-[var(--border-default)] bg-[var(--bg-surface)]",
    "shadow-[0_18px_50px_rgba(0,0,0,0.13)] [backface-visibility:hidden]",
  );

  return (
    <button
      aria-label={flipped ? backLabel : frontLabel}
      className={cn(
        "group relative h-[330px] w-full appearance-none border-0 bg-transparent p-0 text-left [perspective:1600px]",
        className,
      )}
      onClick={toggle}
      type="button"
    >
      <div
        className={cn(
          "relative h-full w-full [transform-style:preserve-3d]",
          "transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
          flipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
        )}
      >
        <div className={faceClasses}>
          <div className="h-1.5 w-full bg-[var(--accent-color)]" />
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            {front}
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-[var(--text-tertiary)]">
            <span>Question</span>
            <span className="flex items-center gap-1.5">
              Reveal answer
              <IconRefresh aria-hidden="true" size={14} />
            </span>
          </div>
        </div>

        <div className={cn(faceClasses, "[transform:rotateY(180deg)]")}>
          <div className="h-1.5 w-full bg-[var(--accent-color)] opacity-70" />
          <div className="flex flex-1 items-center justify-center bg-[var(--hover-bg)]/40 p-8 text-center">
            {back}
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-[var(--text-tertiary)]">
            <span>Answer</span>
            <span className="flex items-center gap-1.5">
              Show question
              <IconRefresh aria-hidden="true" size={14} />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
