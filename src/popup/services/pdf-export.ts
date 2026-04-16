import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { AuditReport, ComparisonReport, Recommendation } from "../../shared/types";
import { domainFromUrl } from "../../shared/utils";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const SECTION_GAP = 14;
const CARD_GAP = 10;
const LINE_GAP = 12;
const SECTION_TOP_GAP = 12;

const COLORS = {
  ink: rgb(0.09, 0.13, 0.18),
  muted: rgb(0.39, 0.43, 0.5),
  line: rgb(0.85, 0.82, 0.76),
  surface: rgb(1, 1, 1),
  surfaceSoft: rgb(0.98, 0.97, 0.95),
  navy: rgb(0.08, 0.2, 0.39),
  navySoft: rgb(0.92, 0.95, 0.99),
  gold: rgb(0.79, 0.49, 0.18),
  goldSoft: rgb(0.97, 0.93, 0.87),
  green: rgb(0.12, 0.48, 0.33),
  greenSoft: rgb(0.91, 0.96, 0.93),
  amber: rgb(0.67, 0.43, 0.08),
  amberSoft: rgb(1, 0.96, 0.89),
  red: rgb(0.65, 0.21, 0.29),
  redSoft: rgb(0.98, 0.92, 0.94)
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type LayoutContext = {
  pdf: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  y: number;
};

type StatCard = {
  label: string;
  value: string;
  note?: string;
  tone?: "navy" | "gold" | "green";
};

function sanitizeText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\s+/g, " ").trim();
}

function severityTone(level: Recommendation["severity"]): { fill: ReturnType<typeof rgb>; accent: ReturnType<typeof rgb> } {
  if (level === "High") {
    return { fill: COLORS.redSoft, accent: COLORS.red };
  }
  if (level === "Medium") {
    return { fill: COLORS.amberSoft, accent: COLORS.amber };
  }
  return { fill: COLORS.navySoft, accent: COLORS.navy };
}

function tonePalette(tone: StatCard["tone"]): { fill: ReturnType<typeof rgb>; accent: ReturnType<typeof rgb> } {
  if (tone === "gold") {
    return { fill: COLORS.goldSoft, accent: COLORS.gold };
  }
  if (tone === "green") {
    return { fill: COLORS.greenSoft, accent: COLORS.green };
  }
  return { fill: COLORS.navySoft, accent: COLORS.navy };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = sanitizeText(text);
  if (!clean) {
    return [""];
  }

  const lines: string[] = [];
  const words = clean.split(" ");
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }

    let segment = "";
    for (const char of word) {
      const candidate = `${segment}${char}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        segment = candidate;
      } else {
        if (segment) {
          lines.push(segment);
        }
        segment = char;
      }
    }
    current = segment;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function addPage(ctx: LayoutContext): void {
  ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: LayoutContext, needed: number): void {
  if (ctx.y - needed < MARGIN) {
    addPage(ctx);
  }
}

function drawParagraph(
  ctx: LayoutContext,
  text: string,
  options?: { size?: number; color?: ReturnType<typeof rgb>; lineHeight?: number; gapAfter?: number }
): void {
  const size = options?.size ?? 10;
  const lineHeight = options?.lineHeight ?? Math.ceil(size * 1.45);
  const color = options?.color ?? COLORS.ink;
  const lines = wrapText(text, ctx.fonts.regular, size, CONTENT_WIDTH);
  const blockHeight = lines.length * lineHeight;

  ensureSpace(ctx, blockHeight + (options?.gapAfter ?? 8));
  ctx.page.drawText(lines.join("\n"), {
    x: MARGIN,
    y: ctx.y - blockHeight + lineHeight,
    size,
    lineHeight,
    font: ctx.fonts.regular,
    color
  });
  ctx.y -= blockHeight + (options?.gapAfter ?? 8);
}

function estimateBulletHeight(ctx: LayoutContext, item: string): number {
  const lines = wrapText(item, ctx.fonts.regular, 10, CONTENT_WIDTH - 48);
  return lines.length * LINE_GAP + 18;
}

function estimateRecommendationHeight(ctx: LayoutContext, item: Recommendation): number {
  const titleLines = wrapText(item.title, ctx.fonts.bold, 11, CONTENT_WIDTH - 76);
  const detailLines = wrapText(`Why it matters: ${item.detail}`, ctx.fonts.regular, 9, CONTENT_WIDTH - 26);
  const fixLines = wrapText(`Fix: ${item.fix}`, ctx.fonts.regular, 9, CONTENT_WIDTH - 26);
  return 18 + titleLines.length * 13 + detailLines.length * 11 + fixLines.length * 11 + 18;
}

function estimateStatGridPreviewHeight(ctx: LayoutContext, cards: StatCard[], columns = 3): number {
  const columnCount = Math.min(columns, cards.length);
  const cardWidth = (CONTENT_WIDTH - CARD_GAP * (columnCount - 1)) / columnCount;
  const row = cards.slice(0, columnCount);
  const heights = row.map((card) => {
    const labelLines = wrapText(card.label, ctx.fonts.bold, 8, cardWidth - 20);
    const valueLines = wrapText(card.value, ctx.fonts.bold, 17, cardWidth - 20);
    const noteLines = card.note ? wrapText(card.note, ctx.fonts.regular, 9, cardWidth - 20) : [];
    return 20 + labelLines.length * 10 + valueLines.length * 18 + noteLines.length * 10;
  });

  return Math.max(...heights, 88) + 8;
}

function estimateTablePreviewHeight(ctx: LayoutContext, headers: string[], rows: string[][]): number {
  const columnWidth = CONTENT_WIDTH / headers.length;
  const headerHeight = 28;
  const firstRow = rows[0] ?? new Array(headers.length).fill("");
  const rowHeight = Math.max(...firstRow.map((cell) => wrapText(cell, ctx.fonts.regular, 8, columnWidth - 10).length * 10 + 8), 22);
  return headerHeight + rowHeight + 8;
}

function drawHeader(ctx: LayoutContext, title: string, subtitle: string, details: string[]): void {
  const titleLines = wrapText(title, ctx.fonts.bold, 23, CONTENT_WIDTH - 36);
  const subtitleLines = wrapText(subtitle, ctx.fonts.regular, 11, CONTENT_WIDTH - 36);
  const detailBlocks = details.slice(0, 3).map((detail) => wrapText(detail, ctx.fonts.regular, 9, CONTENT_WIDTH - 36));
  const headerHeight = Math.max(
    132,
    18 +
      14 +
      titleLines.length * 27 +
      8 +
      subtitleLines.length * 14 +
      12 +
      detailBlocks.reduce((sum, lines) => sum + lines.length * 11 + 4, 0) +
      14
  );
  const bottom = ctx.y - headerHeight;

  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: CONTENT_WIDTH,
    height: headerHeight,
    color: COLORS.navy
  });

  ctx.page.drawRectangle({
    x: MARGIN,
    y: bottom - 6,
    width: CONTENT_WIDTH,
    height: 6,
    color: COLORS.navy
  });

  ctx.page.drawText("SEOmation", {
    x: MARGIN + 18,
    y: bottom + headerHeight - 26,
    size: 12,
    font: ctx.fonts.bold,
    color: COLORS.goldSoft
  });

  let cursorY = bottom + headerHeight - 54;

  ctx.page.drawText(titleLines.join("\n"), {
    x: MARGIN + 18,
    y: cursorY,
    size: 23,
    lineHeight: 27,
    font: ctx.fonts.bold,
    color: COLORS.surface
  });
  cursorY -= titleLines.length * 27 + 8;

  ctx.page.drawText(subtitleLines.join("\n"), {
    x: MARGIN + 18,
    y: cursorY,
    size: 11,
    lineHeight: 14,
    font: ctx.fonts.regular,
    color: COLORS.navySoft
  });
  cursorY -= subtitleLines.length * 14 + 12;

  for (const lines of detailBlocks) {
    ctx.page.drawText(lines.join("\n"), {
      x: MARGIN + 18,
      y: cursorY,
      size: 9,
      lineHeight: 11,
      font: ctx.fonts.regular,
      color: COLORS.surface
    });
    cursorY -= lines.length * 11 + 4;
  }

  ctx.y = bottom - SECTION_GAP - 6;
}

function drawSectionTitle(ctx: LayoutContext, title: string, subtitle?: string, keepWithNext = 0): void {
  const needed = SECTION_TOP_GAP + (subtitle ? 42 : 30) + keepWithNext;
  ensureSpace(ctx, needed);
  ctx.y -= SECTION_TOP_GAP;

  ctx.page.drawText(sanitizeText(title), {
    x: MARGIN,
    y: ctx.y,
    size: 13,
    font: ctx.fonts.bold,
    color: COLORS.navy
  });

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 14 },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y - 14 },
    thickness: 1,
    color: COLORS.line
  });

  ctx.y -= 24;

  if (subtitle) {
    drawParagraph(ctx, subtitle, { size: 9, color: COLORS.muted, gapAfter: 8 });
  } else {
    ctx.y -= 4;
  }
}

function drawStatGrid(ctx: LayoutContext, cards: StatCard[], columns = 3): void {
  const columnCount = Math.min(columns, cards.length);
  const cardWidth = (CONTENT_WIDTH - CARD_GAP * (columnCount - 1)) / columnCount;

  for (let index = 0; index < cards.length; index += columnCount) {
    const row = cards.slice(index, index + columnCount);
    const heights = row.map((card) => {
      const labelLines = wrapText(card.label, ctx.fonts.bold, 8, cardWidth - 20);
      const valueLines = wrapText(card.value, ctx.fonts.bold, 17, cardWidth - 20);
      const noteLines = card.note ? wrapText(card.note, ctx.fonts.regular, 9, cardWidth - 20) : [];
      return 20 + labelLines.length * 10 + valueLines.length * 18 + noteLines.length * 10;
    });

    const rowHeight = Math.max(...heights, 88);
    ensureSpace(ctx, rowHeight + 8);

    row.forEach((card, offset) => {
      const x = MARGIN + offset * (cardWidth + CARD_GAP);
      const y = ctx.y - rowHeight;
      const palette = tonePalette(card.tone);

      ctx.page.drawRectangle({
        x,
        y,
        width: cardWidth,
        height: rowHeight,
        color: palette.fill,
        borderColor: COLORS.line,
        borderWidth: 1
      });

      ctx.page.drawRectangle({
        x,
        y: y + rowHeight - 5,
        width: cardWidth,
        height: 5,
        color: palette.accent
      });

      const labelLines = wrapText(card.label, ctx.fonts.bold, 8, cardWidth - 20);
      const valueLines = wrapText(card.value, ctx.fonts.bold, 17, cardWidth - 20);
      const noteLines = card.note ? wrapText(card.note, ctx.fonts.regular, 9, cardWidth - 20) : [];

      let textY = y + rowHeight - 20;
      ctx.page.drawText(labelLines.join("\n"), {
        x: x + 10,
        y: textY,
        size: 8,
        lineHeight: 10,
        font: ctx.fonts.bold,
        color: COLORS.muted
      });
      textY -= labelLines.length * 10 + 12;

      ctx.page.drawText(valueLines.join("\n"), {
        x: x + 10,
        y: textY,
        size: 17,
        lineHeight: 18,
        font: ctx.fonts.bold,
        color: COLORS.ink
      });
      textY -= valueLines.length * 18 + 8;

      if (noteLines.length > 0) {
        ctx.page.drawText(noteLines.join("\n"), {
          x: x + 10,
          y: textY,
          size: 9,
          lineHeight: 10,
          font: ctx.fonts.regular,
          color: COLORS.muted
        });
      }
    });

    ctx.y -= rowHeight + 8;
  }
}

function drawBullets(ctx: LayoutContext, items: string[]): void {
  if (items.length === 0) {
    drawParagraph(ctx, "No items to display.", { size: 10, color: COLORS.muted });
    return;
  }

  for (const [index, item] of items.entries()) {
    const lines = wrapText(item, ctx.fonts.regular, 10, CONTENT_WIDTH - 48);
    const height = lines.length * LINE_GAP + 18;
    ensureSpace(ctx, height);

    const topY = ctx.y;
    const rowY = topY - height;

    ctx.page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: CONTENT_WIDTH,
      height,
      color: COLORS.surfaceSoft,
      borderColor: COLORS.line,
      borderWidth: 1
    });

    ctx.page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: 5,
      height,
      color: COLORS.gold
    });

    const badgeSize = 16;
    const badgeY = rowY + height - badgeSize - 6;
    ctx.page.drawRectangle({
      x: MARGIN + 12,
      y: badgeY,
      width: badgeSize,
      height: badgeSize,
      color: COLORS.goldSoft,
      borderColor: COLORS.line,
      borderWidth: 0.5
    });

    ctx.page.drawText(String(index + 1), {
      x: MARGIN + 17,
      y: badgeY + 4,
      size: 8,
      font: ctx.fonts.bold,
      color: COLORS.gold
    });

    ctx.page.drawText(lines.join("\n"), {
      x: MARGIN + 38,
      y: rowY + height - 13,
      size: 10,
      lineHeight: LINE_GAP,
      font: ctx.fonts.regular,
      color: COLORS.ink
    });

    ctx.y -= height + 6;
  }

  ctx.y -= 4;
}

function drawRecommendations(ctx: LayoutContext, recommendations: Recommendation[]): void {
  if (recommendations.length === 0) {
    drawParagraph(ctx, "No major issues found by the current rule set.", { size: 10, color: COLORS.muted });
    return;
  }

  for (const item of recommendations) {
    const titleLines = wrapText(item.title, ctx.fonts.bold, 11, CONTENT_WIDTH - 76);
    const detailLines = wrapText(`Why it matters: ${item.detail}`, ctx.fonts.regular, 9, CONTENT_WIDTH - 26);
    const fixLines = wrapText(`Fix: ${item.fix}`, ctx.fonts.regular, 9, CONTENT_WIDTH - 26);
    const height = 18 + titleLines.length * 13 + detailLines.length * 11 + fixLines.length * 11 + 18;

    ensureSpace(ctx, height + 8);

    const top = ctx.y;
    const y = top - height;
    const palette = severityTone(item.severity);

    ctx.page.drawRectangle({
      x: MARGIN,
      y,
      width: CONTENT_WIDTH,
      height,
      color: palette.fill,
      borderColor: COLORS.line,
      borderWidth: 1
    });

    ctx.page.drawRectangle({
      x: MARGIN,
      y,
      width: 6,
      height,
      color: palette.accent
    });

    ctx.page.drawText(item.severity.toUpperCase(), {
      x: MARGIN + 16,
      y: top - 18,
      size: 8,
      font: ctx.fonts.bold,
      color: palette.accent
    });

    ctx.page.drawText(titleLines.join("\n"), {
      x: MARGIN + 68,
      y: top - 20,
      size: 11,
      lineHeight: 13,
      font: ctx.fonts.bold,
      color: COLORS.ink
    });

    ctx.page.drawText(detailLines.join("\n"), {
      x: MARGIN + 16,
      y: top - 38 - titleLines.length * 13 + 10,
      size: 9,
      lineHeight: 11,
      font: ctx.fonts.regular,
      color: COLORS.ink
    });

    ctx.page.drawText(fixLines.join("\n"), {
      x: MARGIN + 16,
      y: top - 48 - titleLines.length * 13 - detailLines.length * 11 + 10,
      size: 9,
      lineHeight: 11,
      font: ctx.fonts.regular,
      color: COLORS.muted
    });

    ctx.y -= height + 8;
  }
}

function drawTable(ctx: LayoutContext, headers: string[], rows: string[][]): void {
  const columnCount = headers.length;
  const columnWidth = CONTENT_WIDTH / columnCount;
  const headerHeight = 28;

  const drawHeader = () => {
    ensureSpace(ctx, headerHeight + 8);
    const y = ctx.y - headerHeight;

    headers.forEach((header, index) => {
      const x = MARGIN + index * columnWidth;
      ctx.page.drawRectangle({
        x,
        y,
        width: columnWidth,
        height: headerHeight,
        color: COLORS.navySoft,
        borderColor: COLORS.line,
        borderWidth: 1
      });

      const lines = wrapText(header, ctx.fonts.bold, 8, columnWidth - 10);
      ctx.page.drawText(lines.join("\n"), {
        x: x + 5,
        y: y + headerHeight - 17,
        size: 8,
        lineHeight: 10,
        font: ctx.fonts.bold,
        color: COLORS.navy
      });
    });

    ctx.y -= headerHeight;
  };

  drawHeader();

  rows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell) => wrapText(cell, ctx.fonts.regular, 8, columnWidth - 10));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length * 10 + 8), 22);

    if (ctx.y - rowHeight < MARGIN) {
      addPage(ctx);
      drawHeader();
    }

    const y = ctx.y - rowHeight;
    row.forEach((_cell, columnIndex) => {
      const x = MARGIN + columnIndex * columnWidth;
      ctx.page.drawRectangle({
        x,
        y,
        width: columnWidth,
        height: rowHeight,
        color: rowIndex % 2 === 0 ? COLORS.surface : COLORS.surfaceSoft,
        borderColor: COLORS.line,
        borderWidth: 1
      });

      ctx.page.drawText(cellLines[columnIndex].join("\n"), {
        x: x + 5,
        y: y + rowHeight - 14,
        size: 8,
        lineHeight: 10,
        font: ctx.fonts.regular,
        color: COLORS.ink
      });
    });

    ctx.y -= rowHeight;
  });

  ctx.y -= 8;
}

function drawBulletSection(ctx: LayoutContext, title: string, items: string[], subtitle?: string): void {
  const previewHeight = items.length > 0 ? estimateBulletHeight(ctx, items[0]) : 24;
  drawSectionTitle(ctx, title, subtitle, previewHeight);
  drawBullets(ctx, items);
}

function drawRecommendationsSection(
  ctx: LayoutContext,
  title: string,
  recommendations: Recommendation[],
  subtitle?: string
): void {
  const previewHeight = recommendations.length > 0 ? estimateRecommendationHeight(ctx, recommendations[0]) + 8 : 24;
  drawSectionTitle(ctx, title, subtitle, previewHeight);
  drawRecommendations(ctx, recommendations);
}

function drawStatGridSection(
  ctx: LayoutContext,
  title: string,
  cards: StatCard[],
  columns = 3,
  subtitle?: string
): void {
  drawSectionTitle(ctx, title, subtitle, estimateStatGridPreviewHeight(ctx, cards, columns));
  drawStatGrid(ctx, cards, columns);
}

function drawTableSection(ctx: LayoutContext, title: string, headers: string[], rows: string[][], subtitle?: string): void {
  drawSectionTitle(ctx, title, subtitle, estimateTablePreviewHeight(ctx, headers, rows));
  drawTable(ctx, headers, rows);
}

function addFooters(pdf: PDFDocument, fonts: Fonts): void {
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const footer = `SEOmation Report  |  Page ${index + 1} of ${pages.length}`;
    page.drawText(footer, {
      x: MARGIN,
      y: 18,
      size: 8,
      font: fonts.regular,
      color: COLORS.muted
    });
  });
}

export function buildAuditPdfBlob(report: AuditReport): Promise<Blob> {
  return buildStyledPdf(async (ctx) => {
    drawHeader(ctx, "Audit Report", domainFromUrl(report.url), [
      `Generated ${new Date(report.timestamp).toLocaleString()}`,
      `URL ${report.url}`
    ]);

    drawStatGrid(ctx, [
      { label: "Overall Score", value: `${report.score}/100`, note: report.statusLabel, tone: "navy" },
      { label: "Broken Links", value: String(report.links.brokenCount), note: "Detected URLs", tone: "gold" },
      {
        label: "Robots Skipped",
        value: String(report.links.blockedByRobotsCount ?? 0),
        note: "Checks skipped",
        tone: "gold"
      },
      { label: "Recommendations", value: String(report.recommendations.length), note: "Items to review", tone: "green" }
    ], 2);

    drawStatGridSection(
      ctx,
      "Page Snapshot",
      [
        { label: "Title Length", value: `${report.metrics.titleLength} chars`, note: report.metrics.title ? "Title found" : "Title missing" },
        {
          label: "Meta Description",
          value: `${report.metrics.metaDescriptionLength} chars`,
          note: report.metrics.metaDescription ? "Description found" : "Description missing"
        },
        { label: "Canonical", value: report.metrics.canonical ? "Present" : "Missing", note: report.metrics.canonical ?? "No canonical tag" },
        { label: "Viewport", value: report.metrics.viewportPresent ? "Present" : "Missing", note: "Mobile viewport tag" },
        { label: "Robots Meta", value: report.metrics.robotsMeta || "Not set", note: "Meta robots directive" },
        { label: "Keyword", value: report.keyword.keyword || "Not set", note: "Optional analysis keyword" }
      ],
      2
    );

    drawStatGridSection(
      ctx,
      "Content & Link Metrics",
      [
        { label: "Words", value: String(report.readability.totalWords), note: "Visible page words" },
        { label: "Avg Sentence", value: `${report.readability.avgSentenceLen}`, note: "Words per sentence" },
        { label: "Headings", value: `${report.headings.h1Count}/${report.headings.h2Count}/${report.headings.h3Count}`, note: "H1 / H2 / H3" },
        { label: "Alt Coverage", value: `${report.images.altCoveragePct}%`, note: `${report.images.missingAltCount} missing alt` },
        { label: "Internal Links", value: String(report.links.internalCount), note: "Links within site" },
        { label: "External Links", value: String(report.links.externalCount), note: "Outbound links" },
        {
          label: "Keyword Density",
          value: report.keyword.density !== undefined ? `${report.keyword.density}%` : "N/A",
          note: `${report.keyword.occurrences ?? 0} occurrences`
        },
        { label: "Unknown Checks", value: String(report.links.unknownCount), note: "Timeout or network issues" },
        {
          label: "Hierarchy Issues",
          value: String(report.headings.hierarchyIssues.length),
          note: report.headings.hierarchyIssues[0] ?? "No hierarchy issues"
        }
      ]
    );

    drawStatGridSection(
      ctx,
      "Score Breakdown",
      [
        { label: "Title Quality", value: `${report.components.titleQuality}/10` },
        { label: "Meta Description", value: `${report.components.metaDescription}/10` },
        { label: "Headings", value: `${report.components.headingsStructure}/15` },
        { label: "Keyword Density", value: `${report.components.keywordDensity}/10` },
        { label: "Readability", value: `${report.components.readability}/10` },
        { label: "Image Alt Coverage", value: `${report.components.imageAltCoverage}/10` },
        { label: "Link Profile", value: `${report.components.linksProfile}/10` },
        { label: "Broken Links", value: `${report.components.brokenLinks}/15` },
        { label: "Technical Bonus", value: `${report.components.technicalBonus}/10` }
      ]
    );

    drawRecommendationsSection(ctx, "Recommendations", report.recommendations.slice(0, 14), "Highest-priority items are shown first.");

    if (report.links.brokenSamples.length > 0) {
      drawBulletSection(ctx, "Broken Link Samples", report.links.brokenSamples.slice(0, 12));
    }
  });
}

export function buildComparisonPdfBlob(report: ComparisonReport): Promise<Blob> {
  return buildStyledPdf(async (ctx) => {
    const bestScore = report.perPage.reduce((best, page) => Math.max(best, page.score ?? 0), 0);

    drawHeader(ctx, "Comparison Report", `${report.perPage.length} pages reviewed`, [
      `Generated ${new Date(report.timestamp).toLocaleString()}`,
      `URLs ${report.urls.join(" | ")}`
    ]);

    const headers = ["Metric", ...report.perPage.map((page) => domainFromUrl(page.url) || "Page")];
    const rows = [
      [
        "Status",
        ...report.perPage.map((page) =>
          page.blockedByRobots ? "Blocked by robots.txt" : page.error ? page.error : page.statusLabel
        )
      ],
      ["Score", ...report.perPage.map((page) => String(page.score ?? "N/A"))],
      ["Title length", ...report.perPage.map((page) => String(page.titleLength))],
      ["Meta length", ...report.perPage.map((page) => String(page.metaDescriptionLength))],
      ["Word count", ...report.perPage.map((page) => String(page.wordCount))],
      ["H1 / H2 / H3", ...report.perPage.map((page) => `${page.h1Count}/${page.h2Count}/${page.h3Count}`)],
      [
        "Keyword density",
        ...report.perPage.map((page) => (page.keywordDensity !== undefined ? `${page.keywordDensity}%` : "N/A"))
      ],
      ["Images missing alt", ...report.perPage.map((page) => String(page.imagesMissingAlt))],
      ["Internal / External", ...report.perPage.map((page) => `${page.internalLinks}/${page.externalLinks}`)],
      ["Broken links", ...report.perPage.map((page) => String(page.brokenLinks))]
    ];

    drawStatGrid(ctx, [
      { label: "Pages Compared", value: String(report.perPage.length), note: "Selected URLs", tone: "navy" },
      { label: "Best Score", value: String(bestScore), note: "Top page result", tone: "green" },
      { label: "Gap Insights", value: String(report.gapInsights.length), note: "Comparison findings", tone: "gold" },
      { label: "Recommendations", value: String(report.recommendations.length), note: "Actions for URL A", tone: "navy" }
    ], 2);

    drawTableSection(ctx, "Comparison Summary", headers, rows);
    drawBulletSection(ctx, "Gap Insights", report.gapInsights.slice(0, 16));
    drawRecommendationsSection(ctx, "Recommendations for URL A", report.recommendations.slice(0, 14));
  });
}

async function buildStyledPdf(drawContent: (ctx: LayoutContext) => Promise<void>): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold)
  };

  const ctx: LayoutContext = {
    pdf,
    fonts,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN
  };

  await drawContent(ctx);
  addFooters(pdf, fonts);

  const bytes = Uint8Array.from(await pdf.save());
  return new Blob([bytes], { type: "application/pdf" });
}
