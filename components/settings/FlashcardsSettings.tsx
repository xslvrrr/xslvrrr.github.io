"use client"

import * as React from "react"
import { IconBell, IconCards, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"
import { Switch } from "../ui/switch"
import { fetchStudyBootstrap, saveStudyPreferences } from "../../lib/study/client"
import type { StudyExperienceMode } from "../../lib/study/domain"
import type { HomeSettings } from "../../types/home"

/**
 * Flashcard preferences.
 *
 * These used to be scattered across the pages they affected — the review reminder sat under
 * Notifications, and the rating controls were a toggle group on the Flashcards page itself, where
 * they took up space above the thing the student actually came to do. They are settings, so they
 * live in settings, and this section is where the rest of them will go.
 */

const EXPERIENCE_MODES: Array<{ value: StudyExperienceMode; label: string; subtitle: string }> = [
    { value: "beginner", label: "Simple", subtitle: "Forgot or Remembered" },
    { value: "intermediate", label: "Standard", subtitle: "Four ratings, each showing when the card returns" },
    { value: "expert", label: "Advanced", subtitle: "Ratings plus the scheduler's own working" },
]

export interface FlashcardsSettingsProps {
    homeSettings: HomeSettings
    updateHomeSettings: (updates: Partial<HomeSettings>) => void
}

interface SettingRowProps {
    label: string
    description?: string
    icon?: React.ReactNode
    /** Settings search target; see lib/settings-focus.ts. */
    anchor?: string
    children: React.ReactNode
}

function SettingRow({ label, description, icon, anchor, children }: SettingRowProps) {
    return (
        <div data-settings-anchor={anchor} className="flex flex-col items-stretch gap-3 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-[18px]">
            <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] ${description ? "mb-1" : ""}`}>
                    {icon}
                    {label}
                </div>
                {description && (
                    <div className="text-xs text-[var(--text-tertiary)]">{description}</div>
                )}
            </div>
            <div className="min-w-0 sm:ml-6 sm:shrink-0">{children}</div>
        </div>
    )
}

function SettingSection({ title, anchor, children }: { title: string; anchor?: string; children: React.ReactNode }) {
    return (
        <div data-settings-anchor={anchor} className="mb-4">
            <h3 className="mb-2.5 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                {children}
            </div>
        </div>
    )
}

export function FlashcardsSettings({ homeSettings, updateHomeSettings }: FlashcardsSettingsProps) {
    const [experienceMode, setExperienceMode] = React.useState<StudyExperienceMode | null>(null)
    const [revision, setRevision] = React.useState<number | null>(null)
    const [isSaving, setIsSaving] = React.useState(false)

    // Rating controls are Study preferences held on the server, not a home setting, so this section
    // reads them itself rather than expecting the dashboard to have loaded Flashcards first.
    React.useEffect(() => {
        let active = true
        void fetchStudyBootstrap()
            .then((bootstrap) => {
                if (!active) return
                setExperienceMode(bootstrap.preferences.experienceMode)
                setRevision(bootstrap.preferences.revision)
            })
            .catch(() => {
                if (active) toast.error("Flashcard preferences could not be loaded.")
            })
        return () => { active = false }
    }, [])

    const changeExperienceMode = async (next: StudyExperienceMode) => {
        if (next === experienceMode) return
        const previous = experienceMode
        setExperienceMode(next)
        setIsSaving(true)
        try {
            const saved = await saveStudyPreferences({
                experienceMode: next,
                ...(revision === null ? {} : { expectedRevision: revision }),
            })
            setExperienceMode(saved.experienceMode)
            setRevision(saved.revision)
        } catch (error) {
            // The select has already moved, so it has to move back or it will lie about what is saved.
            setExperienceMode(previous)
            toast.error(error instanceof Error ? error.message : "Failed to save rating controls.")
        } finally {
            setIsSaving(false)
        }
    }

    const selectedMode = EXPERIENCE_MODES.find((mode) => mode.value === experienceMode)

    return (
        <div data-tour-id="settings-flashcards">
            <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--hover-bg)]">
                    <IconCards size={20} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                    <h2 className="mb-0.5 text-base font-semibold text-[var(--text-primary)]">Flashcards</h2>
                    <p className="text-[13px] text-[var(--text-tertiary)]">
                        Control how reviews are rated and when you are reminded
                    </p>
                </div>
            </div>

            <SettingSection title="Reviews" anchor="flashcards-reviews">
                <SettingRow
                    label="Rating controls"
                    anchor="flashcards-rating-controls"
                    description="How many options you get when rating a card, and how much of the scheduler's reasoning is shown."
                    icon={<IconCards size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Select
                        value={experienceMode ?? ""}
                        onValueChange={(value) => void changeExperienceMode(value as StudyExperienceMode)}
                        disabled={experienceMode === null || isSaving}
                    >
                        <SelectTrigger
                            aria-label="Rating controls"
                            className="w-[280px] max-w-[min(280px,calc(100vw-48px))]"
                        >
                            <SelectValue>
                                <span className="flex items-center gap-2">
                                    {isSaving ? <IconLoader2 size={14} className="animate-spin" /> : null}
                                    {selectedMode?.label ?? "Loading"}
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="w-[280px] max-w-[min(280px,calc(100vw-48px))]">
                            {EXPERIENCE_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                    <span className="grid gap-0.5">
                                        <span>{mode.label}</span>
                                        <span className="text-[11px] text-[var(--text-tertiary)]">{mode.subtitle}</span>
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SettingRow>
            </SettingSection>

            <SettingSection title="Reminders" anchor="flashcards-reminders">
                <SettingRow
                    label="Spaced repetition reminders"
                    anchor="flashcards-review-reminders"
                    description="Show an in-app reminder when flashcards are due for review."
                    icon={<IconBell size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        aria-label="Show spaced repetition reminders"
                        checked={homeSettings.studyReviewNotifications}
                        onCheckedChange={(studyReviewNotifications) => updateHomeSettings({ studyReviewNotifications })}
                    />
                </SettingRow>
            </SettingSection>
        </div>
    )
}
