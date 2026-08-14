import { describe, expect, test } from "vitest";

import {
  distanceToAnnotation,
  extendDraft,
  isDegenerateDraft,
  toolKind,
  type DocumentAnnotation,
} from "./annotations.ts";

const base = (overrides: Partial<DocumentAnnotation> = {}): DocumentAnnotation => ({
  id: "a",
  documentId: "doc",
  page: 1,
  kind: "draw",
  points: [{ x: 0, y: 0 }],
  color: "#ef4444",
  strokeWidth: 3,
  ...overrides,
});

describe("extendDraft", () => {
  test("accumulates points while free drawing", () => {
    const next = extendDraft(base(), { x: 0.5, y: 0.5 });
    expect(next.points).toHaveLength(2);
  });

  test("drops jitter below the sampling threshold", () => {
    const draft = base();
    expect(extendDraft(draft, { x: 0.0001, y: 0.0001 })).toBe(draft);
  });

  test("replaces the second point for two-ended tools", () => {
    const draft = base({ kind: "line", points: [{ x: 0, y: 0 }, { x: 0.2, y: 0.2 }] });
    const next = extendDraft(draft, { x: 0.9, y: 0.9 });

    expect(next.points).toEqual([{ x: 0, y: 0 }, { x: 0.9, y: 0.9 }]);
  });
});

describe("isDegenerateDraft", () => {
  test("rejects a drag that never moved", () => {
    expect(isDegenerateDraft(base({ kind: "line", points: [{ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 }] }))).toBe(true);
  });

  test("keeps a real stroke", () => {
    expect(isDegenerateDraft(base({ kind: "line", points: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 }] }))).toBe(false);
  });

  test("never rejects a text note, which has no drag at all", () => {
    expect(isDegenerateDraft(base({ kind: "text", points: [{ x: 0.4, y: 0.4 }] }))).toBe(false);
  });
});

describe("distanceToAnnotation", () => {
  test("measures to the nearest point on the path, not to its endpoints", () => {
    const line = base({ kind: "line", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(distanceToAnnotation(line, { x: 0.5, y: 0.1 })).toBeCloseTo(0.1, 5);
  });

  test("handles a single-point annotation", () => {
    expect(distanceToAnnotation(base(), { x: 0, y: 0.3 })).toBeCloseTo(0.3, 5);
  });

  test("measures across every segment of a freehand stroke", () => {
    const stroke = base({ points: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] });
    expect(distanceToAnnotation(stroke, { x: 0.5, y: 0.95 })).toBeCloseTo(0.05, 5);
  });
});

describe("toolKind", () => {
  test("maps drawing tools onto annotation kinds and non-drawing tools onto nothing", () => {
    expect(toolKind("highlight")).toBe("highlight");
    expect(toolKind("hand")).toBeNull();
    expect(toolKind("eraser")).toBeNull();
  });
});
