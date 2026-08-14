"use client"

import * as React from "react"
import { IconSearch, IconX } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

type ComboboxSearchFieldProps = Omit<React.ComponentPropsWithoutRef<"input">, "type"> & {
  onClear?: () => void
}

const ComboboxSearchField = React.forwardRef<HTMLInputElement, ComboboxSearchFieldProps>(
  ({ className, onClear, value, ...props }, ref) => (
    <div
      data-slot="combobox-search-field"
      className={cn(
        "relative flex h-9 w-full min-w-0 items-center rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--input-bg,var(--sidebar-background))] text-[var(--text-primary)] transition-[background,border-color] focus-within:border-transparent focus-within:[background:linear-gradient(var(--input-bg,var(--sidebar-background)),var(--input-bg,var(--sidebar-background)))_padding-box,var(--accent-gradient)_border-box]",
        className,
      )}
    >
      <IconSearch aria-hidden="true" className="pointer-events-none ml-2.5 size-4 shrink-0 text-[var(--text-tertiary)]" />
      <input
        ref={ref}
        type="text"
        value={value}
        className="h-full min-w-0 flex-1 appearance-none rounded-[inherit] border-0 bg-transparent px-2 text-sm text-inherit outline-none placeholder:text-[var(--text-tertiary)]"
        {...props}
      />
      {onClear && Boolean(value) && (
        <button
          type="button"
          onClick={onClear}
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] border-0 bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          aria-label="Clear search"
        >
          <IconX className="size-3.5" />
        </button>
      )}
    </div>
  ),
)

ComboboxSearchField.displayName = "ComboboxSearchField"

export { ComboboxSearchField }
