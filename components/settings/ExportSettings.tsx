"use client"

import * as React from "react"
import { IconAlertTriangle, IconDownload, IconFileImport, IconShieldLock } from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function exportedFilename(response: Response): string {
  const disposition = response.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="([^"]+)"/i)
  return match?.[1] || `millennium-export-${new Date().toISOString().slice(0, 10)}.json`
}

export function ExportSettings() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [showDownloadWarning, setShowDownloadWarning] = React.useState(false)

  const downloadExport = React.useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/user/export", {
        cache: "no-store",
        credentials: "same-origin",
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.message || "Export failed")
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = exportedFilename(response)
      anchor.style.display = "none"
      document.body.appendChild(anchor)

      try {
        anchor.click()
      } finally {
        anchor.remove()
        // Firefox and WebKit may not consume the object URL until after the
        // click task finishes. Revoking it immediately can cancel the download.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }, [])

  const importExport = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/user/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || "Import failed")
      setMessage("Import complete. Reload Millennium to see restored data.")
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="grid gap-4" data-tour-id="settings-export">
      <Card data-settings-anchor="export-data">
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download a JSON copy of the account data Millennium currently stores for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <IconShieldLock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="grid gap-1 text-sm">
              <strong>Private download</strong>
              <span className="text-muted-foreground">
                The file can contain student information, notices, classes, calendars, preferences, and assistant history. Store it securely.
              </span>
            </div>
          </div>
          <div>
            <Button onClick={() => setShowDownloadWarning(true)} disabled={busy}>
              <IconDownload data-icon="inline-start" aria-hidden="true" />
              {busy ? "Preparing export..." : "Download JSON export"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card data-settings-anchor="export-import">
        <CardHeader>
          <CardTitle>Import your data</CardTitle>
          <CardDescription>Restore data from a Millennium JSON export belonging to this user ID.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" render={<label htmlFor="millennium-import" />} disabled={busy}>
            <IconFileImport data-icon="inline-start" aria-hidden="true" />
            {busy ? "Importing..." : "Choose JSON export"}
          </Button>
          <Input id="millennium-import" type="file" accept="application/json,.json" className="sr-only" onChange={importExport} disabled={busy} />
        </CardContent>
      </Card>
      <AlertDialog open={showDownloadWarning} onOpenChange={setShowDownloadWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep this export private</AlertDialogTitle>
            <AlertDialogDescription>
              This file contains private student and account data. Never share it with anyone. Store it securely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={downloadExport}>I understand, download</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <Alert variant="destructive">
          <IconAlertTriangle aria-hidden="true" />
          <AlertTitle>Export failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <IconShieldLock aria-hidden="true" />
          <AlertTitle>Data imported</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
