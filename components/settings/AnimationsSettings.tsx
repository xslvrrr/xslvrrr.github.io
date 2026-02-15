"use client"

import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"
import { Switch } from "../ui/switch"
import { Button } from "../ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog"
import {
    IconSparkles,
    IconRefresh,
    IconEye,
    IconClick,
    IconArrowsMove,
    IconLoader,
    IconList,
    IconLayoutSidebar,
    IconWindowMaximize,
    IconAlertCircle,
} from "@tabler/icons-react"
import { AnimationSettings, defaultAnimationSettings } from "../../hooks/useAnimationSettings"

// ============================================
// TYPES
// ============================================

interface AnimationsSettingsProps {
    settings: AnimationSettings
    onUpdateSetting: <K extends keyof AnimationSettings>(key: K, value: AnimationSettings[K]) => void
    onResetSettings: () => void
    onToggleAll: (enabled: boolean) => void
}

// ============================================
// COMPONENTS
// ============================================

interface SettingRowProps {
    label: string
    description?: string
    icon?: React.ReactNode
    children: React.ReactNode
    disabled?: boolean
}

function SettingRow({ label, description, icon, children, disabled }: SettingRowProps) {
    return (
        <div className={`flex items-center justify-between px-4 py-4 border-b border-[var(--border-subtle)] transition-opacity duration-[var(--anim-duration-fast,150ms)] last:border-b-0 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-1 items-start gap-3">
                {icon && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover-bg)] mt-0.5">
                        {icon}
                    </div>
                )}
                <div>
                    <div className={`text-sm font-medium text-[var(--text-primary)] ${description ? 'mb-1' : ''}`}>
                        {label}
                    </div>
                    {description && (
                        <div className="text-xs text-[var(--text-tertiary)] leading-snug">
                            {description}
                        </div>
                    )}
                </div>
            </div>
            <div className="shrink-0 ml-6">
                {children}
            </div>
        </div>
    )
}

interface SettingSectionProps {
    title: string
    children: React.ReactNode
}

function SettingSection({ title, children }: SettingSectionProps) {
    return (
        <div className="mb-7">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2.5">
                {title}
            </h3>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
                {children}
            </div>
        </div>
    )
}

// ============================================
// MAIN COMPONENT
// ============================================

export function AnimationsSettings({
    settings,
    onUpdateSetting,
    onResetSettings,
    onToggleAll,
}: AnimationsSettingsProps) {
    const [showResetDialog, setShowResetDialog] = React.useState(false)
    const [previewKey, setPreviewKey] = React.useState(0)
    const [previewToggle, setPreviewToggle] = React.useState(false)

    const handleReset = () => {
        onResetSettings()
        setShowResetDialog(false)
    }

    const handleResetClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.shiftKey) {
            onResetSettings()
            setShowResetDialog(false)
            return
        }
        setShowResetDialog(true)
    }

    const triggerPreview = () => {
        setPreviewKey(prev => prev + 1)
    }

    const isGloballyDisabled = !settings.enableAnimations || settings.reduceMotion

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--hover-bg)]">
                        <IconSparkles size={20} className="text-[var(--text-secondary)]" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-0.5">
                            Animations
                        </h2>
                        <p className="text-[13px] text-[var(--text-tertiary)]">
                            Control motion and transitions throughout the app
                        </p>
                    </div>
                </div>
                <Button
                    variant="destructive"
                    onClick={handleResetClick}
                    className="gap-1.5"
                >
                    <IconRefresh size={14} />
                    Reset All
                </Button>
            </div>

            {/* Reduced Motion Warning */}
            {settings.reduceMotion && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 mb-6 text-[13px] text-[var(--text-secondary)]">
                    <IconAlertCircle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                    <div>
                        <strong>Reduced motion is enabled.</strong> Your system prefers reduced motion.
                        All animations are disabled for accessibility. You can override this below.
                    </div>
                </div>
            )}

            {/* Master Toggle Section */}
            <SettingSection title="Global">
                <SettingRow
                    label="Enable Animations"
                    description="Master toggle for all animations and transitions"
                    icon={<IconSparkles size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        checked={settings.enableAnimations}
                        onCheckedChange={(checked) => onToggleAll(checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Respect System Preference"
                    description="Automatically disable animations when system prefers reduced motion"
                    icon={<IconEye size={16} className="text-[var(--text-tertiary)]" />}
                >
                    <Switch
                        checked={settings.reduceMotion}
                        onCheckedChange={(checked) => onUpdateSetting('reduceMotion', checked)}
                    />
                </SettingRow>

                <SettingRow
                    label="Animation Speed"
                    description="Control how fast animations play"
                    disabled={isGloballyDisabled}
                >
                    <Select
                        value={settings.animationSpeed}
                        onValueChange={(v) => onUpdateSetting('animationSpeed', v as 'slow' | 'normal' | 'fast')}
                        disabled={isGloballyDisabled}
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="slow">Slow</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="fast">Fast</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
            </SettingSection>

            {/* Category Toggles */}
            <SettingSection title="Animation Categories">
                <SettingRow
                    label="Page Transitions"
                    description="Fade and slide effects when navigating between pages"
                    icon={<IconArrowsMove size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.pageTransitions}
                        onCheckedChange={(checked) => onUpdateSetting('pageTransitions', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>

                <SettingRow
                    label="Micro-interactions"
                    description="Button presses, toggle animations, checkboxes, and other small feedback"
                    icon={<IconClick size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.microInteractions}
                        onCheckedChange={(checked) => onUpdateSetting('microInteractions', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>

                <SettingRow
                    label="Hover Effects"
                    description="Card lifts, color changes, and transforms on hover"
                    icon={<IconEye size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.hoverEffects}
                        onCheckedChange={(checked) => onUpdateSetting('hoverEffects', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>

                <SettingRow
                    label="Loading Animations"
                    description="Spinners, skeleton loading, and progress indicators"
                    icon={<IconLoader size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.loadingAnimations}
                        onCheckedChange={(checked) => onUpdateSetting('loadingAnimations', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>

                <SettingRow
                    label="List Animations"
                    description="Staggered appearance of list items and cards"
                    icon={<IconList size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.listStagger}
                        onCheckedChange={(checked) => onUpdateSetting('listStagger', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>

                <SettingRow
                    label="Sidebar Animations"
                    description="Sidebar collapse/expand and menu transitions"
                    icon={<IconLayoutSidebar size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.sidebarAnimations}
                        onCheckedChange={(checked) => onUpdateSetting('sidebarAnimations', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>

                <SettingRow
                    label="Modal & Popup Animations"
                    description="Dialog, dropdown, and tooltip appear/disappear effects"
                    icon={<IconWindowMaximize size={16} className="text-[var(--text-tertiary)]" />}
                    disabled={isGloballyDisabled}
                >
                    <Switch
                        checked={settings.modalAnimations}
                        onCheckedChange={(checked) => onUpdateSetting('modalAnimations', checked)}
                        disabled={isGloballyDisabled}
                    />
                </SettingRow>
            </SettingSection>

            {/* Preview Section */}
            <SettingSection title="Preview">
                <div className="flex flex-col gap-4 rounded-lg bg-[var(--hover-bg)] p-5">
                    <p className="text-[13px] text-[var(--text-tertiary)]">
                        Test your animation settings with interactive previews:
                    </p>

                    {/* Button Preview */}
                    <div className="flex flex-wrap gap-3">
                        <Button
                            key={`btn-${previewKey}`}
                            onClick={triggerPreview}
                            className="transition-transform duration-[var(--anim-duration-normal,200ms)] active:scale-[0.97]"
                        >
                            Click Me
                        </Button>

                        {/* Card Preview */}
                        <div className="cursor-pointer rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-6 py-4 transition-all duration-[var(--anim-duration-normal,200ms)] hover:-translate-y-0.5 hover:border-[var(--hover-border-color)] hover:bg-[var(--hover-card-bg)]">
                            <span className="text-sm text-[var(--text-primary)]">
                                Hover Card
                            </span>
                        </div>

                        {/* Toggle Preview */}
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={previewToggle}
                                onCheckedChange={setPreviewToggle}
                            />
                            <span className="text-[13px] text-[var(--text-secondary)]">
                                Toggle {previewToggle ? 'On' : 'Off'}
                            </span>
                        </div>
                    </div>

                    {/* Loading Preview */}
                    {settings.loadingAnimations && settings.enableAnimations && (
                        <div className="flex items-center gap-3">
                            <div className="size-5 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent-color)]" />
                            <span className="text-[13px] text-[var(--text-tertiary)]">
                                Loading spinner
                            </span>
                        </div>
                    )}
                </div>
            </SettingSection>

            {/* Reset Dialog */}
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <AlertDialogContent className="max-w-[450px] border-[var(--border-default)] bg-[var(--bg-elevated)] p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                    <AlertDialogHeader className="mb-4">
                        <AlertDialogTitle className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                            Reset Animation Settings?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            This will reset all animation settings to their default values. Your customizations will be lost.
                            Hold Shift while clicking destructive actions to skip confirmation.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex justify-end gap-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={handleReset}>
                            Reset All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
