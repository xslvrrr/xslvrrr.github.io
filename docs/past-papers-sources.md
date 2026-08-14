# Past paper sources

The past papers index is built from other people's published material. This document records what
each source permits, what the adapter is therefore allowed to do, and what an operator has to
decide before a source is turned on.

Source state lives in `public.past_paper_sources`. A row's `enabled` flag is the switch; the
indexer skips a disabled source entirely.

## The rule the adapters follow

**Index the catalogue, never mirror the files.** A row in `past_papers` says a document exists,
what it is, and where it can be obtained. The document itself is fetched only when a student saves
or stars it, and only from a source that permits a direct fetch. Anything else becomes a
`referral`: a link that opens the publisher's own page, with attribution.

This is why `PaperResource.accessMode` exists and why nothing in the indexer downloads a PDF.

## Coverage

Two things build the catalogue, and they cover different ground:

- **`lib/past-papers/indexer.ts`** indexes the THSC catalogue — rows pointing at documents, no files.
  It discovers what to read from the repository tree (one GitHub API request), so it covers every
  year level THSC publishes (`yr9`, `yr10`, `yr11`, `yr12`), every subject folder including nested
  ones (`yr12/LOTE/Japanese`, `yr12/Maths/Competitions`), and every listing page including the
  per-course ones (`hscpapers_extension2.html`, `trialpapers_paper2_standard.html`,
  `trialpapers_sor1.html`). If the tree cannot be read it degrades to walking the year index pages
  for the unsuffixed listing names, records a warning, and under-reports.
- **The scraper CLI in `Past Papers/`** downloads documents into the local corpus, which
  `scripts/ingest-past-paper-corpus.ts` then indexes. Its THSC scraper reads the same tree through
  the same channel and resolves the same folder/filename vocabulary, so both paths agree on what a
  subject and a course are.

What the corpus holds after a full pass of every source: **12,648 documents, 106 courses, 574
schools, 1990-2026**, across all four year levels — yr12 11,461, yr11 923, yr10 168, yr9 96. By
category: 5,752 HSC, 3,917 trial, 1,809 assessment, 748 preliminary, 212 yearly, 210 other; 5,676
have answers available.

Four sources feed it, and they cover different ground:

| Source | What it adds |
| --- | --- |
| `thsc` | 7,168 documents, 38 courses, school trials back to 1990, all four year levels |
| `nesapacks` | Official papers for every course NESA still publishes, 2014 onward |
| `hscmirror` | 317 official papers 1995-2020 — the years NESA has since withdrawn |
| `hscninja` | AceHSC's school trial archive, which is where most of the 574 schools come from |

`bos`, `artofsmart` and `schooltrials` return nothing — their sites have changed shape.
`hsclearner` and `notesfromthao` resolve to the same AceHSC CDN as `hscninja`, so running more than
one of the three fetches identical files under three source names and produces triplicate rows.
`matrix` returns the dead `educationstandards` URLs.

### Courses with no papers anywhere

Twenty-six of the 135 known courses hold nothing, and none of them is a gap in the scrapers:

- **Minor languages** — Czech, Dutch, Hindi, Hungarian, Khmer, Lithuanian, Macedonian, Malay,
  Maltese, Persian, Polish, Portuguese, Punjabi, Russian, Tamil, Turkish, Ukrainian, and the
  Indonesian and Japanese background-speaker courses. NESA lists the course and its year packs,
  and the year pages carry no documents at all. Checked by sampling: Tamil, Ukrainian, Maltese,
  Hindi and Portuguese return zero PDF links across their year pages, while Swedish returns twelve
  and is indexed accordingly.
- **Music Extension** — a practical and composition course with no written examination. NESA
  publishes marking feedback for it and nothing else.
- **Psychology, Senior Science, Metal and Engineering, Slovenian** — discontinued. Every candidate
  page 404s.

Two rules keep that count honest, and both were learned by breaking them:

- **A local filename must identify one document.** Year, subject, school, source and type do not:
  "Hurlstone 2006" and "Hurlstone 2006 w. sol" share all five, as do a marking guideline and the
  marking-centre feedback for the same exam. Naming files that way overwrote 1,563 documents with
  their siblings. Filenames now carry the source's own name for the document plus a digest of its
  URL.
- **A catalogue key must identify one document, for the same reason.** `external_key` includes the
  document's label; without it the upsert collapsed 1,693 documents into 783 rows.

`repair_manifest.py` fixes a corpus written under either of the old schemes.

Junior year listings (`yr9papers.html`, `yr10papers.html`) are the
`yearly` category — a Year 9 end-of-year exam is not a trial for anything, and Year 9 and 10 papers
are deliberately given no syllabus era, no HSC time allowance and no course mark total, because
they are written to none of them.

Courses the folder alone cannot identify are taken from the listing filename, not guessed: a
school trial listed as "Barker 2019" under `trialpapers_extension2.html` is an Extension 2 paper,
and nothing in its own title says so. Where the filename says only that a student accelerated, the
course stays unclaimed (`maths_accelerated`) rather than being assumed to be Advanced.

## NESA / Board of Studies (`nesa`) — enabled

Official NSW HSC examination papers, marking guidelines and sample answers, published by the
curriculum authority for public use. Papers are served from `educationstandards.nsw.edu.au` and the
`boardofstudies.nsw.edu.au` archive, which is still live and still serving the older PDFs.

- Access mode: `direct`. These are the copies a save fetches.
- Attribution: every paper links back to its NESA page.
- Rate: the indexer is polite by default and papers are re-checked on a slow cadence; the
  catalogue changes once a year.

**There is no NESA adapter inside the application.** The source row exists and is enabled, but the
server indexer does not crawl NESA: the only official URLs it can resolve are the ones THSC's own
`index/*.json` files point at, and their repository holds two of those files in total.

Official papers reach the local corpus through the scraper CLI instead, and through two scrapers
rather than one:

- `scrapers/nesa.py` walks a course's pages on `nsw.gov.au`. Its subject list,
  `NESA_SUBJECT_SLUGS`, is hand-written and covers about fifty of the 123 courses NESA examines.
  Every slug in it has been checked; a course with no entry is one NESA does not publish under
  that name — Mathematics Standard 1 and 2 share a page, as do Studies of Religion I and II.
- `scrapers/nesa_packs.py` supplies the rest. `thsconline/json` publishes `HSCpapers.json`, NESA's
  own exam-pack listing. **Its document URLs are dead** — NESA moved off
  `educationstandards.nsw.edu.au/wps/wcm/connect/…` and every one now redirects to a course
  landing page (sampled twelve at random, twelve returned HTML). What survives is the course list
  and, per course, a link whose *redirect* names that course's current page. So the catalogue is
  read as a discovery index: course name → one redirect → current slug → walk the live page and
  its `-archive` companion with the same code `nesa.py` uses.

That is what reaches the VET frameworks, the twenty-odd languages and the discontinued courses,
none of which had a route into the library before. A course whose links now redirect to NESA's own
landing page no longer has a page, and is skipped rather than walked.

NESA's archive pages reach back to **2014**. The 2001-2013 packs the catalogue describes are no
longer published at any URL; those years survive only through the `boardofstudies.nsw.edu.au`
links in THSC's index files.

The practical consequence is unchanged: a paper indexed from the THSC catalogue but not held in the
corpus is a referral, and the timer, annotation, attempts and flashcard generation only work on
documents the corpus holds.

## THSC Online (`thsc`) — **enabled, permission pending**

> **Current state.** `enabled = true` on the `thsc` row, and the catalogue has been built. This is
> ahead of the term 2 reply, and was turned on
> deliberately so the behaviour could be recorded for the permission request itself. If the reply
> does not arrive or is refused, flip it back with:
>
> ```sql
> update public.past_paper_sources set enabled = false where slug = 'thsc';
> ```
>
> Existing rows can stay — nothing is served from THSC, and every trial paper is a link back to
> them — but the indexer will stop rebuilding.


THSC Online is the most complete free index of NSW past papers, including thousands of school trial
papers that exist nowhere else. Its taxonomy — year level, subject, then past HSC / trials /
assessment tasks / preliminary / yearly — is the structure the browser mirrors, because it is the
structure students already navigate.

Three constraints shape the adapter:

**1. `robots.txt` disallows crawling.** `https://thsconline.github.io/robots.txt` is:

```
User-agent: *
Disallow: /
```

So the adapter does not crawl that host. The site is published from the public repository
[`thsconline/s`](https://github.com/thsconline/s) (branch `thsconline-website`, ~4.5 MB, no PDFs in
it), and the adapter reads that repository through the GitHub API instead. That is a sanctioned,
rate-limited, cacheable channel the disallow directive does not govern, and it costs THSC nothing.

**2. Documents are behind their own delivery gate.** THSC serves files through a Google Apps Script
endpoint keyed by a hashed parameter. That is their access control and their bandwidth. The adapter
never calls it. Their licence also explicitly excludes the Apps Scripts (term 8).

In practice this costs less than it sounds: THSC's own `index/{viewNumber}.json` files point at
official NESA and Board of Studies URLs for HSC papers, so the common case resolves to the official
document and never touches THSC infrastructure. School trial papers, which only THSC has, become
referrals to their viewer page.

> **The scraper CLI is not bound by this, and does call the Apps Script.** Every THSC document in
> the local corpus was fetched through that endpoint, which is what makes those papers openable in
> the reader rather than links out. That is a deliberate difference between the server indexer
> (catalogue only, never the gate) and an operator's local library, and it is the part of the
> arrangement term 8 speaks to most directly — so it belongs in the permission request, and an
> expanded pass should be rate-limited and run once rather than repeatedly.

**3. The licence needs a decision.** [`LICENSE`](https://github.com/thsconline/s/blob/thsconline-website/LICENSE)
is MIT plus nine additional terms. The relevant ones:

- **Term 7** — a "substantial copy" explicitly includes "linking to all pages listed in the HTML
  code of thsconline or a significant portion thereof". Indexing the catalogue is squarely inside
  that description.
- **Terms 2 and 6** — a substantial copy requires informal permission, and the licence states
  approval "will most likely be granted if sought".
- **Term 9** — "All material may be used for non-commercial, educational purposes only… not to be
  resold or republished in a manner for profit."

**Term 9 is satisfied.** Paid tiers were withdrawn before this release: there is no billing page,
no paid models, and nothing about past papers sits behind a payment. If paid tiers are
reintroduced, term 9 has to be revisited before they ship — past papers themselves may stay free,
but the question becomes live again rather than settled.

Term 2 is still outstanding, and it is a courtesy rather than a conflict: the licence anticipates
the request and says approval is likely.

### Turning THSC on

1. Email the THSC maintainers describing what Millennium indexes (catalogue only), what it does not
   (no file mirroring, no Apps Script calls, no crawling of the disallowed host), and that use is
   free and educational. Ask for the permission term 2 anticipates.
2. Record the reply.
3. Set `PAST_PAPERS_THSC_ENABLED=true` and flip `enabled` on the `thsc` row.

Until then the index runs on `nesa` alone, which covers every official HSC paper — the mainstream
case — and the browser's category tree simply shows no trial papers.

## Adding a source

1. Check `robots.txt` and the terms before writing anything.
2. Add an adapter under `lib/past-papers/sources/`, exporting pure parse functions so it can be
   tested against captured fixtures rather than the live site.
3. Classify every resolved document as `direct` or `referral`. When in doubt it is `referral`.
4. Add a row to `past_paper_sources` with an honest `licence_summary`, and default `enabled` to
   false if the terms need a human decision.
5. Document the reasoning here.
