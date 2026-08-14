import { z } from "zod";

import { studyQueryAstSchema, type StudyQueryNode } from "./query";

export const STUDY_SMART_SESSION_LIMIT = 50;

export interface StudySmartSession {
  id: string;
  name: string;
  description: string;
  queryText: string;
  queryAst: StudyQueryNode;
  orderingStrategy: "adaptive" | "blocked" | "mixed";
  configuration: Record<string, unknown>;
  revision: number;
  updatedAt: string;
}

export const studySmartSessionCommandSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  queryText: z.string().trim().min(1).max(2_000),
  orderingStrategy: z.enum(["adaptive", "blocked", "mixed"]).default("adaptive"),
  configuration: z.object({
    limit: z.number().int().min(1).max(200).default(60),
    includeNew: z.boolean().default(true),
  }).strict().default({ limit: 60, includeNew: true }),
  expectedRevision: z.number().int().min(1).optional(),
}).strict();

export type StudySmartSessionCommand = z.infer<typeof studySmartSessionCommandSchema>;

export const studySmartSessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  description: z.string().max(500),
  queryText: z.string().max(2_000),
  queryAst: studyQueryAstSchema,
  orderingStrategy: z.enum(["adaptive", "blocked", "mixed"]),
  configuration: z.record(z.string(), z.unknown()),
  revision: z.number().int().min(1),
  updatedAt: z.string(),
}).passthrough();

export function parseStudySmartSession(value: unknown): StudySmartSession {
  return studySmartSessionSchema.parse(value) as StudySmartSession;
}

export interface StudySessionPreset {
  id: string;
  name: string;
  description: string;
  queryText: string;
  orderingStrategy: "adaptive" | "blocked" | "mixed";
}

/**
 * Friendly presets are the beginner surface for the same query language experts type. Each one is
 * a recovery or focus plan, not a punishment queue: none of them demand clearing everything.
 */
export const STUDY_SESSION_PRESETS: StudySessionPreset[] = [
  {
    id: "due-today",
    name: "What is due today",
    description: "Everything your schedule asks for right now.",
    queryText: "is:due",
    orderingStrategy: "adaptive",
  },
  {
    id: "minimum-viable",
    name: "Short session",
    description: "A small slice of what is due, when time is tight.",
    queryText: "is:due -is:suspended",
    orderingStrategy: "adaptive",
  },
  {
    id: "oldest-first",
    name: "Oldest waiting first",
    description: "Work through a backlog from the oldest card, without adding new ones.",
    queryText: "is:due -is:new",
    orderingStrategy: "blocked",
  },
  {
    id: "weak-cards",
    name: "Cards you keep forgetting",
    description: "Cards that have lapsed more than three times. No new cards.",
    queryText: "lapses>3 -is:new",
    orderingStrategy: "blocked",
  },
  {
    id: "review-only",
    name: "Review only",
    description: "Nothing new today — only cards you have already learned.",
    queryText: "is:due -is:new",
    orderingStrategy: "adaptive",
  },
  {
    id: "confusable",
    name: "Tell similar things apart",
    description: "Mixes topics you have already seen, so you practise distinguishing them.",
    queryText: "is:due -is:new",
    orderingStrategy: "mixed",
  },
];
