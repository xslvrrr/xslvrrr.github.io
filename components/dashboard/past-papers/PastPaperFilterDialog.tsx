import * as React from "react"
import { IconCheck, IconChevronDown, IconSearch, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  PAPER_CATEGORIES, PAPER_CATEGORY_LABELS, PAPER_DIFFICULTY_BANDS, PAPER_DIFFICULTY_LABELS,
  PAPER_YEAR_LEVELS, PAPER_YEAR_LEVEL_LABELS, visibleSyllabusEras, type SyllabusEra,
} from "@/lib/past-papers/domain"
import type { PastPapersFacets, PastPapersQuery } from "@/hooks/usePastPapers"

interface PastPaperFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The query currently in effect. The dialog edits a copy. */
  query: PastPapersQuery
  facets: PastPapersFacets
  eras: readonly SyllabusEra[]
  /** Year level read from the student's portal, offered as the detected default. */
  detectedYearLevel: string | null
  onApply: (next: PastPapersQuery) => void
}

/**
 * The filter dialog.
 *
 * Nothing here changes the listing until Apply is pressed, and dismissing the dialog — by Escape,
 * by the close button, or by clicking outside it — discards the draft entirely. Filters that
 * applied live turned every exploratory click into a full requery and a repainted page, and a
 * half-built filter set is almost never a set the student wanted to see results for.
 *
 * The draft is re-seeded from `query` each time the dialog opens, so a discarded edit really is
 * discarded rather than lingering until the page reloads.
 */
export function PastPaperFilterDialog({
  open,
  onOpenChange,
  query,
  facets,
  eras,
  detectedYearLevel,
  onApply,
}: PastPaperFilterDialogProps) {
  const [draft, setDraft] = React.useState<PastPapersQuery>(query)

  React.useEffect(() => {
    if (open) setDraft(query)
  }, [open, query])

  const patch = (next: Partial<PastPapersQuery>) => setDraft((current) => ({ ...current, ...next }))

  const availableEras = visibleSyllabusEras(eras, facets.years)
  const minYear = facets.years[0] ?? 1990
  const maxYear = facets.years[facets.years.length - 1] ?? new Date().getFullYear()

  // Difficulty is a contiguous range on the five-point ladder, so a two-handle slider expresses it
  // exactly. A set of independent checkboxes would let a student ask for "gentle or brutal but not
  // solid", which is not a question anyone means to ask.
  const difficultyRange = difficultyToRange(draft.difficulty)

  const apply = () => {
    onApply(draft)
    onOpenChange(false)
  }

  // `savedOnly`, `folderId` and `downloadedOnly` are the sidebar's, not this dialog's. Clearing
  // filters must not move the student out of the folder they are looking at.
  const clear = () => setDraft({
    ...draft,
    yearLevel: undefined,
    subjects: [], categories: [], schools: [], difficulty: [],
    yearFrom: null, yearTo: null, era: null, requireSolutions: false,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Filter papers</DialogTitle>
          <DialogDescription>
            Nothing changes until you apply. Closing this discards the changes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 px-5 py-4">
            <Field label="Subject">
              <MultiCombobox
                placeholder="Any subject"
                searchPlaceholder="Search subjects"
                options={facets.subjects.map((subject) => ({
                  value: subject.slug,
                  label: subject.label,
                  hint: `${subject.count}`,
                }))}
                selected={draft.subjects}
                onChange={(subjects) => patch({ subjects })}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Year level"
                hint={detectedYearLevel ? `Detected: ${PAPER_YEAR_LEVEL_LABELS[detectedYearLevel as keyof typeof PAPER_YEAR_LEVEL_LABELS] ?? detectedYearLevel}` : undefined}
              >
                <SingleCombobox
                  placeholder="Any year level"
                  options={PAPER_YEAR_LEVELS.map((level) => ({
                    value: level,
                    label: PAPER_YEAR_LEVEL_LABELS[level],
                  }))}
                  value={draft.yearLevel ?? null}
                  onChange={(yearLevel) => patch({ yearLevel: yearLevel ?? undefined })}
                />
              </Field>

              <Field label="Type">
                <MultiCombobox
                  placeholder="Any type"
                  options={PAPER_CATEGORIES
                    .filter((category) => category !== "other")
                    .map((category) => ({ value: category, label: PAPER_CATEGORY_LABELS[category] }))}
                  selected={draft.categories}
                  onChange={(categories) => patch({ categories })}
                />
              </Field>
            </div>

            <Field label="School" hint={`${facets.schools.length} in the library`}>
              <MultiCombobox
                placeholder="Any school"
                searchPlaceholder="Search schools"
                options={facets.schools.map((school) => ({ value: school, label: school }))}
                selected={draft.schools}
                onChange={(schools) => patch({ schools })}
              />
            </Field>

            <Field label="Syllabus">
              <SingleCombobox
                placeholder="Any syllabus"
                options={availableEras.map((era) => ({ value: era.id, label: era.label, hint: era.description }))}
                value={draft.era}
                // An era and a manual year range describe the same thing, so choosing one clears
                // the other rather than leaving a listing nobody can account for.
                onChange={(era) => patch({ era, yearFrom: null, yearTo: null })}
              />
            </Field>

            <Field label="Years" hint={`Library covers ${minYear}–${maxYear}`}>
              <div className="flex flex-wrap items-center gap-2">
                <NumberField
                  aria-label="Earliest year"
                  value={draft.yearFrom}
                  min={minYear}
                  max={maxYear}
                  placeholder={String(minYear)}
                  onValueChange={(yearFrom) => patch({ yearFrom, era: null })}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <NumberField
                  aria-label="Latest year"
                  value={draft.yearTo}
                  min={minYear}
                  max={maxYear}
                  placeholder={String(maxYear)}
                  onValueChange={(yearTo) => patch({ yearTo, era: null })}
                />
                {draft.yearFrom !== null || draft.yearTo !== null ? (
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => patch({ yearFrom: null, yearTo: null })}
                  >Reset</Button>
                ) : null}
              </div>
            </Field>

            <Field
              label="Difficulty"
              hint={difficultyRange
                ? `${PAPER_DIFFICULTY_LABELS[PAPER_DIFFICULTY_BANDS[difficultyRange[0]]]} to ${PAPER_DIFFICULTY_LABELS[PAPER_DIFFICULTY_BANDS[difficultyRange[1]]]}`
                : "Any difficulty"}
            >
              <div className="flex items-center gap-3">
                <Slider
                  className="flex-1"
                  min={0}
                  max={PAPER_DIFFICULTY_BANDS.length - 1}
                  step={1}
                  value={difficultyRange ?? [0, PAPER_DIFFICULTY_BANDS.length - 1]}
                  onValueChange={(value: number | readonly number[]) => {
                    const range = Array.isArray(value) ? value : [value as number, value as number]
                    patch({ difficulty: rangeToDifficulty([range[0], range[1]]) })
                  }}
                />
                {draft.difficulty.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => patch({ difficulty: [] })}>
                    Any
                  </Button>
                ) : null}
              </div>
            </Field>

            <Separator />

            <div className="flex flex-col gap-3">
              <SwitchRow
                id="filter-solutions"
                label="Only papers with solutions"
                checked={draft.requireSolutions}
                onChange={(requireSolutions) => patch({ requireSolutions })}
              />
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={clear}>Clear all</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={apply}>Apply filters</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function SwitchRow({
  id, label, checked, onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

interface Option {
  value: string
  label: string
  hint?: string
}

/**
 * A searchable single-select.
 *
 * Matches the combobox already used by the calendar: a popover with a filter field, rather than a
 * native select, because several of these lists run to dozens of options.
 */
function SingleCombobox({
  value, options, placeholder, onChange,
}: {
  value: string | null
  options: readonly Option[]
  placeholder: string
  onChange: (value: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const selected = options.find((option) => option.value === value)
  const filtered = filterOptions(options, search)

  return (
    <Popover open={open} onOpenChange={(next: boolean) => { setOpen(next); if (!next) setSearch("") }}>
      <PopoverTrigger render={<ComboboxTrigger empty={!selected} label={selected?.label ?? placeholder} />} />
      <PopoverContent className="w-[var(--anchor-width)] min-w-56 p-0" align="start">
        {options.length > 8 ? (
          <ComboboxSearch value={search} onChange={setSearch} placeholder="Search" />
        ) : null}
        <ScrollArea className="max-h-64">
          <div className="flex flex-col p-1">
            <ComboboxOption
              label={placeholder}
              selected={value === null}
              onSelect={() => { onChange(null); setOpen(false) }}
            />
            {filtered.map((option) => (
              <ComboboxOption
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={option.value === value}
                onSelect={() => { onChange(option.value); setOpen(false) }}
              />
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/** The same control, multi-select. Stays open between picks, since choosing several is the norm. */
function MultiCombobox({
  selected, options, placeholder, searchPlaceholder, onChange,
}: {
  selected: readonly string[]
  options: readonly Option[]
  placeholder: string
  searchPlaceholder?: string
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const filtered = filterOptions(options, search)

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selected`

  const toggle = (value: string) => {
    onChange(selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open} onOpenChange={(next: boolean) => { setOpen(next); if (!next) setSearch("") }}>
        <PopoverTrigger render={<ComboboxTrigger empty={selected.length === 0} label={label} />} />
        <PopoverContent className="w-[var(--anchor-width)] min-w-56 p-0" align="start">
          {options.length > 8 ? (
            <ComboboxSearch
              value={search}
              onChange={setSearch}
              placeholder={searchPlaceholder ?? "Search"}
            />
          ) : null}
          <ScrollArea className="max-h-64">
            <div className="flex flex-col p-1">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches</p>
              ) : null}
              {filtered.map((option) => (
                <ComboboxOption
                  key={option.value}
                  label={option.label}
                  hint={option.hint}
                  selected={selected.includes(option.value)}
                  onSelect={() => toggle(option.value)}
                />
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Chips, so a multi-select's contents are legible without reopening the popover. */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 pr-1">
              {options.find((option) => option.value === value)?.label ?? value}
              <button
                type="button"
                className="rounded-sm opacity-60 hover:opacity-100"
                aria-label={`Remove ${value}`}
                onClick={() => toggle(value)}
              >
                <IconX className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface ComboboxTriggerProps extends React.ComponentPropsWithoutRef<"button"> {
  empty: boolean
  label: string
}

/**
 * The button a combobox popover hangs off.
 *
 * Forwarding is the entire point of this component, and getting it wrong is why none of these
 * filters opened: Base UI's `render` prop clones the element it is given with the trigger's own
 * click handler, ref and ARIA state, so a component that renders a fixed `<button>` and ignores
 * its props silently discards all of it. The popover was wired to a button that was never told to
 * open it.
 */
const ComboboxTrigger = React.forwardRef<HTMLButtonElement, ComboboxTriggerProps>(
  function ComboboxTrigger({ empty, label, className, ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent",
          "px-3 py-1 text-sm shadow-xs transition-[color,box-shadow]",
          "hover:bg-muted/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          empty && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <IconChevronDown className="size-4 shrink-0 opacity-50" />
      </button>
    )
  },
)

function ComboboxSearch({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative border-b p-1">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 border-0 pl-7 shadow-none focus-visible:ring-0"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function ComboboxOption({
  label, hint, selected, onSelect,
}: {
  label: string
  hint?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
        "hover:bg-accent hover:text-accent-foreground",
      )}
      onClick={onSelect}
    >
      <IconCheck className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-xs text-muted-foreground">{hint}</span> : null}
    </button>
  )
}

function filterOptions(options: readonly Option[], search: string): Option[] {
  const query = search.trim().toLowerCase()
  if (!query) return [...options]
  return options.filter((option) => option.label.toLowerCase().includes(query))
}

/** The selected bands as a contiguous slider range, or null when every band is allowed. */
function difficultyToRange(difficulty: readonly string[]): [number, number] | null {
  if (difficulty.length === 0) return null
  const indices = difficulty
    .map((band) => PAPER_DIFFICULTY_BANDS.indexOf(band as (typeof PAPER_DIFFICULTY_BANDS)[number]))
    .filter((index) => index >= 0)
  if (indices.length === 0) return null
  return [Math.min(...indices), Math.max(...indices)]
}

function rangeToDifficulty([low, high]: [number, number]): string[] {
  // The full range means "no difficulty filter", not "every band selected" — otherwise a paper with
  // no difficulty rating yet would be excluded by a slider the student never touched.
  if (low <= 0 && high >= PAPER_DIFFICULTY_BANDS.length - 1) return []
  return PAPER_DIFFICULTY_BANDS.slice(low, high + 1)
}
