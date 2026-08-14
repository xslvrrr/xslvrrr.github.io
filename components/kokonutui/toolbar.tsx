import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface ToolbarItem<T extends string = string> {
  id: T
  title: string
  icon: ReactNode
  disabled?: boolean
}

interface ToolbarProps<T extends string = string> {
  items: readonly ToolbarItem<T>[]
  selected?: T | null
  className?: string
  ariaLabel?: string
  onSelect: (itemId: T) => void
}

const buttonMotion = {
  closed: { paddingLeft: 10, paddingRight: 10 },
  open: { paddingLeft: 12, paddingRight: 12 },
}

/**
 * The space between the icon and the revealed label rides on the label itself rather than on a
 * `gap` on the button. Motion only appends `px` to properties in its unit map — padding and margin
 * are in it, `gap` is not — so an animated `gap: 8` was written out unitless, dropped by CSS, and
 * the label rendered flush against the icon. Collapsing the margin with the width also keeps the
 * closed button perfectly square.
 */
const labelMotion = {
  initial: { width: 0, opacity: 0, marginLeft: 0 },
  animate: { width: "auto", opacity: 1, marginLeft: 8 },
  exit: { width: 0, opacity: 0, marginLeft: 0 },
}

export function Toolbar<T extends string>({
  items,
  selected,
  className,
  ariaLabel = "Tools",
  onSelect,
}: ToolbarProps<T>) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        "flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-background/90 p-1.5 shadow-xl backdrop-blur-xl",
        className
      )}
    >
      {items.map((item) => {
        const active = selected === item.id
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger
              render={
                <motion.button
                  type="button"
                  aria-label={item.title}
                  aria-pressed={active}
                  disabled={item.disabled}
                  className={cn(
                    "relative flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-medium",
                    "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-40",
                    active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  )}
                  animate={active ? "open" : "closed"}
                  initial={false}
                  variants={buttonMotion}
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  onClick={() => onSelect(item.id)}
                />
              }
            >
              <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
                {item.icon}
              </span>
              <AnimatePresence initial={false}>
                {active ? (
                  <motion.span
                    className="overflow-hidden whitespace-nowrap"
                    initial={labelMotion.initial}
                    animate={labelMotion.animate}
                    exit={labelMotion.exit}
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  >
                    {item.title}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </TooltipTrigger>
            <TooltipContent>{item.title}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export default Toolbar
