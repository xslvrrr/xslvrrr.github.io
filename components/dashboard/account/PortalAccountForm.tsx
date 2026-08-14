import { useEffect, useMemo, useState } from "react"
import { IconDeviceFloppy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PortalAccount } from "@/types/portal"

interface PortalAccountFormProps {
  account?: PortalAccount
  disabled?: boolean
  onUpdated: (account: PortalAccount) => void
}

type EditableAccount = Pick<
  PortalAccount,
  "email" | "nesaStudentNumber" | "usi" | "mobile" | "currentYear"
>

function editableAccount(account?: PortalAccount): EditableAccount {
  return {
    email: account?.email || "",
    nesaStudentNumber: account?.nesaStudentNumber || "",
    usi: account?.usi || "",
    mobile: account?.mobile || "",
    currentYear: account?.currentYear || String(new Date().getFullYear()),
  }
}

export function PortalAccountForm({
  account,
  disabled = false,
  onUpdated,
}: PortalAccountFormProps) {
  const [values, setValues] = useState<EditableAccount>(() => editableAccount(account))
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    setValues(editableAccount(account))
    if (account) setLoadError("")
  }, [account])

  const loadAccount = async () => {
    setLoading(true)
    setLoadError("")
    try {
      const response = await fetch("/api/portal/account", {
        cache: "no-store",
      })
      const body = await response.json().catch(() => null) as {
        message?: string
        account?: PortalAccount
      } | null
      if (!response.ok || !body?.account) {
        throw new Error(body?.message || "Failed to load your Millennium account details.")
      }
      onUpdated(body.account)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load your Millennium account details.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (account || disabled) return
    void loadAccount()
    // Loading is intentionally triggered only when account availability or sync
    // state changes. Retry remains an explicit user action after an error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, disabled])

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: Math.max(1, currentYear - 2021 + 2) }, (_, index) => String(2021 + index))
    if (values.currentYear && !years.includes(values.currentYear)) years.push(values.currentYear)
    return years.sort()
  }, [values.currentYear])

  if (!account) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5">
        <p className="text-sm text-muted-foreground">
          {loading || disabled
            ? "Loading your Millennium account details…"
            : loadError || "Account details have not loaded yet."}
        </p>
        {!loading && !disabled ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void loadAccount()}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  const update = (field: keyof EditableAccount, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch("/api/portal/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const body = await response.json().catch(() => null) as {
        message?: string
        account?: PortalAccount
      } | null
      if (!response.ok || !body?.account) {
        throw new Error(body?.message || "Failed to update your Millennium account.")
      }
      onUpdated(body.account)
      toast.success("Your Millennium account details were updated.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update your Millennium account.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-5">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="portal-account-email">Email address</FieldLabel>
          <Input
            id="portal-account-email"
            type="email"
            value={values.email}
            maxLength={150}
            autoComplete="email"
            disabled={disabled || saving}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-account-nesa">NESA student number</FieldLabel>
          <Input
            id="portal-account-nesa"
            value={values.nesaStudentNumber}
            maxLength={12}
            disabled={disabled || saving}
            onChange={(event) => update("nesaStudentNumber", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-account-usi">USI</FieldLabel>
          <Input
            id="portal-account-usi"
            value={values.usi}
            maxLength={12}
            autoCapitalize="characters"
            disabled={disabled || saving}
            onChange={(event) => update("usi", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-account-mobile">Mobile phone</FieldLabel>
          <Input
            id="portal-account-mobile"
            type="tel"
            inputMode="tel"
            value={values.mobile}
            maxLength={12}
            autoComplete="tel"
            disabled={disabled || saving}
            onChange={(event) => update("mobile", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-account-year">Current year</FieldLabel>
          <Select
            value={values.currentYear}
            disabled={disabled || saving}
            onValueChange={(value) => update("currentYear", value || values.currentYear)}
          >
            <SelectTrigger id="portal-account-year" className="w-full">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={disabled || saving}>
          <IconDeviceFloppy size={15} />
          {saving ? "Saving…" : "Save account details"}
        </Button>
      </div>
    </form>
  )
}
