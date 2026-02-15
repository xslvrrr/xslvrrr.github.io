"use client"

import * as React from "react"
import { Menubar as MenubarPrimitive } from "@base-ui/react/menubar"
import { Menu as MenubarMenuPrimitive } from "@base-ui/react/menu"

import { cn } from "../../lib/utils"
import { IconCheck, IconChevronRight } from "@tabler/icons-react"

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive>) {
  return (
    <MenubarPrimitive
      data-slot="menubar"
      className={cn("bg-background h-9 rounded-md border p-1 flex items-center", className)}
      {...props}
    />
  )
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Root>) {
  return <MenubarMenuPrimitive.Root data-slot="menubar-menu" {...props} />
}

function MenubarGroup({
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Group>) {
  return <MenubarMenuPrimitive.Group data-slot="menubar-group" {...props} />
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Portal>) {
  return <MenubarMenuPrimitive.Portal data-slot="menubar-portal" {...props} />
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.RadioGroup>) {
  return (
    <MenubarMenuPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  )
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Trigger>) {
  return (
    <MenubarMenuPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "hover:bg-muted aria-expanded:bg-muted rounded-[calc(var(--radius-sm)-2px)] px-2 py-[calc(--spacing(0.875))] text-xs/relaxed font-medium flex items-center outline-hidden select-none",
        className
      )}
      {...props}
    />
  )
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Popup>) {
  return (
    <MenubarMenuPrimitive.Portal>
      <MenubarMenuPrimitive.Positioner
        data-slot="menubar-positioner"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
      >
        <MenubarMenuPrimitive.Popup
          data-slot="menubar-content"
          className={cn("bg-popover text-popover-foreground data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 min-w-32 rounded-lg p-1 shadow-md ring-1 duration-100 z-50 overflow-hidden", className )}
          {...props}
        />
      </MenubarMenuPrimitive.Positioner>
    </MenubarMenuPrimitive.Portal>
  )
}

function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenubarMenuPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive not-data-[variant=destructive]:focus:**:text-accent-foreground min-h-7 gap-2 rounded-md px-2 py-1 text-xs/relaxed data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg:not([class*='size-'])]:size-3.5 group/menubar-item relative flex cursor-default items-center outline-hidden select-none data-[disabled]:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.CheckboxItem>) {
  return (
    <MenubarMenuPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground min-h-7 gap-2 rounded-md py-1.5 pr-2 pl-8 text-xs data-disabled:opacity-50 relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="left-2 size-4 [&_svg:not([class*='size-'])]:size-4 pointer-events-none absolute flex items-center justify-center">
        <MenubarMenuPrimitive.CheckboxItemIndicator>
          <IconCheck
          />
        </MenubarMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenubarMenuPrimitive.CheckboxItem>
  )
}

function MenubarRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.RadioItem>) {
  return (
    <MenubarMenuPrimitive.RadioItem
      data-slot="menubar-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground min-h-7 gap-2 rounded-md py-1.5 pr-2 pl-8 text-xs data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-3.5 relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      <span className="left-2 size-4 [&_svg:not([class*='size-'])]:size-4 pointer-events-none absolute flex items-center justify-center">
        <MenubarMenuPrimitive.RadioItemIndicator>
          <IconCheck
          />
        </MenubarMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenubarMenuPrimitive.RadioItem>
  )
}

function MenubarLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.GroupLabel> & {
  inset?: boolean
}) {
  return (
    <MenubarMenuPrimitive.GroupLabel
      data-slot="menubar-label"
      data-inset={inset}
      className={cn("text-muted-foreground px-2 py-1.5 text-xs data-[inset]:pl-8", className)}
      {...props}
    />
  )
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Separator>) {
  return (
    <MenubarMenuPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("bg-border/50 -mx-1 my-1 h-px -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn("text-muted-foreground group-focus/menubar-item:text-accent-foreground text-[0.625rem] tracking-widest ml-auto", className)}
      {...props}
    />
  )
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.SubmenuRoot>) {
  return <MenubarMenuPrimitive.SubmenuRoot data-slot="menubar-sub" {...props} />
}

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.SubmenuTrigger> & {
  inset?: boolean
}) {
  return (
    <MenubarMenuPrimitive.SubmenuTrigger
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground min-h-7 gap-2 rounded-md px-2 py-1 text-xs data-[inset]:pl-8 [&_svg:not([class*='size-'])]:size-3.5 flex cursor-default items-center outline-none select-none",
        className
      )}
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto size-4" />
    </MenubarMenuPrimitive.SubmenuTrigger>
  )
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Popup>) {
  return (
    <MenubarMenuPrimitive.Portal>
      <MenubarMenuPrimitive.Positioner
        data-slot="menubar-sub-positioner"
        sideOffset={6}
        alignOffset={-4}
      >
        <MenubarMenuPrimitive.Popup
          data-slot="menubar-sub-content"
          className={cn("bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 min-w-32 rounded-lg p-1 shadow-md ring-1 duration-100 z-50 overflow-hidden", className )}
          {...props}
        />
      </MenubarMenuPrimitive.Positioner>
    </MenubarMenuPrimitive.Portal>
  )
}

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
}
