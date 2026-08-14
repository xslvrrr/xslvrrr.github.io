import { motion } from "motion/react"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

type BentoGridProps = ComponentProps<"div"> & {
  children: ReactNode
}

type BentoGridItemProps = ComponentProps<typeof motion.div> & {
  children: ReactNode
  interactive?: boolean
  /**
   * Shared layout animation. Turn it off where an external drag system already owns the item's
   * transform (dnd-kit sortables), because both animating the same element fights the pointer.
   */
  animateLayout?: boolean
  /** Kokonut top edge highlight. Off for plain shadcn surfaces. */
  highlight?: boolean
}

export function BentoGrid({ className, children, ...props }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function BentoGridItem({
  className,
  children,
  interactive = false,
  animateLayout = true,
  highlight = true,
  ...props
}: BentoGridItemProps) {
  return (
    <motion.div
      layout={animateLayout}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm",
        interactive && "transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-lg",
        className
      )}
      transition={animateLayout ? { layout: { type: "spring", bounce: 0.15, duration: 0.45 } } : undefined}
      {...props}
    >
      {highlight ? (
        <div
          data-slot="bento-highlight"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
        />
      ) : null}
      {children}
    </motion.div>
  )
}
