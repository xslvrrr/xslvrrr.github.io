import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { AttendanceData, FullTimetable, TimetableEntry } from '../types/portal';

type Homepage = {
  todayTimetable: { date: string; entries: TimetableEntry[] };
  attendance: AttendanceData;
};
type Snapshot = Homepage & {
  liveAttendanceOnly?: true;
  timetable?: FullTimetable;
  timetableReferences?: Array<{ date: string; timetable: FullTimetable }>;
  syncMeta: {
    complete: boolean;
    degraded: boolean;
    pageCount: number;
    succeededPages: number;
    failedPages: Array<{ section: string }>;
    sections: Record<string, { requested: number; succeeded: number; failed: number }>;
  };
};
type FetchPage = ((url: string) => Promise<string>) & { lastServerDate?: string };
type Page = { url: string; type: string; date?: string };
type Scraper = {
  scrapeHomepage: (doc: Document, now?: string) => Homepage;
  scrapeAttendance: (doc: Document) => AttendanceData;
  scrapePortalSnapshot: (options: Record<string, unknown>) => Promise<Snapshot>;
  buildPortalPages: (uid: string, now: string, options: Record<string, unknown>) => Page[];
};
const sandbox: { MillenniumPortalScraper?: Scraper; URL: typeof URL; Date: typeof Date; setTimeout: typeof setTimeout } = {
  URL, Date, setTimeout,
};
runInNewContext(readFileSync(new URL('./portal-scraper.js', import.meta.url), 'utf8'), sandbox);
const scraper = sandbox.MillenniumPortalScraper!;
const parseHtml = (html: string): Document => new JSDOM(html, { url: 'https://millennium.education/portal/' }).window.document;
const now = '2026-09-07T14:30:00Z'; // Tuesday in Sydney, Monday in UTC.
const homeUrl = 'https://millennium.education/portal/';
const identity = '<table><tr><td><b>School: Student</b><a href="timetable.asp?uid=42">Timetable</a></td></tr></table>';
const lesson = (period = 'P1', color = '#3fb319', subject = '12ENG1') =>
  `<tr><td>${period}</td><td>A12</td><td>${subject}</td><td>Ms Teacher</td><td><span style="background-color:${color}">&nbsp;</span></td></tr>`;
const home = (rows = lesson()) => `${identity}<div class="jdash-body"><table>${rows}</table></div>`;
const quietOptions = {
  includeNotices: false, includeGrades: false, includeAttendance: false,
  includeReports: false, includeClasses: false, includeCalendar: false,
};
const timetable = (course: string) => `<table class="contentSM">
  <tr><td>Week A</td></tr><tr><td>Tuesday</td></tr>
  <tr><td></td><td>P1</td><td>${course}</td><td>12ENG1</td><td>Ms Teacher</td><td>A12</td></tr>
  <tr><td>Week B</td></tr><tr><td>Wednesday</td></tr>
  <tr><td></td><td>P2b</td><td>${course}</td><td>12ENG1</td><td>Ms Teacher</td><td>B12</td></tr>
</table>`;
const attendancePage = `<table class="table1sm">
  <tr><td>Day</td><td>Date</td><td>Periods</td></tr>
  <tr><td>Tuesday</td><td>8/9/2026</td><td>
    <span title="P1: 12ENG1" style="background-color:#f04040"></span>
    <span title="P4: 12MAT1" style="background-color:#20e020"></span>
  </td></tr>
  <tr><td>Monday</td><td>7/9/2026</td><td><span title="P1: 12ENG1" style="background-color:#f02020"></span></td></tr>
</table>`;

describe('homepage timetable and attendance', () => {
  it('reads only dashboard lesson rows, preserving split periods and unmarked lessons', () => {
    const doc = parseHtml(`${identity}<table>${lesson('P9')}</table>
      <div class="jdash-body"><table><tr><td><table>
        <tr><th>Period</th><th>Room</th><th>Class</th><th>Teacher</th><th>Attendance</th></tr>
        ${lesson()}${lesson('P2a', 'rgb(240, 32, 32)')}${lesson('P2b', '')}
        <tr><td>P3</td><td>B10</td><td>12MAT1</td><td><span style="color:#b60c0c">Mr Other</span></td></tr>
        <tr><td>Total</td><td>10</td><td>Other dashboard table</td><td>20</td></tr>
        ${lesson('P8', '', '')}
      </table></td></tr></table></div>`);
    const result = scraper.scrapeHomepage(doc, now);
    expect(result.todayTimetable).toEqual({
      date: '2026-09-08', entries: [
        { period: 'P1', room: 'A12', subject: '12ENG1', teacher: 'Ms Teacher', attendanceStatus: 'present' },
        { period: 'P2a', room: 'A12', subject: '12ENG1', teacher: 'Ms Teacher', attendanceStatus: 'absent' },
        { period: 'P2b', room: 'A12', subject: '12ENG1', teacher: 'Ms Teacher', attendanceStatus: 'unmarked' },
        { period: 'P3', room: 'B10', subject: '12MAT1', teacher: 'Mr Other', attendanceStatus: 'absent' },
      ],
    });
    expect(result.attendance.recentPeriods).toEqual([{
      date: '2026-09-08', day: 'Tuesday', periods: [
        { label: 'P1', classCode: '12ENG1', status: 'present' },
        { label: 'P2a', classCode: '12ENG1', status: 'absent' },
        { label: 'P2b', classCode: '12ENG1', status: 'unmarked' },
        { label: 'P3', classCode: '12MAT1', status: 'absent' },
      ],
    }]);
  });

  it.each([
    ['#f02020', 'absent'], ['rgb(240, 32, 32)', 'absent'], ['#b60c0c', 'absent'],
    ['#3fb319', 'present'], ['#20e020', 'present'], ['#f04040', 'absent'],
    ['#4080f0', 'approved'], ['#f0a020', 'sick'], ['#eeeeee', 'unmarked'],
  ])('recognizes attendance color %s on both pages', (color, status) => {
    const doc = parseHtml(`<table class="table1sm"><tr><td>Date Periods</td></tr>
      <tr><td>Tuesday</td><td>8/9/2026</td><td><span title="P2a: 12ENG1: Detail" style="background-color:${color}"></span></td></tr></table>`);
    expect(scraper.scrapeAttendance(doc).recentPeriods?.[0].periods[0]).toEqual({
      label: 'P2a', classCode: '12ENG1', reason: 'Detail', status,
    });
    expect(scraper.scrapeHomepage(parseHtml(home(lesson('P2a', color))), now).attendance.recentPeriods?.[0].periods[0].status).toBe(status);
  });

  it.each([
    ['2026-01-01T13:30:00Z', '2026-01-02', 'Friday'],
    ['2026-07-01T13:30:00Z', '2026-07-01', 'Wednesday'],
    ['2026-10-04T13:30:00Z', '2026-10-05', 'Monday'],
  ])('uses Sydney civil dates across daylight saving: %s', (instant, date, day) => {
    const result = scraper.scrapeHomepage(parseHtml(home()), instant);
    expect(result.todayTimetable.date).toBe(date);
    expect(result.attendance.recentPeriods?.[0].day).toBe(day);
  });
});

describe('snapshot live homepage', () => {
  it('fetches exactly one current homepage despite historical HTML, portalDate and full-sync options', async () => {
    const fetchPage = vi.fn(async () => home());
    const result = await scraper.scrapePortalSnapshot({
      fetchPage, parseHtml, now, liveAttendanceOnly: true, portalDate: '2025-02-03',
      homeHtml: home(lesson('P9')), ultraRun: { startYear: 2021, endYear: 2026 },
      includeAttendance: false, includeTimetable: false,
    });
    expect(fetchPage.mock.calls).toEqual([[homeUrl]]);
    expect(result.liveAttendanceOnly).toBe(true);
    expect(result.todayTimetable.date).toBe('2026-09-08');
    expect(result.todayTimetable.entries[0].period).toBe('P1');
    expect(result.attendance.recentPeriods?.[0].periods[0]).toEqual({ label: 'P1', status: 'present', classCode: '12ENG1' });
    for (const key of ['timetable', 'timetableReferences', 'account', 'notices', 'grades', 'reports', 'calendar', 'classes']) {
      expect(result).not.toHaveProperty(key);
    }
    expect(result.syncMeta).toMatchObject({ complete: true, pageCount: 1, succeededPages: 1 });
  });

  it('takes the server date updated by the homepage request, with options.now taking precedence', async () => {
    const fetchPage: FetchPage = async () => {
      fetchPage.lastServerDate = 'Mon, 07 Sep 2026 14:30:00 GMT';
      return home();
    };
    fetchPage.lastServerDate = 'Sun, 06 Sep 2026 00:00:00 GMT';
    const options = { fetchPage, parseHtml, liveAttendanceOnly: true };
    expect((await scraper.scrapePortalSnapshot(options)).todayTimetable.date).toBe('2026-09-08');
    expect((await scraper.scrapePortalSnapshot({ ...options, now: '2026-01-01T13:30:00Z' })).todayTimetable.date).toBe('2026-01-02');
  });

  it('returns an explicitly marked, valid empty live snapshot without fabricating attendance', async () => {
    const fetchPage = vi.fn(async () => home(''));
    const result = await scraper.scrapePortalSnapshot({ fetchPage, parseHtml, now, liveAttendanceOnly: true });
    expect(result.liveAttendanceOnly).toBe(true);
    expect(result.todayTimetable).toEqual({ date: '2026-09-08', entries: [] });
    expect(result.attendance.recentPeriods).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('rejects a login page even when stale supplied HTML contains an authenticated user', async () => {
    await expect(scraper.scrapePortalSnapshot({
      fetchPage: async () => '<form>Login</form>', parseHtml, now,
      liveAttendanceOnly: true, homeHtml: home(),
    })).rejects.toThrow('UID not found');
  });
});

describe('full snapshots and timetable references', () => {
  it('keeps the selected main timetable and three current references separate, and overlays live attendance', async () => {
    const requested: string[] = [];
    const fetchPage = async (url: string) => {
      requested.push(url);
      const target = new URL(url);
      if (target.pathname === '/portal/') return home();
      if (target.pathname.endsWith('attendance.asp')) return attendancePage;
      if (target.pathname.endsWith('timetable.asp')) return timetable(target.searchParams.get('date')!);
      return '';
    };
    const result = await scraper.scrapePortalSnapshot({
      ...quietOptions, includeAttendance: true, fetchPage, parseHtml, now,
      portalDate: '2025-02-03', homeHtml: home(lesson('P9', '#f02020')),
    });
    expect(requested.filter((url) => new URL(url).pathname === '/portal/')).toEqual([homeUrl]);
    expect(result.todayTimetable.entries[0].period).toBe('P1');
    expect(result.timetable?.weekA[0].course).toBe('3 FEB 2025');
    expect(result.timetableReferences?.map((reference) => [reference.date, reference.timetable.weekA[0].course, reference.timetable.weekB[0].period])).toEqual([
      ['2026-09-08', '8 SEP 2026', 'P2b'], ['2026-09-15', '15 SEP 2026', 'P2b'], ['2026-09-22', '22 SEP 2026', 'P2b'],
    ]);
    expect(result.attendance.recentPeriods).toEqual([
      { date: '2026-09-08', day: 'Tuesday', periods: [
        { label: 'P1', classCode: '12ENG1', reason: '', status: 'present' },
        { label: 'P4', classCode: '12MAT1', reason: '', status: 'present' },
      ] },
      { date: '7/9/2026', day: 'Monday', periods: [{ label: 'P1', classCode: '12ENG1', reason: '', status: 'absent' }] },
    ]);
    expect(result.syncMeta.pageCount).toBe(requested.length);
    expect(result.liveAttendanceOnly).toBeUndefined();
  });

  it('preserves login homepage reuse when no historical date is selected', async () => {
    const fetchPage = vi.fn(async () => '');
    const result = await scraper.scrapePortalSnapshot({
      ...quietOptions, includeTimetable: false, fetchPage, parseHtml, now, homeHtml: home(),
    });
    expect(fetchPage.mock.calls).toEqual([['https://millennium.education/portal/modify.asp']]);
    expect(result.todayTimetable.entries).toHaveLength(1);
    expect(result.attendance.recentPeriods).toHaveLength(1);
    expect(result.timetableReferences).toEqual([]);
  });

  it.each(['8/9/26', '08/09/2026', '8 SEP 2026', '2026-09-08'])(
    'merges register date %s and numeric period labels without erasing marked attendance', async (date) => {
      const fetchPage = async (url: string) => url === homeUrl
        ? home(lesson('P1', ''))
        : url.includes('attendance.asp')
          ? attendancePage.replace('8/9/2026', date).replace('title="P1: 12ENG1"', 'title="1: 12ENG1"')
          : '';
      const result = await scraper.scrapePortalSnapshot({
        ...quietOptions, includeTimetable: false, includeAttendance: true, fetchPage, parseHtml, now,
      });
      expect(result.todayTimetable.entries[0].attendanceStatus).toBe('unmarked');
      expect(result.attendance.recentPeriods).toHaveLength(2);
      expect(result.attendance.recentPeriods?.[0]).toMatchObject({
        date: '2026-09-08', periods: [
          { label: '1', classCode: '12ENG1', status: 'absent' },
          { label: 'P4', classCode: '12MAT1', status: 'present' },
        ],
      });
    },
  );

  it('uses civil +7/+14 dates through DST and year boundaries, respecting disabled timetable and live modes', () => {
    const dates = (instant: string) => scraper.buildPortalPages('42', instant, quietOptions)
      .filter((page) => page.type === 'timetableReferences').map((page) => [page.date, new URL(page.url).searchParams.get('date')]);
    expect(dates('2026-09-27T14:30:00Z')).toEqual([
      ['2026-09-28', '28 SEP 2026'], ['2026-10-05', '5 OCT 2026'], ['2026-10-12', '12 OCT 2026'],
    ]);
    expect(dates('2026-12-28T14:30:00Z')).toEqual([
      ['2026-12-29', '29 DEC 2026'], ['2027-01-05', '5 JAN 2027'], ['2027-01-12', '12 JAN 2027'],
    ]);
    expect(scraper.buildPortalPages('42', now, { ...quietOptions, includeTimetable: false }).some((page) => page.type.startsWith('timetable'))).toBe(false);
    expect(scraper.buildPortalPages('42', now, { liveAttendanceOnly: true })).toEqual([]);
    expect(scraper.buildPortalPages('42', now, { ...quietOptions, includeTimetableReferences: false })
      .some((page) => page.type === 'timetableReferences')).toBe(false);
    expect(scraper.buildPortalPages('42', now, { ...quietOptions, ultraRun: { startYear: 2025, endYear: 2026 } })
      .some((page) => page.type === 'timetableReferences')).toBe(false);
  });

  it('keeps a failed reference out of the degraded verdict while still recording it', async () => {
    const fetchPage = async (url: string) => {
      const target = new URL(url);
      if (target.pathname === '/portal/') return home();
      if (!target.pathname.endsWith('timetable.asp')) return '';
      const date = target.searchParams.get('date');
      if (date === '15 SEP 2026') throw new Error('HTTP 503');
      if (date === '8 SEP 2026') await new Promise((resolve) => setTimeout(resolve, 15));
      return timetable(date || 'Main');
    };
    const result = await scraper.scrapePortalSnapshot({ ...quietOptions, fetchPage, parseHtml, now, pageRetries: 0 });
    expect(result.timetable?.weekA[0].course).toBe('Main');
    expect(result.timetableReferences?.map((reference) => reference.date)).toEqual(['2026-09-08', '2026-09-22']);
    // A reference answers a question about today's lesson rather than carrying data the dashboard
    // renders, so losing one leaves the answer unconfirmed instead of degrading the whole sync.
    expect(result.syncMeta).toMatchObject({ complete: true, degraded: false, failedPages: [] });
    expect(result.syncMeta.sections.timetableReferences).toMatchObject({ requested: 3, succeeded: 2, failed: 1 });
  });
});
