import * as React from "react"
import { IconChevronRight, IconDots, IconFolder, IconFolderOpen, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { PaperSave } from "@/lib/past-papers/repository"
import type { PaperFolder } from "@/lib/past-papers/repository-library"

/**
 * Lets the sidebar's "new folder" button reach the tree that owns the draft input.
 *
 * Lifting the create state into the sidebar would mean threading it back through this component's
 * recursion so a nested folder can start one too; a single event keeps the tree the only place
 * that knows how a folder gets made.
 */
export const NEW_FOLDER_EVENT = "millennium:past-papers:new-folder"

interface PaperFolderTreeProps {
  folders: readonly PaperFolder[]
  saves: readonly PaperSave[]
  /** The folder the listing is currently scoped to, owned by the sidebar. */
  selectedId: string | null
  onChanged: () => Promise<void> | void
  onShare: (folder: PaperFolder) => void
  onSelect: (folderId: string | null) => void
}

/**
 * The saved-papers tree.
 *
 * Nesting is capped server-side at four levels, which is enough for the way students actually
 * organise — subject, then term or paper type — and shallow enough that the sidebar never needs a
 * horizontal scrollbar.
 *
 * Selection is controlled by the sidebar rather than held here. It used to be local, which meant
 * the tree could highlight a folder while the listing beside it showed something else entirely —
 * the folder appeared selected and nothing happened, which is what "folders do not work" looked
 * like from the outside.
 */
export function PaperFolderTree({
  folders,
  saves,
  selectedId,
  onChanged,
  onShare,
  onSelect,
}: PaperFolderTreeProps) {
  const selected = selectedId
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [creating, setCreating] = React.useState<{ parentId: string | null } | null>(null)
  const [draftName, setDraftName] = React.useState("")

  // The sidebar's "+" sits above this component, next to the Folders heading; a nested folder is
  // still created from a folder's own menu below.
  React.useEffect(() => {
    const startCreating = () => setCreating({ parentId: null })
    window.addEventListener(NEW_FOLDER_EVENT, startCreating)
    return () => window.removeEventListener(NEW_FOLDER_EVENT, startCreating)
  }, [])

  const counts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const save of saves) {
      const key = save.folderId ?? ""
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [saves])

  const childrenOf = React.useMemo(() => {
    const map = new Map<string | null, PaperFolder[]>()
    for (const folder of folders) {
      const list = map.get(folder.parentId) ?? []
      list.push(folder)
      map.set(folder.parentId, list)
    }
    return map
  }, [folders])

  const select = (folderId: string | null) => onSelect(folderId)

  const createFolder = async (parentId: string | null, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const response = await fetch("/api/past-papers/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "folder", name: trimmed, parentId, color: "", position: 0 }),
      })
      const payload = await response.json().catch(() => null) as { success?: boolean; message?: string } | null
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "Could not create that folder")
      await onChanged()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not create that folder")
    } finally {
      setCreating(null)
      setDraftName("")
    }
  }

  const removeFolder = async (folder: PaperFolder, deleteContents: boolean) => {
    try {
      const response = await fetch("/api/past-papers/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "folder", id: folder.id, deleteContents }),
      })
      if (!response.ok) throw new Error("Could not delete that folder")
      if (selected === folder.id) select(null)
      await onChanged()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete that folder")
    }
  }

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => (
    (childrenOf.get(parentId) ?? []).map((folder) => {
      const children = childrenOf.get(folder.id) ?? []
      const isOpen = expanded.has(folder.id)

      return (
        <li key={folder.id}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-md pr-1 text-sm",
              selected === folder.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
            style={{ paddingLeft: depth * 12 }}
          >
            <button
              type="button"
              className="flex size-5 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-0"
              aria-label={isOpen ? "Collapse" : "Expand"}
              disabled={children.length === 0}
              onClick={() => setExpanded((current) => {
                const next = new Set(current)
                if (next.has(folder.id)) next.delete(folder.id)
                else next.add(folder.id)
                return next
              })}
            >
              <IconChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
            </button>

            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
              onClick={() => select(selected === folder.id ? null : folder.id)}
            >
              {isOpen ? <IconFolderOpen className="size-4 shrink-0" /> : <IconFolder className="size-4 shrink-0" />}
              <span className="truncate">{folder.name}</span>
              {counts.get(folder.id) ? (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{counts.get(folder.id)}</span>
              ) : null}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 opacity-0 group-hover:opacity-100 [&_svg]:size-3.5"
                    aria-label={`Actions for ${folder.name}`}
                  />
                }
              >
                <IconDots />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreating({ parentId: folder.id })}>
                  New folder inside
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onShare(folder)}>Share…</DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Two separate destructive options rather than one with a checkbox: losing a
                    folder and losing the papers in it are different mistakes. */}
                <DropdownMenuItem onClick={() => void removeFolder(folder, false)}>
                  Delete folder, keep papers
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => void removeFolder(folder, true)}>
                  Delete folder and its papers
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isOpen && children.length > 0 ? (
            <ul className="flex flex-col">{renderLevel(folder.id, depth + 1)}</ul>
          ) : null}
        </li>
      )
    })
  )

  return (
    <div className="flex flex-col gap-1">
      {folders.length === 0 && !creating ? (
        <p className="px-1.5 py-1 text-xs text-muted-foreground">
          No folders yet. Papers you star land in the starred list.
        </p>
      ) : null}

      <ul className="flex flex-col">{renderLevel(null, 0)}</ul>

      {creating ? (
        <Input
          autoFocus
          value={draftName}
          className="h-7 text-sm"
          // Names the parent, because the draft renders at the foot of the tree rather than inside
          // the folder it will belong to, and an unlabelled box there says nothing about where the
          // folder is about to land.
          placeholder={creating.parentId === null
            ? "Folder name"
            : `Inside ${folders.find((folder) => folder.id === creating.parentId)?.name ?? "folder"}`}
          aria-label="New folder name"
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => void createFolder(creating.parentId, draftName)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void createFolder(creating.parentId, draftName)
            if (event.key === "Escape") { setCreating(null); setDraftName("") }
          }}
        />
      ) : null}
    </div>
  )
}
