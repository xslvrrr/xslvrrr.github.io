-- Past papers: sortable difficulty, and provenance for a paper's mark total.
--
-- Two problems, one migration.
--
-- Sorting. Every browse query was ordered `year desc` in SQL and then re-sorted in memory over
-- whatever slice came back. That works for "newest first" and for nothing else: "hardest first"
-- could only rank the newest few hundred papers, so it appeared to do almost nothing. Difficulty
-- lives in a jsonb band, which is not orderable, so it gets a stored generated column and an index
-- and the ordering moves into SQL where it can see the whole catalogue.
--
-- Marks. `total_marks` carried no record of where the number came from, exactly the failure
-- `duration_source` exists to prevent for timing. A mark total read off the paper and one taken
-- from the course's official total look identical in the UI, and a student pacing against marks
-- deserves to know which they are looking at.

alter table public.past_papers
  add column if not exists marks_source text not null default 'unknown';

alter table public.past_papers
  drop constraint if exists past_papers_marks_source_check;

alter table public.past_papers
  add constraint past_papers_marks_source_check
  check (marks_source in ('document', 'title', 'subject-default', 'unknown'));

-- Unrated papers rank as 'solid' so they sort to the middle rather than masquerading as the
-- easiest thing available. Filtering by band is done against `difficulty is not null` alongside
-- this column, so an unrated paper is still never returned as a match for a band.
alter table public.past_papers drop column if exists difficulty_rank;

alter table public.past_papers
  add column difficulty_rank smallint generated always as (
    case difficulty ->> 'band'
      when 'gentle' then 0
      when 'standard' then 1
      when 'solid' then 2
      when 'hard' then 3
      when 'brutal' then 4
      else 2
    end
  ) stored;

create index if not exists past_papers_difficulty_rank_idx
  on public.past_papers (difficulty_rank, year desc nulls last, id);

-- School ordering pages through the whole catalogue now, so the existing partial index (school is
-- not null) no longer covers it; papers with no school sort last and still need a path.
create index if not exists past_papers_school_order_idx
  on public.past_papers (school nulls last, year desc nulls last, id);

-- Backfill, mirroring `parseTotalMarks` and `marksForSubject` exactly.
--
-- Rows already indexed carry no total, and waiting for the next index run would leave every card
-- reading "Marks: not stated" until then. Only rows with nothing recorded are touched, so a total
-- read off a paper's own cover page is never overwritten by this.

-- A total the source stated in its own title. Bounded at both ends for the same reason the
-- TypeScript is: a single-figure match is a question allocation, a four-figure one is a view number
-- that happened to sit beside the word.
--
-- Both word boundaries are load-bearing. Without the trailing `\M`, "2010 Marking Guidelines"
-- matches as "010 Mark" and stamps a ten-mark total on every marking guidelines row in the
-- catalogue; without the leading `\m`, "2019 marks" reads as nineteen.
update public.past_papers
set total_marks = substring(title from '\m(\d{1,3})\s*[Mm]arks?\M')::int,
    marks_source = 'title'
where total_marks is null
  and title ~ '\m\d{1,3}\s*[Mm]arks?\M'
  and substring(title from '\m(\d{1,3})\s*[Mm]arks?\M')::int between 10 and 200;

-- The course's official total, for senior exam papers only. A marking guidelines document has no
-- total of its own, and a junior task is not written to an HSC prescription.
update public.past_papers as papers
set total_marks = totals.marks,
    marks_source = 'subject-default'
from (values
  ('agriculture', 100), ('ancient-history', 100), ('biology', 100), ('business-studies', 100),
  ('chemistry', 100), ('earth-and-environmental-science', 100), ('economics', 100),
  ('engineering-studies', 100), ('investigating-science', 100), ('legal-studies', 100),
  ('modern-history', 100), ('pdhpe', 100), ('physics', 100), ('software', 100),
  ('software-engineering', 100), ('ipt', 100), ('maths-advanced', 100), ('maths-ext-1', 70),
  ('maths-ext-2', 100), ('maths-standard', 100)
) as totals(subject_slug, marks)
where papers.total_marks is null
  and papers.subject_slug = totals.subject_slug
  and papers.document_kind = 'paper'
  and papers.year_level in ('yr11', 'yr12');

-- The only writer of `total_marks` before this release was the cover-page reader that runs on
-- download, so a row that already carried a total came from the document itself.
update public.past_papers
set marks_source = 'document'
where total_marks is not null and marks_source = 'unknown';
