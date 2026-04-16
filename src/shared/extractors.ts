import type { ExtractedPageData, HeadingNode, ImageInfo, LinkInfo } from "./types";
import { normalizeWhitespace } from "./utils";

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, token: string) => {
    if (token[0] === "#") {
      if (token[1]?.toLowerCase() === "x") {
        const code = Number.parseInt(token.slice(2), 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      }
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    }
    const decoded = named[token.toLowerCase()];
    return decoded ?? _;
  });
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, " "));
}

function extractMetaContent(html: string, name: string): string {
  const regex = new RegExp(
    `<meta\\b[^>]*name\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
    "i"
  );
  const swappedRegex = new RegExp(
    `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${name}["'][^>]*>`,
    "i"
  );
  const match = html.match(regex) ?? html.match(swappedRegex);
  return match?.[1]?.trim() ?? "";
}

function extractCanonical(html: string): string | null {
  const regex = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']*)["'][^>]*>/i;
  const swappedRegex = /<link\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*rel\s*=\s*["']canonical["'][^>]*>/i;
  const match = html.match(regex) ?? html.match(swappedRegex);
  return match?.[1]?.trim() || null;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) {
    return "";
  }
  return normalizeWhitespace(stripTags(match[1]));
}

function extractHeadings(html: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  const regex = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match = regex.exec(html);
  while (match) {
    const level = Number(match[1]) as 1 | 2 | 3;
    const text = normalizeWhitespace(stripTags(match[2]));
    headings.push({ level, text });
    match = regex.exec(html);
  }
  return headings;
}

function extractImages(html: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  const regex = /<img\b[^>]*>/gi;
  let match = regex.exec(html);
  while (match) {
    const tag = match[0];
    const srcMatch = tag.match(/src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const altMatch = tag.match(/alt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const srcValue = srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? "";
    const altValue = altMatch?.[2] ?? altMatch?.[3] ?? altMatch?.[4] ?? "";
    images.push({ src: srcValue.trim(), alt: altValue.trim() });
    match = regex.exec(html);
  }
  return images;
}

function extractLinks(html: string, pageUrl: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  const regex = /<a\b[^>]*>/gi;
  let match = regex.exec(html);
  let pageOrigin = "";
  try {
    pageOrigin = new URL(pageUrl).origin;
  } catch {
    pageOrigin = "";
  }

  while (match) {
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "";
    if (href) {
      try {
        const absolute = new URL(href, pageUrl);
        if (absolute.protocol === "http:" || absolute.protocol === "https:") {
          links.push({
            url: absolute.toString(),
            kind: absolute.origin === pageOrigin ? "internal" : "external"
          });
        }
      } catch {
        // Ignore malformed links.
      }
    }
    match = regex.exec(html);
  }
  return links;
}

function extractVisibleText(html: string): string {
  const withoutScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const noComments = withoutScript.replace(/<!--[\s\S]*?-->/g, " ");
  const textOnly = noComments.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(stripTags(textOnly));
}

export function extractPageDataFromHtml(html: string, pageUrl: string, maxLinksToCheck: number): ExtractedPageData {
  const title = extractTitle(html);
  const metaDescription = normalizeWhitespace(extractMetaContent(html, "description"));
  const robotsMetaRaw = extractMetaContent(html, "robots");
  const viewportRaw = extractMetaContent(html, "viewport");
  const canonicalRaw = extractCanonical(html);
  const headings = extractHeadings(html);
  const images = extractImages(html);
  const links = extractLinks(html, pageUrl);
  const visibleText = extractVisibleText(html);
  const linksToCheck = Array.from(new Set(links.map((link) => link.url))).slice(0, maxLinksToCheck);

  return {
    url: pageUrl,
    title,
    metaDescription,
    canonical: canonicalRaw ? canonicalRaw.trim() : null,
    robotsMeta: robotsMetaRaw ? robotsMetaRaw.trim() : null,
    viewportPresent: Boolean(viewportRaw),
    headings,
    visibleText,
    images,
    links,
    linksToCheck
  };
}
