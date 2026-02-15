"use client"

import * as React from "react"
import { useState, useCallback, useEffect, useRef } from "react"
import {
    DEFAULT_SHORTCUTS,
    ShortcutDefinition,
    ShortcutBinding,
    formatShortcutDisplay,
} from "../../hooks/useShortcuts"
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
    IconKeyboard,
    IconRefresh,
    IconCheck,
    IconX,
    IconAlertCircle,
    IconFolder,
} from "@tabler/icons-react"
import * as TablerIcons from "@tabler/icons-react"
import { Switch } from "../ui/switch"

// ============================================
// TYPES
// ============================================

interface ShortcutsSettingsProps {
    bindings: Map<string, ShortcutBinding>
    onSetBinding: (id: string, keys: string[]) => void
    onResetBinding: (id: string) => void
    onResetAll: () => void
    contextAwareCategories: Record<string, boolean>
    onToggleContextAware: (category: string, value: boolean) => void
    isRecording: boolean
    onRecordingChange: (recording: boolean) => void
    notificationFolders?: { id: string; title: string; subtitle?: string; icon: string }[]
}

interface RecordingState {
    shortcutId: string | null
    keys: string[]
    isSequence: boolean
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    actions: 'Actions',
    calendar: 'Calendar & Timetable',
    notifications: 'Notifications',
    settings: 'Settings',
}

const categoryOrder = ['navigation', 'actions', 'calendar', 'notifications', 'settings']

function normalizeRecordedKey(key: string, e: KeyboardEvent): string {
    // Handle special keys
    if (e.metaKey && key !== 'Meta') return key.toLowerCase()
    if (key === 'Meta' || key === 'Control') return '⌘'
    if (key === 'Shift') return 'shift'
    if (key === 'Alt') return '⌥'
    return key.toLowerCase()
}

// ============================================
// COMPONENTS
// ============================================

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '24px' }}>
            <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '10px',
            }}>
                {title}
            </h3>
            <div style={{
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                background: 'var(--bg-surface)',
                overflow: 'hidden',
            }}>
                {children}
            </div>
        </div>
    )
}

function ShortcutRow({
    shortcut,
    binding,
    isRecording,
    recordingKeys,
    onStartRecording,
    onStopRecording,
    onReset,
}: {
    shortcut: ShortcutDefinition
    binding: ShortcutBinding | undefined
    isRecording: boolean
    recordingKeys: string[]
    onStartRecording: () => void
    onStopRecording: (save: boolean) => void
    onReset: () => void
}) {
    const currentKeys = binding?.keys || shortcut.defaultKeys
    const isCustom = binding && JSON.stringify(binding.keys) !== JSON.stringify(shortcut.defaultKeys)

    return (
        <div className="last:border-b-0" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
        }}>
            <div style={{ flex: 1 }}>
                <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    marginBottom: '2px',
                }}>
                    {shortcut.label}
                </div>
                <div style={{
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                }}>
                    {shortcut.description}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
                {isRecording ? (
                    <>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            background: 'var(--accent-gradient)',
                            borderRadius: '6px',
                            minWidth: '120px',
                            justifyContent: 'center',
                        }}>
                            {recordingKeys.length > 0 ? (
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'white' }}>
                                    {recordingKeys.map(k => k.toUpperCase()).join(' + ')}
                                </span>
                            ) : (
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                                    Press keys...
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => onStopRecording(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                background: 'var(--success-color, #22c55e)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'white',
                            }}
                            title="Save"
                        >
                            <IconCheck size={16} />
                        </button>
                        <button
                            onClick={() => onStopRecording(false)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                background: 'var(--hover-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                            }}
                            title="Cancel"
                        >
                            <IconX size={16} />
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={onStartRecording}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                background: isCustom ? 'var(--accent-subtle, rgba(59, 130, 246, 0.1))' : 'var(--hover-bg)',
                                border: `1px solid ${isCustom ? 'var(--accent-color)' : 'var(--border-color)'}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                minWidth: '120px',
                                justifyContent: 'center',
                            }}
                        >
                            <span style={{
                                fontSize: '13px',
                                fontWeight: 500,
                                color: isCustom ? 'var(--accent-color)' : 'var(--text-primary)',
                            }}>
                                {formatShortcutDisplay(currentKeys, shortcut.isSequence)}
                            </span>
                        </button>
                        {isCustom && (
                            <button
                                onClick={onReset}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: 'var(--text-tertiary)',
                                }}
                                title="Reset to default"
                            >
                                <IconRefresh size={14} />
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ShortcutsSettings({
    bindings,
    onSetBinding,
    onResetBinding,
    onResetAll,
    contextAwareCategories,
    onToggleContextAware,
    isRecording,
    onRecordingChange,
    notificationFolders,
}: ShortcutsSettingsProps) {
    const [recording, setRecording] = useState<RecordingState>({
        shortcutId: null,
        keys: [],
        isSequence: false,
    })
    const [showResetDialog, setShowResetDialog] = useState(false)
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [storedFolders, setStoredFolders] = useState<{ id: string; title: string; subtitle?: string; icon: string }[]>([])
    const folders = notificationFolders ?? storedFolders

    useEffect(() => {
        if (notificationFolders) return
        if (typeof window === 'undefined') return
        try {
            const saved = localStorage.getItem('millennium-notification-folders')
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    setStoredFolders(parsed)
                }
            }
        } catch (e) {
            console.error('Failed to load notification folders:', e)
        }
    }, [notificationFolders])

    // Notify parent when recording state changes
    useEffect(() => {
        onRecordingChange(recording.shortcutId !== null);
    }, [recording.shortcutId, onRecordingChange]);

    // Group shortcuts by category
    const groupedShortcuts = React.useMemo(() => {
        const groups: Record<string, ShortcutDefinition[]> = {}
        DEFAULT_SHORTCUTS.forEach(shortcut => {
            if (!groups[shortcut.category]) {
                groups[shortcut.category] = []
            }
            groups[shortcut.category].push(shortcut)
        })
        return groups
    }, [])

    // Handle key recording
    useEffect(() => {
        if (!recording.shortcutId) return

        const shortcut = DEFAULT_SHORTCUTS.find(s => s.id === recording.shortcutId)
        if (!shortcut) return

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()

            const key = normalizeRecordedKey(e.key, e)
            
            // Skip pure modifier key presses for non-modifier shortcuts
            if (!shortcut.isModifier && (key === '⌘' || key === 'shift' || key === '⌥')) {
                return
            }

            if (shortcut.isModifier) {
                // For modifier shortcuts, collect all pressed keys
                const keys: string[] = []
                if (e.metaKey || e.ctrlKey) keys.push('⌘')
                if (e.shiftKey) keys.push('shift')
                if (e.altKey) keys.push('⌥')
                if (key !== '⌘' && key !== 'shift' && key !== '⌥') {
                    keys.push(key)
                }
                setRecording(prev => ({ ...prev, keys }))
            } else if (shortcut.isSequence) {
                // For sequence shortcuts, add to buffer
                setRecording(prev => {
                    const newKeys = [...prev.keys, key].slice(-2) // Keep last 2 keys
                    return { ...prev, keys: newKeys }
                })
                
                // Clear timeout and set new one
                if (recordingTimeoutRef.current) {
                    clearTimeout(recordingTimeoutRef.current)
                }
                recordingTimeoutRef.current = setTimeout(() => {
                    setRecording(prev => ({ ...prev, keys: [] }))
                }, 1500)
            } else {
                // Single key shortcut
                setRecording(prev => ({ ...prev, keys: [key] }))
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            if (recordingTimeoutRef.current) {
                clearTimeout(recordingTimeoutRef.current)
            }
        }
    }, [recording.shortcutId])

    const startRecording = useCallback((shortcutId: string) => {
        const shortcut = DEFAULT_SHORTCUTS.find(s => s.id === shortcutId)
        if (!shortcut) return

        setRecording({
            shortcutId,
            keys: [],
            isSequence: shortcut.isSequence || false,
        })
    }, [])

    const stopRecording = useCallback((save: boolean) => {
        if (save && recording.shortcutId && recording.keys.length > 0) {
            onSetBinding(recording.shortcutId, recording.keys)
        }
        setRecording({ shortcutId: null, keys: [], isSequence: false })
    }, [recording, onSetBinding])

    const handleResetAll = useCallback(() => {
        onResetAll()
        setShowResetDialog(false)
    }, [onResetAll])

    const handleResetAllClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.shiftKey) {
            onResetAll()
            setShowResetDialog(false)
            return
        }
        setShowResetDialog(true)
    }, [onResetAll])

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '10px',
                        background: 'var(--hover-bg)',
                    }}>
                        <IconKeyboard size={20} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                    <div>
                        <h2 style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                        }}>
                            Keyboard Shortcuts
                        </h2>
                        <p style={{
                            fontSize: '13px',
                            color: 'var(--text-tertiary)',
                        }}>
                            Customize keyboard shortcuts for quick actions
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleResetAllClick}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'white',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                >
                    <IconRefresh size={14} />
                    Reset All
                </button>
            </div>

            {/* Context-aware toggles per category */}
            <div style={{
                padding: '16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                marginBottom: '16px',
            }}>
                <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '12px',
                }}>
                    Context-Aware Shortcuts
                </div>
                <div style={{
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    marginBottom: '12px',
                    lineHeight: 1.4,
                }}>
                    Enable page-specific shortcuts for each category. When enabled, shortcuts only work on their relevant pages.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {['navigation', 'calendar', 'notifications', 'settings'].map(category => (
                        <div key={category} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingBottom: '12px',
                            borderBottom: '1px solid var(--border-subtle)',
                        }}>
                            <div style={{
                                fontSize: '13px',
                                color: 'var(--text-secondary)',
                                textTransform: 'capitalize',
                            }}>
                                {category === 'calendar' ? 'Calendar & Timetable' : category.charAt(0).toUpperCase() + category.slice(1)}
                            </div>
                            <Switch
                                checked={contextAwareCategories[category] ?? false}
                                onCheckedChange={(value) => onToggleContextAware(category, value)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Instructions */}
            <div style={{
                padding: '12px 16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
            }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--text-tertiary)' }} />
                    <div>
                        Click on a shortcut to change it. Press your desired key combination, then click the checkmark to save.
                        Sequence shortcuts use two keys pressed in order (e.g., G then H).
                    </div>
                </div>
            </div>

            {/* Notification Folders */}
            <SettingSection title="Notification Folders">
                {folders.length === 0 ? (
                    <div style={{
                        padding: '16px',
                        border: '1px dashed var(--border-subtle)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: 'var(--text-tertiary)',
                        background: 'var(--hover-bg)',
                    }}>
                        No folders created yet. Create a folder in Notifications to see it here and in the command menu.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {folders.map(folder => {
                            const FolderIcon = (TablerIcons as Record<string, React.ComponentType<{ size?: number }>>)[folder.icon] || IconFolder
                            return (
                                <div key={folder.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-surface)',
                                }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: 'var(--hover-bg)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-secondary)',
                                    }}>
                                        <FolderIcon size={16} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {folder.title}
                                        </div>
                                        {folder.subtitle ? (
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {folder.subtitle}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                Available in command menu search
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </SettingSection>

            {/* Shortcut Categories */}
            {categoryOrder.map(category => {
                const shortcuts = groupedShortcuts[category]
                if (!shortcuts || shortcuts.length === 0) return null

                return (
                    <SettingSection key={category} title={categoryLabels[category]}>
                        {shortcuts.map(shortcut => (
                            <ShortcutRow
                                key={shortcut.id}
                                shortcut={shortcut}
                                binding={bindings.get(shortcut.id)}
                                isRecording={recording.shortcutId === shortcut.id}
                                recordingKeys={recording.shortcutId === shortcut.id ? recording.keys : []}
                                onStartRecording={() => startRecording(shortcut.id)}
                                onStopRecording={stopRecording}
                                onReset={() => onResetBinding(shortcut.id)}
                            />
                        ))}
                    </SettingSection>
                )
            })}

            {/* Reset All Dialog */}
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <AlertDialogContent style={{
                    maxWidth: '450px',
                    padding: '24px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    outline: 'none',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}>
                    <AlertDialogHeader style={{ marginBottom: '16px' }}>
                        <AlertDialogTitle style={{
                            fontSize: '18px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '8px',
                        }}>
                            Reset All Shortcuts?
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                        }}>
                            This will reset all keyboard shortcuts to their default values. Any customizations you've made will be lost. This action cannot be undone.
                            Hold Shift while clicking destructive actions to skip confirmation.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter style={{
                        display: 'flex',
                        gap: '8px',
                        justifyContent: 'flex-end',
                    }}>
                        <AlertDialogCancel style={{
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            outline: 'none',
                        }}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            variant="destructive" 
                            onClick={handleResetAll}
                            style={{
                                padding: '10px 16px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: 'white',
                                backgroundColor: '#ef4444',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                        >
                            Reset All Shortcuts
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
