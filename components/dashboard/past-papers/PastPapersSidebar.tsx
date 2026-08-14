import * as React from "react"
import {
  IconChevronRight, IconDeviceFloppy, IconLayoutList, IconPlus, IconStairs, IconStarFilled,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/past-papers/local-library"
import type { PaperSave } from "@/lib/past-papers/repository"
import type { PaperFolder } from "@/lib/past-papers/repository-library"
import { NEW_FOLDER_EVENT, PaperFolderTree } from "./PaperFolderTree"

/**
 * Which listing the browser is showing.
 *
 * A view is a destination, not a filter. Starred and downloaded are separate places a student goes
 * to rather than checkboxes buried in the filter dialog, because "the papers I set aside" and "the
 * papers on this laptop" are how anyone actually thinks about their own library — and a switch
 * hidden two clicks deep in a modal is a switch nobody finds.
 */
export type PastPapersView = "browse" | "starred" | "downloaded" | "ladders"

interface PastPapersSidebarProps {
  view: PastPapersView
  onViewChange: (view: PastPapersView) => void
  folderId: string | null
  onFolderChange: (folderId: string | null) => void
  folders: readonly PaperFolder[]
  saves: readonly PaperSave[]
  ladderCount: number
  /** Papers whose document is stored for this account, wherever they were downloaded from. */
  downloadedCount: number
  /** Papers held in this browser's own store. Reported separately, and honestly. */
  onDeviceCount: number
  onDeviceBytes: number
  onChanged: () => Promise<void> | void
  onShareFolder: (folder: PaperFolder) => void
}

/**
 * The past papers sidebar.
 *
 * Replaces a bare folder tree under a "Folders" caption, which was the only navigation the page
 * had: everything else — starred papers, downloads, ladders — was reachable only through a tab
 * strip in the header or a switch inside the filter dialog, so most of the feature was invisible
 * from the page it belonged to. The tree stays, demoted to what it is: one way of organising the
 * starred list, not the whole of navigation.
 */
export function PastPapersSidebar({
  view,
  onViewChange,
  folderId,
  onFolderChange,
  folders,
  saves,
  ladderCount,
  downloadedCount,
  onDeviceCount,
  onDeviceBytes,
  onChanged,
  onShareFolder,
}: PastPapersSidebarProps) {
  const [foldersOpen, setFoldersOpen] = React.useState(true)

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-4 lg:flex">
      <nav className="flex flex-col gap-0.5" aria-label="Past papers sections">
        <NavItem
          icon={<IconLayoutList className="size-4" />}
          label="Browse"
          active={view === "browse" && folderId === null}
          onClick={() => onViewChange("browse")}
        />
        <NavItem
          icon={<IconStarFilled className="size-4 text-amber-500" />}
          label="Starred"
          count={saves.length}
          active={view === "starred" && folderId === null}
          onClick={() => onViewChange("starred")}
        />
        <NavItem
          icon={<IconDeviceFloppy className="size-4" />}
          label="Downloaded"
          count={downloadedCount}
          active={view === "downloaded" && folderId === null}
          onClick={() => onViewChange("downloaded")}
        />
        <NavItem
          icon={<IconStairs className="size-4" />}
          label="Ladders"
          count={ladderCount}
          active={view === "ladders"}
          onClick={() => onViewChange("ladders")}
        />
      </nav>

      <div className="flex min-h-0 flex-col gap-1">
        <div className="flex items-center gap-1 pr-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            aria-expanded={foldersOpen}
            onClick={() => setFoldersOpen((open) => !open)}
          >
            <IconChevronRight className={cn("size-3.5 transition-transform", foldersOpen && "rotate-90")} />
            Folders
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 [&_svg]:size-3.5"
            aria-label="New folder"
            onClick={() => {
              setFoldersOpen(true)
              window.dispatchEvent(new Event(NEW_FOLDER_EVENT))
            }}
          >
            <IconPlus />
          </Button>
        </div>

        {foldersOpen ? (
          <ScrollArea className="max-h-72 min-h-0">
            <PaperFolderTree
              folders={folders}
              saves={saves}
              selectedId={folderId}
              onChanged={onChanged}
              onShare={onShareFolder}
              onSelect={onFolderChange}
            />
          </ScrollArea>
        ) : null}
      </div>

      {onDeviceCount > 0 ? (
        <p className="mt-auto px-1 text-[11px] leading-tight text-muted-foreground">
          {onDeviceCount} {onDeviceCount === 1 ? "paper" : "papers"} on this device
          <br />
          {formatBytes(onDeviceBytes)}
        </p>
      ) : null}
    </aside>
  )
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-muted",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  )
}
