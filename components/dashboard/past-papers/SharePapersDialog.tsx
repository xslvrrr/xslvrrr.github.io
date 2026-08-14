import * as React from "react"
import { IconCheck, IconCopy, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { normaliseShareCode, shareLinkPath, type PastPaperPublication } from "@/lib/past-papers/sharing"

interface SharePapersDialogProps {
  target: { kind: "folder" | "ladder"; id: string; title: string }
  onClose: () => void
}

/**
 * Share codes for a folder or ladder.
 *
 * Publishing snapshots what is being shared, so a recipient gets what the sender meant to send —
 * reorganising the folder afterwards does not silently change what someone else already holds a
 * link to. That is stated in the dialog rather than left implicit, because the alternative
 * assumption is the more natural one.
 */
export function SharePapersDialog({ target, onClose }: SharePapersDialogProps) {
  const [publications, setPublications] = React.useState<PastPaperPublication[]>([])
  const [redeemCode, setRedeemCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/past-papers/share", { cache: "no-store" })
      const payload = await response.json().catch(() => null) as
        { success?: boolean; data?: { publications?: PastPaperPublication[] } } | null
      if (payload?.success) setPublications(payload.data?.publications ?? [])
    } catch {
      // The dialog still works for creating a new code without the existing list.
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const publish = async () => {
    setBusy(true)
    try {
      const response = await fetch("/api/past-papers/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target.kind,
          folderId: target.kind === "folder" ? target.id : null,
          ladderId: target.kind === "ladder" ? target.id : null,
          title: target.title,
          description: "",
        }),
      })
      const payload = await response.json().catch(() => null) as
        { success?: boolean; message?: string } | null
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "Could not create a share code")
      toast.success("Share code created")
      await load()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not create a share code")
    } finally {
      setBusy(false)
    }
  }

  const redeem = async () => {
    const code = normaliseShareCode(redeemCode)
    if (code.length < 8) {
      toast.error("That does not look like a share code")
      return
    }

    setBusy(true)
    try {
      const response = await fetch("/api/past-papers/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redeem", shareCode: code, folderId: null }),
      })
      const payload = await response.json().catch(() => null) as
        { success?: boolean; message?: string; data?: { added?: number; title?: string } } | null
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "That share code is not valid")

      toast.success(`Added ${payload.data?.added ?? 0} papers from “${payload.data?.title ?? "shared folder"}”`)
      setRedeemCode("")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not use that share code")
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (publication: PastPaperPublication) => {
    try {
      const response = await fetch("/api/past-papers/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId: publication.id }),
      })
      if (!response.ok) throw new Error("Could not revoke that code")
      toast.success("Share code revoked")
      await load()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not revoke that code")
    }
  }

  const copy = async (publication: PastPaperPublication) => {
    const link = `${window.location.origin}${shareLinkPath(publication.shareCode)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(publication.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard access can be denied; the code is on screen and selectable either way.
      toast.message(link)
    }
  }

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{target.title}”</DialogTitle>
          <DialogDescription>
            A code shares the papers as they are now. Changing this {target.kind} later will not
            change what anyone who already has the code received.
          </DialogDescription>
        </DialogHeader>

        <Button type="button" disabled={busy} onClick={() => void publish()}>
          Create a share code
        </Button>

        {publications.filter((publication) => publication.revokedAt === null).length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your codes</Label>
            {publications.filter((publication) => publication.revokedAt === null).map((publication) => (
              <div key={publication.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{publication.title}</span>
                  <code className="truncate font-mono text-xs text-muted-foreground">{publication.shareCode}</code>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{publication.paperCount} papers</span>
                <Button
                  type="button" variant="ghost" size="icon" className="size-8 shrink-0 [&_svg]:size-4"
                  aria-label="Copy share link" onClick={() => void copy(publication)}
                >{copiedId === publication.id ? <IconCheck className="text-primary" /> : <IconCopy />}</Button>
                <Button
                  type="button" variant="ghost" size="icon" className="size-8 shrink-0 [&_svg]:size-4"
                  aria-label="Revoke share code" onClick={() => void revoke(publication)}
                ><IconTrash /></Button>
              </div>
            ))}
          </div>
        ) : null}

        <Separator />

        <div className="flex flex-col gap-2">
          <Label htmlFor="redeem-code">Have a code?</Label>
          <div className="flex gap-2">
            <Input
              id="redeem-code"
              value={redeemCode}
              placeholder="Paste a code or link"
              onChange={(event) => setRedeemCode(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void redeem() }}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => void redeem()}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
