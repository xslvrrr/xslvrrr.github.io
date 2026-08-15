"use client"

import * as React from "react"
import {
  IconBug,
  IconCoin,
  IconCreditCard,
  IconLoader2,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconShieldLock,
  IconUsers,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ONE_TIME_NOTICES,
  clearOneTimeNoticeStorage,
  type OneTimeNoticeDefinition,
} from "@/lib/one-time-notices"
import { createEmptyTourPreferences } from "@/lib/tour/persistence"

import { FeedbackAdminSettings } from "./FeedbackAdminSettings"

type UserRole = "user" | "admin"
type ResetAction = "reset-ai-limit" | "reset-trial" | "reset-ai-all"

interface AdministratorUser {
  id: string
  millenniumUid: string
  email: string
  name: string
  school: string
  role: UserRole
  subscriptionTier: string
  subscriptionStatus: string
  createdAt: string | null
  lastSync: string | null
  aiRequests: number
  aiSpentUsd: number
  trialStatus: string | null
}

interface AdministratorResponse {
  users: AdministratorUser[]
  pagination: {
    page: number
    pageSize: number
    total: number
    pages: number
  }
  overview: {
    users: number
    administrators: number
    paidUsers: number
    monthlyAiSpendUsd: number
  }
}

type Confirmation =
  | { kind: "role"; user: AdministratorUser; role: UserRole }
  | { kind: "reset"; user: AdministratorUser; action: ResetAction }

const emptyData: AdministratorResponse = {
  users: [],
  pagination: { page: 1, pageSize: 25, total: 0, pages: 1 },
  overview: { users: 0, administrators: 0, paidUsers: 0, monthlyAiSpendUsd: 0 },
}

function displayDate(value: string | null) {
  if (!value) return "Never"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString()
}

function resetLabel(action: ResetAction) {
  if (action === "reset-ai-limit") return "Reset AI limits"
  if (action === "reset-trial") return "Reset trial"
  return "Reset all AI state"
}

export function AdminSettings({ currentUserId }: { currentUserId: string }) {
  const [data, setData] = React.useState<AdministratorResponse>(emptyData)
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null)
  const [replayingNotice, setReplayingNotice] = React.useState<string | null>(null)

  /**
   * Debug helper: clears the "seen once" markers for a notice so it fires again on this device.
   * Guided tours also live in server-side preferences, so those are reset there as well.
   */
  const replayOneTimeNotice = async (notice: OneTimeNoticeDefinition) => {
    setReplayingNotice(notice.id)
    try {
      if (!clearOneTimeNoticeStorage(notice)) {
        throw new Error("Local storage is unavailable in this browser session.")
      }
      if (notice.clearsTourPreferences) {
        const response = await fetch("/api/user/preferences", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tourPreferences: createEmptyTourPreferences() }),
        })
        if (!response.ok) throw new Error("Saved guided-tour progress could not be cleared.")
      }
      toast.success(`${notice.label} re-armed. Reload the dashboard to see it.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not re-arm this event.")
    } finally {
      setReplayingNotice(null)
    }
  }

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      })
      if (search) params.set("search", search)
      const response = await fetch(`/api/admin/users?${params}`, {
        cache: "no-store",
        signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Failed to load administrator tools.")
      setData(body)
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "Failed to load administrator tools.")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, search])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const applyConfirmation = async () => {
    if (!confirmation) return
    setPending(true)
    try {
      const roleChange = confirmation.kind === "role"
      const response = await fetch("/api/admin/users", {
        method: roleChange ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleChange
          ? { userId: confirmation.user.id, role: confirmation.role }
          : { userId: confirmation.user.id, action: confirmation.action }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Administrator action failed.")
      toast.success(roleChange
        ? `${confirmation.user.name || "User"} is now ${confirmation.role === "admin" ? "an administrator" : "a standard user"}.`
        : `${resetLabel(confirmation.action)} completed for ${confirmation.user.name || "user"}.`)
      setConfirmation(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Administrator action failed.")
    } finally {
      setPending(false)
    }
  }

  const metrics = [
    { label: "Users", value: data.overview.users.toLocaleString(), icon: IconUsers },
    { label: "Administrators", value: data.overview.administrators.toLocaleString(), icon: IconShieldLock },
    { label: "Paid users", value: data.overview.paidUsers.toLocaleString(), icon: IconCreditCard },
    { label: "Monthly AI spend", value: `$${data.overview.monthlyAiSpendUsd.toFixed(2)}`, icon: IconCoin },
  ]

  return (
    <div className="grid gap-5">
      <Card data-settings-anchor="admin-overview">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconShieldLock className="text-[var(--accent-color)]" size={18} />
                Administrator
              </CardTitle>
              <CardDescription>
                Server-enforced user roles, debug resets, and audited privileged actions.
              </CardDescription>
            </div>
            <Badge variant="secondary">Administrator access</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div className="rounded-lg border border-border bg-muted/25 p-3" key={metric.label}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <metric.icon size={15} />
                {metric.label}
              </div>
              <div className="mt-2 text-xl font-semibold">{loading ? "—" : metric.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-settings-anchor="admin-debug-events">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconBug className="text-[var(--accent-color)]" size={18} />
            Debug events
          </CardTitle>
          <CardDescription>
            Re-arm one-time popups and prompts for your own account, the same way the frontier trial
            can be reset. Changes apply to this browser and take effect after a dashboard reload.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {ONE_TIME_NOTICES.map((notice) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3"
              key={notice.id}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{notice.label}</div>
                <div className="text-xs text-muted-foreground">{notice.description}</div>
              </div>
              <Button
                disabled={replayingNotice !== null}
                onClick={() => void replayOneTimeNotice(notice)}
                size="xs"
                variant="outline"
              >
                {replayingNotice === notice.id ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
                Re-enable
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <FeedbackAdminSettings />

      <Card data-settings-anchor="admin-user-management">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>User management</CardTitle>
              <CardDescription>
                Search accounts, manage administrator access, and inspect AI state.
              </CardDescription>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input
                  aria-label="Search users"
                  className="pl-8"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Name, email, UID, or school"
                  value={searchInput}
                />
              </div>
              <Button
                aria-label="Refresh users"
                disabled={loading}
                onClick={() => void load()}
                size="icon"
                variant="outline"
              >
                <IconRefresh className={loading ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && data.users.length === 0 ? (
            <div className="grid gap-2">
              {[0, 1, 2, 3].map((item) => <Skeleton className="h-16 w-full" key={item} />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>AI this month</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => {
                  const currentUser = user.id === currentUserId
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="max-w-56">
                          <div className="truncate font-medium">{user.name || "Unnamed user"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {user.email || user.millenniumUid || user.id}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{user.school || "No school"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "outline"}>
                          {user.role === "admin" ? "Administrator" : "User"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="capitalize">{user.subscriptionTier}</div>
                        <div className="text-xs text-muted-foreground">{user.subscriptionStatus}</div>
                      </TableCell>
                      <TableCell>
                        <div>{user.aiRequests.toLocaleString()} requests</div>
                        <div className="text-xs text-muted-foreground">${user.aiSpentUsd.toFixed(4)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.trialStatus === "completed" ? "secondary" : "outline"}>
                          {user.trialStatus || "Available"}
                        </Badge>
                      </TableCell>
                      <TableCell>{displayDate(user.lastSync)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            disabled={currentUser}
                            onClick={() => setConfirmation({
                              kind: "role",
                              user,
                              role: user.role === "admin" ? "user" : "admin",
                            })}
                            size="xs"
                            variant="outline"
                          >
                            {user.role === "admin" ? "Remove admin" : "Make admin"}
                          </Button>
                          <Button
                            onClick={() => setConfirmation({ kind: "reset", user, action: "reset-ai-limit" })}
                            size="xs"
                            variant="outline"
                          >
                            <IconRobot />
                            AI limit
                          </Button>
                          <Button
                            onClick={() => setConfirmation({ kind: "reset", user, action: "reset-trial" })}
                            size="xs"
                            variant="outline"
                          >
                            Trial
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {data.users.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={7}>
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {data.pagination.total.toLocaleString()} user{data.pagination.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <span>Page {data.pagination.page} of {data.pagination.pages}</span>
              <Button
                disabled={loading || page >= data.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => {
        if (!open && !pending) setConfirmation(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.kind === "role"
                ? `${confirmation.role === "admin" ? "Grant" : "Remove"} administrator access?`
                : `${confirmation ? resetLabel(confirmation.action) : "Reset AI state"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === "role"
                ? `${confirmation.user.name || "This user"} will ${confirmation.role === "admin" ? "gain access to all administrator tools" : "lose administrator tools immediately"}.`
                : confirmation?.action === "reset-trial"
                  ? `${confirmation.user.name || "This user"} will be able to use the frontier trial again. Recorded monthly AI cost remains unchanged.`
                  : `${confirmation?.user.name || "This user"} will have current-month AI usage limits, assistant rate limits, and pending action approvals cleared.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault()
                void applyConfirmation()
              }}
              variant={confirmation?.kind === "role" && confirmation.role === "admin" ? "default" : "destructive"}
            >
              {pending ? <IconLoader2 className="animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
