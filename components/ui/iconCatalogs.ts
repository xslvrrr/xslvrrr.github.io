import * as TablerCatalog from "@tabler/icons-react"
import * as LucideCatalog from "lucide-react"
import * as PhosphorCatalog from "@phosphor-icons/react"
import * as RemixCatalog from "@remixicon/react"

import {
  componentEntries,
  sortIcons,
  type IconProviderId,
  type ProviderIcon,
} from "./iconCatalogShared"

/**
 * Every icon in every browsable library.
 *
 * This module must only ever be reached through a dynamic `import()`. The four namespace imports
 * above defeat tree-shaking by design — the picker offers the whole catalogue, so the whole
 * catalogue has to be enumerable — and together they are around 12 MB once bundled. Imported
 * statically they land in the server bundle, where they are useless: nothing renders a searchable
 * icon grid during SSR. That 12 MB is what pushed the production server build past the memory a
 * build machine has.
 *
 * `icon-explorer.tsx` resolves the icons it can from a small curated set synchronously, and loads
 * this module only when the picker opens or when a stored icon is not in that set.
 */
export const loadIconCatalogs = (): Record<IconProviderId, ProviderIcon[]> => ({
  tabler: sortIcons(componentEntries(
    TablerCatalog,
    key => /^Icon[A-Z]/.test(key) && key !== "IconContext" && !key.endsWith("Filled"),
  )),
  lucide: sortIcons(componentEntries(
    LucideCatalog,
    key => /^[A-Z][A-Za-z0-9]*Icon$/.test(key) && !key.startsWith("Lucide"),
  )),
  phosphor: sortIcons(componentEntries(
    PhosphorCatalog,
    key => key.endsWith("Icon"),
  )),
  remix: sortIcons(componentEntries(
    RemixCatalog,
    key => /^Ri[A-Z0-9]/.test(key),
  )),
  // Supplied by the picker: HugeIcons are already per-icon dynamic imports and cost nothing here.
  hugeicons: [],
})
