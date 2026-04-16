import { analyzeExtractedPage, createAuditSummary, createComparisonReport } from "../shared/analyzer";
import { extractPageDataFromHtml } from "../shared/extractors";
import { MESSAGE_TYPES } from "../shared/messages";
import { isPathAllowedByRobots } from "../shared/robots";
import type {
  AuditReport,
  AuditReportSummary,
  BrokenLinkResult,
  ExtensionSettings,
  ExtractedPageData
} from "../shared/types";
import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../shared/types";
import { clamp, delay, normalizeUrl } from "../shared/utils";

interface MessageSuccess<T> {
  ok: true;
  data: T;
}

interface MessageFailure {
  ok: false;
  error: string;
}

type MessageResponse<T> = MessageSuccess<T> | MessageFailure;

interface ComparisonOutcome {
  url: string;
  audit?: AuditReport;
  blockedByRobots?: boolean;
  error?: string;
}

function normalizeAndValidateUrl(urlInput: string): string | null {
  const normalized = normalizeUrl(urlInput);
  if (!normalized) {
    return null;
  }
  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function normalizeSettings(input?: Partial<ExtensionSettings>, stored?: ExtensionSettings): ExtensionSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    ...(input ?? {})
  };

  return {
    maxLinksToCheck: clamp(Number(merged.maxLinksToCheck) || DEFAULT_SETTINGS.maxLinksToCheck, 10, 200),
    rateLimitMs: clamp(Number(merged.rateLimitMs) || DEFAULT_SETTINGS.rateLimitMs, 200, 5000)
  };
}

async function resolveSettings(input?: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const stored = await storageGet<ExtensionSettings>(STORAGE_KEYS.settings);
  return normalizeSettings(input, stored);
}

async function ensureDefaultSettings(): Promise<void> {
  const existing = await storageGet<ExtensionSettings>(STORAGE_KEYS.settings);
  if (!existing) {
    await storageSet({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    return;
  }
  const normalized = normalizeSettings(undefined, existing);
  await storageSet({ [STORAGE_KEYS.settings]: normalized });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRobotsTxt(origin: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, { method: "GET" }, 7000);
    if (response.status === 404 || !response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  }
}

async function checkRobotsAllowance(
  url: string,
  robotsCache: Map<string, Promise<string | null>> = new Map()
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  let robotsPromise = robotsCache.get(parsed.origin);
  if (!robotsPromise) {
    robotsPromise = fetchRobotsTxt(parsed.origin);
    robotsCache.set(parsed.origin, robotsPromise);
  }

  const robotsTxt = await robotsPromise;
  if (!robotsTxt) {
    return true;
  }

  const targetPath = `${parsed.pathname}${parsed.search}`;
  return isPathAllowedByRobots(robotsTxt, targetPath);
}

async function checkSingleLink(
  url: string,
  timeoutMs: number,
  robotsCache: Map<string, Promise<string | null>>
): Promise<BrokenLinkResult> {
  const allowedByRobots = await checkRobotsAllowance(url, robotsCache);
  if (!allowedByRobots) {
    return { url, status: null, state: "unknown", reason: "Blocked by robots.txt" };
  }

  try {
    let response = await fetchWithTimeout(url, { method: "HEAD" }, timeoutMs);
    if (response.status === 405 || response.status === 501 || response.status === 403) {
      response = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
    }

    if (response.status >= 400) {
      return { url, status: response.status, state: "broken", reason: `HTTP ${response.status}` };
    }
    return { url, status: response.status, state: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return { url, status: null, state: "unknown", reason: message };
  }
}

async function checkBrokenLinks(urls: string[], timeoutMs = 6000, concurrency = 5): Promise<BrokenLinkResult[]> {
  if (urls.length === 0) {
    return [];
  }

  const results: BrokenLinkResult[] = new Array(urls.length);
  let index = 0;
  const robotsCache = new Map<string, Promise<string | null>>();

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }).map(async () => {
    while (index < urls.length) {
      const current = index;
      index += 1;
      results[current] = await checkSingleLink(urls[current], timeoutMs, robotsCache);
    }
  });

  await Promise.all(workers);
  return results;
}

function buildUnavailableSummary(outcome: ComparisonOutcome): AuditReportSummary {
  return {
    url: outcome.url,
    score: null,
    statusLabel: "Unavailable",
    titleLength: 0,
    metaDescriptionLength: 0,
    wordCount: 0,
    h1Count: 0,
    h2Count: 0,
    h3Count: 0,
    keywordDensity: undefined,
    imagesMissingAlt: 0,
    internalLinks: 0,
    externalLinks: 0,
    brokenLinks: 0,
    blockedByRobots: outcome.blockedByRobots,
    error: outcome.error
  };
}

async function analyzeRemotePage(urlInput: string, keyword: string | undefined, settings: ExtensionSettings): Promise<ComparisonOutcome> {
  const pageUrl = normalizeAndValidateUrl(urlInput);
  if (!pageUrl) {
    return {
      url: urlInput,
      error: "Invalid URL."
    };
  }

  const allowedByRobots = await checkRobotsAllowance(pageUrl);
  if (!allowedByRobots) {
    return {
      url: pageUrl,
      blockedByRobots: true,
      error: "Blocked by robots.txt"
    };
  }

  try {
    const response = await fetchWithTimeout(pageUrl, { method: "GET" }, 12000);
    if (!response.ok) {
      return {
        url: pageUrl,
        error: `Page fetch failed with status ${response.status}.`
      };
    }
    const html = await response.text();
    const extracted = extractPageDataFromHtml(html, pageUrl, settings.maxLinksToCheck);
    const brokenResults = await checkBrokenLinks(extracted.linksToCheck, 6000, 5);
    const audit = analyzeExtractedPage(extracted, {
      keyword,
      brokenLinks: brokenResults
    });
    return { url: pageUrl, audit };
  } catch (error) {
    return {
      url: pageUrl,
      error: error instanceof Error ? error.message : "Failed to fetch URL."
    };
  }
}

async function handleRunAudit(message: { extracted: ExtractedPageData; keyword?: string; settings?: Partial<ExtensionSettings> }) {
  const settings = await resolveSettings(message.settings);
  const extracted = message.extracted;
  const linksToCheck = extracted.linksToCheck.slice(0, settings.maxLinksToCheck);
  const brokenResults = await checkBrokenLinks(linksToCheck, 6000, 5);
  const report = analyzeExtractedPage(
    {
      ...extracted,
      linksToCheck
    },
    {
      keyword: message.keyword,
      brokenLinks: brokenResults
    }
  );
  return report;
}

async function handleRunComparison(message: { urls: string[]; keyword?: string; settings?: Partial<ExtensionSettings> }) {
  const settings = await resolveSettings(message.settings);
  const normalizedUrls = Array.from(new Set(message.urls.map(normalizeAndValidateUrl).filter((url): url is string => Boolean(url))));

  if (normalizedUrls.length < 2) {
    throw new Error("Comparison requires at least two valid URLs.");
  }

  const outcomes: ComparisonOutcome[] = [];
  for (let index = 0; index < normalizedUrls.length; index += 1) {
    if (index > 0) {
      await delay(settings.rateLimitMs);
    }
    const outcome = await analyzeRemotePage(normalizedUrls[index], message.keyword, settings);
    outcomes.push(outcome);
  }

  const summaries = outcomes.map((outcome) => (outcome.audit ? createAuditSummary(outcome.audit) : buildUnavailableSummary(outcome)));
  const report = createComparisonReport(normalizedUrls, summaries, message.keyword);

  for (const outcome of outcomes) {
    if (outcome.blockedByRobots) {
      report.gapInsights.push(`${outcome.url} skipped: blocked by robots.txt`);
    } else if (outcome.error) {
      report.gapInsights.push(`${outcome.url} skipped: ${outcome.error}`);
    }
  }

  return report;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch(() => {
    // Ignore storage initialization errors.
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse: (response: MessageResponse<unknown>) => void) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === MESSAGE_TYPES.runAudit) {
    handleRunAudit(message)
      .then((report) => {
        sendResponse({ ok: true, data: report });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Audit failed."
        });
      });
    return true;
  }

  if (message.type === MESSAGE_TYPES.runComparison) {
    handleRunComparison(message)
      .then((report) => {
        sendResponse({ ok: true, data: report });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Comparison failed."
        });
      });
    return true;
  }
});
