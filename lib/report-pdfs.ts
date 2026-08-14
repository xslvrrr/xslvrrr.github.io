import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase';
import type { Report } from '../types/portal';
import { getApprovedReportUrl } from './report-urls';

const REPORT_BUCKET = 'report-pdfs';
const MAX_REPORT_BYTES = 30 * 1024 * 1024;
const REPORT_DOWNLOAD_TIMEOUT_MS = 30_000;

function reportId(report: Report): string {
  return createHash('sha256')
    .update([report.url, report.title, report.calendarYear, report.semester].join('::'))
    .digest('hex')
    .slice(0, 32);
}

async function downloadReport(report: Report, cookies: string[], signal?: AbortSignal): Promise<Buffer> {
  const url = getApprovedReportUrl(report.url);
  if (!url) throw new Error('Report URL is not an approved Millennium portal URL');
  const timeoutSignal = AbortSignal.timeout(REPORT_DOWNLOAD_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/pdf,*/*;q=0.8',
      Cookie: cookies.join('; '),
      Referer: 'https://millennium.education/portal/reports.asp',
    },
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });
  if (!response.ok) throw new Error(`Report download returned HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_REPORT_BYTES) throw new Error('Report PDF exceeds 30 MB limit');
  if (!response.body) throw new Error('Report download returned no body');

  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  let byteSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const bytes = Buffer.from(value);
    byteSize += bytes.length;
    if (byteSize > MAX_REPORT_BYTES) {
      await reader.cancel('Report PDF exceeds 30 MB limit');
      throw new Error('Report PDF exceeds 30 MB limit');
    }
    chunks.push(bytes);
  }

  const bytes = Buffer.concat(chunks, byteSize);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Report download did not return a PDF');
  return bytes;
}

export async function persistReportPdfs(
  userId: string,
  reports: Report[] | undefined,
  cookies: string[],
  signal?: AbortSignal,
  existingReports: Report[] = [],
): Promise<{ reports: Report[]; warnings: string[] }> {
  const warnings: string[] = [];
  const persisted: Report[] = [];
  const existingById = new Map(
    existingReports.flatMap((report) => {
      const url = getApprovedReportUrl(report.url);
      if (!url) return [];
      const normalized = { ...report, url };
      return [[reportId(normalized), normalized] as const];
    }),
  );

  for (const report of reports || []) {
    const url = getApprovedReportUrl(report.url);
    if (!url) {
      warnings.push(`${report.title}: Report URL is not an approved Millennium portal URL`);
      continue;
    }
    const normalizedReport = { ...report, url };
    const id = reportId(normalizedReport);
    const existing = existingById.get(id);
    if (existing?.storagePath && isOwnedReportPath(userId, existing.storagePath)) {
      persisted.push({ ...normalizedReport, ...existing, id });
      continue;
    }
    try {
      const bytes = await downloadReport(normalizedReport, cookies, signal);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const storagePath = `${userId}/${id}.pdf`;
      const { error } = await supabaseAdmin.storage.from(REPORT_BUCKET).upload(storagePath, bytes, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      });
      if (error) throw error;
      persisted.push({
        ...normalizedReport,
        id,
        storagePath,
        checksum,
        downloadedAt: new Date().toISOString(),
        byteSize: bytes.length,
      });
    } catch (error) {
      persisted.push({ ...normalizedReport, id });
      warnings.push(`${report.title}: ${error instanceof Error ? error.message : 'PDF download failed'}`);
    }
  }

  return { reports: persisted, warnings };
}

export function isOwnedReportPath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes('..');
}

export { REPORT_BUCKET };
