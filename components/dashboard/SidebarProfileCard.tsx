"use client"

import {
  IconLogout,
  IconSettings,
  IconShieldLock,
} from "@tabler/icons-react"
import { useState, type MouseEvent } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SettingsSectionId } from "@/components/dashboard/navigation/dashboardRegistry"
import { cn } from "@/lib/utils"

interface SidebarProfileCardProps {
  name: string
  school: string
  profileImage: string | null
  initials: string
  isAdministrator: boolean
  isPreviewMode: boolean
  onOpenSettings: (section: SettingsSectionId) => void
  onLogout: (event: MouseEvent<HTMLElement>) => void
}

export function SidebarProfileCard({
  name,
  school,
  profileImage,
  initials,
  isAdministrator,
  isPreviewMode,
  onOpenSettings,
  onLogout,
}: SidebarProfileCardProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <div className="group/profile-card relative">
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/35 p-2 text-left",
                // Width and padding are in the transition because the avatar is the row's last
                // item: without them the card snaps to icon width and the avatar teleports across
                // the rail instead of riding the collapse.
                "transition-[background-color,border-color,box-shadow,width,padding,gap] duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/75 hover:shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                // Collapsed, the button is exactly the avatar: the row gap would otherwise still
                // reserve 12px next to the zero-width name block and push the avatar out of frame.
                // No justify-* here — the avatar is the last item, so it rides the shrinking box
                // to the left edge on its own; centring it would jump it mid-collapse.
                "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:rounded-full! group-data-[collapsible=icon]:border-0! group-data-[collapsible=icon]:bg-transparent! group-data-[collapsible=icon]:p-0!",
                "group-data-[collapsible=icon]:gap-0!",
              )}
              data-sidebar="profile-card"
            />
          }
        >
          <div className="sidebar-collapse-hide min-w-0 flex-1 pl-1">
            <div className="truncate text-sm font-medium leading-tight tracking-tight text-sidebar-foreground">
              {name}
            </div>
            <div className="truncate text-xs leading-tight tracking-tight text-sidebar-foreground/55">
              {school}
            </div>
          </div>

          <Avatar className="sidebar-profile-avatar size-10 shrink-0 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5 group-data-[collapsible=icon]:size-8">
            <div className="size-full overflow-hidden rounded-full bg-sidebar">
              {profileImage ? (
                <AvatarImage src={profileImage} alt={name} className="size-full object-cover" />
              ) : null}
              <AvatarFallback className="size-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                {initials}
              </AvatarFallback>
            </div>
          </Avatar>
        </DropdownMenuTrigger>

        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -right-2 -translate-y-1/2 text-sidebar-foreground/35 transition-all duration-200 sidebar-collapse-hide",
            isOpen
              ? "scale-110 text-sidebar-primary"
              : "group-hover/profile-card:text-sidebar-foreground/65",
          )}
        >
          <svg fill="none" height="24" viewBox="0 0 12 24" width="12">
            <path
              d="M2 4C6 8 6 16 2 20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={6}
          positionerClassName="z-[110]"
          className="z-[110] w-56 rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur-sm"
        >
          <div className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2">
            <Avatar className="size-9 rounded-full">
              {profileImage ? <AvatarImage src={profileImage} alt="" /> : null}
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="truncate text-xs text-muted-foreground">{school}</div>
            </div>
          </div>

          {!isPreviewMode ? (
            <>
              <DropdownMenuSeparator className="my-2 bg-gradient-to-r from-transparent via-border to-transparent" />
              <DropdownMenuItem
                onClick={() => onOpenSettings("general")}
                className="cursor-pointer rounded-xl px-3 py-2.5"
              >
                <IconSettings />
                Settings
              </DropdownMenuItem>
              {isAdministrator ? (
                <DropdownMenuItem
                  onClick={() => onOpenSettings("admin")}
                  className="cursor-pointer rounded-xl px-3 py-2.5"
                >
                  <IconShieldLock />
                  Administrator
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator className="my-2 bg-gradient-to-r from-transparent via-border to-transparent" />
              <DropdownMenuItem
                onClick={onLogout}
                variant="destructive"
                className="cursor-pointer rounded-xl bg-destructive/10 px-3 py-2.5"
              >
                <IconLogout />
                Log out
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  )
}
