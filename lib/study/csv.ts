/**
 * The CSV reader and writer used by flashcard importing.
 *
 * This replaces PapaParse, which could not be built into the server bundle: it constructs its
 * worker by stringifying a factory function whose body contains `var global = ...`, and Nitro's
 * `rollup-plugin-inject` pass corrupts that string literal, after which rollup fails to parse the
 * package at all. None of that machinery — workers, streaming, chunked files, node streams — is
 * used here. Imports are capped at 2 MB and 500 rows and are parsed in one pass, on both the
 * server (`buildStudyImportPreview`) and in the browser (the import dialog).
 *
 * The dialect is RFC 4180 as the spreadsheet applications people actually export from write it:
 * fields may be quoted with `"`, a doubled `""` is a literal quote inside a quoted field, and
 * quoted fields may contain the delimiter, CR, and LF.
 */

/** Delimiters worth guessing between. Ordered only for deterministic tie-breaking. */
const CANDIDATE_DELIMITERS = [",", "\t", ";", "|"] as const;

export const DEFAULT_CSV_DELIMITER = ","

export interface CsvParseResult {
  readonly rows: string[][]
  /**
   * Zero-based indexes of rows that could not be read as written — currently only a quoted field
   * that the file ends in the middle of. Reported rather than thrown so a mostly-good file still
   * imports and the user is told which lines to fix.
   */
  readonly unreadableRows: number[]
  readonly delimiter: string
}

/** True for a row that carries no content: no fields, or every field blank. */
function isBlankRow(row: string[]): boolean {
  return row.every((field) => field.trim() === "")
}

/**
 * Splits on the first line that is not inside quotes, so a delimiter is guessed from a whole
 * record rather than from the first physical line of a multi-line field.
 */
function firstRecordText(content: string): string {
  let insideQuotes = false
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (character === '"') {
      if (insideQuotes && content[index + 1] === '"') index += 1
      else insideQuotes = !insideQuotes
      continue
    }
    if (!insideQuotes && (character === "\n" || character === "\r")) return content.slice(0, index)
  }
  return content
}

/**
 * Picks the delimiter that splits the first record into the most fields.
 *
 * Ties keep the earlier candidate, which makes a single-column file a comma file — the same answer
 * PapaParse gave, and the one that reads correctly when the user then maps one column.
 */
export function detectCsvDelimiter(content: string): string {
  const sample = firstRecordText(content)
  if (!sample) return DEFAULT_CSV_DELIMITER

  let best = DEFAULT_CSV_DELIMITER
  let bestCount = 0
  for (const candidate of CANDIDATE_DELIMITERS) {
    const count = parseCsv(sample, candidate).rows[0]?.length ?? 0
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * Reads `content` as CSV. Blank rows are dropped, matching the "greedy" empty-line handling the
 * import flow relied on: a trailing newline, a stray blank line, and a line of bare delimiters all
 * disappear rather than becoming an empty card.
 */
export function parseCsv(content: string, delimiter?: string): CsvParseResult {
  const activeDelimiter = delimiter ?? detectCsvDelimiter(content)
  const rows: string[][] = []
  const unreadableRows: number[] = []

  let field = ""
  let row: string[] = []
  let insideQuotes = false
  let quoteOpenedAtRow = -1

  const endField = () => {
    row.push(field)
    field = ""
  }

  const endRow = () => {
    endField()
    if (!isBlankRow(row)) rows.push(row)
    row = []
  }

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (insideQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          insideQuotes = false
        }
        continue
      }
      field += character
      continue
    }

    if (character === '"' && field === "") {
      insideQuotes = true
      quoteOpenedAtRow = rows.length
      continue
    }

    if (character === activeDelimiter) {
      endField()
      continue
    }

    // A lone CR, a lone LF, and CRLF all end the record.
    if (character === "\r" || character === "\n") {
      if (character === "\r" && content[index + 1] === "\n") index += 1
      endRow()
      continue
    }

    field += character
  }

  // A file that ends mid-quote has no closing delimiter, so the partial record is kept and flagged
  // rather than silently truncated.
  if (insideQuotes && quoteOpenedAtRow >= 0) unreadableRows.push(quoteOpenedAtRow)
  if (field !== "" || row.length > 0) endRow()

  return { rows, unreadableRows, delimiter: activeDelimiter }
}

/** Quotes only what has to be quoted, so a plain file stays readable in a text editor. */
function encodeField(value: unknown, delimiter: string): string {
  const text = value === null || value === undefined ? "" : String(value)
  const needsQuotes = text.includes(delimiter)
    || text.includes('"')
    || text.includes("\n")
    || text.includes("\r")
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text
}

export interface CsvUnparseInput {
  readonly fields: readonly string[]
  readonly data: readonly (readonly unknown[])[]
}

/** Writes a header row followed by the data, LF-separated and with no trailing newline. */
export function unparseCsv(
  { fields, data }: CsvUnparseInput,
  delimiter: string = DEFAULT_CSV_DELIMITER
): string {
  const lines = [fields.map((field) => encodeField(field, delimiter)).join(delimiter)]
  for (const row of data) {
    lines.push(row.map((value) => encodeField(value, delimiter)).join(delimiter))
  }
  return lines.join("\n")
}
