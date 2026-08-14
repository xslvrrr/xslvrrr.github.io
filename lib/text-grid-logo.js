export const TEXT_GRID_GLYPHS = "MILLENNIUMSTUDENTPORTAL0123456789/\\|[]{}<>"

export function getTextGridMetrics(width, height) {
  const fontSize = Math.max(7, Math.min(10, Math.round(width / 165)))
  const cellWidth = fontSize * 0.62
  const cellHeight = fontSize * 1.08

  return {
    fontSize,
    cellWidth,
    cellHeight,
    cols: Math.ceil(width / cellWidth) + 1,
    rows: Math.ceil(height / cellHeight) + 1,
    centerX: width / 2,
    centerY: height / 2,
    radius: Math.min(width, height) * 0.43,
  }
}

export function getLogoAlpha(x, y, radius) {
  const nx = x / radius
  const ny = y / radius
  const inCircle = nx * nx + ny * ny <= 1
  if (!inCircle) return 0

  const stripe = nx + ny * 0.54
  const inStripe = [-0.38, 0, 0.38].some((offset) => Math.abs(stripe - offset) < 0.105)
  const inStripeBand = ny > -0.82 && ny < 0.88

  return inStripe && inStripeBand ? 0 : 1
}

export function getGlyphIndex(col, row, frame, glyphCount = TEXT_GRID_GLYPHS.length) {
  const hash = (col * 73856093) ^ (row * 19349663) ^ (frame * 83492791)
  return Math.abs(hash) % glyphCount
}
