"use client"

import * as React from "react"
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react"
import { clearPortalDataCache } from "@/lib/desktop/storage"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const CONFIRMATION = "DELETE MY ACCOUNT"

export function AccountDeletionSettings() {
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const deleteAccount = React.useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/user/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-Millennium-Confirm": CONFIRMATION },
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.message || "Account deletion failed")
      }

      await clearPortalDataCache().catch(() => {})
      try {
        window.localStorage.clear()
        window.sessionStorage.clear()
      } catch {
        // The server account is already deleted; blocked storage can no longer resync.
      }
      window.location.replace("/login?accountDeleted=1")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Account deletion failed")
      setBusy(false)
    }
  }, [])

  return (
    <>
      <Card data-settings-anchor="export-delete-account" className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently removes your Millennium account record and its server-stored portal, calendar, notification, customisation, and assistant data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Alert variant="destructive">
            <IconAlertTriangle aria-hidden="true" />
            <AlertTitle>This cannot be undone</AlertTitle>
            <AlertDescription>Download an export first if you need a copy.</AlertDescription>
          </Alert>
          <div>
            <Button variant="destructive" onClick={() => setOpen(true)}>
              <IconTrash data-icon="inline-start" aria-hidden="true" />
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={(nextOpen) => {
        if (busy) return
        setOpen(nextOpen)
        if (!nextOpen) {
          setConfirmation("")
          setError("")
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Type {CONFIRMATION} to confirm. This removes the account and revokes extension access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="delete-account-confirmation">Confirmation message</FieldLabel>
            <Input
              id="delete-account-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              placeholder={CONFIRMATION}
            />
            <FieldDescription>Capitalisation must match.</FieldDescription>
          </Field>
          {error ? (
            <Alert variant="destructive">
              <IconAlertTriangle aria-hidden="true" />
              <AlertTitle>Account was not deleted</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={confirmation !== CONFIRMATION || busy}
              onClick={deleteAccount}
            >
              {busy ? "Deleting..." : "Delete account permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
