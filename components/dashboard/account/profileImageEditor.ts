export const PROFILE_EDITOR_SIZE = 220
export const PROFILE_EXPORT_SIZE = 512
export const PROFILE_IMAGE_MAX_BYTES = 25 * 1024 * 1024

export const PROFILE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

const PROFILE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

export interface ProfileImageMeta {
  width: number
  height: number
}

export interface ProfileImageOffset {
  x: number
  y: number
}

export interface ProfileImageTransform {
  zoom: number
  rotation: number
  offset: ProfileImageOffset
}

interface DrawProfileImageOptions {
  canvas: HTMLCanvasElement
  image: HTMLImageElement
  imageMeta: ProfileImageMeta
  transform: ProfileImageTransform
  size: number
}

export function getProfileImageValidationError(file: File): string | null {
  if (!PROFILE_IMAGE_TYPES.has(file.type)) {
    return "Unsupported image type. Use PNG, JPG, WEBP, or GIF."
  }

  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return "Image exceeds 25 MB limit."
  }

  return null
}

export function readProfileImageFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 40))
    }
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("Failed to read file"))
      }
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

function drawProfileImage({
  canvas,
  image,
  imageMeta,
  transform,
  size,
}: DrawProfileImageOptions): boolean {
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext("2d")
  if (!context) {
    return false
  }

  const baseScale = Math.max(size / imageMeta.width, size / imageMeta.height)
  const scale = baseScale * transform.zoom
  const offsetScale = size / PROFILE_EDITOR_SIZE

  context.clearRect(0, 0, size, size)
  context.save()
  context.beginPath()
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  context.closePath()
  context.clip()
  context.translate(
    size / 2 + transform.offset.x * offsetScale,
    size / 2 + transform.offset.y * offsetScale,
  )
  context.rotate((transform.rotation * Math.PI) / 180)
  context.scale(scale, scale)
  context.drawImage(image, -imageMeta.width / 2, -imageMeta.height / 2)
  context.restore()
  return true
}

export function renderProfileImagePreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  imageMeta: ProfileImageMeta,
  transform: ProfileImageTransform,
): void {
  drawProfileImage({
    canvas,
    image,
    imageMeta,
    transform,
    size: PROFILE_EDITOR_SIZE,
  })
}

export function exportProfileImage(
  image: HTMLImageElement,
  imageMeta: ProfileImageMeta,
  transform: ProfileImageTransform,
  sourceType: string | null,
): string {
  const canvas = document.createElement("canvas")
  const rendered = drawProfileImage({
    canvas,
    image,
    imageMeta,
    transform,
    size: PROFILE_EXPORT_SIZE,
  })
  if (!rendered) {
    throw new Error("Failed to prepare editor")
  }

  const exportType = sourceType === "image/gif" ? "image/png" : sourceType || "image/png"
  return canvas.toDataURL(exportType)
}
