import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { cn } from "@/lib/utils"

type DashboardPageProps = {
  children: ReactNode
  className?: string
}

type DashboardPageHeaderProps = {
  children?: ReactNode
  className?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  sticky?: boolean
}

function DashboardPage({
  children,
  className,
  ...rest
}: DashboardPageProps & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)} {...rest}>
      {children}
    </div>
  )
}

function DashboardPageHeader({
  title,
  description,
  actions,
  sticky = true,
  className,
  children,
}: DashboardPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2.5",
        sticky && "sticky top-0 z-10",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="m-0 truncate text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

function DashboardPageBody({
  children,
  className,
  scroll = true,
}: DashboardPageProps & {
  scroll?: boolean
}) {
  return (
    <div
      className={cn(
        // Both axes scroll: browser zoom can push card grids wider than the frame, and a
        // clipped horizontal axis makes that content unreachable.
        "min-h-0 flex-1 p-4",
        scroll && "overflow-auto",
        className
      )}
    >
      {children}
    </div>
  )
}

function DashboardStack({ children, className }: DashboardPageProps) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>
}

function DashboardActionRow({ children, className }: DashboardPageProps) {
  return <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
}

function DashboardDescriptionList({ children, className }: DashboardPageProps) {
  return <dl className={cn("grid gap-0 text-sm", className)}>{children}</dl>
}

function DashboardDescriptionItem({
  label,
  value,
  className,
}: {
  label: ReactNode
  value: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0",
        className
      )}
    >
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{value}</dd>
    </div>
  )
}

export {
  DashboardActionRow,
  DashboardDescriptionItem,
  DashboardDescriptionList,
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
  DashboardStack,
}
