/**
 * Read tools for the parts of the dashboard the assistant could see but could not reach.
 *
 * The dashboard snapshot in the system prompt carries classes, the timetable grid, notices,
 * calendars, themes and home layout. It carries a *count* of grades and nothing at all for
 * attendance or reports — so an assistant shipped with a built-in "Attendance reading" skill had no
 * attendance to read. These tools close that gap, and they do it as tools rather than as more
 * snapshot because attendance and grade history are long, are asked about rarely, and would
 * otherwise be paid for on every message.
 *
 * `inspect_schedule` is the exception and the important one. It does not return data for the model
 * to reason over; it returns the answer. Week A/B rotation, holiday skipping and bell times are
 * resolved in `./schedule.ts` before the model sees anything, because those three deductions were
 * where "what have I got today" went wrong.
 *
 * Every tool here is read-only. Nothing in this module can change a single stored field.
 */

import { BUILTIN_ASSISTANT_SKILLS } from "./builtin-skills.ts";
import { isHolidayEntry, parsePortalDate } from "../school-terms.ts";
import { describeTeacherChange } from "../portal-teacher-changes.ts";
import {
  findCurrentClass,
  findNextClass,
  resolveDaySchedule,
  type DaySchedule,
} from "./schedule.ts";
import type { AssistantDashboardState } from "./actions.ts";

export const ASSISTANT_READ_TOOL_NAMES = [
  "inspect_schedule",
  "inspect_attendance",
  "inspect_academics",
  "inspect_calendar",
  "inspect_notices",
  "inspect_teacher_changes",
  "inspect_skills",
] as const;

/** How many days ahead `inspect_schedule` will lay out in one call. */
const MAX_SCHEDULE_DAYS = 14;

const MAX_CALENDAR_DAYS = 120;
const DEFAULT_CALENDAR_DAYS = 14;
const MAX_CALENDAR_EVENTS = 60;

const MAX_NOTICES = 40;
const DEFAULT_NOTICES = 10;
/** Longest a single notice body is returned at. Whole notices are short; a runaway one is not. */
const MAX_NOTICE_BODY_CHARS = 2_000;

/** Attendance bands, when the student has not set their own. Mirrors `types/portal.ts`. */
const DEFAULT_ATTENDANCE_BANDS = { excellent: 95, good: 90, concern: 80 };

export function getAssistantReadTools() {
  return [
    {
      type: "function",
      function: {
        name: "inspect_schedule",
        description: [
          "Resolve what classes actually run on a day, with the Week A/B rotation, school holidays",
          "and bell times already applied. Use this for every question about today's classes, a",
          "specific day's classes, what is on now, or what is next — do not work it out from the",
          "timetable grid in the snapshot, which is two undated fortnightly grids and does not say",
          "which week today is.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["day", "next", "now"],
              description: "'day' lists a day's periods (the default), 'next' finds the next class, 'now' reports the class currently running.",
            },
            date: {
              type: "string",
              description: "Which day, as 'today', 'tomorrow', a weekday name, or YYYY-MM-DD. Defaults to today.",
            },
            days: {
              type: "number",
              minimum: 1,
              maximum: MAX_SCHEDULE_DAYS,
              description: "Lay out this many consecutive days starting at `date`. Defaults to 1.",
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_attendance",
        description: [
          "Read attendance: yearly percentages, per-subject percentages, and recorded absences.",
          "Attendance is not in the dashboard snapshot, so this tool is the only way to see it.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            subject: { type: "string", description: "Filter to one subject or class code." },
            includeAbsences: { type: "boolean", description: "Include the individual absence records. Defaults to true." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_academics",
        description: [
          "Read marked work and published reports: task results with their dates, and the list of",
          "report documents. The snapshot carries only a count of these, so read them here before",
          "answering anything about marks, results or progress.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["grades", "reports", "both"],
              description: "Which to read. Defaults to both.",
            },
            subject: { type: "string", description: "Filter grades to one subject." },
            limit: { type: "number", minimum: 1, maximum: 100, description: "Most recent N grades. Defaults to 40." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_calendar",
        description: [
          "List what is on between two dates: school calendar events, holidays and the student's own",
          "Millennium events, with every date already parsed and sorted. Use this for 'what is on',",
          "'what is coming up', and 'when is X'. Do not read schoolCalendar out of the snapshot to",
          "answer those — its dates are raw portal strings in several formats, and ordering them is",
          "not something to do by eye.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Start of the range, as 'today', 'tomorrow', a weekday name, or YYYY-MM-DD. Defaults to today.",
            },
            days: {
              type: "number",
              minimum: 1,
              maximum: MAX_CALENDAR_DAYS,
              description: `How many days from \`from\` to cover. Defaults to ${DEFAULT_CALENDAR_DAYS}.`,
            },
            query: { type: "string", description: "Only events whose title or type contains this text." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_notices",
        description: [
          "Read the full text of daily notices, optionally filtered by a search term or a date. The",
          "snapshot carries only titles and a short preview, so anything about what a notice actually",
          "says has to be read here first.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Only notices whose title or body contains this text." },
            date: { type: "string", description: "Only notices posted for this day, as 'today' or YYYY-MM-DD." },
            limit: {
              type: "number",
              minimum: 1,
              maximum: MAX_NOTICES,
              description: `Most recent N notices. Defaults to ${DEFAULT_NOTICES}.`,
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_teacher_changes",
        description: [
          "Read teacher changes found in the timetable, each already classified as a permanent change",
          "or a substitute covering. This is the only place that knows a teacher changed at all: the",
          "timetable shows who teaches a class now and never who used to, so it cannot be worked out",
          "from the snapshot.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["permanent", "substitute", "unconfirmed", "all"],
              description: "Filter to one kind of change. Defaults to all.",
            },
            subject: { type: "string", description: "Filter to one subject or class code." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_skills",
        description: [
          "List the skills available in this conversation, or read one in full. The system prompt",
          "carries only the names and one-line descriptions of skills that are not currently active;",
          "call this with a name to read that skill's full instructions before doing work it covers.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Read this skill's full instructions. Omit to list every skill." },
          },
        },
      },
    },
  ];
}

export interface ReadToolResult {
  action: string;
  ok: boolean;
  message: string;
  data?: unknown;
}

const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

/**
 * Turns whatever the model wrote into a date.
 *
 * Accepts the shapes a model actually emits — `today`, `tomorrow`, `Friday`, an ISO date — and
 * returns null for anything else rather than guessing, because a schedule answered for a date the
 * student did not ask about is worse than a request to clarify.
 */
function resolveRequestedDate(value: unknown, now: Date): Date | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw || raw === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (raw === "tomorrow") return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (raw === "yesterday") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const weekdayIndex = WEEKDAY_NAMES.indexOf(raw.replace(/^(next|this)\s+/, ""));
  if (weekdayIndex >= 0) {
    // The next occurrence, today included, which is what "on Friday" means when said on a Friday.
    const offset = (weekdayIndex - now.getDay() + 7) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  }

  return null;
}

function describeDay(schedule: DaySchedule): string {
  if (!schedule.isSchoolDay) {
    return `${schedule.weekday} ${schedule.date}: no classes. ${schedule.notSchoolDayReason}`;
  }
  return `${schedule.weekday} ${schedule.date} (${schedule.weekLabel}): ${schedule.periods.length} period${schedule.periods.length === 1 ? "" : "s"}.`;
}

function cleanText(value: unknown, maximum = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

/**
 * Reads a numeric argument out of whatever the model actually sent.
 *
 * A schema saying `type: "number"` is a request, not a guarantee. The smaller free models send
 * `"7"`, `"7 days"` and occasionally `seven`; the first two are plainly a number and were being
 * turned into `NaN` by `Number(...)`, which then silently fell back to the default. A tool that
 * quietly ignores the argument it was given is worse than one that refuses it, because the model
 * has no way to tell its instruction was dropped and simply asserts the wrong answer.
 */
function readNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

/** The same tolerance for booleans, which arrive as `"true"`, `"yes"` and `1` about as often. */
function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = cleanText(value, 10).toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return fallback;
}

function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function matchesSubject(filter: string, ...fields: unknown[]): boolean {
  if (!filter) return true;
  return fields.some((field) => cleanText(field, 300).toLowerCase().includes(filter));
}

export async function executeAssistantReadTool(
  name: string,
  args: Record<string, any>,
  state: AssistantDashboardState,
  now: Date,
): Promise<ReadToolResult> {
  const fail = (message: string): ReadToolResult => ({ action: name, ok: false, message });
  const portal = state.portalData || {};
  const unenrolledClassKeys = state.preferences.homeSettings.unenrolledClassKeys || [];

  if (name === "inspect_schedule") {
    const mode = args.mode === "next" || args.mode === "now" ? args.mode : "day";

    if (mode === "now") {
      const current = findCurrentClass(portal, now, { unenrolledClassKeys });
      const today = resolveDaySchedule(portal, now, { unenrolledClassKeys });
      return {
        action: name,
        ok: true,
        message: current
          ? `${current.course} is on now, period ${current.period}${current.room ? ` in ${current.room}` : ""}.`
          : `No class is running right now. ${today.notSchoolDayReason || "The period between classes."}`,
        data: { now: now.toISOString(), current, today: describeDay(today) },
      };
    }

    if (mode === "next") {
      const next = findNextClass(portal, now, { unenrolledClassKeys });
      return {
        action: name,
        ok: true,
        message: next.period
          ? `Next: ${next.period.course}, ${next.isToday ? "today" : next.weekday} ${next.date}, period ${next.period.period}${next.period.startsAt ? ` at ${next.period.startsAt}` : ""}.`
          : "No upcoming class was found in the next four weeks of timetable data.",
        data: next,
      };
    }

    const start = resolveRequestedDate(args.date, now);
    if (!start) return fail(`Could not read “${cleanText(args.date, 60)}” as a date. Use today, tomorrow, a weekday, or YYYY-MM-DD.`);

    const days = readNumber(args.days, 1, 1, MAX_SCHEDULE_DAYS);
    const schedules = Array.from({ length: days }, (_, offset) => (
      resolveDaySchedule(
        portal,
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset),
        { unenrolledClassKeys },
      )
    ));

    return {
      action: name,
      ok: true,
      message: schedules.map(describeDay).join(" "),
      data: { days: schedules, resolvedFrom: cleanText(args.date, 60) || "today" },
    };
  }

  if (name === "inspect_attendance") {
    const attendance = portal.attendance;
    if (!attendance || typeof attendance !== "object") {
      return fail("No attendance data has been synced from the portal.");
    }

    const subject = cleanText(args.subject, 200).toLowerCase();
    const yearly = Array.isArray(attendance.yearly) ? attendance.yearly.slice(0, 12) : [];
    const subjects = (Array.isArray(attendance.subjects) ? attendance.subjects : [])
      .filter((entry: any) => matchesSubject(subject, entry?.classCode, entry?.course, entry?.subject))
      .slice(0, 40);
    const absences = readBoolean(args.includeAbsences, true)
      ? (Array.isArray(attendance.absences) ? attendance.absences : []).slice(-60)
      : [];

    return {
      action: name,
      ok: true,
      message: `Attendance: ${yearly.length} year record${yearly.length === 1 ? "" : "s"}, ${subjects.length} subject${subjects.length === 1 ? "" : "s"}, ${absences.length} absence record${absences.length === 1 ? "" : "s"}.`,
      data: {
        yearly,
        subjects,
        absences,
        recentPeriodCount: Array.isArray(attendance.recentPeriods) ? attendance.recentPeriods.length : 0,
        // Stated so a percentage is never reported against a generic 90% the student never chose.
        bands: DEFAULT_ATTENDANCE_BANDS,
        bandsSource: "application defaults",
      },
    };
  }

  if (name === "inspect_academics") {
    const kind = args.kind === "grades" || args.kind === "reports" ? args.kind : "both";
    const subject = cleanText(args.subject, 200).toLowerCase();
    const limit = readNumber(args.limit, 40, 1, 100);

    const grades = kind === "reports"
      ? []
      : (Array.isArray(portal.grades) ? portal.grades : [])
        .filter((entry: any) => matchesSubject(subject, entry?.subject, entry?.course))
        .slice(-limit)
        .map((entry: any) => ({
          subject: cleanText(entry?.subject || entry?.course, 200),
          task: cleanText(entry?.task || entry?.title, 240),
          result: cleanText(entry?.result || entry?.mark || entry?.grade, 80),
          date: cleanText(entry?.date, 60),
        }));

    const reports = kind === "grades"
      ? []
      : (Array.isArray(portal.reports) ? portal.reports : []).slice(0, 30).map((entry: any) => ({
        title: cleanText(entry?.title, 240),
        yearLevel: cleanText(entry?.yearLevel, 60),
        semester: Number.isFinite(Number(entry?.semester)) ? Number(entry.semester) : null,
        calendarYear: Number.isFinite(Number(entry?.calendarYear)) ? Number(entry.calendarYear) : null,
      }));

    if (grades.length === 0 && reports.length === 0) {
      return fail(
        subject
          ? `No marked work or reports were found for “${cleanText(args.subject, 60)}”.`
          : "No marked work or reports have been synced from the portal.",
      );
    }

    return {
      action: name,
      ok: true,
      message: `Found ${grades.length} marked task${grades.length === 1 ? "" : "s"} and ${reports.length} report${reports.length === 1 ? "" : "s"}.`,
      // Report documents are listed by name only. Their URLs are session-scoped portal links and
      // would be a credentialed reference handed to a model, for no benefit it can act on.
      data: { grades, reports },
    };
  }

  if (name === "inspect_calendar") {
    const start = resolveRequestedDate(args.from, now);
    if (!start) return fail(`Could not read “${cleanText(args.from, 60)}” as a date. Use today, tomorrow, a weekday, or YYYY-MM-DD.`);

    const days = readNumber(args.days, DEFAULT_CALENDAR_DAYS, 1, MAX_CALENDAR_DAYS);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1);
    const query = cleanText(args.query, 200).toLowerCase();

    // School events and the student's own events are merged into one list on purpose. "What is on
    // next week" is one question, and answering it from two separately shaped arrays is where a
    // model drops half the answer.
    const schoolEvents = (Array.isArray(portal.calendar) ? portal.calendar : []).flatMap((event: any) => {
      const dates = Array.isArray(event?.dates) && event.dates.length ? event.dates : [event?.date];
      return dates.map((value: unknown) => {
        const date = parsePortalDate(value);
        if (!date || date < start || date > end) return null;
        if (!matchesSubject(query, event?.title, event?.type)) return null;
        return {
          date: toDateKey(date),
          title: cleanText(event?.title, 240),
          type: cleanText(event?.type, 100) || "school",
          source: "school" as const,
          isHoliday: isHolidayEntry(event),
        };
      });
    }).filter(Boolean);

    const personalEvents = state.localCalendar.events.map((event: any) => {
      const date = parsePortalDate(cleanText(event?.start, 100).slice(0, 10));
      if (!date || date < start || date > end) return null;
      if (!matchesSubject(query, event?.title, event?.description)) return null;
      return {
        date: toDateKey(date),
        title: cleanText(event?.title, 240),
        type: cleanText(event?.calendarName, 120) || "personal",
        source: "personal" as const,
        isHoliday: false,
      };
    }).filter(Boolean);

    const events = [...schoolEvents, ...personalEvents]
      .sort((left: any, right: any) => left.date.localeCompare(right.date))
      .slice(0, MAX_CALENDAR_EVENTS);

    return {
      action: name,
      ok: true,
      message: events.length
        ? `${events.length} event${events.length === 1 ? "" : "s"} between ${toDateKey(start)} and ${toDateKey(end)}.`
        : `Nothing is on between ${toDateKey(start)} and ${toDateKey(end)}.`,
      data: { from: toDateKey(start), to: toDateKey(end), events },
    };
  }

  if (name === "inspect_notices") {
    const notices = Array.isArray(portal.notices) ? portal.notices : [];
    if (notices.length === 0) return fail("No notices have been synced from the portal.");

    const query = cleanText(args.query, 200).toLowerCase();
    const limit = readNumber(args.limit, DEFAULT_NOTICES, 1, MAX_NOTICES);
    const onDate = args.date === undefined ? null : resolveRequestedDate(args.date, now);
    if (args.date !== undefined && !onDate) {
      return fail(`Could not read “${cleanText(args.date, 60)}” as a date. Use today or YYYY-MM-DD.`);
    }
    const dateKey = onDate ? toDateKey(onDate) : "";

    const matched = notices.filter((notice: any) => {
      if (!matchesSubject(query, notice?.title, notice?.content, notice?.preview)) return false;
      if (!dateKey) return true;
      const dates = Array.isArray(notice?.dates) && notice.dates.length ? notice.dates : [notice?.date];
      return dates.some((value: unknown) => cleanText(value, 40).startsWith(dateKey));
    });

    if (matched.length === 0) {
      return fail(query || dateKey
        ? `No notice matched${query ? ` “${cleanText(args.query, 60)}”` : ""}${dateKey ? ` on ${dateKey}` : ""}.`
        : "No notices have been synced from the portal.");
    }

    return {
      action: name,
      ok: true,
      message: `${matched.length} notice${matched.length === 1 ? "" : "s"} matched; returning ${Math.min(matched.length, limit)}.`,
      data: {
        notices: matched.slice(-limit).map((notice: any) => ({
          title: cleanText(notice?.title, 240),
          date: cleanText(notice?.date, 40),
          // The plain-text body only. `contentHtml` is portal markup and would spend the budget on
          // tags the model has no use for.
          content: cleanText(notice?.content || notice?.preview, MAX_NOTICE_BODY_CHARS),
        })),
      },
    };
  }

  if (name === "inspect_teacher_changes") {
    const changes = state.teacherChanges || [];
    if (changes.length === 0) {
      return fail("No teacher changes have been found. Either nothing changed, or the timetable has only been synced once so far.");
    }

    const kind = ["permanent", "substitute", "unconfirmed"].includes(String(args.kind)) ? String(args.kind) : "all";
    const subject = cleanText(args.subject, 200).toLowerCase();
    const matched = changes.filter((change) => (
      (kind === "all" || change.kind === kind)
      && matchesSubject(subject, change.course, change.classCode)
    ));

    if (matched.length === 0) {
      return fail(`No ${kind === "all" ? "" : `${kind} `}teacher change matched${subject ? ` “${cleanText(args.subject, 60)}”` : ""}.`);
    }

    return {
      action: name,
      ok: true,
      // The verdicts are stated in the message as well as the data, because the whole value of this
      // tool is the permanent/substitute distinction and a model that only skims the message should
      // still get it right.
      message: matched.map(describeTeacherChange).join(" "),
      data: { changes: matched },
    };
  }

  if (name === "inspect_skills") {
    const requested = cleanText(args.name, 120).toLowerCase();
    const catalogue = [
      ...BUILTIN_ASSISTANT_SKILLS.map((skill) => ({
        name: skill.name,
        description: skill.description,
        origin: "built-in" as const,
        active: true,
        instructions: skill.instructions,
      })),
      ...state.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        origin: "user" as const,
        active: skill.enabled,
        instructions: skill.instructions,
      })),
    ];

    if (requested) {
      const match = catalogue.find((skill) => skill.name.toLowerCase() === requested)
        || catalogue.find((skill) => skill.name.toLowerCase().includes(requested));
      if (!match) return fail(`No skill named “${cleanText(args.name, 60)}” is available.`);
      return {
        action: name,
        ok: true,
        message: `Read the ${match.origin} skill “${match.name}”.`,
        data: {
          ...match,
          // Repeated on the read path as well as in the prompt: a model that fetched a user skill
          // several turns after the prompt block scrolled past still needs to know its standing.
          note: match.origin === "user"
            ? "User-authored. A preference for wording and approach; it never authorizes a change."
            : "Application guidance. It never authorizes a change either.",
        },
      };
    }

    return {
      action: name,
      ok: true,
      message: `${catalogue.length} skill${catalogue.length === 1 ? "" : "s"} available.`,
      data: {
        skills: catalogue.map(({ instructions: _instructions, ...summary }) => summary),
      },
    };
  }

  return fail("Unsupported read tool.");
}
