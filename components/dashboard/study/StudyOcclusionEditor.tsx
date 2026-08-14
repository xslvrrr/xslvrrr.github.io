"use client"

import * as React from "react"
import { IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { uploadStudyMedia } from "@/lib/study/client"
import { STUDY_MEDIA_MAX_BYTES, type StudyOcclusionRegion } from "@/lib/study/media"

interface StudyOcclusionEditorProps {
  open: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (fields: Record<string, unknown>) => Promise<void> | void
}

function emptyRegion(index: number): StudyOcclusionRegion {
  return { id: `r${index}`, label: "", x: 10, y: 10, width: 20, height: 20 }
}

async function readAsBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Regions are authored as labelled numeric bounds. That is the keyboard-operable path, and the
 * labels are what make the resulting cards answerable without seeing the image at all.
 */
export function StudyOcclusionEditor({
  open,
  isSaving,
  onOpenChange,
  onSubmit,
}: StudyOcclusionEditorProps) {
  const [mediaId, setMediaId] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState("")
  const [altText, setAltText] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [mode, setMode] = React.useState<"hide-one" | "hide-all">("hide-one")
  const [regions, setRegions] = React.useState<StudyOcclusionRegion[]>([emptyRegion(1)])
  const [isUploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const updateRegion = (index: number, changes: Partial<StudyOcclusionRegion>) => {
    setRegions((current) => current.map((region, position) => (
      position === index ? { ...region, ...changes } : region
    )))
  }

  const upload = async (file: File) => {
    if (!altText.trim()) {
      setError("Describe the image first. Alt text is required before it can be uploaded.")
      return
    }
    if (file.size > STUDY_MEDIA_MAX_BYTES) {
      setError("Images must be smaller than 5 MB.")
      return
    }
    setUploading(true)
    try {
      const media = await uploadStudyMedia({
        data: await readAsBase64(file),
        altText: altText.trim(),
      })
      setMediaId(media.id)
      setFileName(file.name)
      setError(null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That image could not be uploaded.")
    } finally {
      setUploading(false)
    }
  }

  const labelledRegions = regions.filter((region) => region.label.trim())
  const isComplete = Boolean(mediaId) && altText.trim().length > 0 && labelledRegions.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add an image card</DialogTitle>
          <DialogDescription>
            Every region needs a written label. The labels are what let this card be answered
            without seeing the image.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm" role="alert">{error}</p> : null}

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="occlusion-alt">Describe the image</Label>
            <Textarea
              id="occlusion-alt"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Cross-section of a plant cell with labelled organelles"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="occlusion-file">Image file</Label>
            <Input
              id="occlusion-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
              }}
            />
            <p className="text-xs text-[var(--text-tertiary)]" role="status" aria-live="polite">
              {isUploading
                ? "Uploading…"
                : mediaId
                  ? `${fileName} uploaded. PNG, JPEG, or WebP up to 5 MB.`
                  : "PNG, JPEG, or WebP up to 5 MB."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="occlusion-prompt">Question (optional)</Label>
            <Input
              id="occlusion-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Name the hidden organelle"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="occlusion-mode">How to hide regions</Label>
            <Select
              value={mode}
              onValueChange={(value: string | null) => setMode(value === "hide-all" ? "hide-all" : "hide-one")}
            >
              <SelectTrigger id="occlusion-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hide-one">One card per region</SelectItem>
                <SelectItem value="hide-all">One card hiding every region</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Regions</legend>
            {regions.map((region, index) => (
              <div className="grid gap-2 rounded-lg border border-[var(--border-default)] p-3" key={region.id}>
                <div className="grid gap-2">
                  <Label htmlFor={`region-label-${region.id}`}>Label</Label>
                  <Input
                    id={`region-label-${region.id}`}
                    value={region.label}
                    onChange={(event) => updateRegion(index, { label: event.target.value })}
                    placeholder="Chloroplast"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ["x", "Left %"],
                    ["y", "Top %"],
                    ["width", "Width %"],
                    ["height", "Height %"],
                  ] as const).map(([key, label]) => (
                    <div className="grid gap-1" key={key}>
                      <Label htmlFor={`region-${key}-${region.id}`} className="text-xs">{label}</Label>
                      <Input
                        id={`region-${key}-${region.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={region[key]}
                        onChange={(event) => updateRegion(index, {
                          [key]: Number(event.target.value),
                        } as Partial<StudyOcclusionRegion>)}
                      />
                    </div>
                  ))}
                </div>
                {regions.length > 1 ? (
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRegions((current) => current.filter((_entry, position) => position !== index))}
                    >
                      <IconTrash /> Remove region
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={regions.length >= 8}
                onClick={() => setRegions((current) => [...current, emptyRegion(current.length + 1)])}
              >
                <IconPlus /> Add region
              </Button>
            </div>
          </fieldset>

          <p className="text-sm text-[var(--text-tertiary)]" role="status" aria-live="polite">
            This makes {mode === "hide-all" ? 1 : labelledRegions.length} card
            {(mode === "hide-all" ? 1 : labelledRegions.length) === 1 ? "" : "s"}.
          </p>
        </div>

        <DialogFooter showCloseButton>
          <Button
            disabled={isSaving || isUploading || !isComplete}
            onClick={() => void onSubmit({
              mediaId,
              altText: altText.trim(),
              ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
              mode,
              regions: labelledRegions,
            })}
          >
            {isSaving ? <IconLoader2 className="animate-spin" /> : null}
            Add image card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
