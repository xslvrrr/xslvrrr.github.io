/**
 * Builds the past papers catalogue from the command line.
 *
 * The same indexer the administrator route runs, without needing a browser session. Useful for the
 * first build after a migration, and for a scheduled rebuild.
 *
 *   bun run scripts/index-past-papers.ts              # every year level
 *   bun run scripts/index-past-papers.ts yr12         # one year level
 *   bun run scripts/index-past-papers.ts --dry-run    # walk the source, write nothing
 *
 * Honours the source's `enabled` flag exactly as the route does: a disabled source is not indexed,
 * whoever asked. See docs/past-papers-sources.md.
 */

import { PAPER_YEAR_LEVELS, type PaperYearLevel } from "../lib/past-papers/domain.ts";
import { createIndexerFetch, indexThsc } from "../lib/past-papers/indexer.ts";
import { isSourceEnabled, recordIndexRun, upsertIndexedPapers } from "../lib/past-papers/repository.ts";
import { THSC_SOURCE_SLUG } from "../lib/past-papers/sources/thsc.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const requested = args.filter((arg): arg is PaperYearLevel =>
  (PAPER_YEAR_LEVELS as readonly string[]).includes(arg));
const yearLevels = requested.length > 0 ? requested : PAPER_YEAR_LEVELS;

async function main(): Promise<void> {
  if (!await isSourceEnabled(THSC_SOURCE_SLUG)) {
    console.error(
      `Source "${THSC_SOURCE_SLUG}" is disabled. Enable it deliberately after reading `
      + "docs/past-papers-sources.md.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Indexing ${THSC_SOURCE_SLUG}: ${yearLevels.join(", ")}${dryRun ? " (dry run)" : ""}`);
  const startedAt = Date.now();

  try {
    const result = await indexThsc({
      fetchText: createIndexerFetch(),
      yearLevels,
      onProgress: (message) => console.log(`  ${message}`),
    });

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`\nFound ${result.papers.length} papers in ${elapsed}s`);

    const direct = result.papers.filter((paper) => paper.resources[0]?.accessMode === "direct").length;
    console.log(`  ${direct} fetchable directly, ${result.papers.length - direct} link out to the source`);

    if (result.warnings.length > 0) {
      console.log(`\n${result.warnings.length} warning(s):`);
      for (const warning of result.warnings.slice(0, 20)) console.log(`  - ${warning}`);
    }

    if (dryRun) {
      console.log("\nDry run — nothing written.");
      return;
    }

    const written = await upsertIndexedPapers(result.papers);
    await recordIndexRun(
      THSC_SOURCE_SLUG,
      result.warnings.length > 0 ? result.warnings.slice(0, 20).join("; ") : null,
    );
    console.log(`\nWrote ${written} rows.`);
  } catch (error: unknown) {
    // Recorded on the source row so a failed run is visible in the app, not only in this terminal.
    await recordIndexRun(
      THSC_SOURCE_SLUG,
      error instanceof Error ? error.message.slice(0, 500) : "Unknown failure",
    ).catch(() => undefined);
    throw error;
  }
}

await main();
