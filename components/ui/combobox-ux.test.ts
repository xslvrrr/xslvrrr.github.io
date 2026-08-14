import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { getIconExplorerLabel } from "./icon-explorer"

const readProjectFile = (path: string): string => (
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
)

describe("combobox presentation", () => {
  it("preserves authored select label capitalization", () => {
    const selectSource = readProjectFile("components/ui/select.tsx")

    expect(selectSource).not.toMatch(/SelectValue[\s\S]{0,300}\bcapitalize\b/)
    expect(readProjectFile("components/settings/GeneralSettings.tsx")).toContain(
      "DMY (DD/MM/YYYY)",
    )
  })

  it("opens shared select popups slightly larger and aligned with their trigger", () => {
    const selectSource = readProjectFile("components/ui/select.tsx")

    expect(selectSource).toContain('align = "start"')
    expect(selectSource).toContain("--anchor-width")
    expect(selectSource).toContain("--available-width")
    expect(selectSource).toContain("calc(var(--anchor-width) + 1rem)")
    expect(selectSource).toContain("alignItemWithTrigger = true")
    expect(selectSource).toContain('className="p-1"')
    expect(selectSource).toContain("formatSelectValue")
    expect(readProjectFile("components/settings/GeneralSettings.tsx")).toContain("WEEKDAY_NAMES[homeSettings.calendarFirstDayOfWeek]")
  })

  it("uses human-readable selected icon labels", () => {
    expect(getIconExplorerLabel("IconCalendarEvent")).toBe("Calendar Event")
    expect(getIconExplorerLabel("lucide:CircleCheckIcon")).toBe("Circle Check")
  })

  it("keeps custom popups wider than their anchors when space allows", () => {
    const calendarStyles = readProjectFile("components/Calendar/Calendar.module.css")
    const calendarCombobox = readProjectFile("components/Calendar/ComboboxField.tsx")
    const notificationSource = readProjectFile("components/settings/NotificationsSettings.tsx")
    const iconSource = readProjectFile("components/ui/icon-explorer.tsx")

    expect(calendarStyles).toContain("calc(var(--anchor-width) + 16px)")
    expect(calendarStyles).toContain("padding: 10px")
    expect(calendarCombobox).toContain("<PopoverContent align=\"start\"")
    expect(notificationSource).toContain("calc(var(--anchor-width)+16px)")
    expect(iconSource).toContain("calc(var(--anchor-width)+16px)")
  })
})
