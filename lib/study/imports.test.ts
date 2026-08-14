import { describe, expect, it } from "vitest";

import type { StudySchedulingState } from "./domain";
import {
  buildStudyImportErrorReport,
  buildStudyImportPreview,
  inspectStudyImportFile,
  studyImportContentKey,
  type StudyImportPlanInput,
} from "./imports";

const INITIAL_STATE: StudySchedulingState = {
  state: "new",
  dueAt: "2026-08-02T10:00:00.000Z",
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  repetitions: 0,
  lapses: 0,
  lastReviewedAt: null,
};

function planInput(
  content: string,
  overrides: Partial<StudyImportPlanInput["command"]> = {},
  existingContentKeys = new Set<string>(),
): StudyImportPlanInput {
  let counter = 0;
  return {
    command: {
      fileName: "cards.csv",
      content,
      hasHeader: true,
      mapping: { prompt: "Question", answer: "Answer" },
      deckId: null,
      deckTitle: "Imported",
      duplicatePolicy: "skip",
      tagDelimiter: ",",
      ...overrides,
    },
    deck: { id: "a7f51bdf-8ba3-41f0-ac1f-33f014ac0a36", title: "Imported", description: "" },
    existingContentKeys,
    initialState: INITIAL_STATE,
    schedulerName: "fsrs",
    schedulerVersion: "6",
    parametersVersion: "default",
    createId: () => `id-${(counter += 1)}`,
  };
}

describe("inspectStudyImportFile", () => {
  it("detects a tab delimiter without being told", () => {
    const inspection = inspectStudyImportFile("Question\tAnswer\nMitosis?\tCell division\n", true);

    expect(inspection.delimiter).toBe("\t");
    expect(inspection.columns).toEqual(["Question", "Answer"]);
    expect(inspection.rows).toEqual([["Mitosis?", "Cell division"]]);
  });

  it("names columns positionally when the file has no header", () => {
    const inspection = inspectStudyImportFile("Mitosis?,Cell division\n", false);

    expect(inspection.columns).toEqual(["Column 1", "Column 2"]);
    expect(inspection.rows).toHaveLength(1);
  });

  it("keeps quoted commas and newlines inside one field", () => {
    const inspection = inspectStudyImportFile('Question,Answer\n"a, b","line1\nline2"\n', true);

    expect(inspection.rows[0]).toEqual(["a, b", "line1\nline2"]);
  });
});

describe("buildStudyImportPreview", () => {
  it("plans one card per valid row", () => {
    const preview = buildStudyImportPreview(planInput(
      "Question,Answer\nMitosis?,Cell division\nOsmosis?,Water movement\n",
    ));

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.importedRows).toBe(2);
    expect(preview.plan.notes).toHaveLength(2);
    expect(preview.plan.notes[0].cards).toEqual([{ id: "id-2", templateKey: "forward", ordinal: 0 }]);
  });

  it("reports empty questions and answers against spreadsheet row numbers", () => {
    const preview = buildStudyImportPreview(planInput(
      "Question,Answer\nMitosis?,\n,Water movement\nOsmosis?,Water movement\n",
    ));

    expect(preview.summary.importedRows).toBe(1);
    expect(preview.summary.errors).toEqual([
      { row: 2, code: "missing-answer", message: "The answer is empty." },
      { row: 3, code: "missing-prompt", message: "The question is empty." },
    ]);
  });

  it("skips rows matching cards that already exist", () => {
    const existing = new Set([studyImportContentKey("Mitosis?", "Cell division")]);
    const preview = buildStudyImportPreview(planInput(
      "Question,Answer\nmitosis?,cell division\nOsmosis?,Water movement\n",
      {},
      existing,
    ));

    expect(preview.summary.skippedDuplicates).toBe(1);
    expect(preview.summary.importedRows).toBe(1);
  });

  it("imports duplicate rows when the user chooses to keep them", () => {
    const existing = new Set([studyImportContentKey("Mitosis?", "Cell division")]);
    const preview = buildStudyImportPreview(planInput(
      "Question,Answer\nMitosis?,Cell division\n",
      { duplicatePolicy: "import" },
      existing,
    ));

    expect(preview.summary.skippedDuplicates).toBe(0);
    expect(preview.summary.importedRows).toBe(1);
  });

  it("splits a tag column on the chosen delimiter", () => {
    const preview = buildStudyImportPreview(planInput(
      "Question,Answer,Tags\nMitosis?,Cell division,\"unit-1, exam\"\n",
      { mapping: { prompt: "Question", answer: "Answer", tags: "Tags" } },
    ));

    expect(preview.plan.notes[0].tags).toEqual(["unit-1", "exam"]);
  });

  it("refuses to guess when the mapped column is not in the file", () => {
    expect(() => buildStudyImportPreview(planInput(
      "Front,Back\nMitosis?,Cell division\n",
    ))).toThrow(/question and the answer/);
  });

  it("preview counts equal the number of notes a commit would insert", () => {
    const preview = buildStudyImportPreview(planInput(
      "Question,Answer\nMitosis?,Cell division\n,\nOsmosis?,Water movement\n",
    ));

    expect(preview.summary.importedRows).toBe(preview.plan.notes.length);
  });
});

describe("buildStudyImportErrorReport", () => {
  it("writes a CSV a user can open and fix", () => {
    const report = buildStudyImportErrorReport([
      { row: 2, code: "missing-answer", message: "The answer is empty." },
    ]);

    expect(report.split("\n")[0]).toBe("row,code,message");
    expect(report).toContain("2,missing-answer");
  });
});
