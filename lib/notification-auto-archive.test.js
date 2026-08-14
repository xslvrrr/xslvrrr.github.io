import test from "node:test"
import assert from "node:assert/strict"

import { reconcileAutoArchivedNotifications } from "./notification-auto-archive.ts"

const NOW = new Date(2026, 6, 28, 12)

const notice = (notificationId, date) => ({
  notificationId,
  notice: {
    title: notificationId,
    preview: "",
    content: "",
    ...(date ? { date } : {}),
  },
})

test("reconcileAutoArchivedNotifications marks newly auto-archived notifications", () => {
  const states = {
    old: { read: true, pinned: false, archived: false, category: "alerts" },
  }

  const next = reconcileAutoArchivedNotifications(
    states,
    [notice("old", "2026-05-01")],
    "1m",
    NOW,
  )

  assert.notEqual(next, states)
  assert.deepEqual(next.old, {
    read: true,
    pinned: false,
    archived: true,
    autoArchived: true,
    category: "alerts",
  })
})

test("reconcileAutoArchivedNotifications restores only auto-archived notifications in the expanded range", () => {
  const states = {
    restored: { read: false, pinned: false, archived: true, autoArchived: true },
    stillOld: { read: false, pinned: false, archived: true, autoArchived: true },
    manual: { read: false, pinned: false, archived: true },
  }

  const next = reconcileAutoArchivedNotifications(
    states,
    [
      notice("restored", "2026-04-01"),
      notice("stillOld", "2025-10-01"),
      notice("manual", "2026-04-01"),
    ],
    "6m",
    NOW,
  )

  assert.equal(next.restored.archived, false)
  assert.equal(next.restored.autoArchived, undefined)
  assert.equal(next.stillOld.archived, true)
  assert.equal(next.stillOld.autoArchived, true)
  assert.equal(next.manual.archived, true)
  assert.equal(next.manual.autoArchived, undefined)
})

test("reconcileAutoArchivedNotifications restores all automatic archives when disabled", () => {
  const states = {
    automatic: { read: false, pinned: false, archived: true, autoArchived: true },
    manual: { read: false, pinned: false, archived: true },
  }

  const next = reconcileAutoArchivedNotifications(
    states,
    [
      notice("automatic", "2025-01-01"),
      notice("manual", "2025-01-01"),
    ],
    "never",
    NOW,
  )

  assert.equal(next.automatic.archived, false)
  assert.equal(next.automatic.autoArchived, undefined)
  assert.equal(next.manual.archived, true)
})

test("reconcileAutoArchivedNotifications leaves pinned and undated notifications alone", () => {
  const states = {
    pinned: { read: false, pinned: true, archived: false },
  }

  const next = reconcileAutoArchivedNotifications(
    states,
    [
      notice("pinned", "2025-01-01"),
      notice("undated"),
    ],
    "1w",
    NOW,
  )

  assert.equal(next, states)
})
