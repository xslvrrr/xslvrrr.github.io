"use client"

import * as React from "react"
import {
    IconAlertTriangle,
    IconBrandOpenai,
    IconCheck,
    IconDeviceDesktop,
    IconKey,
    IconLoader2,
    IconPlugConnected,
    IconRefresh,
    IconRobot,
    IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
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
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
    detectAssistantClis,
    type AssistantCliStatus,
} from "../../lib/desktop/assistant-cli"
import { isDesktopApp } from "../../lib/desktop/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"

type ProviderId = "openai" | "anthropic" | "openrouter"
type AuthMode = "api-key" | "oauth-token"

interface ProviderConnection {
    id: string
    provider: ProviderId
    authMode: AuthMode
    label: string
    model: string
    keyHint: string
    createdAt: string
    updatedAt: string
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
    openai: "OpenAI Platform",
    anthropic: "Anthropic Console",
    openrouter: "OpenRouter",
}

function defaultLabel(provider: ProviderId) {
    return PROVIDER_LABELS[provider]
}

export function AssistantProvidersSettings() {
    const [connections, setConnections] = React.useState<ProviderConnection[]>([])
    const [provider, setProvider] = React.useState<ProviderId>("openai")
    const [authMode, setAuthMode] = React.useState<AuthMode>("api-key")
    const [label, setLabel] = React.useState(defaultLabel("openai"))
    const [model, setModel] = React.useState("")
    const [credential, setCredential] = React.useState("")
    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [deleting, setDeleting] = React.useState<ProviderConnection | null>(null)
    const [desktop] = React.useState(() => isDesktopApp())
    const [cliStatuses, setCliStatuses] = React.useState<AssistantCliStatus[]>([])
    const [loadingClis, setLoadingClis] = React.useState(false)

    const loadConnections = React.useCallback(async () => {
        const response = await fetch("/api/assistant/providers", { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.message || "Failed to load provider connections.")
        setConnections(Array.isArray(data.connections) ? data.connections : [])
    }, [])

    React.useEffect(() => {
        let active = true
        void loadConnections()
            .catch((error) => {
                if (active) toast.error(error instanceof Error ? error.message : "Failed to load provider connections.")
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => { active = false }
    }, [loadConnections])

    const loadClis = React.useCallback(async () => {
        if (!desktop) return
        setLoadingClis(true)
        try {
            setCliStatuses(await detectAssistantClis())
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to inspect provider CLIs.")
        } finally {
            setLoadingClis(false)
        }
    }, [desktop])

    React.useEffect(() => {
        void loadClis()
    }, [loadClis])

    const handleProviderChange = (value: ProviderId) => {
        setProvider(value)
        setAuthMode("api-key")
        setLabel(defaultLabel(value))
        const existing = connections.find((connection) => connection.provider === value)
        if (existing) {
            setLabel(existing.label)
            setModel(existing.model)
        } else {
            setModel("")
        }
        setCredential("")
    }

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!label.trim() || !model.trim() || !credential.trim()) {
            toast.error("Label, model id, and credential are required.")
            return
        }
        setSaving(true)
        try {
            const response = await fetch("/api/assistant/providers", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    authMode,
                    label: label.trim(),
                    model: model.trim(),
                    credential: credential.trim(),
                }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.message || "Provider connection failed.")
            setCredential("")
            await loadConnections()
            toast.success(`${PROVIDER_LABELS[provider]} connected.`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Provider connection failed.")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleting) return
        const target = deleting
        setSaving(true)
        try {
            const response = await fetch(`/api/assistant/providers?id=${encodeURIComponent(target.id)}`, {
                method: "DELETE",
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.message || "Failed to remove provider.")
            setConnections((current) => current.filter((connection) => connection.id !== target.id))
            setDeleting(null)
            toast.success(`${PROVIDER_LABELS[target.provider]} removed.`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove provider.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4" data-settings-anchor="assistant-providers" data-tour-id="settings-ai-providers">
            <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--hover-bg)]">
                    <IconKey size={20} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">AI Providers</h2>
                    <p className="text-[13px] text-[var(--text-tertiary)]">
                        Use your own provider account and model
                    </p>
                </div>
            </div>

            <Alert>
                <IconAlertTriangle />
                <AlertTitle>Consumer subscriptions and APIs are separate</AlertTitle>
                <AlertDescription>
                    ChatGPT Plus/Pro and Claude.ai Pro/Max do not provide supported third-party API access.
                    API credentials below use separate provider billing. Millennium Desktop can instead use
                    an authenticated Codex or Claude CLI locally.
                </AlertDescription>
            </Alert>

            <Card data-settings-anchor="assistant-provider-subscriptions">
                <CardHeader className="flex-row items-start justify-between gap-3">
                    <div className="space-y-1.5">
                        <CardTitle className="flex items-center gap-2">
                            <IconDeviceDesktop className="size-4" />
                            Provider subscriptions
                            <Badge variant="outline">Desktop only</Badge>
                        </CardTitle>
                        <CardDescription>
                            Uses provider CLI already installed and signed in on this device. Credentials never enter Millennium.
                        </CardDescription>
                    </div>
                    {desktop ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={loadingClis}
                            onClick={() => void loadClis()}
                        >
                            {loadingClis ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
                            Refresh
                        </Button>
                    ) : null}
                </CardHeader>
                <CardContent>
                    {!desktop ? (
                        <p className="text-sm text-muted-foreground">
                            Open Millennium Desktop to use ChatGPT or Claude account-based usage.
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            {(["openai", "anthropic"] as const).map((providerId) => {
                                const status = cliStatuses.find((item) => item.provider === providerId)
                                const ready = status?.installed && status.authenticated
                                const Icon = providerId === "openai" ? IconBrandOpenai : IconRobot
                                const name = providerId === "openai" ? "ChatGPT via Codex CLI" : "Claude via Claude CLI"
                                return (
                                    <div
                                        key={providerId}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Icon className="size-5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{name}</p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {loadingClis && !status
                                                        ? "Checking local CLI"
                                                        : !status?.installed
                                                            ? "CLI not installed"
                                                            : !status.authenticated
                                                                ? "Installed; sign in from terminal"
                                                                : status.version || "Ready"}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge variant={ready ? "default" : "secondary"}>
                                            {ready ? <IconCheck /> : null}
                                            {ready ? "Ready" : "Unavailable"}
                                        </Badge>
                                    </div>
                                )
                            })}
                            <p className="pt-1 text-xs text-muted-foreground">
                                Local CLI models are read-only inside Millennium and cannot perform dashboard actions.
                                Install and authenticate provider CLI from your terminal, then refresh.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card data-settings-anchor="assistant-connected-providers">
                <CardHeader>
                    <CardTitle>Connected providers</CardTitle>
                    <CardDescription>
                        Credentials stay encrypted at rest and are never returned to this browser.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {loading ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                            <IconLoader2 className="size-4 animate-spin" />
                            Loading providers
                        </div>
                    ) : connections.length === 0 ? (
                        <p className="py-3 text-sm text-muted-foreground">No provider accounts connected.</p>
                    ) : connections.map((connection) => (
                        <div
                            key={connection.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-medium">{connection.label}</span>
                                    <Badge variant="outline">{PROVIDER_LABELS[connection.provider]}</Badge>
                                    {connection.authMode === "oauth-token" ? <Badge>OAuth</Badge> : null}
                                </div>
                                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {connection.model} · {connection.keyHint}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove ${connection.label}`}
                                onClick={() => setDeleting(connection)}
                            >
                                <IconTrash />
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card data-settings-anchor="assistant-connect-provider">
                <CardHeader>
                    <CardTitle>Connect or rotate provider</CardTitle>
                    <CardDescription>
                        Credential is verified against provider model list before encrypted storage.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-4" onSubmit={handleSave}>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="assistant-provider">Provider</Label>
                                <Select value={provider} onValueChange={(value) => handleProviderChange(value as ProviderId)}>
                                    <SelectTrigger id="assistant-provider">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="openai">OpenAI Platform</SelectItem>
                                        <SelectItem value="anthropic">Anthropic Console</SelectItem>
                                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="assistant-provider-auth">Authentication</Label>
                                <Select
                                    value={authMode}
                                    onValueChange={(value) => setAuthMode(value as AuthMode)}
                                >
                                    <SelectTrigger id="assistant-provider-auth">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="api-key">API key</SelectItem>
                                        {provider === "anthropic" ? (
                                            <SelectItem value="oauth-token">Console OAuth token</SelectItem>
                                        ) : null}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="assistant-provider-label">Display name</Label>
                                <Input
                                    id="assistant-provider-label"
                                    maxLength={60}
                                    value={label}
                                    onChange={(event) => setLabel(event.target.value)}
                                    autoComplete="off"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="assistant-provider-model">Model id</Label>
                                <Input
                                    id="assistant-provider-model"
                                    maxLength={160}
                                    value={model}
                                    onChange={(event) => setModel(event.target.value)}
                                    placeholder="Provider model id"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="assistant-provider-credential">
                                {authMode === "oauth-token" ? "OAuth access token" : "API key"}
                            </Label>
                            <Input
                                id="assistant-provider-credential"
                                type="password"
                                value={credential}
                                onChange={(event) => setCredential(event.target.value)}
                                placeholder={connections.some((connection) => connection.provider === provider)
                                    ? "Enter a new credential to rotate"
                                    : "Credential is encrypted after verification"}
                                autoComplete="new-password"
                            />
                            {provider === "anthropic" && authMode === "oauth-token" ? (
                                <p className="text-xs text-muted-foreground">
                                    Console workspace OAuth only. Expired tokens must be reconnected.
                                </p>
                            ) : null}
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={saving}>
                                {saving ? <IconLoader2 className="animate-spin" /> : <IconPlugConnected />}
                                Verify and connect
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove provider connection?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleting?.label} disappears from model picker. Stored credential is permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void handleDelete()}>
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
