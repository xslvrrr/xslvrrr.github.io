import type * as React from "react"

/**
 * The pieces both the icon picker and the full icon catalogues need.
 *
 * Kept in its own module so `iconCatalogs.ts` — which namespace-imports four entire icon libraries —
 * can be loaded on demand without dragging the picker in with it, and vice versa.
 */

export type IconProviderId = "tabler" | "lucide" | "hugeicons" | "phosphor" | "remix"

export type IconComponent = React.ElementType<any>

export type ProviderIcon = {
  key: string
  label: string
  Component: IconComponent
  searchText: string
}

export type CatalogIcon = ProviderIcon & { provider: IconProviderId }

export const PROVIDERS: { id: IconProviderId; label: string; shortLabel: string }[] = [
  { id: "tabler", label: "Tabler", shortLabel: "Tabler" },
  { id: "lucide", label: "Lucide", shortLabel: "Lucide" },
  { id: "hugeicons", label: "HugeIcons", shortLabel: "Huge" },
  { id: "phosphor", label: "Phosphor", shortLabel: "Phosphor" },
  { id: "remix", label: "Remix Icon", shortLabel: "Remix" },
]

export const toLabel = (value: string) => (
  value
    .replace(/^Icon/, "")
    .replace(/^Ri/, "")
    .replace(/(FreeIcons|Icon|Line|Fill|Regular|Bold|Duotone|Light|Thin)$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim() || value
)

const makeSearchText = (key: string, label: string) => `${label} ${key}`.toLowerCase()

export const makeProviderIcon = (key: string, Component: IconComponent): ProviderIcon => {
  const label = toLabel(key)
  return {
    key,
    label,
    Component,
    searchText: makeSearchText(key, label),
  }
}

export const sortIcons = <T extends ProviderIcon>(icons: T[]): T[] => (
  icons.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
)

export const componentEntries = (
  catalog: Record<string, unknown>,
  include: (key: string) => boolean
) => (
  Object.entries(catalog)
    .filter(([key, value]) => include(key) && (
      typeof value === "function"
      || (typeof value === "object" && value !== null && "$$typeof" in value)
    ))
    .map(([key, Component]) => makeProviderIcon(key, Component as IconComponent))
)
