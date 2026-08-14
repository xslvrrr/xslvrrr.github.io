/**
 * Loads the locally scraped corpus into the catalogue.
 *
 *   bun run scripts/ingest-past-paper-corpus.ts
 *   bun run scripts/ingest-past-paper-corpus.ts --dry-run
 *   PAST_PAPERS_CORPUS_DIR="/path/to/Past Papers" bun run scripts/ingest-past-paper-corpus.ts
 *
 * Reads `downloads/manifest.json`, keeps only the entries whose file is actually on disk, and
 * upserts them. A manifest row without its PDF is skipped rather than indexed: the catalogue is
 * supposed to describe documents we can hand over, and a listing that fails on download is worse
 * than one that is smaller.
 */

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { eraForYear } from "../lib/past-papers/domain.ts";
import type { IndexedPaper } from "../lib/past-papers/indexer.ts";
import { pruneIndexedPapers, upsertIndexedPapers, recordIndexRun } from "../lib/past-papers/repository.ts";
import { CORPUS_SOURCE_SLUG, isSafeCorpusPath, parseManifest, toCorpusPaper } from "../lib/past-papers/sources/corpus.ts";
import { parseTotalMarks } from "../lib/past-papers/sources/thsc.ts";
import { marksForSubject, SYLLABUS_ERAS, timingForSubject } from "../lib/past-papers/taxonomy.ts";

const dryRun = process.argv.includes("--dry-run");
const corpusRoot = resolve(process.env.PAST_PAPERS_CORPUS_DIR || "Past Papers");

async function main(): Promise<void> {
  const manifestPath = join(corpusRoot, "downloads", "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`No manifest at ${manifestPath}. Set PAST_PAPERS_CORPUS_DIR.`);
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  const entries = parseManifest(manifest);
  console.log(`Manifest: ${entries.length} entries`);

  const papers: IndexedPaper[] = [];
  let missing = 0;
  let unsafe = 0;
  let unmapped = 0;
  let bytes = 0;

  for (const entry of entries) {
    if (!isSafeCorpusPath(entry.localPath)) {
      unsafe += 1;
      continue;
    }

    const absolute = join(corpusRoot, entry.localPath);
    if (!existsSync(absolute)) {
      missing += 1;
      continue;
    }

    const paper = toCorpusPaper(entry);
    if (!paper) {
      unmapped += 1;
      continue;
    }

    bytes += statSync(absolute).size;
    // Syllabus eras, exam allowances and course mark totals are all facts about the senior HSC
    // courses. A Year 9 or 10 yearly is written to none of them, and stamping one with a
    // three-hour HSC allowance starts the timer at roughly double the paper's real length. Same
    // rule as `indexer.ts`, which is the other writer into this table.
    const senior = paper.yearLevel === "yr11" || paper.yearLevel === "yr12";
    const era = senior && paper.year !== null
      ? eraForYear(SYLLABUS_ERAS, paper.year, paper.subjectSlug)
      : null;
    const timing = senior ? timingForSubject(paper.subjectSlug) : null;
    const titleMarks = parseTotalMarks(paper.title);
    const courseMarks = senior && paper.documentKind === "paper"
      ? marksForSubject(paper.subjectSlug)
      : null;

    papers.push({
      sourceSlug: CORPUS_SOURCE_SLUG,
      externalKey: paper.externalKey,
      yearLevel: paper.yearLevel,
      category: paper.category,
      subject: paper.subject,
      subjectSlug: paper.subjectSlug,
      school: paper.school,
      year: paper.year,
      title: paper.title,
      documentKind: paper.documentKind,
      bundledSolutions: false,
      // Filled in below, once every row is known.
      hasSolutions: false,
      resources: paper.resources,
      sourceUrl: paper.sourceUrl,
      syllabusEraId: era?.id ?? null,
      durationMinutes: timing?.workingMinutes ?? null,
      readingMinutes: timing?.readingMinutes ?? null,
      durationSource: timing ? "subject-default" : "unknown",
      // Same ladder as timing: whatever the manifest's own title states, then the course's
      // official total, then nothing. The paper's cover page replaces either the first time
      // anybody opens it.
      totalMarks: titleMarks ?? courseMarks,
      marksSource: titleMarks !== null ? "title" : courseMarks !== null ? "subject-default" : "unknown",
    });
  }

  // A paper "has solutions" when a marking guideline or sample answer exists for the same course,
  // year and school. Computed across the whole corpus rather than per subject folder, because the
  // guideline for a 2023 HSC paper is a separate manifest entry in a different directory.
  const answerKeys = new Set(
    papers
      .filter((paper) => paper.documentKind !== "paper")
      .map((paper) => `${paper.subjectSlug}::${paper.category}::${paper.school ?? ""}::${paper.year ?? ""}`),
  );
  for (const paper of papers) {
    paper.hasSolutions = answerKeys.has(
      `${paper.subjectSlug}::${paper.category}::${paper.school ?? ""}::${paper.year ?? ""}`,
    );
  }

  console.log(`\nIndexable: ${papers.length} papers (${(bytes / 1024 ** 3).toFixed(2)} GB on disk)`);
  console.log(`  skipped: ${missing} missing file, ${unmapped} unknown type, ${unsafe} unsafe path`);
  console.log(`  ${papers.filter((paper) => paper.hasSolutions).length} with solutions available`);
  console.log(`  ${new Set(papers.map((paper) => paper.subjectSlug)).size} subjects, `
    + `${new Set(papers.flatMap((paper) => (paper.school ? [paper.school] : []))).size} schools`);
  console.log(`  by year level: ${summarise(papers, (paper) => paper.yearLevel)}`);
  console.log(`  by category:   ${summarise(papers, (paper) => paper.category)}`);

  if (dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  const written = await upsertIndexedPapers(papers);
  // The manifest is the whole corpus, so anything in the table this run did not produce describes
  // a file that is no longer there — or a row keyed the old way, which would otherwise sit beside
  // its replacement as a duplicate listing.
  const removed = await pruneIndexedPapers(CORPUS_SOURCE_SLUG, new Set(papers.map((paper) => paper.externalKey)));
  await recordIndexRun(CORPUS_SOURCE_SLUG, null);
  console.log(`\nWrote ${written} rows, removed ${removed} stale rows.`);
}

function summarise<T>(papers: readonly IndexedPaper[], key: (paper: IndexedPaper) => T): string {
  const counts = new Map<T, number>();
  for (const paper of papers) counts.set(key(paper), (counts.get(key(paper)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => `${String(value)} ${count}`)
    .join(", ");
}

await main();
