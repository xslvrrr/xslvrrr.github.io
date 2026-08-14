"use client"

import * as React from "react"
import { IconLoader2, IconSearch } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { StudyTabLoading } from "@/components/dashboard/study/StudyTabLoading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStudyBrowser } from "@/hooks/useStudyBrowser"
import { STUDY_BROWSER_PAGE_SIZE, type StudyBrowserQuery } from "@/lib/study/browser"
import type { StudyDeckSummary } from "@/lib/study/domain"
import { renderStudyCard } from "@/lib/study/note-types"

interface StudyBrowserProps {
  decks: StudyDeckSummary[]
}

const ALL_DECKS = "all"
const ALL_STATES = "all"

const STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL_STATES, label: "Any state" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "review", label: "In review" },
  { value: "relearning", label: "Relearning" },
  { value: "suspended", label: "Suspended" },
  { value: "buried", label: "Buried" },
]

const SORT_OPTIONS: Array<{ value: StudyBrowserQuery["sort"]; label: string }> = [
  { value: "due", label: "Due first" },
  { value: "created", label: "Newest first" },
  { value: "lapses", label: "Most forgotten" },
  { value: "difficulty", label: "Hardest" },
  { value: "stability", label: "Most stable" },
]

function formatDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString()
}

export function StudyBrowser({ decks }: StudyBrowserProps) {
  const { state, actions } = useStudyBrowser(true)
  const [text, setText] = React.useState("")
  const [tag, setTag] = React.useState("")

  const page = Math.floor(state.offset / STUDY_BROWSER_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(state.total / STUDY_BROWSER_PAGE_SIZE))
  const selectedCount = state.selectedIds.length

  return (
    <Card className="border border-[var(--border-default)] bg-[var(--bg-surface)] ring-0">
      <CardHeader>
        <CardTitle>Find cards</CardTitle>
        <CardDescription>
          Search every set, then act on what you select. Nothing changes until you choose an action.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            actions.setFilter((current) => ({ ...current, text: text.trim() || undefined }))
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="study-browser-text">Search question and answer text</Label>
            <Input
              id="study-browser-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="mitochondria"
            />
          </div>
          <Button className="self-end" type="submit" disabled={state.isLoading}>
            {state.isLoading ? <IconLoader2 className="animate-spin" /> : <IconSearch />}
            Search
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="study-browser-deck">Set</Label>
            <Select
              value={state.filter.deckIds?.[0] ?? ALL_DECKS}
              onValueChange={(value: string | null) => actions.setFilter((current) => ({
                ...current,
                deckIds: !value || value === ALL_DECKS ? [] : [value],
              }))}
            >
              <SelectTrigger id="study-browser-deck"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DECKS}>All sets</SelectItem>
                {decks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>{deck.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="study-browser-state">State</Label>
            <Select
              value={state.filter.states?.[0] ?? ALL_STATES}
              onValueChange={(value: string | null) => actions.setFilter((current) => ({
                ...current,
                states: !value || value === ALL_STATES
                  ? []
                  : [value as NonNullable<StudyBrowserQuery["states"]>[number]],
              }))}
            >
              <SelectTrigger id="study-browser-state"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="study-browser-sort">Order</Label>
            <Select
              value={state.filter.sort ?? "due"}
              onValueChange={(value: string | null) => actions.setFilter((current) => ({
                ...current,
                sort: (value ?? "due") as StudyBrowserQuery["sort"],
              }))}
            >
              <SelectTrigger id="study-browser-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {state.error ? <p className="text-sm" role="alert">{state.error}</p> : null}

        <p className="text-sm text-[var(--text-tertiary)]" role="status" aria-live="polite">
          {state.total} card{state.total === 1 ? "" : "s"} match. Page {page} of {pageCount}.
          {selectedCount > 0 ? ` ${selectedCount} selected.` : ""}
        </p>

        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-default)] p-3">
            <Button size="sm" variant="outline" disabled={state.isSaving}
              onClick={() => void actions.runBulk({ action: "suspend" })}>
              Suspend
            </Button>
            <Button size="sm" variant="outline" disabled={state.isSaving}
              onClick={() => void actions.runBulk({ action: "unsuspend" })}>
              Unsuspend
            </Button>
            <Button size="sm" variant="outline" disabled={state.isSaving}
              onClick={() => void actions.runBulk({ action: "bury" })}>
              Bury until tomorrow
            </Button>
            <Button size="sm" variant="outline" disabled={state.isSaving}
              onClick={() => void actions.runBulk({
                action: "reschedule",
                dueAt: new Date().toISOString(),
              })}>
              Make due now
            </Button>
            <div className="flex items-center gap-2">
              <Label className="sr-only" htmlFor="study-browser-tag">Tag to add</Label>
              <Input
                id="study-browser-tag"
                className="h-8 w-40"
                placeholder="tag"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
              <Button size="sm" variant="outline" disabled={state.isSaving || !tag.trim()}
                onClick={() => void actions.runBulk({ action: "add-tag", tag: tag.trim() })}>
                Add tag
              </Button>
            </div>
            <Button size="sm" variant="destructive" disabled={state.isSaving}
              onClick={() => void actions.runBulk({ action: "delete" })}>
              Delete cards
            </Button>
            <Button size="sm" variant="ghost" onClick={actions.clearSelection}>Clear selection</Button>
          </div>
        ) : null}

        <Table className="min-w-[48rem]">
          <TableCaption className="sr-only">Search results</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  aria-label="Select every card on this page"
                  checked={state.items.length > 0 && selectedCount === state.items.length}
                  onCheckedChange={(checked: boolean) => (checked
                    ? actions.selectAllOnPage()
                    : actions.clearSelection())}
                />
              </TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Set</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Lapses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.items.map((item) => (
              <TableRow key={item.cardId}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select card ${renderStudyCard(item.noteType, item.fields, item.templateKey).prompt}`}
                    checked={state.selectedIds.includes(item.cardId)}
                    onCheckedChange={() => actions.toggleSelected(item.cardId)}
                  />
                </TableCell>
                <TableCell className="max-w-sm truncate">
                  {renderStudyCard(item.noteType, item.fields, item.templateKey).prompt}
                </TableCell>
                <TableCell>{item.deckTitle}</TableCell>
                <TableCell><Badge variant="outline">{item.state}</Badge></TableCell>
                <TableCell className="tabular-nums">{formatDate(item.dueAt)}</TableCell>
                <TableCell className="tabular-nums">{item.lapses}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {state.items.length === 0 ? (
          state.isLoading
            ? <StudyTabLoading label="Searching your cards" />
            : <p className="text-sm text-[var(--text-tertiary)]">No cards match these filters.</p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={state.offset === 0 || state.isLoading}
            onClick={() => actions.goToPage(Math.max(0, state.offset - STUDY_BROWSER_PAGE_SIZE))}
          >
            Previous page
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.offset + STUDY_BROWSER_PAGE_SIZE >= state.total || state.isLoading}
            onClick={() => actions.goToPage(state.offset + STUDY_BROWSER_PAGE_SIZE)}
          >
            Next page
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
