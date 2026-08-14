const MILLENNIUM_REPORT_ORIGIN = 'https://millennium.education'

export function getApprovedReportUrl(value: string): string | null {
  try {
    const url = new URL(value, `${MILLENNIUM_REPORT_ORIGIN}/portal/`)
    if (
      url.protocol !== 'https:'
      || url.origin !== MILLENNIUM_REPORT_ORIGIN
      || !url.pathname.startsWith('/portal/')
      || url.username
      || url.password
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}
