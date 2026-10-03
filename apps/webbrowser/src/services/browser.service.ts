import { config } from '@repo/config';
import { logger } from '@repo/logger';
import type { Browser, HTTPRequest, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import anonymizeUaPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import blockResourcesPlugin from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import TurndownService from 'turndown';
import { Semaphore } from '../utils/semaphore';
import { assertPublicUrl, isPublicUrl } from '../utils/url-guard';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(blockResourcesPlugin({ blockedTypes: new Set(['image', 'stylesheet', 'font']) }));
puppeteer.use(anonymizeUaPlugin());

const turndownService = new TurndownService();

// Caps how many pages navigate concurrently. Each scrape is a real Chromium
// tab; without this, a burst of agent calls could spawn unbounded tabs and
// exhaust the container's memory/CPU.
const scrapeSlots = new Semaphore(config.browserMaxConcurrency);

const MAX_MARKDOWN_LENGTH = 10_000;

// Elements that only add navigation/decoration noise to the extracted markdown.
const REMOVED_ELEMENTS_SELECTOR =
  'script, footer, .footer, #footer, header, .header, #header, nav, .nav, #nav, ' +
  'banner, .banner, #banner, aside, .aside, #aside, sidebar, .sidebar, #sidebar, ' +
  'iframe, video, audio, object, embed';

const ALLOWED_META_TAGS = [
  'title',
  'description',
  'keywords',
  'og:title',
  'og:description',
  'og:site_name',
  'og:type',
  'og:locale',
];

export type PageMeta = Record<string, string | null>;

export type ScrapeResult = {
  meta: PageMeta;
  body: string;
};

export async function scrapePage(url: string): Promise<ScrapeResult> {
  return scrapeSlots.withLock(async () => {
    const { bodyHtml, meta } = await getPageContents(url);
    return { meta, body: toMarkdown(bodyHtml) };
  });
}

// One Chromium process is shared across requests; each request gets its own
// tab. Launching a fresh browser per request was costing hundreds of ms of
// startup and CPU on every single scrape.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const browser = await browserPromise;
    if (browser.connected) {
      return browser;
    }
    browserPromise = null;
  }

  browserPromise = puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }
  const browser = await browserPromise;
  browserPromise = null;
  if (browser.connected) {
    await browser.close();
  }
}

function toMarkdown(bodyHtml: string): string {
  const markdown = turndownService.turndown(bodyHtml);
  const truncated =
    markdown.length > MAX_MARKDOWN_LENGTH ? markdown.slice(0, MAX_MARKDOWN_LENGTH) : markdown;
  return truncated.replace(/^\s*[\r\n]/gm, '');
}

async function getPageContents(url: string): Promise<{ meta: PageMeta; bodyHtml: string }> {
  // Reject before a tab is opened. Redirect hops and sub-requests are checked
  // again in the request handler below.
  await assertPublicUrl(url);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultNavigationTimeout(config.browserNavigationTimeout);
    await page.setViewport({ width: 800, height: 600 });
    await blockNonEssentialRequests(page);
    // Puppeteer's own accept() promise isn't awaited by the caller — swallow
    // rejections (e.g. page already closed) so they don't surface as an
    // unhandled rejection and take down the whole service.
    page.on('dialog', (dialog) => {
      dialog.accept().catch(() => {});
    });

    logger.info('Navigating to', url);
    await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'] });

    // `domcontentloaded`/`networkidle2` above don't guarantee `readyState` has
    // already flipped to `complete` by the time we check it here, so wait a
    // little longer instead of failing the whole scrape on that race.
    await page
      .waitForFunction(() => document.readyState === 'complete', {
        timeout: config.browserBodyLoadTimeout,
      })
      .catch(() => logger.warn(`Page ${url} did not report 'complete' readyState in time`));

    await page.waitForSelector('body', { timeout: config.browserBodyLoadTimeout });

    const meta = await getMetaInfo(page);
    await removeUnwantedElements(page);
    const bodyHtml = await extractBodyHtml(page);

    return { meta, bodyHtml };
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

async function blockNonEssentialRequests(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  // Page scripts often hit the same host many times. Cache the verdict per
  // tab so each host is resolved once.
  const verdicts = new Map<string, Promise<boolean>>();
  // The request event is fire-and-forget, so run the async work detached.
  page.on('request', (request) => {
    void handleRequest(request, verdicts);
  });
}

const ALLOWED_RESOURCE_TYPES = ['script', 'xhr', 'fetch', 'document'];

// Puppeteer emits a new 'request' event for every redirect hop under
// interception, so this runs for each hop as well as the first request.
async function handleRequest(
  request: HTTPRequest,
  verdicts: Map<string, Promise<boolean>>,
): Promise<void> {
  try {
    if (request.isInterceptResolutionHandled()) {
      return;
    }
    if (!ALLOWED_RESOURCE_TYPES.includes(request.resourceType())) {
      await request.abort();
      return;
    }

    const url = request.url();
    const host = hostKey(url);
    let verdict = verdicts.get(host);
    if (!verdict) {
      verdict = isPublicUrl(url);
      verdicts.set(host, verdict);
    }
    const allowed = await verdict;

    // Another handler (e.g. an adblock plugin) may have resolved the request
    // while the lookup was pending.
    if (request.isInterceptResolutionHandled()) {
      return;
    }
    if (allowed) {
      await request.continue();
    } else {
      logger.warn('Blocked request to a non-public address');
      await request.abort('blockedbyclient');
    }
  } catch {
    // continue()/abort() can reject when the page or frame is torn down
    // (e.g. our navigation timeout fired). That is not an error here, and an
    // unhandled rejection would take down the whole service.
  }
}

// Verdicts are per scheme, host and port. Non-URL strings get their own key.
function hostKey(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

async function removeUnwantedElements(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    for (const element of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(element);
      const isRemovedOverlay =
        (style.position === 'fixed' ||
          style.position === 'sticky' ||
          style.position === 'absolute') &&
        element.clientHeight > 0 &&
        element.clientWidth > 0;

      if (isRemovedOverlay || element.matches(selector)) {
        element.remove();
      }
    }
  }, REMOVED_ELEMENTS_SELECTOR);
}

async function extractBodyHtml(page: Page): Promise<string> {
  return page.$eval('body', (body) => {
    // Some sites store the real content in a `content`/`text` attribute on custom elements.
    for (const element of Array.from(body.querySelectorAll('[content]'))) {
      element.innerHTML = element.getAttribute('content') ?? '';
    }
    for (const element of Array.from(body.querySelectorAll('[text]'))) {
      element.innerHTML = element.getAttribute('text') ?? '';
    }
    return body.innerHTML;
  });
}

async function getMetaInfo(page: Page): Promise<PageMeta> {
  // Collected in a single browser-side pass instead of one round-trip per
  // <meta> tag — pages can easily have 20-30+ of these.
  return page.evaluate((allowedKeys) => {
    const meta: Record<string, string | null> = {};
    for (const tag of Array.from(document.querySelectorAll('meta'))) {
      const key = tag.getAttribute('name') ?? tag.getAttribute('property');
      if (key && allowedKeys.includes(key)) {
        meta[key] = tag.getAttribute('content');
      }
    }
    return meta;
  }, ALLOWED_META_TAGS);
}
