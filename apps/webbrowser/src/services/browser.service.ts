import { config } from '@repo/config';
import { logger } from '@repo/logger';
import {
  DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  type Browser,
  type HTTPRequest,
  type Page,
} from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import anonymizeUaPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import blockResourcesPlugin from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import TurndownService from 'turndown';
import { Semaphore } from '../utils/semaphore';
import { assertPublicUrl, isPublicUrl } from '../utils/url-guard';

puppeteer.use(StealthPlugin());
puppeteer.use(
  AdblockerPlugin({
    blockTrackers: true,
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  }),
);
puppeteer.use(
  blockResourcesPlugin({
    blockedTypes: new Set(['image', 'stylesheet', 'font']),
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  }),
);
puppeteer.use(anonymizeUaPlugin());

const turndownService = new TurndownService();

// Caps how many pages navigate concurrently. Each scrape is a real Chromium
// tab; without this, a burst of agent calls could spawn unbounded tabs and
// exhaust the container's memory/CPU.
const scrapeSlots = new Semaphore(config.browserMaxConcurrency, config.browserMaxQueue);

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

/** Scrapes a page; `signal` cancels it when the caller has gone away. */
export async function scrapePage(url: string, signal: AbortSignal): Promise<ScrapeResult> {
  markScrapeStarted();
  try {
    return await scrapeSlots.withLock(async () => {
      const { bodyHtml, meta } = await getPageContents(url, signal);
      return { meta, body: toMarkdown(bodyHtml) };
    }, signal);
  } finally {
    markScrapeFinished();
  }
}

// Counts queued scrapes too, so the browser is never closed while one waits for a slot.
let pendingScrapes = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function markScrapeStarted(): void {
  pendingScrapes++;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

// Scrapes are rare, so an idle Chromium would hold a few hundred MB for nothing.
// A close-after of 0 keeps the browser running.
function markScrapeFinished(): void {
  pendingScrapes--;
  if (pendingScrapes > 0 || config.browserIdleCloseAfter === 0) {
    return;
  }
  idleTimer = setTimeout(() => {
    idleTimer = null;
    closeBrowser().catch((error) => logger.error('Failed to close idle browser:', error));
  }, config.browserIdleCloseAfter);
}

// One Chromium process is shared across requests while scrapes keep coming;
// each request gets its own incognito context. Launching a fresh browser per
// request was costing hundreds of ms of startup and CPU on every single scrape.
let browserPromise: Promise<Browser> | null = null;

/**
 * Returns the shared browser, relaunching it after a crash or a failed launch.
 * Concurrent callers share one relaunch instead of each starting their own.
 */
async function getBrowser(): Promise<Browser> {
  const current = browserPromise;
  if (current) {
    const browser = await current.catch(() => null);
    if (browser?.connected) {
      return browser;
    }
    // Another caller may already have replaced it while we awaited.
    if (browserPromise === current) {
      browserPromise = null;
    }
  }

  browserPromise ??= launchBrowser();
  return browserPromise;
}

function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    pipe: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      // Safe because the sandbox is already off; saves two zygote processes.
      '--no-zygote',
      '--js-flags=--jitless',
    ],
  });
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }
  // Cleared before awaiting so a scrape arriving meanwhile launches a new browser
  // instead of reusing the one being closed.
  const closingBrowser = browserPromise;
  browserPromise = null;
  const browser = await closingBrowser.catch(() => null);
  if (browser?.connected) {
    await browser.close();
  }
}

function toMarkdown(bodyHtml: string): string {
  const markdown = turndownService.turndown(bodyHtml);
  const truncated =
    markdown.length > MAX_MARKDOWN_LENGTH ? markdown.slice(0, MAX_MARKDOWN_LENGTH) : markdown;
  return truncated.replace(/^\s*[\r\n]/gm, '');
}

async function getPageContents(
  url: string,
  signal: AbortSignal,
): Promise<{ meta: PageMeta; bodyHtml: string }> {
  // Reject before a tab is opened. Redirect hops and sub-requests are checked
  // again in the request handler below.
  await assertPublicUrl(url);

  const browser = await getBrowser();
  signal.throwIfAborted();
  // A throwaway context per scrape keeps cookies and cache from leaking
  // between users' scrapes and from piling up in a long-lived browser.
  const context = await browser.createBrowserContext();
  // Closing the context makes the pending page calls reject, which ends the scrape.
  const closeContext = () => {
    context.close().catch(() => {});
  };
  signal.addEventListener('abort', closeContext, { once: true });

  try {
    const page = await context.newPage();
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
    signal.removeEventListener('abort', closeContext);
    await context.close().catch(() => {});
  }
}

async function blockNonEssentialRequests(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  // Page scripts often hit the same host many times. Cache the verdict per
  // tab so each host is resolved once.
  const verdicts = new Map<string, Promise<boolean>>();
  page.on('request', (request) => handleRequest(request, verdicts));
}

const ALLOWED_RESOURCE_TYPES = ['script', 'xhr', 'fetch', 'document'];

const BLOCK_PRIORITY = DEFAULT_INTERCEPT_RESOLUTION_PRIORITY + 100;

async function handleRequest(
  request: HTTPRequest,
  verdicts: Map<string, Promise<boolean>>,
): Promise<void> {
  try {
    if (!ALLOWED_RESOURCE_TYPES.includes(request.resourceType())) {
      await request.abort('failed', BLOCK_PRIORITY);
      return;
    }

    const url = request.url();
    const host = hostKey(url);
    let verdict = verdicts.get(host);
    if (!verdict) {
      verdict = isPublicUrl(url);
      verdicts.set(host, verdict);
    }

    if (await verdict) {
      await request.continue(undefined, DEFAULT_INTERCEPT_RESOLUTION_PRIORITY);
    } else {
      logger.warn('Blocked request to a non-public address');
      await request.abort('blockedbyclient', BLOCK_PRIORITY);
    }
  } catch {}
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
