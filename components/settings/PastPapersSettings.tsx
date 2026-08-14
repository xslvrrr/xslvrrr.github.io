"use client"

import * as React from "react"
import { IconCheck, IconLoader2, IconVolume, IconVolume3 } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ScrollArea } from "../ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"
import { Slider } from "../ui/slider"
import { Switch } from "../ui/switch"
import { cn } from "../../lib/utils"
import {
    PAPER_YEAR_LEVELS,
    PAPER_YEAR_LEVEL_LABELS,
    type PaperYearLevel,
} from "../../lib/past-papers/domain"
import {
    DEFAULT_PAST_PAPER_PREFERENCES,
    parsePastPaperPreferences,
    type PastPaperPreferences,
} from "../../lib/past-papers/preferences"
import { PAPER_SORT_LABELS, type PaperSort } from "../../lib/past-papers/query"

/** Long enough to swallow a slider drag, short enough that a switch feels saved on the spot. */
const SAVE_DEBOUNCE_MS = 400

/** The zoom levels worth offering. Anything finer belongs to the viewer's own controls. */
const ZOOM_CHOICES = [0.75, 1, 1.2, 1.5, 2] as const

/**
 * Past papers settings.
 *
 * Rewritten to the same shape every other settings page uses — bordered card per section, one row
 * per setting, `data-settings-anchor` on the rows the settings search already indexes. It was
 * previously the only page in Settings built from bare flex columns and shadcn `Separator`s, which
 * meant it inherited none of the surface tokens, none of the row rhythm, and none of the search
 * behaviour: typing "timer volume" into settings search navigated here and then had nothing to
 * scroll to.
 *
 * Saved as it changes rather than behind a save button: every setting here is a small reversible
 * preference, and a page of switches with a submit button invites people to change one thing and
 * navigate away without it applying. Writes are coalesced and only ever carry the fields that
 * changed — the server merges them onto what is stored, so two settings pages open at once cannot
 * talk past each other.
 */
export function PastPapersSettings() {
    const [preferences, setPreferences] = React.useState<PastPaperPreferences>(DEFAULT_PAST_PAPER_PREFERENCES)
    const [loaded, setLoaded] = React.useState(false)
    const [subjects, setSubjects] = React.useState<Array<{ slug: string; label: string; count: number }>>([])
    const [subjectSearch, setSubjectSearch] = React.useState("")

    /**
     * Changes waiting to be written.
     *
     * Held rather than sent per change because the volume slider fires on every step of a drag, and
     * a request per step both wastes the account's write budget and arrives out of order. The patch
     * is coalesced, so a drag from 60% to 20% is one save of the value the student let go on.
     */
    const pending = React.useRef<Partial<PastPaperPreferences>>({})
    const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    React.useEffect(() => {
        let cancelled = false
        void fetch("/api/past-papers/preferences", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: { data?: { preferences?: unknown } } | null) => {
                if (cancelled) return
                // Anything already changed is newer than this response, which was in flight before
                // the student touched it.
                setPreferences({ ...parsePastPaperPreferences(payload?.data?.preferences), ...pending.current })
                setLoaded(true)
            })
            .catch(() => { if (!cancelled) setLoaded(true) })
        return () => { cancelled = true }
    }, [])

    // The subject list is the catalogue's own, so it comes from the browse facets rather than a
    // hardcoded list that would drift from whatever the index actually holds.
    React.useEffect(() => {
        let cancelled = false
        void fetch("/api/past-papers/browse?limit=1", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: { data?: { facets?: { subjects?: unknown } } } | null) => {
                if (cancelled) return
                const list = payload?.data?.facets?.subjects
                if (Array.isArray(list)) setSubjects(list as typeof subjects)
            })
            .catch(() => {
                // Subjects are an aid to the enrolment picker, not a requirement for the page.
            })
        return () => { cancelled = true }
    }, [])

    const flush = React.useCallback(async (keepalive = false) => {
        const patch = pending.current
        pending.current = {}
        if (Object.keys(patch).length === 0) return

        try {
            const response = await fetch("/api/past-papers/preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
                keepalive,
            })
            const payload = await response.json().catch(() => null) as
                { success?: boolean; data?: { preferences?: unknown }; message?: string } | null

            // A rejected save has to be visible. Reporting only transport failures meant a rate
            // limit or an expired session looked exactly like a successful write.
            if (!response.ok || !payload?.success) {
                throw new Error(payload?.message || "That setting could not be saved.")
            }

            // The server's answer is the record of what is stored, but anything typed while the
            // request was in flight is newer than it and stays.
            const stored = parsePastPaperPreferences(payload.data?.preferences)
            setPreferences({ ...stored, ...pending.current })
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "That setting could not be saved.")
        }
    }, [])

    const update = React.useCallback(<K extends keyof PastPaperPreferences>(
        key: K,
        value: PastPaperPreferences[K],
    ) => {
        setPreferences((current) => ({ ...current, [key]: value }))
        pending.current = { ...pending.current, [key]: value }
        if (flushTimer.current) clearTimeout(flushTimer.current)
        flushTimer.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
    }, [flush])

    // Leaving the page must not lose the last change; `keepalive` lets the write outlive the unmount.
    React.useEffect(() => () => {
        if (flushTimer.current) clearTimeout(flushTimer.current)
        void flush(true)
    }, [flush])

    const senior = preferences.yearLevel === "yr11" || preferences.yearLevel === "yr12"

    const filteredSubjects = React.useMemo(() => {
        const needle = subjectSearch.trim().toLowerCase()
        if (!needle) return subjects
        return subjects.filter((subject) => subject.label.toLowerCase().includes(needle))
    }, [subjectSearch, subjects])

    const toggleSubject = (slug: string) => {
        const next = preferences.subjectSlugs.includes(slug)
            ? preferences.subjectSlugs.filter((entry) => entry !== slug)
            : [...preferences.subjectSlugs, slug]
        update("subjectSlugs", next)
    }

    return (
        <div aria-busy={!loaded}>
            <SettingSection title="Your study profile" anchor="past-papers-profile">
                <SettingRow
                    label="Year level"
                    description="Decides which papers rank first and how long the timer starts at."
                    anchor="past-papers-year-level"
                >
                    <Select
                        value={preferences.yearLevel ?? ""}
                        onValueChange={(value: string | null) => {
                            if (value) update("yearLevel", value as PaperYearLevel)
                        }}
                    >
                        <SelectTrigger className="w-48">
                            <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                            {PAPER_YEAR_LEVELS.map((level) => (
                                <SelectItem key={level} value={level}>
                                    {PAPER_YEAR_LEVEL_LABELS[level]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SettingRow>

                {/* Only Year 11 and 12 choose their subjects; a junior sits whatever their school
                    sets, so the question has no answer worth storing. */}
                {senior ? (
                    <div data-settings-anchor="past-papers-subjects" className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0 sm:px-[18px]">
                        <div className="min-w-0">
                            <div className="mb-1 text-sm font-medium text-[var(--text-primary)]">Your subjects</div>
                            <div className="text-xs text-[var(--text-tertiary)]">
                                Papers for these come first. {preferences.subjectSlugs.length} selected.
                            </div>
                        </div>

                        <Input
                            value={subjectSearch}
                            className="h-8 max-w-xs"
                            placeholder="Search subjects"
                            aria-label="Search subjects"
                            onChange={(event) => setSubjectSearch(event.target.value)}
                        />

                        <ScrollArea className="h-56 rounded-lg border border-[var(--border-default)]">
                            <div className="grid gap-0.5 p-1.5 sm:grid-cols-2">
                                {filteredSubjects.length === 0 ? (
                                    <p className="px-2 py-6 text-center text-xs text-[var(--text-tertiary)]">
                                        {subjects.length === 0 ? "Loading subjects" : "Nothing matches"}
                                    </p>
                                ) : null}
                                {filteredSubjects.map((subject) => {
                                    const selected = preferences.subjectSlugs.includes(subject.slug)
                                    return (
                                        <button
                                            key={subject.slug}
                                            type="button"
                                            aria-pressed={selected}
                                            className={cn(
                                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                                selected
                                                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                                                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                                            )}
                                            onClick={() => toggleSubject(subject.slug)}
                                        >
                                            <IconCheck className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                                            <span className="min-w-0 flex-1 truncate">{subject.label}</span>
                                            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{subject.count}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                ) : null}

                <SettingRow
                    label="Run the setup again"
                    description="Reopens the two-question setup the past papers page starts with."
                    anchor="past-papers-setup"
                >
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!loaded}
                        onClick={() => {
                            update("onboardingCompleted", false)
                            toast.success("Setup will run the next time you open Past papers.")
                        }}
                    >
                        {loaded ? "Run setup" : <IconLoader2 className="size-4 animate-spin" />}
                    </Button>
                </SettingRow>
            </SettingSection>

            <SettingSection title="Timer" anchor="past-papers-timer">
                <SettingRow
                    label="Show the timer by default"
                    description="You can still toggle it inside any paper."
                >
                    <Switch
                        checked={preferences.timerEnabled}
                        onCheckedChange={(value: boolean) => update("timerEnabled", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Start the timer automatically"
                    description="Off by default, so glancing at a paper does not start a clock on it."
                >
                    <Switch
                        checked={preferences.autoStartTimer}
                        onCheckedChange={(value: boolean) => update("autoStartTimer", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Include reading time"
                    description="Runs the paper's reading allowance as its own phase before the working clock starts."
                >
                    <Switch
                        checked={preferences.includeReadingTime}
                        onCheckedChange={(value: boolean) => update("includeReadingTime", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Rolling digits"
                    description="Digits roll as they change. Turn off for a plain clock."
                    anchor="past-papers-rolling"
                >
                    <Switch
                        checked={preferences.rollingDigits}
                        onCheckedChange={(value: boolean) => update("rollingDigits", value)}
                    />
                </SettingRow>

                <SettingRow label="Progress bar and percentage">
                    <Switch
                        checked={preferences.showTimerProgress}
                        onCheckedChange={(value: boolean) => update("showTimerProgress", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Chime at 30, 10 and 5 minutes"
                    description="The same calls an invigilator makes."
                >
                    <Switch
                        checked={preferences.timerAlerts}
                        onCheckedChange={(value: boolean) => update("timerAlerts", value)}
                    />
                </SettingRow>

                <SettingRow label="Timer volume" anchor="past-papers-timer-volume">
                    <div className="flex w-56 items-center gap-2">
                        <IconVolume3 className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                        <Slider
                            className="flex-1"
                            aria-label="Timer volume"
                            min={0}
                            max={100}
                            step={5}
                            disabled={!preferences.timerAlerts}
                            value={[Math.round(preferences.timerVolume * 100)]}
                            onValueChange={(value: number | readonly number[]) => {
                                const next = Array.isArray(value) ? value[0] : (value as number)
                                update("timerVolume", Math.min(1, Math.max(0, next / 100)))
                            }}
                        />
                        <IconVolume className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                        <span className="w-9 shrink-0 text-right text-sm tabular-nums text-[var(--text-tertiary)]">
                            {Math.round(preferences.timerVolume * 100)}%
                        </span>
                    </div>
                </SettingRow>
            </SettingSection>

            <SettingSection title="Reading" anchor="past-papers-reading">
                <SettingRow label="Annotation tools">
                    <Switch
                        checked={preferences.annotationsEnabled}
                        onCheckedChange={(value: boolean) => update("annotationsEnabled", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Hide the toolbar by default"
                    description="Opens papers with the floating tools collapsed. A button in the corner brings them back."
                >
                    <Switch
                        checked={preferences.hideToolbarByDefault}
                        onCheckedChange={(value: boolean) => update("hideToolbarByDefault", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Lock text selection during a timed attempt"
                    description="Stops a paper being copied out while the clock runs."
                >
                    <Switch
                        checked={preferences.lockSelectionDuringAttempt}
                        onCheckedChange={(value: boolean) => update("lockSelectionDuringAttempt", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Default zoom"
                    description="What a paper opens at. The viewer's own zoom still applies from there."
                    anchor="past-papers-zoom"
                >
                    <Select
                        value={String(nearestZoom(preferences.defaultZoom))}
                        onValueChange={(value: string | null) => {
                            if (value) update("defaultZoom", Number(value))
                        }}
                    >
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {ZOOM_CHOICES.map((zoom) => (
                                <SelectItem key={zoom} value={String(zoom)}>
                                    {Math.round(zoom * 100)}%
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow
                    label="Keep answers shut during a timed attempt"
                    description="Marking guidelines and sample answers stay closed until you pause."
                    anchor="past-papers-answers"
                >
                    <Switch
                        checked={preferences.hideAnswersDuringAttempt}
                        onCheckedChange={(value: boolean) => update("hideAnswersDuringAttempt", value)}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="Browsing" anchor="past-papers-browsing">
                <SettingRow label="Default sort" description="What the list opens on.">
                    <Select
                        value={preferences.defaultSort}
                        onValueChange={(value: string | null) => {
                            if (value) update("defaultSort", value as PaperSort)
                        }}
                    >
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {(Object.keys(PAPER_SORT_LABELS) as PaperSort[]).map((sort) => (
                                <SelectItem key={sort} value={sort}>{PAPER_SORT_LABELS[sort]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SettingRow>

                <SettingRow label="Show the picked-for-you row">
                    <Switch
                        checked={preferences.showPickedForYou}
                        onCheckedChange={(value: boolean) => update("showPickedForYou", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Match my year level"
                    description="Opens the list filtered to the year you are in."
                >
                    <Switch
                        checked={preferences.matchMyYearLevel}
                        onCheckedChange={(value: boolean) => update("matchMyYearLevel", value)}
                    />
                </SettingRow>

                <SettingRow
                    label="Show estimated difficulty"
                    description="Bands with little evidence behind them, marked with a question mark."
                >
                    <Switch
                        checked={preferences.showEstimatedDifficulty}
                        onCheckedChange={(value: boolean) => update("showEstimatedDifficulty", value)}
                    />
                </SettingRow>

                <SettingRow label="Warn about superseded syllabuses">
                    <Switch
                        checked={preferences.warnOffSyllabus}
                        onCheckedChange={(value: boolean) => update("warnOffSyllabus", value)}
                    />
                </SettingRow>
            </SettingSection>

            <SettingSection title="After an attempt" anchor="past-papers-attempt">
                <SettingRow
                    label="Ask how hard it was"
                    description="Your rating is what teaches the difficulty labels other students see."
                >
                    <Switch
                        checked={preferences.promptForRating}
                        onCheckedChange={(value: boolean) => update("promptForRating", value)}
                    />
                </SettingRow>

                <SettingRow label="Offer to make flashcards from the paper">
                    <Switch
                        checked={preferences.offerFlashcardsAfterAttempt}
                        onCheckedChange={(value: boolean) => update("offerFlashcardsAfterAttempt", value)}
                    />
                </SettingRow>
            </SettingSection>
        </div>
    )
}

/**
 * A stored zoom that is not one of the offered steps still has to select something.
 *
 * The viewer writes no zoom of its own today, but the schema accepts any scale between 0.35 and 6,
 * and a select with no matching option renders empty — which reads as "unset" for a setting that is
 * very much set.
 */
function nearestZoom(value: number): number {
    return ZOOM_CHOICES.reduce((closest, zoom) =>
        Math.abs(zoom - value) < Math.abs(closest - value) ? zoom : closest)
}

/**
 * The row and section primitives every other settings page uses.
 *
 * Duplicated rather than imported because each settings page currently owns its own copy; matching
 * them exactly is what makes this page look like it belongs, and diverging from them by a few
 * pixels is what made the old one look like it did not.
 */
function SettingRow({
    label,
    description,
    anchor,
    children,
}: {
    label: string
    description?: string
    anchor?: string
    children: React.ReactNode
}) {
    return (
        <div
            data-settings-anchor={anchor}
            className="flex flex-col items-stretch gap-3 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-[18px]"
        >
            <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-medium text-[var(--text-primary)]", description && "mb-1")}>
                    {label}
                </div>
                {description ? (
                    <div className="text-xs text-[var(--text-tertiary)]">{description}</div>
                ) : null}
            </div>
            <div className="min-w-0 sm:ml-6 sm:shrink-0">{children}</div>
        </div>
    )
}

function SettingSection({
    title,
    anchor,
    children,
}: {
    title: string
    anchor?: string
    children: React.ReactNode
}) {
    return (
        <div data-settings-anchor={anchor} className="mb-4">
            <h3 className="mb-2.5 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                {children}
            </div>
        </div>
    )
}
