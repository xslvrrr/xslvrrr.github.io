import type { Report } from '@/types/portal';

/**
 * How a report is named everywhere it is shown or downloaded.
 *
 * The portal gives every report a title of its own ("Year 11 Semester 1 Report 2025"), so that is
 * what the student sees. Reports were previously labelled from the parsed year and semester, which
 * read as "Semester 0 Report" whenever the portal's link text did not match the expected shape, and
 * the stored PDF was served under its database id.
 */
export function reportDisplayName(report: Pick<Report, 'title' | 'yearLevel' | 'semester' | 'calendarYear'>): string {
  const title = report.title?.trim();
  if (title) return title;

  const composed = [
    report.yearLevel?.trim(),
    report.semester > 0 ? `Semester ${report.semester}` : '',
    report.calendarYear > 0 ? String(report.calendarYear) : '',
  ].filter(Boolean).join(' ');

  return composed ? `${composed} Report` : 'Report';
}

/**
 * The same name, reduced to what a `Content-Disposition` filename and every desktop filesystem
 * accept. Quotes and path separators are the parts that matter; the rest is tidiness.
 */
export function reportFileName(report: Pick<Report, 'title' | 'yearLevel' | 'semester' | 'calendarYear'>): string {
  const safe = reportDisplayName(report)
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return `${safe || 'Report'}.pdf`;
}
