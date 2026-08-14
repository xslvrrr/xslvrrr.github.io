-- Past papers: compute the browser's filter lists in the database.
--
-- `loadFacets` used to select every row and fold it in TypeScript. PostgREST caps a select at
-- 1,000 rows and says nothing about it, and `.limit(20_000)` cannot raise a server-side ceiling —
-- so the filter row described the first thousand rows of a 12,648-row catalogue: 7 subjects out
-- of 106, 59 schools out of 574. Aggregating here returns the whole catalogue in one row and
-- moves the counting to where the data already is.

create or replace function public.past_paper_facets(p_year_level text default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with scoped as (
    select subject, subject_slug, school, year
    from public.past_papers
    where p_year_level is null or year_level = p_year_level
  ),
  subjects as (
    select
      subject_slug as slug,
      -- One slug can carry more than one display name across sources; the commonest wins.
      mode() within group (order by subject) as label,
      count(*) as count
    from scoped
    group by subject_slug
  )
  select jsonb_build_object(
    'subjects', coalesce(
      (select jsonb_agg(jsonb_build_object('slug', slug, 'label', label, 'count', count)
                        order by label)
       from subjects),
      '[]'::jsonb),
    'schools', coalesce(
      (select jsonb_agg(distinct school order by school)
       from scoped where school is not null),
      '[]'::jsonb),
    'years', coalesce(
      (select jsonb_agg(distinct year order by year)
       from scoped where year is not null),
      '[]'::jsonb)
  );
$$;

comment on function public.past_paper_facets(text) is
  'Filter lists for the past papers browser. Aggregated server-side because a plain select is '
  'capped at 1,000 rows, which silently reduced the filters to a fraction of the catalogue.';

-- Read through the service-role client only, exactly like the table it reads.
revoke all on function public.past_paper_facets(text) from public, anon, authenticated;
