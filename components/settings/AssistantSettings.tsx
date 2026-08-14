"use client"

import * as React from "react"
import { IconMessageChatbot } from "@tabler/icons-react"
import type { HomeSettings } from "../../types/home"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"
import { Switch } from "../ui/switch"

const ASSISTANT_TONE_OPTIONS: Array<{ value: HomeSettings["assistantTone"]; label: string; subtitle: string }> = [
    { value: "friendly", label: "Friendly", subtitle: "Warm, helpful, and a little more conversational" },
    { value: "pragmatic", label: "Pragmatic", subtitle: "Direct, efficient, and action-first" },
    { value: "simple", label: "Simple", subtitle: "Short sentences with plain language" },
    { value: "formal", label: "Formal", subtitle: "Polished wording with a more professional style" },
]

export interface AssistantSettingsProps {
    showAiAgent: boolean
    onShowAiAgentChange: (showAiAgent: boolean) => void
    assistantSummarizeThinking: boolean
    onAssistantSummarizeThinkingChange: (assistantSummarizeThinking: boolean) => void
    assistantTone: HomeSettings["assistantTone"]
    onAssistantToneChange: (assistantTone: HomeSettings["assistantTone"]) => void
}

interface SettingRowProps {
    label: string
    description?: string
    /** Settings search target; see lib/settings-focus.ts. */
    anchor?: string
    children: React.ReactNode
}

function SettingRow({ label, description, anchor, children }: SettingRowProps) {
    return (
        <div data-settings-anchor={anchor} className="flex items-center justify-between border-b border-[var(--border-subtle)] px-[18px] py-4 last:border-b-0">
            <div className="flex-1">
                <div className={`text-sm font-medium text-[var(--text-primary)] ${description ? "mb-1" : ""}`}>
                    {label}
                </div>
                {description && (
                    <div className="text-xs text-[var(--text-tertiary)]">
                        {description}
                    </div>
                )}
            </div>
            <div className="ml-6 shrink-0">
                {children}
            </div>
        </div>
    )
}

interface SettingSectionProps {
    title: string
    anchor?: string
    children: React.ReactNode
}

function SettingSection({ title, anchor, children }: SettingSectionProps) {
    return (
        <div data-settings-anchor={anchor} className="mb-4">
            <h3 className="mb-2.5 text-[15px] font-semibold text-[var(--text-primary)]">
                {title}
            </h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                {children}
            </div>
        </div>
    )
}

export function AssistantSettings({
    showAiAgent,
    onShowAiAgentChange,
    assistantSummarizeThinking,
    onAssistantSummarizeThinkingChange,
    assistantTone,
    onAssistantToneChange,
}: AssistantSettingsProps) {
    return (
        <div data-tour-id="settings-ai-agent">
            <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--hover-bg)]">
                    <IconMessageChatbot size={20} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                    <h2 className="mb-0.5 text-base font-semibold text-[var(--text-primary)]">
                        AI Agent
                    </h2>
                    <p className="text-[13px] text-[var(--text-tertiary)]">
                        Control how the AI Agent appears and communicates
                    </p>
                </div>
            </div>

            <SettingSection title="AI Agent" anchor="assistant-ai-agent">
                <SettingRow
                    label="Show AI Agent button"
                    anchor="assistant-show-button"
                    description="Display the AI Agent button in the app"
                >
                    <Switch
                        checked={showAiAgent}
                        onCheckedChange={onShowAiAgentChange}
                        aria-label="Show AI Agent button"
                    />
                </SettingRow>

                <SettingRow
                    label="Summarised thinking"
                    anchor="assistant-summarised-thinking"
                    description="Show a short summary of the agent's reasoning instead of expanded details"
                >
                    <Switch
                        checked={assistantSummarizeThinking}
                        onCheckedChange={onAssistantSummarizeThinkingChange}
                        aria-label="Use summarised thinking"
                    />
                </SettingRow>

                <SettingRow
                    label="Talking style"
                    anchor="assistant-talking-style"
                    description="Choose how much detail the AI Agent includes in its responses"
                >
                    <Select
                        value={assistantTone}
                        onValueChange={(value) => onAssistantToneChange(value as HomeSettings["assistantTone"])}
                    >
                        <SelectTrigger className="w-[280px] max-w-[min(280px,calc(100vw-48px))]" aria-label="Talking style">
                            <SelectValue>
                                {ASSISTANT_TONE_OPTIONS.find((option) => option.value === assistantTone)?.label}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="w-[280px] max-w-[min(280px,calc(100vw-48px))]">
                            {ASSISTANT_TONE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    <span className="grid gap-0.5">
                                        <span>{option.label}</span>
                                        <span className="text-[11px] text-[var(--text-tertiary)]">{option.subtitle}</span>
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SettingRow>
            </SettingSection>
        </div>
    )
}
