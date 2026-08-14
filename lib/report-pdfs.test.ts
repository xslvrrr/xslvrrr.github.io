import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Report } from '../types/portal';

const mocks = vi.hoisted(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) }));

vi.mock('./supabase', () => ({
  supabaseAdmin: {
    storage: { from: () => ({ upload: mocks.upload }) },
  },
}));

import { persistReportPdfs } from './report-pdfs';

const report: Report = {
  title: 'Semester report',
  url: 'https://millennium.education/portal/reports/semester.pdf',
  yearLevel: 'Year 11',
  semester: 1,
  calendarYear: 2026,
};

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.upload.mockClear();
});

describe('persistReportPdfs', () => {
  it('reuses an already persisted report without downloading or uploading it again', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const existing: Report = {
      ...report,
      id: '8bb4e384d59fac8ad93fea330702f018',
      storagePath: 'user-1/8bb4e384d59fac8ad93fea330702f018.pdf',
      checksum: 'existing-checksum',
      downloadedAt: '2026-07-01T00:00:00.000Z',
      byteSize: 1024,
    };

    const result = await persistReportPdfs('user-1', [existing], ['session=secret'], undefined, [existing]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(result).toEqual({ reports: [existing], warnings: [] });
  });

  it('derives storage identifiers instead of trusting report-provided paths', async () => {
    const pdf = new Blob(['%PDF-test'], { type: 'application/pdf' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(pdf, { status: 200 })));
    const malicious = { ...report, id: '../../escape' };

    const result = await persistReportPdfs('user-1', [malicious], ['session=secret']);

    expect(result.reports[0]?.id).toMatch(/^[a-f0-9]{32}$/);
    expect(result.reports[0]?.storagePath).toMatch(/^user-1\/[a-f0-9]{32}\.pdf$/);
    expect(mocks.upload).toHaveBeenCalledWith(
      'user-1/8bb4e384d59fac8ad93fea330702f018.pdf',
      expect.any(Buffer),
      expect.any(Object),
    );
  });

  it('rejects a cross-origin report URL before sending portal cookies', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const untrustedReport = {
      ...report,
      url: 'https://attacker.example/collect.pdf',
    };

    const result = await persistReportPdfs('user-1', [untrustedReport], ['session=secret']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.reports).toHaveLength(1);
    expect(result.warnings[0]).toContain('Report URL is not an approved Millennium portal URL');
  });
});
