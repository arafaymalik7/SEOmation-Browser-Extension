import type { ExtractedPageData, HeadingNode, ImageInfo, LinkInfo } from "../shared/types";

const MESSAGE_TYPES = {
  extractPage: "SEOMATION_EXTRACT_PAGE",
  extractEmails: "SEOMATION_EXTRACT_EMAILS"
} as const;

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractMetaContent(name: string): string {
  const element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  return element?.content?.trim() ?? "";
}

function extractCanonical(): string | null {
  const element = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  const value = element?.href?.trim() ?? "";
  return value || null;
}

function extractHeadings(): HeadingNode[] {
  const nodes = Array.from(document.querySelectorAll("h1, h2, h3"));
  return nodes.map((node) => {
    const level = Number(node.tagName.slice(1)) as 1 | 2 | 3;
    return {
      level,
      text: normalizeWhitespace(node.textContent ?? "")
    };
  });
}

function extractImages(): ImageInfo[] {
  return Array.from(document.images).map((image) => ({
    src: image.src || "",
    alt: (image.getAttribute("alt") ?? "").trim()
  }));
}

function extractLinks(pageUrl: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  const pageOrigin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];

  for (const anchor of anchors) {
    const raw = anchor.getAttribute("href");
    if (!raw) {
      continue;
    }
    try {
      const absolute = new URL(raw, pageUrl);
      if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
        continue;
      }
      const key = absolute.toString();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      links.push({
        url: key,
        kind: absolute.origin === pageOrigin ? "internal" : "external"
      });
    } catch {
      // Ignore malformed URLs.
    }
  }
  return links;
}

function extractVisibleText(): string {
  return normalizeWhitespace(document.body?.innerText ?? "");
}

function collectPageData(maxLinksToCheck: number): ExtractedPageData {
  const url = window.location.href;
  const links = extractLinks(url);
  const uniqueLinksToCheck = Array.from(new Set(links.map((link) => link.url))).slice(0, maxLinksToCheck);

  return {
    url,
    title: normalizeWhitespace(document.title ?? ""),
    metaDescription: normalizeWhitespace(extractMetaContent("description")),
    canonical: extractCanonical(),
    robotsMeta: normalizeWhitespace(extractMetaContent("robots")) || null,
    viewportPresent: Boolean(extractMetaContent("viewport")),
    headings: extractHeadings(),
    visibleText: extractVisibleText(),
    images: extractImages(),
    links,
    linksToCheck: uniqueLinksToCheck
  };
}

function extractEmailsFromText(rawText: string): string[] {
  const normalized = rawText
    .replace(/\[\s*at\s*]/gi, "@")
    .replace(/\(\s*at\s*\)/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\[\s*dot\s*]/gi, ".")
    .replace(/\(\s*dot\s*\)/gi, ".")
    .replace(/\s+dot\s+/gi, ".");
  const regex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  return normalized.match(regex) ?? [];
}

function collectEmails(): string[] {
  const emails = new Set<string>();
  const visibleText = document.body?.innerText ?? "";

  for (const email of extractEmailsFromText(visibleText)) {
    emails.add(email.toLowerCase());
  }

  const anchors = Array.from(document.querySelectorAll('a[href^="mailto:"]')) as HTMLAnchorElement[];
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") ?? "";
    const address = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (address) {
      emails.add(address);
    }
  }

  return Array.from(emails).sort((a, b) => a.localeCompare(b));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === MESSAGE_TYPES.extractPage) {
    try {
      const maxLinks = Number(message.maxLinksToCheck) > 0 ? Number(message.maxLinksToCheck) : 50;
      const data = collectPageData(maxLinks);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to extract page data."
      });
    }
    return;
  }

  if (message.type === MESSAGE_TYPES.extractEmails) {
    try {
      const emails = collectEmails();
      sendResponse({
        ok: true,
        data: {
          url: window.location.href,
          emails
        }
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to extract emails."
      });
    }
  }
});
