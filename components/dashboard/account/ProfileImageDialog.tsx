"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { ChangeEvent, PointerEvent } from "react"
import {
  IconPhotoPlus,
  IconPencil,
  IconRotate,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import styles from "@/styles/Dashboard.module.css"

import {
  exportProfileImage,
  getProfileImageValidationError,
  PROFILE_EDITOR_SIZE,
  PROFILE_IMAGE_ACCEPT,
  readProfileImageFile,
  renderProfileImagePreview,
  type ProfileImageMeta,
  type ProfileImageOffset,
  type ProfileImageTransform,
} from "./profileImageEditor"

interface ProfileImageResponse {
  message?: string
  profileImage?: string | null
}

interface ProfileImageDialogProps {
  profileImage: string | null
  onProfileImageChange: (profileImage: string | null) => void
}

interface DragStart {
  x: number
  y: number
  offsetX: number
  offsetY: number
}

const INITIAL_TRANSFORM: ProfileImageTransform = {
  zoom: 1,
  rotation: 0,
  offset: { x: 0, y: 0 },
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as ProfileImageResponse | null
  return new Error(body?.message || fallback)
}

export function ProfileImageDialog({
  profileImage,
  onProfileImageChange,
}: ProfileImageDialogProps) {
  const fileInputId = useId()
  const shouldReduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [imageSource, setImageSource] = useState<string | null>(null)
  const [imageType, setImageType] = useState<string | null>(null)
  const [imageMeta, setImageMeta] = useState<ProfileImageMeta | null>(null)
  const [transform, setTransform] = useState<ProfileImageTransform>(INITIAL_TRANSFORM)
  const [isDragging, setIsDragging] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragStartRef = useRef<DragStart | null>(null)

  const resetTransform = () => setTransform(INITIAL_TRANSFORM)

  useEffect(() => {
    imageRef.current = null
    setImageMeta(null)
    setImageSource(null)
    setImageType(null)

    if (!open) return

    setTransform(INITIAL_TRANSFORM)
    setUploadProgress(0)

    if (!profileImage) return
    const timer = window.setTimeout(() => {
      setImageSource(profileImage)
      setImageType("image/png")
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open, profileImage])

  useEffect(() => {
    if (!imageSource) return

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      imageRef.current = image
      setImageMeta({ width: image.width, height: image.height })
    }
    image.onerror = () => {
      if (!cancelled) toast.error("Failed to load this profile picture.")
    }
    image.src = imageSource

    return () => {
      cancelled = true
    }
  }, [imageSource])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !imageMeta) return
    renderProfileImagePreview(canvas, image, imageMeta, transform)
  }, [imageMeta, imageSource, transform])

  const handleSelectImage = () => {
    const input = document.getElementById(fileInputId) as HTMLInputElement | null
    input?.click()
  }

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validationError = getProfileImageValidationError(file)
    if (validationError) {
      toast.error(validationError)
      event.target.value = ""
      return
    }

    setUploading(true)
    setUploadProgress(0)
    try {
      const dataUrl = await readProfileImageFile(file, setUploadProgress)
      setUploadProgress(45)
      setImageSource(dataUrl)
      setImageType(file.type)
      setImageMeta(null)
      resetTransform()
    } catch (error) {
      toast.error(errorMessage(error, "Failed to read image."))
    } finally {
      setUploading(false)
      setUploadProgress(0)
      event.target.value = ""
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageSource) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragStartRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      offsetX: transform.offset.x,
      offsetY: transform.offset.y,
    }
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current
    if (!isDragging || !dragStart) return

    const rect = event.currentTarget.getBoundingClientRect()
    const offset: ProfileImageOffset = {
      x: dragStart.offsetX + event.clientX - rect.left - dragStart.x,
      y: dragStart.offsetY + event.clientY - rect.top - dragStart.y,
    }
    setTransform((current) => ({ ...current, offset }))
  }

  const handlePointerUp = (event?: PointerEvent<HTMLDivElement>) => {
    setIsDragging(false)
    dragStartRef.current = null
    if (!event?.currentTarget) return

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be released when the pointer leaves the editor.
    }
  }

  const handleSave = async () => {
    const image = imageRef.current
    if (!image || !imageMeta) {
      toast.error("Please add a profile picture.")
      return
    }

    setUploading(true)
    setUploadProgress(60)
    try {
      const dataUrl = exportProfileImage(image, imageMeta, transform, imageType)
      setUploadProgress(85)

      const response = await fetch("/api/user/profile-image", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      })
      if (!response.ok) {
        throw await responseError(response, "Failed to save profile image")
      }

      const result = await response.json() as ProfileImageResponse
      onProfileImageChange(result.profileImage || null)
      setUploadProgress(100)
      toast.success("Profile picture updated.")
      window.setTimeout(() => setUploadProgress(0), 600)
      setOpen(false)
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update profile picture."))
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    setUploading(true)
    setUploadProgress(60)
    try {
      const response = await fetch("/api/user/profile-image", { method: "DELETE" })
      if (!response.ok) {
        throw await responseError(response, "Failed to remove profile image")
      }

      const result = await response.json() as ProfileImageResponse
      onProfileImageChange(result.profileImage || null)
      imageRef.current = null
      setImageSource(null)
      setImageMeta(null)
      resetTransform()
      setUploadProgress(100)
      toast.success("Profile picture removed.")
      window.setTimeout(() => setUploadProgress(0), 600)
    } catch (error) {
      toast.error(errorMessage(error, "Failed to remove profile picture."))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={uploading} />}>
        <IconPencil size={14} />
        Edit Photo
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-border/70 bg-popover p-0 sm:max-w-[680px]"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">Profile picture</DialogTitle>
            <DialogDescription className="text-xs">
              Upload a photo, then drag, zoom, and rotate it into place.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-xl"
                aria-label="Close"
              />
            }
          >
            <IconX />
          </DialogClose>
        </div>

        <div className="grid gap-6 px-6 py-5 md:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative" style={{ width: PROFILE_EDITOR_SIZE, height: PROFILE_EDITOR_SIZE }}>
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                animate={{
                  boxShadow: "0 0 0 2px rgba(99, 102, 241, .55), 0 10px 32px rgba(99, 102, 241, .18)",
                }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
              />
              <div
                className={cn(
                  styles.profileEditorCanvas,
                  "relative size-full touch-none overflow-hidden rounded-full border border-border bg-muted/60",
                  "flex items-center justify-center select-none",
                  imageSource ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {imageSource ? (
                  <canvas ref={canvasRef} className="size-full" />
                ) : (
                  <div className="flex max-w-32 flex-col items-center gap-2 text-center text-xs text-muted-foreground">
                    <IconPhotoPlus className="size-6" />
                    Add a profile picture
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {imageSource ? "Your photo" : "No photo selected"}
            </div>

            <motion.div
              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={handleSelectImage}
                disabled={uploading}
                className="rounded-xl border-dashed"
              >
                <IconPhotoPlus />
                {imageSource ? "Choose another photo" : "Upload a photo"}
              </Button>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Input
              id={fileInputId}
              type="file"
              accept={PROFILE_IMAGE_ACCEPT}
              onChange={handleImageChange}
              className="sr-only"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${fileInputId}-zoom`}>Zoom</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {transform.zoom.toFixed(2)}×
                </span>
              </div>
              <Slider
                id={`${fileInputId}-zoom`}
                aria-label="Profile image zoom"
                value={[transform.zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={(value) => {
                  const zoom = typeof value === "number" ? value : value[0] ?? 1
                  setTransform((current) => ({ ...current, zoom }))
                }}
                className={styles.profileEditorSlider}
                disabled={!imageSource}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${fileInputId}-rotation`}>Rotation</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(transform.rotation)}°
                </span>
              </div>
              <Slider
                id={`${fileInputId}-rotation`}
                aria-label="Profile image rotation"
                value={[transform.rotation]}
                min={-180}
                max={180}
                step={1}
                onValueChange={(value) => {
                  const rotation = typeof value === "number" ? value : value[0] ?? 0
                  setTransform((current) => ({ ...current, rotation }))
                }}
                className={styles.profileEditorSlider}
                disabled={!imageSource}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setTransform((current) => ({ ...current, rotation: current.rotation - 90 }))}
                disabled={!imageSource}
              >
                <IconRotate className="-scale-x-100" />
                Left
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setTransform((current) => ({ ...current, rotation: current.rotation + 90 }))}
                disabled={!imageSource}
              >
                <IconRotate />
                Right
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={resetTransform}
                disabled={!imageSource || uploading}
              >
                Reset view
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleRemove}
                disabled={!profileImage || uploading}
              >
                <IconTrash />
                Remove
              </Button>
            </div>

            {(uploading || uploadProgress > 0) ? (
              <div className="space-y-2" aria-live="polite">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{uploading ? "Updating photo…" : "Processing…"}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Profile image update progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgress}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {imageType === "image/gif" ? (
              <p className="text-xs text-muted-foreground">
                Animated GIFs are flattened when edited.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4 sm:justify-between">
          <DialogClose render={<Button variant="ghost" className="rounded-xl" />}>
            Cancel
          </DialogClose>
          <Button
            className="rounded-xl"
            onClick={handleSave}
            disabled={!imageSource || uploading}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
