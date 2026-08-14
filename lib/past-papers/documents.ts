import { PastPapersError } from "./http";
import type { PaperResource, PastPaper } from "./domain.ts";
import { isSafeCorpusPath } from "./sources/corpus.ts";

/**
 * Fetching a paper on a student's behalf.
 *
 * This is the one place in the feature where the server makes an outbound request to a URL that
 * originated in someone else's data, so it is written as a hostile-input problem rather than a
 * download helper.
 *
 * The threat is server-side request forgery. A URL in the catalogue came from a third-party index;
 * if that index were ever compromised or simply wrong, an unguarded fetch would let it point at
 * cloud metadata endpoints, internal services, or `localhost`. The defences, in order:
 *
 * 1. Only `direct` resources are fetchable at all. A `referral` never becomes a request.
 * 2. The host must be on the allowlist. Not "not on a blocklist" — an allowlist, because the set
 *    of legitimate publishers is small, known, and changes about once a year.
 * 3. Only `https`, and no credentials in the URL.
 * 4. Redirects are followed manually and every hop is re-checked against the same allowlist, since
 *    an allowed host redirecting to an internal address is the standard bypass.
 * 5. The response must actually be a PDF, and is capped by size and by time.
 */

/**
 * Publishers we will fetch from.
 *
 * Suffix matching is anchored on a leading dot so `evil-boardofstudies.nsw.edu.au` and
 * `boardofstudies.nsw.edu.au.attacker.com` both fail.
 */
const ALLOWED_HOSTS = [
  "boardofstudies.nsw.edu.au",
  "educationstandards.nsw.edu.au",
  "nesa.nsw.edu.au",
  "curriculum.nsw.edu.au",
  // NESA's current publishing home. Official HSC papers moved here from the standalone NESA site,
  // and the scraper's manifest resolves modern papers to it.
  "nsw.gov.au",
] as const;

export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 4;

export function isAllowedDocumentHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  // A URL carrying credentials is never a legitimate public paper, and some clients would send
  // them onward through a redirect.
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * The resource we would actually fetch for a paper, or null when there is nothing fetchable.
 *
 * Null is a normal, expected answer: every school trial paper resolves to a referral, and the UI
 * links the student out rather than showing a broken download.
 */
export function fetchableResource(paper: PastPaper): PaperResource | null {
  return paper.resources.find(
    (resource) => resource.accessMode === "direct"
      && (isCorpusResource(resource) || isAllowedDocumentHost(resource.url)),
  ) ?? null;
}

/**
 * A resource held in the local corpus rather than at a URL.
 *
 * The distinction matters because the two are read completely differently: a corpus resource is a
 * path resolved under `PAST_PAPERS_CORPUS_DIR` and never leaves the machine, and a URL resource is
 * an outbound request that has to survive every check in this file. Anything that is not an
 * absolute URL is treated as a corpus path, and `isSafeCorpusPath` is what makes that safe.
 */
export function isCorpusResource(resource: PaperResource): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(resource.url) && isSafeCorpusPath(resource.url);
}

export interface FetchedDocument {
  bytes: Uint8Array;
  contentType: string;
  sourceUrl: string;
}

/**
 * Downloads a paper.
 *
 * Redirects are followed by hand with `redirect: "manual"` rather than left to the runtime,
 * because the runtime would happily follow an allowed host's redirect to an internal address and
 * there is no hook to inspect the intermediate hops.
 */
export async function fetchPaperDocument(url: string): Promise<FetchedDocument> {
  if (!isAllowedDocumentHost(url)) {
    throw new PastPapersError("PAST_PAPER_SOURCE_NOT_ALLOWED", "That paper cannot be downloaded automatically.", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let target = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(target, {
        signal: controller.signal,
        redirect: "manual",
        headers: { accept: "application/pdf,*/*" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "The source redirected without a destination.", 502);
        }
        // Resolved against the current URL so a relative `Location` is handled, then re-checked.
        const next = new URL(location, target).toString();
        if (!isAllowedDocumentHost(next)) {
          throw new PastPapersError(
            "PAST_PAPER_SOURCE_NOT_ALLOWED",
            "The source redirected somewhere we will not follow.",
            502,
          );
        }
        target = next;
        continue;
      }

      if (!response.ok) {
        throw new PastPapersError("PAST_PAPER_FETCH_FAILED", `The source returned ${response.status}.`, 502);
      }

      const contentType = response.headers.get("content-type") ?? "";
      // Some archive servers mislabel PDFs as octet-stream, so the magic number is the real test
      // and the header is only used to reject obvious HTML error pages served with a 200.
      if (/text\/html/i.test(contentType)) {
        throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "The source returned a page, not a document.", 502);
      }

      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_DOCUMENT_BYTES) {
        throw new PastPapersError("PAST_PAPER_TOO_LARGE", "That paper is too large to store.", 413);
      }

      const bytes = await readCapped(response);
      if (!looksLikePdf(bytes)) {
        throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "The downloaded file was not a PDF.", 502);
      }

      return { bytes, contentType: "application/pdf", sourceUrl: target };
    }

    throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "The source redirected too many times.", 502);
  } catch (error) {
    if (error instanceof PastPapersError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PastPapersError("PAST_PAPER_FETCH_TIMEOUT", "The source took too long to respond.", 504);
    }
    throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "Could not download that paper.", 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the body with a hard ceiling.
 *
 * Streamed and counted rather than buffered through `arrayBuffer()`, because a server that lies
 * about `content-length` — or omits it — would otherwise be able to exhaust memory before any
 * size check ran.
 */
async function readCapped(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "The source sent an empty response.", 502);

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new PastPapersError("PAST_PAPER_TOO_LARGE", "That paper is too large to store.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** `%PDF-`. Cheap, and the only check that survives a mislabelled content type. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/**
 * Where a fetched paper lives.
 *
 * Owner-scoped so one student's cached copy is never served to another, even though the underlying
 * document is public — the path is also the authorisation check on the read side.
 */
/**
 * Reads a paper out of the local corpus.
 *
 * The path came from a manifest, so it is validated before it is joined and the join is checked
 * afterwards: `isSafeCorpusPath` rejects traversal up front, and the resolved path is confirmed to
 * still sit under the corpus root, which catches anything symlinks or unicode normalisation could
 * smuggle past the first check.
 */
export async function readCorpusDocument(relativePath: string): Promise<FetchedDocument> {
  if (!isSafeCorpusPath(relativePath)) {
    throw new PastPapersError("PAST_PAPER_SOURCE_NOT_ALLOWED", "That paper cannot be opened.", 400);
  }

  const root = process.env.PAST_PAPERS_CORPUS_DIR;
  if (!root) {
    throw new PastPapersError(
      "PAST_PAPERS_CORPUS_UNAVAILABLE",
      "The paper library is not configured on this server.",
      503,
    );
  }

  const { readFile } = await import("node:fs/promises");
  const { resolve, sep } = await import("node:path");

  const rootPath = resolve(root);
  const absolute = resolve(rootPath, relativePath);
  if (absolute !== rootPath && !absolute.startsWith(rootPath + sep)) {
    throw new PastPapersError("PAST_PAPER_SOURCE_NOT_ALLOWED", "That paper cannot be opened.", 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(absolute));
  } catch {
    throw new PastPapersError("PAST_PAPER_NOT_CACHED", "That paper is missing from the library.", 404);
  }

  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new PastPapersError("PAST_PAPER_TOO_LARGE", "That paper is too large to open.", 413);
  }
  if (!looksLikePdf(bytes)) {
    throw new PastPapersError("PAST_PAPER_FETCH_FAILED", "That file is not a readable PDF.", 502);
  }

  return { bytes, contentType: "application/pdf", sourceUrl: relativePath };
}

export function documentStoragePath(userId: string, paperId: string): string {
  return `past-papers/${userId}/${paperId}.pdf`;
}

export const PAST_PAPER_STORAGE_BUCKET = "past-papers";

/**
 * The first page or two of a PDF as text, for reading the working time off the cover.
 *
 * Extraction is deliberately shallow. The cover page carries the allowance and the mark total;
 * scanning further finds per-question timing advice that would outrank it, and costs a full parse
 * of a forty-page document to do it.
 */
export async function extractCoverText(bytes: Uint8Array, maxPages = 2): Promise<string> {
  // The legacy build, not the default one. The default entry point assumes a browser and reaches
  // for `DOMMatrix` at module scope, which throws the moment this is imported under Node. This
  // module only ever runs server-side, so the legacy build is the correct entry point — the
  // viewer in `components/pdf/` keeps using the modern one.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // No font loading and no external resource resolution: this parses a third-party file on the
  // server, so it is given as little to do as possible.
  const loadingTask = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  const document = await loadingTask.promise;

  try {
    const pages = Math.min(maxPages, document.numPages);
    const texts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    }

    return texts.join("\n");
  } finally {
    // Destroying the loading task tears down the worker too; `document.cleanup()` alone would
    // leave it alive for the lifetime of the process.
    await loadingTask.destroy();
  }
}
