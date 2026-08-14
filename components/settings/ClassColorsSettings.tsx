"use client"

import * as React from "react"
import { IconChevronDown, IconPalette, IconRestore } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ColorPicker, ColorPickerContent, ColorPickerTrigger } from "@/components/ui/color-picker"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
  "#8b5cf6", "#ec4899", "#6366f1", "#06b6d4", "#84cc16", "#f43f5e",
]

export interface ClassColorOption {
  classCode: string
  course: string
  color: string
  customized: boolean
  enrolled: boolean
}

interface ClassColorsSettingsProps {
  classes: ClassColorOption[]
  onChange: (classCode: string, color: string) => void
  onReset: (classCode: string) => void
  onResetAll: () => void
}

export function ClassColorsSettings({ classes, onChange, onReset, onResetAll }: ClassColorsSettingsProps) {
  const enrolledClasses = classes.filter((item) => item.enrolled)
  const unenrolledClasses = classes.filter((item) => !item.enrolled)

  const renderClass = (item: ClassColorOption) => (
    <div key={item.classCode} className="flex items-center gap-3 rounded-lg border p-3">
      <ColorPicker value={item.color} onChange={(color) => onChange(item.classCode, color)}>
        <ColorPickerTrigger aria-label={`Change colour for ${item.course}`}>
          <IconPalette aria-hidden="true" />
        </ColorPickerTrigger>
        <ColorPickerContent presetColors={PRESET_COLORS} />
      </ColorPicker>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.course}</div>
        <div className="truncate text-xs text-muted-foreground">{item.classCode}</div>
      </div>
      <div className="size-5 rounded-full border" style={{ backgroundColor: item.color }} aria-hidden="true" />
      <Button variant="ghost" size="sm" onClick={() => onReset(item.classCode)} disabled={!item.customized}>
        Reset
      </Button>
    </div>
  )

  return (
    <Card data-settings-anchor="class-colours">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Class colours</CardTitle>
            <CardDescription>Use one consistent colour for each class across the timetable and dashboard.</CardDescription>
          </div>
          <Button data-settings-anchor="class-colours-reset" variant="outline" size="sm" onClick={onResetAll} disabled={!classes.some((item) => item.customized)}>
            <IconRestore data-icon="inline-start" aria-hidden="true" />
            Reset all
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {classes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Class colours will appear after your timetable has synced.
          </div>
        ) : (
          <div className="grid gap-2">
            {enrolledClasses.map(renderClass)}
            {unenrolledClasses.length > 0 && (
              <Collapsible className="group mt-1">
                <CollapsibleTrigger data-settings-anchor="class-colours-unenrolled" data-settings-open="class-colours-unenrolled" render={<Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" />}>
                  Unenrolled classes ({unenrolledClasses.length})
                  <IconChevronDown className="size-4 transition-transform duration-[var(--anim-microInteractions-duration)] ease-[var(--anim-microInteractions-easing)] group-data-open:rotate-180" aria-hidden="true" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 grid gap-2">
                  {unenrolledClasses.map(renderClass)}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
