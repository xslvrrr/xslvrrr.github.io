/**
 * Dotted version comparison for desktop packages.
 *
 * Release versions follow `major.minor.patch` with an optional pre-release suffix. A pre-release
 * sorts below the same numeric release, matching SemVer precedence closely enough for update
 * decisions without pulling in a comparison dependency.
 */

interface ParsedVersion {
  numbers: number[]
  preRelease: string | null
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (!match) return null
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    preRelease: match[4] || null,
  }
}

/** Returns a negative number when `left` is older, positive when newer, zero when equal. */
export function compareDesktopVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left)
  const parsedRight = parseVersion(right)
  if (!parsedLeft || !parsedRight) return 0

  for (let index = 0; index < 3; index += 1) {
    const difference = parsedLeft.numbers[index] - parsedRight.numbers[index]
    if (difference !== 0) return difference < 0 ? -1 : 1
  }

  if (parsedLeft.preRelease === parsedRight.preRelease) return 0
  if (!parsedLeft.preRelease) return 1
  if (!parsedRight.preRelease) return -1
  return parsedLeft.preRelease < parsedRight.preRelease ? -1 : 1
}

/** True when `candidate` is a strictly newer release than `current`. */
export function isNewerDesktopVersion(candidate: string, current: string): boolean {
  return compareDesktopVersions(candidate, current) > 0
}
