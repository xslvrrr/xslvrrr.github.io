"use client";

/**
 * Adapted from Kokonut UI's Card Stack for Millennium.
 * Uses app theme tokens and accepts arbitrary card content.
 */

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface CardStackItem {
  id: string;
  content: ReactNode;
}

export interface CardStackProps {
  items: CardStackItem[];
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  "aria-label"?: string;
}

export default function CardStack({
  items,
  className,
  expanded,
  onExpandedChange,
  "aria-label": ariaLabel = "Flashcard stack",
}: CardStackProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const isExpanded = expanded ?? internalExpanded;
  const visibleItems = items.slice(0, 5);

  const toggle = () => {
    const next = !isExpanded;
    if (expanded === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  if (visibleItems.length === 0) return null;

  return (
    <button
      aria-expanded={isExpanded}
      aria-label={ariaLabel}
      className={cn(
        "relative mx-auto flex h-64 w-full max-w-xl appearance-none items-center justify-center border-0 bg-transparent p-0 text-left",
        className,
      )}
      onClick={toggle}
      type="button"
    >
      {visibleItems.map((item, index) => {
        const centeredIndex = index - (visibleItems.length - 1) / 2;
        const collapsed = {
          x: index * 8,
          y: index * 5,
          rotate: reducedMotion ? 0 : centeredIndex * 1.25,
          scale: 1 - index * 0.018,
        };
        const spread = {
          x: centeredIndex * Math.min(76, 280 / Math.max(1, visibleItems.length - 1)),
          y: Math.abs(centeredIndex) * 5,
          rotate: reducedMotion ? 0 : centeredIndex * 3.5,
          scale: 1,
        };

        return (
          <motion.div
            animate={isExpanded ? spread : collapsed}
            className={cn(
              "absolute inset-x-8 top-3 min-h-52 overflow-hidden rounded-2xl",
              "border border-[var(--border-default)] bg-[var(--bg-surface)]",
              "shadow-[0_14px_40px_rgba(0,0,0,0.12)]",
              "transition-colors hover:border-[var(--border-strong)]",
            )}
            initial={collapsed}
            key={item.id}
            style={{ zIndex: visibleItems.length - index }}
            transition={reducedMotion
              ? { duration: 0.15 }
              : { type: "spring", stiffness: 240, damping: 25, mass: 0.9 }}
          >
            <div className="h-1 w-full bg-[var(--accent-color)] opacity-80" />
            <div className="p-5">{item.content}</div>
          </motion.div>
        );
      })}
    </button>
  );
}
