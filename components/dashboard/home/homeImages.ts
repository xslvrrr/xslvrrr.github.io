import {
  HOME_IMAGE_MAX_DATA_URL_LENGTH,
  HOME_IMAGE_MAX_EDGE_PX,
  isStorableHomeImageSource,
} from "./homeLayout"

/**
 * Turning a chosen file into something a home layout can hold.
 *
 * Freeform pictures live inside the layout document rather than in object storage, so the file has
 * to be small enough that saving Home stays cheap. Every image is decoded, scaled to fit
 * `HOME_IMAGE_MAX_EDGE_PX`, and re-encoded; quality is stepped down only while the result is still
 * over the size limit, so ordinary screenshots keep their original quality.
 */

export interface PreparedHomeImage {
  src: string
  /** Natural size after downscaling, used to give the new element a correct aspect ratio. */
  width: number
  height: number
}

export class HomeImageError extends Error {}

/** Encoding attempts, in order. The first result that fits the limit wins. */
const ENCODE_ATTEMPTS: ReadonlyArray<{ type: string; quality?: number }> = [
  { type: "image/webp", quality: 0.92 },
  { type: "image/webp", quality: 0.8 },
  { type: "image/jpeg", quality: 0.8 },
  { type: "image/jpeg", quality: 0.6 },
]

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new HomeImageError("That image could not be read."))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new HomeImageError("That image could not be read."))
        return
      }
      resolve(result)
    }
    reader.readAsDataURL(file)
  })
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new HomeImageError("That file is not an image Millennium can read."))
    image.src = dataUrl
  })
}

/** Scale factor that brings the longest edge down to the cap, never scaling a small image up. */
export function homeImageScale(width: number, height: number, maxEdge = HOME_IMAGE_MAX_EDGE_PX) {
  const longest = Math.max(width, height)
  return longest > maxEdge ? maxEdge / longest : 1
}

export async function prepareHomeImage(file: File): Promise<PreparedHomeImage> {
  if (!file.type.startsWith("image/")) {
    throw new HomeImageError("Choose an image file.")
  }

  const original = await readAsDataUrl(file)
  const image = await decode(original)
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  if (!naturalWidth || !naturalHeight) {
    throw new HomeImageError("That image has no readable dimensions.")
  }

  const scale = homeImageScale(naturalWidth, naturalHeight)
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))

  // An already-small file that fits is kept exactly as chosen, so a transparent PNG stays
  // transparent rather than being flattened onto a canvas by a re-encode it did not need.
  if (scale === 1 && isStorableHomeImageSource(original)) {
    return { src: original, width, height }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new HomeImageError("This browser could not process that image.")
  context.drawImage(image, 0, 0, width, height)

  for (const attempt of ENCODE_ATTEMPTS) {
    const encoded = canvas.toDataURL(attempt.type, attempt.quality)
    // A browser without the requested encoder silently returns PNG, which is still valid output.
    if (encoded.length <= HOME_IMAGE_MAX_DATA_URL_LENGTH) {
      return { src: encoded, width, height }
    }
  }

  throw new HomeImageError("That image is too large to add. Try a smaller or more compressed file.")
}
