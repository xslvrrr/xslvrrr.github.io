-- Past papers: allow the junior "yearly exam" category.
--
-- THSC publishes Year 9 and Year 10 school papers under `yr9papers.html` / `yr10papers.html`.
-- They are end-of-year school exams, not trials for an external exam, and folding them into
-- `trial` would label a Year 9 yearly as HSC trial practice. Widening the check is enough: the
-- column is text and every existing row keeps its value.

alter table public.past_papers
  drop constraint if exists past_papers_category_check;

alter table public.past_papers
  add constraint past_papers_category_check
  check (category in ('hsc', 'trial', 'assessment', 'prelim', 'yearly', 'other'));
