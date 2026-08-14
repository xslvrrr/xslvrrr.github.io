"use client";

/**
 * @author: @kokonutui
 * @description: AI Loading State
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { useId } from "react";

import { cn } from "@/lib/utils";

interface AILoadingStateProps {
  status?: string;
  lines?: string[];
  className?: string;
}

function LoadingAnimation({ label }: { label: string }) {
  const maskId = useId().replace(/:/g, "");

  return (
    <div className="relative h-6 w-6 shrink-0" aria-hidden="true">
      <svg
        aria-label={label}
        className="h-full w-full"
        fill="none"
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{label}</title>
        <defs>
          <mask id={maskId}>
            <rect fill="black" height="240" width="240" />
            <circle
              cx="120"
              cy="120"
              fill="white"
              r="120"
              strokeDasharray="490 754"
              transform="rotate(-90 120 120)"
            />
          </mask>
        </defs>
        <style>
          {`
            @keyframes kokonut-ai-spin-cw {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes kokonut-ai-spin-ccw {
              from { transform: rotate(360deg); }
              to { transform: rotate(0deg); }
            }
            .kokonut-ai-rings circle {
              transform-origin: 120px 120px;
            }
            .kokonut-ai-rings circle:nth-child(odd) {
              animation: kokonut-ai-spin-cw 8s linear infinite;
            }
            .kokonut-ai-rings circle:nth-child(even) {
              animation: kokonut-ai-spin-ccw 8s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .kokonut-ai-rings circle { animation: none; }
            }
          `}
        </style>
        <g
          className="kokonut-ai-rings"
          mask={`url(#${maskId})`}
          strokeDasharray="18% 40%"
          strokeWidth="16"
        >
          <circle cx="120" cy="120" opacity="0.95" r="150" stroke="var(--accent-color, currentColor)" />
          <circle cx="120" cy="120" opacity="0.82" r="130" stroke="var(--accent-color, currentColor)" />
          <circle cx="120" cy="120" opacity="0.68" r="110" stroke="var(--accent-color, currentColor)" />
          <circle cx="120" cy="120" opacity="0.54" r="90" stroke="var(--accent-color, currentColor)" />
          <circle cx="120" cy="120" opacity="0.4" r="70" stroke="var(--accent-color, currentColor)" />
          <circle cx="120" cy="120" opacity="0.26" r="50" stroke="var(--accent-color, currentColor)" />
        </g>
      </svg>
    </div>
  );
}

export default function AILoadingState({
  status = "Working",
  lines = [],
  className,
}: AILoadingStateProps) {
  const visibleLines = lines.slice(-3);

  return (
    <div
      className={cn(
        "border-border bg-muted/30 w-full rounded-xl border px-3 py-2.5",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="text-foreground flex items-center gap-2 font-medium">
        <LoadingAnimation label={`${status} in progress`} />
        <span className="text-sm">{status}</span>
      </div>
      {visibleLines.length > 0 ? (
        <div className="text-muted-foreground mt-2 grid gap-1 pl-8 font-mono text-[11px] leading-5">
          {visibleLines.map((line, index) => (
            <div className="flex min-w-0 items-center gap-2" key={`${line}-${index}`}>
              <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
              <span className="truncate">{line}</span>
            </div>
          ))}
        </div>
      ) : null}
      <span className="sr-only">{visibleLines.at(-1) || status}</span>
    </div>
  );
}
