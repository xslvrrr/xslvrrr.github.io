import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import puppeteer, { type Browser, type Cookie, type Page } from 'puppeteer-core';
import type { PortalSyncOptions } from './data-settings';
import { assertUsefulPortalSyncData } from './portal-data-integrity';
import portalScraperSource from './portal-scraper.js?raw';
import type { PortalAccount } from '../types/portal';

const LOGIN_URL = 'https://millennium.education/login.asp';
const PORTAL_URL = 'https://millennium.education/portal/';
const MODIFY_ACCOUNT_URL = 'https://millennium.education/portal/modify.asp';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const STUDENT_ACCOUNT = '2';
const SCHOOL = 'rhhs';
const PUPPETEER_HEADLESS = process.env.PUPPETEER_HEADLESS !== 'false';
const NORMAL_OPERATION_TIMEOUT_MS = 180_000;
const ULTRA_OPERATION_TIMEOUT_MS = 600_000;
const BROWSER_PROTOCOL_TIMEOUT_MS = 60_000;
const PORTAL_LOGIN_ATTEMPTS = 3;

export type PortalSyncTransport = 'http' | 'browser';
export type PortalSyncStage = 'login' | 'session' | 'scrape' | 'browser' | 'timeout';

export interface PortalSyncExecution {
  data: any;
  cookies: string[];
  portalUrl: string;
  transport: PortalSyncTransport;
  durationMs: number;
}

export type PortalAccountUpdate = Pick<
  PortalAccount,
  'email' | 'nesaStudentNumber' | 'usi' | 'mobile' | 'currentYear'
>;

export interface PortalAccountUpdateExecution {
  account: PortalAccount;
  cookies: string[];
  portalUrl: string;
}

export class PortalSyncError extends Error {
  readonly status: number;
  readonly code: string;
  readonly stage: PortalSyncStage;
  readonly retryable: boolean;

  constructor(message: string, options: {
    code: string;
    stage: PortalSyncStage;
    status?: number;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(message, { cause: options.cause });
    this.name = 'PortalSyncError';
    this.code = options.code;
    this.stage = options.stage;
    this.status = options.status ?? 502;
    this.retryable = options.retryable ?? false;
  }
}

export class PortalAuthError extends PortalSyncError {
  constructor(message = 'Millennium login expired or credentials were rejected', cause?: unknown) {
    super(message, { code: 'PORTAL_AUTH_REQUIRED', stage: 'login', status: 401, cause });
    this.name = 'PortalAuthError';
  }
}

type FetchPage = ((url: string) => Promise<string>) & { lastServerDate?: string | null };

interface PortalScraper {
  extractUserId(doc: Document): string | null;
  findAccountPageUrl(doc: Document): string;
  scrapeAccount(doc: Document): PortalAccount | null;
  scrapePortalSnapshot(options: Partial<PortalSyncOptions> & {
    fetchPage: FetchPage;
    parseHtml: (html: string) => Document;
    homeHtml?: string;
    concurrency?: number;
    pageRetries?: number;
    progress?: (progress: unknown) => void;
    now?: string;
  }): Promise<any>;
}

interface ScrapeRuntimeOptions {
  concurrency: number;
  pageRetries: number;
  pageTimeoutMs: number;
}

class CookieJar {
  private cookies = new Map<string, string>();

  constructor(cookies: string[] = []) {
    cookies.forEach((cookie) => this.setCookie(cookie));
  }

  toArray(): string[] {
    return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).slice(0, 32);
  }

  async text(
    url: string,
    init: RequestInit = {},
    redirects = 0,
    timeoutMs = 6_500,
    operationSignal?: AbortSignal,
  ): Promise<{ text: string; url: string; status: number; serverDate: string | null }> {
    const response = await this.fetch(url, init, redirects, timeoutMs, operationSignal);
    return {
      text: await response.text(),
      url: response.url || url,
      status: response.status,
      serverDate: response.headers.get('date'),
    };
  }

  private async fetch(
    url: string,
    init: RequestInit,
    redirects: number,
    timeoutMs: number,
    operationSignal?: AbortSignal,
  ): Promise<Response> {
    if (operationSignal?.aborted) throw operationSignal.reason;

    const headers = new Headers(init.headers);
    headers.set('User-Agent', headers.get('User-Agent') || USER_AGENT);
    headers.set('Accept', headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    headers.set('Accept-Language', headers.get('Accept-Language') || 'en-AU,en;q=0.9');

    const cookieHeader = this.toArray().join('; ');
    if (cookieHeader) headers.set('Cookie', cookieHeader);
    else headers.delete('Cookie');

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(operationSignal?.reason);
    operationSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Portal request timed out', 'TimeoutError')), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, redirect: 'manual', signal: controller.signal });
      this.storeFrom(response.headers);
    } finally {
      clearTimeout(timeoutId);
      operationSignal?.removeEventListener('abort', forwardAbort);
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirects >= 5) {
        throw new PortalSyncError('Millennium redirected too many times', {
          code: 'PORTAL_REDIRECT_LOOP', stage: 'login', retryable: false,
        });
      }
      const location = response.headers.get('location');
      if (!location) return response;

      const nextUrl = new URL(location, url).toString();
      const method = (init.method || 'GET').toUpperCase();
      const nextInit: RequestInit = { ...init, headers };
      if (method === 'POST' && [301, 302, 303].includes(response.status)) {
        nextInit.method = 'GET';
        delete nextInit.body;
        headers.delete('Content-Type');
      }
      headers.set('Referer', url);
      return this.fetch(nextUrl, nextInit, redirects + 1, timeoutMs, operationSignal);
    }

    return response;
  }

  private storeFrom(headers: Headers) {
    const getSetCookie = (headers as any).getSetCookie?.bind(headers);
    const values = typeof getSetCookie === 'function'
      ? getSetCookie()
      : splitSetCookie(headers.get('set-cookie') || '');
    values.forEach((cookie: string) => this.setCookie(cookie));
  }

  private setCookie(cookie: string) {
    const pair = cookie.split(';')[0]?.trim();
    const separator = pair?.indexOf('=') ?? -1;
    if (!pair || separator <= 0) return;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(name);
    else this.cookies.set(name, value);
  }
}

function splitSetCookie(value: string): string[] {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((cookie) => cookie.trim()).filter(Boolean);
}

let scraper: PortalScraper | null = null;

function getScraper(): PortalScraper {
  if (scraper) return scraper;
  const sandbox: any = { console, URL, Date, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  runInNewContext(portalScraperSource, sandbox, { filename: 'portal-scraper.js' });
  scraper = sandbox.MillenniumPortalScraper;
  if (!scraper?.scrapePortalSnapshot) throw new Error('Millennium portal scraper failed to load');
  return scraper;
}

function parseHtml(html: string): Document {
  return new JSDOM(html, { url: PORTAL_URL }).window.document;
}

function extractLoginCsrfToken(html: string): string {
  const input = parseHtml(html).querySelector('input[name="csrf_token"]') as HTMLInputElement | null;
  const token = input?.value.trim() || '';
  if (!token || token.length > 512 || /[\u0000-\u001f\u007f]/.test(token)) {
    throw new PortalSyncError('Millennium login form did not provide a valid security token', {
      code: 'PORTAL_LOGIN_CONTRACT_CHANGED',
      stage: 'login',
      status: 502,
      retryable: false,
    });
  }
  return token;
}

function isUltraRun(options?: PortalSyncOptions): boolean {
  return !!options?.ultraRun;
}

function getScrapeRuntimeOptions(options?: PortalSyncOptions): ScrapeRuntimeOptions {
  const configuredConcurrency = Number(process.env.PORTAL_SYNC_CONCURRENCY);
  const normalConcurrency = Number.isFinite(configuredConcurrency)
    ? Math.max(4, Math.min(16, Math.trunc(configuredConcurrency)))
    : 12;
  return isUltraRun(options)
    ? { concurrency: 8, pageRetries: 2, pageTimeoutMs: 10_000 }
    : { concurrency: normalConcurrency, pageRetries: 1, pageTimeoutMs: 6_500 };
}

function operationTimeoutMs(options?: PortalSyncOptions): number {
  return isUltraRun(options) ? ULTRA_OPERATION_TIMEOUT_MS : NORMAL_OPERATION_TIMEOUT_MS;
}

async function withOperationDeadline<T>(
  options: PortalSyncOptions | undefined,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = operationTimeoutMs(options);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new PortalSyncError(`Millennium sync exceeded ${Math.round(timeoutMs / 1000)} seconds`, {
        code: 'PORTAL_SYNC_TIMEOUT', stage: 'timeout', status: 504, retryable: true,
      });
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(controller.signal), deadline]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function retryDelayMs(attempt: number): number {
  const backoff = Math.min(1_500, 150 * (2 ** attempt));
  return backoff + Math.floor(Math.random() * 100);
}

function isRetryableFetchError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('abort')
    || message.includes('timeout')
    || message.includes('fetch failed')
    || message.includes('network')
    || /http (429|500|502|503|504)/.test(message);
}

function isAuthFailure(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes('uid not found')
    || message.includes('session unavailable')
    || message.includes('login expired')
    || message.includes('credentials were rejected');
}

function normalizePortalError(error: unknown, stage: PortalSyncStage): PortalSyncError {
  if (error instanceof PortalSyncError) return error;
  if (isAuthFailure(error)) return new PortalAuthError(undefined, error);
  const retryable = isRetryableFetchError(error);
  const message = retryable
    ? 'Millennium could not be reached reliably. Please retry shortly.'
    : 'Millennium sync failed while processing the portal response.';
  return new PortalSyncError(message, {
    code: retryable ? 'PORTAL_TRANSIENT_FAILURE' : 'PORTAL_SYNC_FAILURE',
    stage,
    status: retryable ? 503 : 502,
    retryable,
    cause: error,
  });
}

function assertUsefulPortalData(data: any) {
  if (!data?.user?.uid) throw new PortalAuthError('Millennium login expired or UID was not found');
  assertUsefulPortalSyncData(data, 'Millennium scrape returned no portal data; keeping the last known good data instead');
}

function assertCriticalSectionCoverage(data: any, options?: PortalSyncOptions) {
  const sections = data?.syncMeta?.sections || {};
  const required = [
    options?.includeTimetable !== false ? 'timetable' : null,
    options?.includeNotices !== false ? 'notices' : null,
    options?.includeGrades !== false ? 'grades' : null,
  ].filter(Boolean) as string[];
  const missing = required.filter((section) => sections[section]?.requested > 0 && sections[section]?.succeeded === 0);
  if (missing.length > 0) {
    throw new PortalSyncError(`Millennium did not return required ${missing.join(', ')} data`, {
      code: 'PORTAL_REQUIRED_SECTION_FAILED', stage: 'scrape', status: 503, retryable: true,
    });
  }
}

async function scrapeWithJar(
  jar: CookieJar,
  options: PortalSyncOptions | undefined,
  signal: AbortSignal,
  homeHtml?: string,
): Promise<any> {
  const runtime = getScrapeRuntimeOptions(options);
  const fetchPage: FetchPage = async (url: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= runtime.pageRetries; attempt += 1) {
      try {
        const response = await jar.text(url, { cache: 'no-store' }, 0, runtime.pageTimeoutMs, signal);
        fetchPage.lastServerDate = response.serverDate || fetchPage.lastServerDate;
        if (response.status >= 400) throw new Error(`Portal page returned HTTP ${response.status}`);
        return response.text;
      } catch (error) {
        lastError = error;
        if (attempt >= runtime.pageRetries || !isRetryableFetchError(error) || signal.aborted) break;
        await wait(retryDelayMs(attempt), signal);
      }
    }
    throw lastError || new Error('Portal page failed');
  };

  try {
    const data = await getScraper().scrapePortalSnapshot({
      ...(options || {}),
      concurrency: runtime.concurrency,
      pageRetries: 0,
      fetchPage,
      parseHtml,
      ...(homeHtml ? { homeHtml } : {}),
    });
    assertUsefulPortalData(data);
    assertCriticalSectionCoverage(data, options);
    return data;
  } catch (error) {
    throw normalizePortalError(error, 'scrape');
  }
}

async function scrapeWithPage(page: Page, options?: PortalSyncOptions): Promise<any> {
  const runtime = getScrapeRuntimeOptions(options);
  try {
    const hasScraper = await page.evaluate(() => typeof (window as any).MillenniumPortalScraper?.scrapePortalSnapshot === 'function');
    if (!hasScraper) await page.addScriptTag({ content: portalScraperSource });

    const data = await page.evaluate(async ({ scrapeOptions, runtime }) => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const retryDelay = (attempt: number) => Math.min(1_500, 150 * (2 ** attempt)) + Math.floor(Math.random() * 100);
      const isRetryable = (error: any) => {
        const message = String(error?.message || error || '').toLowerCase();
        return message.includes('abort') || message.includes('timeout') || message.includes('failed to fetch')
          || message.includes('network') || /http (429|500|502|503|504)/.test(message);
      };
      const fetchPage = async (targetUrl: string) => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt <= runtime.pageRetries; attempt += 1) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), runtime.pageTimeoutMs);
          try {
            const response = await fetch(targetUrl, { credentials: 'include', cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error(`Portal page returned HTTP ${response.status}`);
            (fetchPage as any).lastServerDate = response.headers.get('date') || (fetchPage as any).lastServerDate;
            return response.text();
          } catch (error) {
            lastError = error;
            if (attempt >= runtime.pageRetries || !isRetryable(error)) break;
            await delay(retryDelay(attempt));
          } finally {
            clearTimeout(timeoutId);
          }
        }
        throw lastError || new Error('Portal page failed');
      };

      return (window as any).MillenniumPortalScraper.scrapePortalSnapshot({
        ...(scrapeOptions || {}),
        concurrency: runtime.concurrency,
        pageRetries: 0,
        fetchPage,
        parseHtml: (html: string) => new DOMParser().parseFromString(html, 'text/html'),
      });
    }, { scrapeOptions: options || null, runtime });
    assertUsefulPortalData(data);
    assertCriticalSectionCoverage(data, options);
    return data;
  } catch (error) {
    throw normalizePortalError(error, 'browser');
  }
}

async function launchBrowserFallback(): Promise<Browser> {
  const disableSandbox = process.env.PUPPETEER_DISABLE_SANDBOX === 'true';
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (!executablePath) {
    throw new PortalSyncError('Browser compatibility fallback is enabled without a configured Chromium executable', {
      code: 'PORTAL_BROWSER_NOT_CONFIGURED',
      stage: 'browser',
      status: 503,
      retryable: false,
    });
  }
  return puppeteer.launch({
    headless: PUPPETEER_HEADLESS,
    executablePath,
    protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS,
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      ...(disableSandbox ? ['--disable-setuid-sandbox', '--no-sandbox'] : []),
    ],
  });
}

async function preparePage(page: Page, options?: PortalSyncOptions) {
  const timeout = isUltraRun(options) ? 30_000 : 8_000;
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  await page.setUserAgent(USER_AGENT);
  await page.setCacheEnabled(false);
}

async function blockHeavyResources(page: Page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const blocked = new Set(['font', 'image', 'media', 'stylesheet']);
    void (blocked.has(request.resourceType()) ? request.abort() : request.continue()).catch(() => {});
  });
}

async function prepareStudentAccount(page: Page) {
  await page.waitForSelector('form[action$="login.asp"]', { timeout: 5_000 });
  const selected = await page.$eval('form[action$="login.asp"]', (form) => {
    const accountInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="account"]'));
    accountInputs.forEach((input) => {
      input.disabled = input.value !== '2';
      if (input.value === '2' && input.type === 'radio') input.checked = true;
    });
    let studentAccount = accountInputs.find((input) => input.value === '2');
    if (!studentAccount) {
      studentAccount = document.createElement('input');
      studentAccount.type = 'hidden';
      studentAccount.name = 'account';
      studentAccount.value = '2';
      form.appendChild(studentAccount);
    }
    return !studentAccount.disabled && studentAccount.value === '2';
  });
  if (!selected) throw new Error('Student account option could not be selected');
}

async function clearAndType(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { timeout: 5_000 });
  await page.$eval(selector, (input) => { (input as HTMLInputElement).value = ''; });
  await page.type(selector, value);
}

async function getCookiePairs(page: Page): Promise<string[]> {
  const cookies = await page.cookies('https://millennium.education');
  return cookies.map((cookie: Cookie) => `${cookie.name}=${cookie.value}`).slice(0, 32);
}

async function setPortalCookiePairs(page: Page, cookies: string[]) {
  const cookieObjects = cookies.map((cookie) => {
    const separator = cookie.indexOf('=');
    return {
      name: separator > 0 ? cookie.slice(0, separator) : '',
      value: separator > 0 ? cookie.slice(separator + 1) : '',
      domain: 'millennium.education',
      path: '/',
    };
  }).filter((cookie) => cookie.name && cookie.value);
  if (cookieObjects.length > 0) await page.setCookie(...cookieObjects);
}

async function readPuppeteerAccount(page: Page): Promise<PortalAccount> {
  const hasScraper = await page.evaluate(() => typeof (window as any).MillenniumPortalScraper?.scrapeAccount === 'function');
  if (!hasScraper) await page.addScriptTag({ content: portalScraperSource });
  const account = await page.evaluate(() => (
    (window as any).MillenniumPortalScraper.scrapeAccount(document)
  ));
  if (!account) {
    throw new PortalSyncError('Millennium account details are currently unavailable.', {
      code: 'PORTAL_ACCOUNT_FORM_UNAVAILABLE',
      stage: 'browser',
      status: 502,
      retryable: true,
    });
  }
  return account as PortalAccount;
}

async function openPuppeteerAccountPage(
  page: Page,
  credentials?: { username: string; password: string },
) {
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  await ensureExpectedPortalPage(page, credentials);

  const hasScraper = await page.evaluate(() => typeof (window as any).MillenniumPortalScraper?.findAccountPageUrl === 'function');
  if (!hasScraper) await page.addScriptTag({ content: portalScraperSource });
  const discoveredUrl = await page.evaluate(() => (
    (window as any).MillenniumPortalScraper.findAccountPageUrl(document)
  )) as string;
  await page.goto(discoveredUrl || MODIFY_ACCOUNT_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  await page.waitForSelector('input[name="email1"]', { timeout: 8_000 });
}

function isExpectedPortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'millennium.education' && url.pathname.startsWith('/portal');
  } catch {
    return false;
  }
}

async function authenticatePuppeteerPage(page: Page, username: string, password: string) {
  if (!page.url().startsWith(LOGIN_URL)) {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 8_000 });
  }
  await prepareStudentAccount(page);
  await clearAndType(page, 'input[name="email"]', username);
  await clearAndType(page, 'input[name="password"]', password);
  await clearAndType(page, 'input[name="sitename"]', SCHOOL);

  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => null);
  await page.click('input[type="submit"]');
  await navigation;

  // Legacy login sometimes finishes server-side while returning its stale error page.
  // Reloading portal confirms that session instead of reporting a false login failure.
  if (!isExpectedPortalUrl(page.url())) {
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  }
  if (!isExpectedPortalUrl(page.url())) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10_000 });
  }
  if (!isExpectedPortalUrl(page.url())) throw new PortalAuthError();
}

async function ensureExpectedPortalPage(
  page: Page,
  credentials?: { username: string; password: string },
) {
  if (isExpectedPortalUrl(page.url())) return;
  if (!credentials) throw new PortalAuthError();
  await authenticatePuppeteerPage(page, credentials.username, credentials.password);
}

export async function updatePortalAccountWithPuppeteer(
  cookies: string[],
  update: PortalAccountUpdate,
  credentials?: { username: string; password: string },
): Promise<PortalAccountUpdateExecution> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowserFallback();
    const page = await browser.newPage();
    await preparePage(page);
    await blockHeavyResources(page);
    await setPortalCookiePairs(page, cookies);
    await openPuppeteerAccountPage(page, credentials);

    await clearAndType(page, 'input[name="email1"]', update.email);
    await clearAndType(page, 'input[name="bosID"]', update.nesaStudentNumber);
    await clearAndType(page, 'input[name="usi"]', update.usi);
    await clearAndType(page, 'input[name="mobile"]', update.mobile);
    const selectedYear = await page.select('select[name="y"]', update.currentYear);
    if (!selectedYear.includes(update.currentYear)) {
      throw new PortalSyncError('The selected school year is not available in Millennium.', {
        code: 'PORTAL_ACCOUNT_YEAR_UNAVAILABLE',
        stage: 'browser',
        status: 400,
        retryable: false,
      });
    }

    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => null);
    await page.click('form[action$="modify.asp"] input[type="submit"], form[name="form1"] input[type="submit"]');
    await navigation;

    await openPuppeteerAccountPage(page, credentials);
    const account = await readPuppeteerAccount(page);
    if (credentials?.username) account.username = credentials.username;
    return {
      account,
      cookies: await getCookiePairs(page),
      portalUrl: page.url(),
    };
  } catch (error) {
    throw normalizePortalError(error, 'browser');
  } finally {
    await browser?.close().catch(() => {});
  }
}

export async function readPortalAccountWithPuppeteer(
  cookies: string[],
  credentials?: { username: string; password: string },
): Promise<PortalAccountUpdateExecution> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowserFallback();
    const page = await browser.newPage();
    await preparePage(page);
    await blockHeavyResources(page);
    await setPortalCookiePairs(page, cookies);
    await openPuppeteerAccountPage(page, credentials);
    const account = await readPuppeteerAccount(page);
    if (credentials?.username) account.username = credentials.username;
    return {
      account,
      cookies: await getCookiePairs(page),
      portalUrl: page.url(),
    };
  } catch (error) {
    throw normalizePortalError(error, 'browser');
  } finally {
    await browser?.close().catch(() => {});
  }
}

interface HttpPortalAccountPage {
  account: PortalAccount;
  document: Document;
  url: string;
}

async function loadPortalAccountWithJar(
  jar: CookieJar,
  signal: AbortSignal,
  credentials?: { username: string; password: string },
): Promise<HttpPortalAccountPage> {
  let home = await jar.text(PORTAL_URL, { cache: 'no-store' }, 0, 6_500, signal);
  let homeDocument = parseHtml(home.text);
  if (!getScraper().extractUserId(homeDocument)) {
    if (!credentials) throw new PortalAuthError();
    const login = await authenticateCookieJar(jar, credentials.username, credentials.password, signal);
    home = login.url.includes('/portal')
      ? login
      : await jar.text(PORTAL_URL, { cache: 'no-store' }, 0, 6_500, signal);
    homeDocument = parseHtml(home.text);
  }
  if (!getScraper().extractUserId(homeDocument)) throw new PortalAuthError();

  const discoveredUrl = getScraper().findAccountPageUrl(homeDocument);
  const candidateUrls = Array.from(new Set([
    discoveredUrl,
    MODIFY_ACCOUNT_URL,
  ].filter(Boolean)));
  for (const url of candidateUrls) {
    const response = await jar.text(url, {
      cache: 'no-store',
      headers: { Referer: home.url || PORTAL_URL },
    }, 0, 6_500, signal);
    if (response.status >= 400) continue;
    const document = parseHtml(response.text);
    const account = getScraper().scrapeAccount(document);
    if (account) {
      if (credentials?.username) account.username = credentials.username;
      return { account, document, url: response.url || url };
    }
  }

  throw new PortalSyncError('Millennium account details are currently unavailable.', {
    code: 'PORTAL_ACCOUNT_FORM_UNAVAILABLE',
    stage: 'session',
    status: 502,
    retryable: true,
  });
}

async function runAccountHttpOperation(
  cookies: string[],
  credentials: { username: string; password: string } | undefined,
  update?: PortalAccountUpdate,
): Promise<PortalAccountUpdateExecution> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Portal account request timed out', 'TimeoutError'));
  }, 45_000);
  const jar = new CookieJar(cookies);

  try {
    const loaded = await loadPortalAccountWithJar(jar, controller.signal, credentials);
    if (update) {
      const form = loaded.document.querySelector('input[name="email1"]')?.closest('form')
        || loaded.document.querySelector('form[action*="modify.asp"], form[name="form1"]');
      if (!form) {
        throw new PortalSyncError('Millennium account form could not be submitted.', {
          code: 'PORTAL_ACCOUNT_FORM_UNAVAILABLE',
          stage: 'session',
          status: 502,
          retryable: true,
        });
      }

      const body = new URLSearchParams();
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
        .forEach((control) => {
          if (!control.name || control.disabled) return;
          if (control.tagName === 'INPUT') {
            const input = control as HTMLInputElement;
            if (['button', 'file', 'reset', 'submit'].includes(input.type)) return;
            if (['checkbox', 'radio'].includes(input.type) && !input.checked) return;
          }
          if (control.tagName === 'SELECT' && (control as HTMLSelectElement).multiple) {
            Array.from((control as HTMLSelectElement).selectedOptions)
              .forEach((option) => body.append(control.name, option.value));
            return;
          }
          body.append(control.name, control.value);
        });
      body.set('email1', update.email);
      body.set('bosID', update.nesaStudentNumber);
      body.set('usi', update.usi);
      body.set('mobile', update.mobile);
      body.set('y', update.currentYear);

      const action = new URL(form.getAttribute('action') || loaded.url, loaded.url).toString();
      const response = await jar.text(action, {
        method: (form.getAttribute('method') || 'post').toUpperCase(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: loaded.url,
        },
        body,
      }, 0, 8_000, controller.signal);
      if (response.status >= 400) {
        throw new PortalSyncError(`Millennium rejected the account update with HTTP ${response.status}.`, {
          code: 'PORTAL_ACCOUNT_UPDATE_FAILED',
          stage: 'session',
          status: 502,
          retryable: response.status >= 500,
        });
      }

      const verified = await loadPortalAccountWithJar(jar, controller.signal, credentials);
      const didPersist = verified.account.email === update.email
        && verified.account.nesaStudentNumber === update.nesaStudentNumber
        && verified.account.usi === update.usi
        && verified.account.mobile === update.mobile
        && verified.account.currentYear === update.currentYear;
      if (!didPersist) {
        throw new PortalSyncError('Millennium did not retain all updated account values.', {
          code: 'PORTAL_ACCOUNT_UPDATE_NOT_PERSISTED',
          stage: 'session',
          status: 502,
          retryable: true,
        });
      }
      return {
        account: verified.account,
        cookies: jar.toArray(),
        portalUrl: verified.url,
      };
    }

    return {
      account: loaded.account,
      cookies: jar.toArray(),
      portalUrl: loaded.url,
    };
  } catch (error) {
    throw normalizePortalError(error, 'session');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readPortalAccount(
  cookies: string[],
  credentials?: { username: string; password: string },
): Promise<PortalAccountUpdateExecution> {
  return runAccountHttpOperation(cookies, credentials);
}

export async function updatePortalAccount(
  cookies: string[],
  update: PortalAccountUpdate,
  credentials?: { username: string; password: string },
): Promise<PortalAccountUpdateExecution> {
  if (browserExecutableConfigured()) {
    try {
      return await updatePortalAccountWithPuppeteer(cookies, update, credentials);
    } catch {
      // Updating the same target values is idempotent. If the configured browser
      // cannot launch or complete the legacy form, keep the account action usable
      // through the authenticated HTTP session.
    }
  }
  return runAccountHttpOperation(cookies, credentials, update);
}

async function loginAndScrapeWithPuppeteer(
  username: string,
  password: string,
  options: PortalSyncOptions | undefined,
  signal: AbortSignal,
): Promise<PortalSyncExecution> {
  const startedAt = Date.now();
  let browser: Browser | null = null;
  const closeOnAbort = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    browser = await launchBrowserFallback();
    const page = await browser.newPage();
    await preparePage(page, options);
    await blockHeavyResources(page);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 8_000 });
    await authenticatePuppeteerPage(page, username, password);
    await ensureExpectedPortalPage(page, { username, password });

    const homeHtml = await page.content();
    const cookies = await getCookiePairs(page);
    const portalUrl = page.url().includes('/portal') ? page.url() : PORTAL_URL;
    await browser.close().catch(() => {});
    browser = null;

    const jar = new CookieJar(cookies);
    const data = await scrapeWithJar(jar, options, signal, homeHtml);
    return { data, cookies: jar.toArray(), portalUrl, transport: 'browser', durationMs: Date.now() - startedAt };
  } catch (error) {
    throw normalizePortalError(error, 'browser');
  } finally {
    signal.removeEventListener('abort', closeOnAbort);
    await browser?.close().catch(() => {});
  }
}

async function scrapeSessionWithPuppeteer(
  cookies: string[],
  options: PortalSyncOptions | undefined,
  signal: AbortSignal,
  credentials?: { username: string; password: string },
): Promise<PortalSyncExecution> {
  const startedAt = Date.now();
  let browser: Browser | null = null;
  const closeOnAbort = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener('abort', closeOnAbort, { once: true });
  try {
    browser = await launchBrowserFallback();
    const page = await browser.newPage();
    await preparePage(page, options);
    await page.setCookie(...cookies.map((cookie) => {
      const separator = cookie.indexOf('=');
      return {
        name: cookie.slice(0, separator), value: cookie.slice(separator + 1),
        domain: 'millennium.education', path: '/',
      };
    }).filter((cookie) => cookie.name && cookie.value));
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 8_000 });
    await ensureExpectedPortalPage(page, credentials);
    const data = await scrapeWithPage(page, options);
    return {
      data,
      cookies: await getCookiePairs(page),
      portalUrl: page.url().includes('/portal') ? page.url() : PORTAL_URL,
      transport: 'browser',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw normalizePortalError(error, 'browser');
  } finally {
    signal.removeEventListener('abort', closeOnAbort);
    await browser?.close().catch(() => {});
  }
}

async function loginAndScrapeWithFetch(
  username: string,
  password: string,
  options: PortalSyncOptions | undefined,
  signal: AbortSignal,
): Promise<PortalSyncExecution> {
  const startedAt = Date.now();
  const jar = new CookieJar();
  const login = await authenticateCookieJar(jar, username, password, signal);
  const data = await scrapeWithJar(
    jar,
    options,
    signal,
    login.url.includes('/portal') ? login.text : undefined,
  );
  return {
    data,
    cookies: jar.toArray(),
    portalUrl: login.url.includes('/portal') ? login.url : PORTAL_URL,
    transport: 'http',
    durationMs: Date.now() - startedAt,
  };
}

async function authenticateCookieJar(
  jar: CookieJar,
  username: string,
  password: string,
  signal: AbortSignal,
) {
  const loginPage = await jar.text(LOGIN_URL, {}, 0, 6_500, signal);
  const csrfToken = extractLoginCsrfToken(loginPage.text);
  const body = new URLSearchParams({
    account: STUDENT_ACCOUNT,
    email: username,
    password,
    sitename: SCHOOL,
    csrf_token: csrfToken,
  });
  return jar.text(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: LOGIN_URL },
    body,
  }, 0, 6_500, signal);
}

function browserExecutableConfigured(): boolean {
  return !!process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
}

function browserFallbackEnabled(): boolean {
  // Browser automation is an explicitly enabled compatibility path. The default
  // transport is ordinary HTTP so deployments do not silently opt into an
  // unsupported provider interaction or a Chromium resource budget.
  return process.env.PORTAL_SYNC_ALLOW_BROWSER_FALLBACK === 'true'
    && browserExecutableConfigured();
}

export async function loginAndScrapePortal(
  username: string,
  password: string,
  options?: PortalSyncOptions,
): Promise<PortalSyncExecution> {
  return withOperationDeadline(options, async (signal) => {
    if (browserFallbackEnabled() && process.env.PORTAL_SYNC_PREFER_BROWSER === 'true') {
      return loginAndScrapeWithPuppeteer(username, password, options, signal);
    }

    let lastError: PortalSyncError | null = null;
    for (let attempt = 0; attempt < PORTAL_LOGIN_ATTEMPTS; attempt += 1) {
      try {
        return await loginAndScrapeWithFetch(username, password, options, signal);
      } catch (error) {
        const normalized = normalizePortalError(error, 'login');
        lastError = normalized;
        const canRetryLegacyAuth = normalized instanceof PortalAuthError
          && attempt < PORTAL_LOGIN_ATTEMPTS - 1
          && !signal.aborted;
        if (!canRetryLegacyAuth) break;
        await wait(350 * (attempt + 1), signal);
      }
    }

    const normalized = lastError || new PortalSyncError('Millennium login failed.', {
      code: 'PORTAL_SYNC_FAILURE',
      stage: 'login',
    });
    const browserOnAuthFailure = process.env.PORTAL_SYNC_BROWSER_ON_AUTH_FAILURE === 'true';
    if (!browserFallbackEnabled() || signal.aborted || (normalized instanceof PortalAuthError && !browserOnAuthFailure)) {
      throw normalized;
    }
    return loginAndScrapeWithPuppeteer(username, password, options, signal);
  });
}

export async function scrapePortalSession(
  cookies: string[],
  options?: PortalSyncOptions,
  credentials?: { username: string; password: string },
): Promise<PortalSyncExecution> {
  return withOperationDeadline(options, async (signal) => {
    try {
      const startedAt = Date.now();
      const jar = new CookieJar(cookies);
      const data = await scrapeWithJar(jar, options, signal);
      return { data, cookies: jar.toArray(), portalUrl: PORTAL_URL, transport: 'http', durationMs: Date.now() - startedAt };
    } catch (error) {
      const normalized = normalizePortalError(error, 'session');
      if (!browserFallbackEnabled() || signal.aborted || normalized instanceof PortalAuthError) throw normalized;
      return scrapeSessionWithPuppeteer(cookies, options, signal, credentials);
    }
  });
}
