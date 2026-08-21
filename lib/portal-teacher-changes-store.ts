/**
 * Storage for detected teacher changes.
 *
 * Detection is pure and lives in `./portal-teacher-changes.ts`. This module is the only thing that
 * talks to `portal_teacher_changes`, so the row shape and the snake_case column names stop at this
 * boundary rather than leaking into routes and components.
 *
 * Recording goes through an RPC rather than an upsert from here, because the same change is
 * re-detected on every sync until the stored timetable catches up, and deciding whether that should
 * clear an acknowledgement is a rule about the data — it belongs next to the data, under the same
 * row lock, not in whichever caller happened to run.
 */

import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import type { TeacherChange, TeacherChangeKind } from "./portal-teacher-changes";

export interface StoredTeacherChange {
  key: string;
  week: "weekA" | "weekB";
  day: string;
  period: string;
  course: string;
  classCode: string;
  room: string;
  previousTeacher: string;
  currentTeacher: string;
  kind: TeacherChangeKind;
  lookaheadDate: string | null;
  detectedAt: string;
}

interface TeacherChangeRow {
  change_key: string;
  week: string;
  day: string | null;
  period: string | null;
  course: string | null;
  class_code: string | null;
  room: string | null;
  previous_teacher: string;
  current_teacher: string;
  kind: string;
  lookahead_date: string | null;
  detected_at: string;
}

const TEACHER_CHANGE_SELECT =
  "change_key, week, day, period, course, class_code, room, previous_teacher, current_teacher, kind, lookahead_date, detected_at";

function isTeacherChangeKind(value: unknown): value is TeacherChangeKind {
  return value === "permanent" || value === "substitute" || value === "unconfirmed";
}

function mapRow(row: TeacherChangeRow): StoredTeacherChange {
  return {
    key: row.change_key,
    week: row.week === "weekB" ? "weekB" : "weekA",
    day: row.day || "",
    period: row.period || "",
    course: row.course || "",
    classCode: row.class_code || "",
    room: row.room || "",
    previousTeacher: row.previous_teacher,
    currentTeacher: row.current_teacher,
    kind: isTeacherChangeKind(row.kind) ? row.kind : "unconfirmed",
    lookaheadDate: row.lookahead_date,
    detectedAt: row.detected_at,
  };
}

/**
 * Records a sync's changes and returns everything the student has not acknowledged.
 *
 * Failures are logged and swallowed to an empty list on purpose. This runs inside the portal sync,
 * and a sync that fetched every page correctly must not be reported as failed because a
 * supplementary observation could not be filed.
 */
export async function recordTeacherChanges(
  userId: string,
  changes: readonly TeacherChange[],
): Promise<StoredTeacherChange[]> {
  try {
    const { data, error } = await supabaseAdmin.rpc("record_portal_teacher_changes", {
      p_user_id: userId,
      p_changes: changes,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data as TeacherChangeRow[] : []).map(mapRow);
  } catch (error) {
    logger.warn("[Portal Sync] Teacher changes could not be recorded", error);
    return [];
  }
}

export async function listPendingTeacherChanges(userId: string): Promise<StoredTeacherChange[]> {
  const { data, error } = await supabaseAdmin
    .from("portal_teacher_changes")
    .select(TEACHER_CHANGE_SELECT)
    .eq("user_id", userId)
    .is("acknowledged_at", null)
    .order("detected_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as TeacherChangeRow[] | null ?? []).map(mapRow);
}

/** Marks changes as seen. An empty list acknowledges everything outstanding. */
export async function acknowledgeTeacherChanges(
  userId: string,
  changeKeys: readonly string[],
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("acknowledge_portal_teacher_changes", {
    p_user_id: userId,
    p_change_keys: changeKeys.length > 0 ? [...changeKeys] : null,
  });

  if (error) throw error;
  return Number.isFinite(Number(data)) ? Number(data) : 0;
}
