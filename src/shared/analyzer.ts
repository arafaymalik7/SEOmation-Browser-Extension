import type {
  AuditReport,
  AuditReportSummary,
  BrokenLinkResult,
  ComparisonReport,
  ExtractedPageData,
  Recommendation
} from "./types";
import { clamp, countSentences, countWords, createReportId, escapeRegExp, getStatusLabel, severityRank } from "./utils";

function addRecommendation(target: Recommendation[], rec: Recommendation): void {
  target.push(rec);
}

function buildHierarchyIssues(headings: ExtractedPageData["headings"]): string[] {
  const issues: string[] = [];
  if (headings.length === 0) {
    issues.push("No H1/H2/H3 headings were detected.");
    return issues;
  }

  const first = headings[0];
  if (first.level !== 1) {
    issues.push(`First heading is H${first.level}; add a top-level H1 near the page start.`);
  }

  for (let index = 1; index < headings.length; index += 1) {
    const prev = headings[index - 1];
    const current = headings[index];
    if (current.level - prev.level > 1) {
      issues.push(`Heading jump from H${prev.level} to H${current.level} detected.`);
    }
  }
  return issues;
}

function countKeywordOccurrences(text: string, keyword: string): number {
  if (!keyword.trim()) {
    return 0;
  }
  const normalized = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase().trim();
  const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "g");
  const matches = normalized.match(pattern);
  return matches?.length ?? 0;
}

function finalizeRecommendations(recommendations: Recommendation[]): Recommendation[] {
  return recommendations.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function createAuditSummary(report: AuditReport): AuditReportSummary {
  return {
    url: report.url,
    score: report.score,
    statusLabel: report.statusLabel,
    titleLength: report.metrics.titleLength,
    metaDescriptionLength: report.metrics.metaDescriptionLength,
    wordCount: report.readability.totalWords,
    h1Count: report.headings.h1Count,
    h2Count: report.headings.h2Count,
    h3Count: report.headings.h3Count,
    keywordDensity: report.keyword.density,
    imagesMissingAlt: report.images.missingAltCount,
    internalLinks: report.links.internalCount,
    externalLinks: report.links.externalCount,
    brokenLinks: report.links.brokenCount
  };
}

interface AnalyzeOptions {
  keyword?: string;
  brokenLinks: BrokenLinkResult[];
}

export function analyzeExtractedPage(extracted: ExtractedPageData, options: AnalyzeOptions): AuditReport {
  const keyword = options.keyword?.trim() ?? "";
  const recommendations: Recommendation[] = [];
  const hierarchyIssues = buildHierarchyIssues(extracted.headings);

  const titleLength = extracted.title.trim().length;
  const metaLength = extracted.metaDescription.trim().length;
  const h1Count = extracted.headings.filter((item) => item.level === 1).length;
  const h2Count = extracted.headings.filter((item) => item.level === 2).length;
  const h3Count = extracted.headings.filter((item) => item.level === 3).length;

  const totalWords = countWords(extracted.visibleText);
  const totalSentences = countSentences(extracted.visibleText);
  const avgSentenceLen = totalSentences > 0 ? totalWords / totalSentences : 0;

  const keywordOccurrences = keyword ? countKeywordOccurrences(extracted.visibleText, keyword) : undefined;
  const keywordDensity =
    keyword && totalWords > 0 && keywordOccurrences !== undefined ? (keywordOccurrences / totalWords) * 100 : undefined;

  const totalImages = extracted.images.length;
  const missingAltCount = extracted.images.filter((image) => !image.alt.trim()).length;
  const altCoveragePct = totalImages > 0 ? ((totalImages - missingAltCount) / totalImages) * 100 : 100;

  const internalCount = extracted.links.filter((link) => link.kind === "internal").length;
  const externalCount = extracted.links.filter((link) => link.kind === "external").length;

  const broken = options.brokenLinks.filter((link) => link.state === "broken");
  const blockedByRobots = options.brokenLinks.filter(
    (link) => link.state === "unknown" && link.reason === "Blocked by robots.txt"
  );
  const unknown = options.brokenLinks.filter(
    (link) => link.state === "unknown" && link.reason !== "Blocked by robots.txt"
  );
  const brokenSamples = broken.slice(0, 10).map((item) => item.url);

  let titleQuality = 0;
  if (titleLength === 0) {
    addRecommendation(recommendations, {
      severity: "High",
      title: "Missing page title",
      detail: "Search engines rely on the title tag to understand and rank this page.",
      fix: "Add a unique <title> element between 45 and 70 characters."
    });
  } else {
    titleQuality += 4;
    if (titleLength >= 45 && titleLength <= 70) {
      titleQuality += 4;
    } else if (titleLength >= 35 && titleLength <= 80) {
      titleQuality += 2;
      addRecommendation(recommendations, {
        severity: "Low",
        title: "Title length is sub-optimal",
        detail: `Current title length is ${titleLength} characters.`,
        fix: "Adjust the title closer to 45-70 characters for stronger SERP display."
      });
    } else {
      addRecommendation(recommendations, {
        severity: "Medium",
        title: "Title length is outside best range",
        detail: `Current title length is ${titleLength} characters, which can reduce click-through.`,
        fix: "Rewrite the title to fit 45-70 characters while keeping intent clear."
      });
    }
  }

  if (keyword) {
    if (extracted.title.toLowerCase().includes(keyword.toLowerCase())) {
      titleQuality += 2;
    } else {
      addRecommendation(recommendations, {
        severity: "Low",
        title: "Primary keyword missing from title",
        detail: "Title relevance can improve when it includes the target keyword naturally.",
        fix: `Include "${keyword}" in the title if it fits user intent.`
      });
    }
  } else {
    titleQuality += 2;
  }

  let metaDescription = 0;
  if (metaLength === 0) {
    addRecommendation(recommendations, {
      severity: "High",
      title: "Missing meta description",
      detail: "No meta description was detected for this page.",
      fix: "Add a 120-160 character meta description summarizing the page value."
    });
  } else {
    metaDescription += 6;
    if (metaLength >= 120 && metaLength <= 160) {
      metaDescription += 4;
    } else {
      metaDescription += 2;
      addRecommendation(recommendations, {
        severity: "Low",
        title: "Meta description length can be improved",
        detail: `Current description length is ${metaLength} characters.`,
        fix: "Keep description between 120 and 160 characters."
      });
    }
  }

  let headingsStructure = 0;
  if (h1Count === 1) {
    headingsStructure += 7;
  } else if (h1Count === 0) {
    addRecommendation(recommendations, {
      severity: "High",
      title: "Missing H1 heading",
      detail: "A clear H1 helps search engines understand topic focus.",
      fix: "Add exactly one descriptive H1 to the page."
    });
  } else {
    headingsStructure += 3;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "Multiple H1 headings detected",
      detail: `${h1Count} H1 tags were found, which weakens semantic hierarchy.`,
      fix: "Keep one H1 and use H2/H3 for supporting sections."
    });
  }

  if (h2Count > 0) {
    headingsStructure += 4;
  } else {
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "No H2 headings found",
      detail: "Subheadings improve content structure and readability.",
      fix: "Use H2 headings to break content into meaningful sections."
    });
  }

  if (hierarchyIssues.length === 0) {
    headingsStructure += 4;
  } else {
    headingsStructure += 2;
    addRecommendation(recommendations, {
      severity: "Low",
      title: "Heading hierarchy can be cleaner",
      detail: hierarchyIssues.join(" "),
      fix: "Use incremental heading levels (H1 > H2 > H3) and avoid jumps."
    });
  }

  let keywordDensityScore = 10;
  if (keyword) {
    if (keywordDensity === undefined) {
      keywordDensityScore = 2;
      addRecommendation(recommendations, {
        severity: "Medium",
        title: "Keyword density could not be calculated",
        detail: "Insufficient page text was detected.",
        fix: "Add substantive copy around the target topic."
      });
    } else if (keywordOccurrences === 0) {
      keywordDensityScore = 1;
      addRecommendation(recommendations, {
        severity: "High",
        title: "Primary keyword is missing in page copy",
        detail: `No occurrences of "${keyword}" were found in visible text.`,
        fix: `Add the keyword naturally within headings and body text.`
      });
    } else if (keywordDensity >= 0.8 && keywordDensity <= 3.5) {
      keywordDensityScore = 10;
    } else if ((keywordDensity >= 0.4 && keywordDensity < 0.8) || (keywordDensity > 3.5 && keywordDensity <= 5)) {
      keywordDensityScore = 6;
      addRecommendation(recommendations, {
        severity: "Low",
        title: "Keyword density is slightly outside target range",
        detail: `Current density is ${keywordDensity.toFixed(2)}%. Recommended range is 0.8%-3.5%.`,
        fix: "Tune usage to improve topical focus without keyword stuffing."
      });
    } else {
      keywordDensityScore = 2;
      addRecommendation(recommendations, {
        severity: "Medium",
        title: "Keyword density is far from best-practice range",
        detail: `Current density is ${keywordDensity.toFixed(2)}%.`,
        fix: "Balance keyword usage around intent and readability."
      });
    }
  }

  let readability = 0;
  if (totalWords === 0 || totalSentences === 0) {
    readability = 3;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "Not enough readable body text",
      detail: "Readability checks need enough visible text and sentence structure.",
      fix: "Add clear explanatory copy with short, direct sentences."
    });
  } else if (avgSentenceLen <= 20) {
    readability = 10;
  } else if (avgSentenceLen <= 25) {
    readability = 7;
    addRecommendation(recommendations, {
      severity: "Low",
      title: "Sentence length is a bit heavy",
      detail: `Average sentence length is ${avgSentenceLen.toFixed(1)} words.`,
      fix: "Split longer sentences to improve scanability."
    });
  } else if (avgSentenceLen <= 30) {
    readability = 4;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "Readability is challenging",
      detail: `Average sentence length is ${avgSentenceLen.toFixed(1)} words.`,
      fix: "Use shorter sentences and tighter paragraph flow."
    });
  } else {
    readability = 1;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "Readability needs improvement",
      detail: `Average sentence length is ${avgSentenceLen.toFixed(1)} words, which is hard to parse.`,
      fix: "Rewrite dense paragraphs into shorter sentence units."
    });
  }

  let imageAltCoverage = 10;
  if (totalImages > 0) {
    if (altCoveragePct >= 80) {
      imageAltCoverage = 10;
    } else if (altCoveragePct >= 60) {
      imageAltCoverage = 7;
      addRecommendation(recommendations, {
        severity: "Medium",
        title: "Image alt coverage can be improved",
        detail: `${missingAltCount} of ${totalImages} images are missing alt text.`,
        fix: "Add concise, descriptive alt text to key images."
      });
    } else {
      imageAltCoverage = 3;
      addRecommendation(recommendations, {
        severity: "High",
        title: "Many images are missing alt text",
        detail: `${missingAltCount} of ${totalImages} images are missing alt text.`,
        fix: "Provide meaningful alt attributes for accessibility and image SEO."
      });
    }
  }

  let linksProfile = 0;
  if (internalCount >= 3) {
    linksProfile += 6;
  } else if (internalCount >= 1) {
    linksProfile += 4;
    addRecommendation(recommendations, {
      severity: "Low",
      title: "Internal linking can be stronger",
      detail: `Only ${internalCount} internal links were detected.`,
      fix: "Add contextual internal links to related pages."
    });
  } else {
    linksProfile += 1;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "No internal links detected",
      detail: "Internal links help crawlability and topical authority flow.",
      fix: "Add links to relevant internal pages."
    });
  }

  if (externalCount <= 20) {
    linksProfile += 4;
  } else if (externalCount <= 40) {
    linksProfile += 2;
    addRecommendation(recommendations, {
      severity: "Low",
      title: "External link volume is high",
      detail: `${externalCount} external links were detected.`,
      fix: "Keep external links intentional and ensure they add user value."
    });
  } else {
    linksProfile += 1;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "External link volume may dilute focus",
      detail: `${externalCount} external links were detected on the page.`,
      fix: "Reduce non-essential outbound links and prioritize user intent."
    });
  }

  let brokenLinks = 0;
  if (broken.length === 0) {
    brokenLinks = 15;
  } else if (broken.length <= 2) {
    brokenLinks = 10;
    addRecommendation(recommendations, {
      severity: "Medium",
      title: "Broken links found",
      detail: `${broken.length} broken links were detected.`,
      fix: "Update or remove broken URLs to prevent crawl and UX issues."
    });
  } else if (broken.length <= 5) {
    brokenLinks = 6;
    addRecommendation(recommendations, {
      severity: "High",
      title: "Multiple broken links found",
      detail: `${broken.length} broken links were detected.`,
      fix: "Fix broken links immediately to improve trust and SEO quality."
    });
  } else {
    brokenLinks = 2;
    addRecommendation(recommendations, {
      severity: "High",
      title: "Many broken links found",
      detail: `${broken.length} broken links were detected.`,
      fix: "Prioritize link cleanup and validate URLs before publishing."
    });
  }

  if (unknown.length >= 5) {
    addRecommendation(recommendations, {
      severity: "Low",
      title: "Some links could not be validated",
      detail: `${unknown.length} links timed out or blocked automated checks.`,
      fix: "Manually verify important links where automated checks failed."
    });
  }

  let technicalBonus = 0;
  if (extracted.canonical) {
    technicalBonus += 5;
  } else {
    addRecommendation(recommendations, {
      severity: "Low",
      title: "Canonical tag not detected",
      detail: "Canonical URLs help prevent duplicate content signals.",
      fix: "Add <link rel=\"canonical\" href=\"...\"> to the page."
    });
  }

  if (extracted.viewportPresent) {
    technicalBonus += 5;
  } else {
    addRecommendation(recommendations, {
      severity: "Low",
      title: "Viewport meta tag is missing",
      detail: "Mobile viewport settings affect usability and mobile rankings.",
      fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">."
    });
  }

  const score = clamp(
    Math.round(
      titleQuality +
        metaDescription +
        headingsStructure +
        keywordDensityScore +
        readability +
        imageAltCoverage +
        linksProfile +
        brokenLinks +
        technicalBonus
    ),
    0,
    100
  );

  return {
    id: createReportId("audit"),
    type: "audit",
    url: extracted.url,
    timestamp: new Date().toISOString(),
    score,
    statusLabel: getStatusLabel(score),
    components: {
      titleQuality,
      metaDescription,
      headingsStructure,
      keywordDensity: keywordDensityScore,
      readability,
      imageAltCoverage,
      linksProfile,
      brokenLinks,
      technicalBonus
    },
    metrics: {
      title: extracted.title,
      titleLength,
      metaDescription: extracted.metaDescription,
      metaDescriptionLength: metaLength,
      canonical: extracted.canonical,
      robotsMeta: extracted.robotsMeta,
      viewportPresent: extracted.viewportPresent
    },
    headings: {
      h1Count,
      h2Count,
      h3Count,
      hierarchyIssues
    },
    keyword: {
      keyword: keyword || undefined,
      density: keywordDensity !== undefined ? Number(keywordDensity.toFixed(2)) : undefined,
      occurrences: keywordOccurrences
    },
    readability: {
      avgSentenceLen: Number(avgSentenceLen.toFixed(2)),
      totalWords,
      totalSentences
    },
    images: {
      totalImages,
      missingAltCount,
      altCoveragePct: Number(altCoveragePct.toFixed(2))
    },
    links: {
      internalCount,
      externalCount,
      brokenCount: broken.length,
      brokenSamples,
      blockedByRobotsCount: blockedByRobots.length,
      unknownCount: unknown.length
    },
    recommendations: finalizeRecommendations(recommendations)
  };
}

function makeComparisonRecommendation(
  severity: Recommendation["severity"],
  title: string,
  detail: string,
  fix: string
): Recommendation {
  return { severity, title, detail, fix };
}

export function buildComparisonInsights(
  basePage: AuditReportSummary | undefined,
  competitors: AuditReportSummary[],
  keyword?: string
): { insights: string[]; recommendations: Recommendation[] } {
  if (!basePage || basePage.score === null) {
    return {
      insights: ["Base page audit is unavailable, so competitive insights are limited."],
      recommendations: [
        makeComparisonRecommendation(
          "High",
          "Run a successful audit for your page",
          "Without baseline metrics, competitor gaps cannot be calculated accurately.",
          "Ensure URL A is accessible and rerun comparison."
        )
      ]
    };
  }

  const validCompetitors = competitors.filter((item) => item.score !== null);
  if (validCompetitors.length === 0) {
    return {
      insights: ["No competitor pages returned valid analysis results."],
      recommendations: []
    };
  }

  const insights: string[] = [];
  const recommendations: Recommendation[] = [];
  const bestScore = Math.max(...validCompetitors.map((item) => item.score ?? 0));

  if (bestScore > basePage.score + 5) {
    insights.push(`Competitors lead in overall SEO score by up to ${bestScore - basePage.score} points.`);
    recommendations.push(
      makeComparisonRecommendation(
        "High",
        "Close score gap with competitors",
        `Your page score is ${basePage.score}, while best competitor score is ${bestScore}.`,
        "Prioritize high-severity audit fixes first, then improve content depth and internal linking."
      )
    );
  } else {
    insights.push("Your page is competitive on overall score compared to provided URLs.");
  }

  const avgCompetitorMeta = validCompetitors.reduce((sum, item) => sum + item.metaDescriptionLength, 0) / validCompetitors.length;
  if (basePage.metaDescriptionLength === 0 && avgCompetitorMeta >= 100) {
    insights.push("Competitors use meta descriptions while your page is missing one.");
    recommendations.push(
      makeComparisonRecommendation(
        "High",
        "Add a meta description to match competitors",
        "Competitor snippets are likely more complete in SERP previews.",
        "Write a concise 120-160 character description aligned to search intent."
      )
    );
  }

  const avgCompetitorH2 = validCompetitors.reduce((sum, item) => sum + item.h2Count, 0) / validCompetitors.length;
  if (basePage.h2Count < avgCompetitorH2) {
    insights.push("Competitors have stronger sectioning with more H2 subheadings.");
    recommendations.push(
      makeComparisonRecommendation(
        "Medium",
        "Expand heading structure depth",
        `Your H2 count (${basePage.h2Count}) trails competitor average (${avgCompetitorH2.toFixed(1)}).`,
        "Add descriptive H2 sections covering related subtopics."
      )
    );
  }

  const avgCompetitorMissingAlt =
    validCompetitors.reduce((sum, item) => sum + item.imagesMissingAlt, 0) / validCompetitors.length;
  if (basePage.imagesMissingAlt > avgCompetitorMissingAlt) {
    insights.push("Competitors have better image accessibility coverage.");
    recommendations.push(
      makeComparisonRecommendation(
        "Medium",
        "Improve image alt-text coverage",
        `Your missing alt count (${basePage.imagesMissingAlt}) is above competitor average (${avgCompetitorMissingAlt.toFixed(1)}).`,
        "Add informative alt text to important images."
      )
    );
  }

  const competitorInternalMax = Math.max(...validCompetitors.map((item) => item.internalLinks));
  if (basePage.internalLinks < competitorInternalMax) {
    insights.push("At least one competitor uses stronger internal linking.");
    recommendations.push(
      makeComparisonRecommendation(
        "Medium",
        "Strengthen internal linking strategy",
        `Your page has ${basePage.internalLinks} internal links; top competitor has ${competitorInternalMax}.`,
        "Link related cluster pages and cornerstone content where relevant."
      )
    );
  }

  if (keyword) {
    const avgDensity =
      validCompetitors.reduce((sum, item) => sum + (item.keywordDensity ?? 0), 0) / validCompetitors.length;
    if ((basePage.keywordDensity ?? 0) < avgDensity && avgDensity > 0) {
      insights.push(`Competitors mention "${keyword}" more frequently in visible text.`);
      recommendations.push(
        makeComparisonRecommendation(
          "Low",
          "Review keyword placement versus competitors",
          `Your density is ${(basePage.keywordDensity ?? 0).toFixed(2)}%, competitor average is ${avgDensity.toFixed(2)}%.`,
          "Add the keyword naturally in relevant headings and body copy."
        )
      );
    }
  }

  if (insights.length === 0) {
    insights.push("No major competitive gaps detected from the selected URLs.");
  }

  return { insights, recommendations: finalizeRecommendations(recommendations) };
}

export function createComparisonReport(
  urls: string[],
  summaries: AuditReportSummary[],
  keyword?: string
): ComparisonReport {
  const [basePage, ...others] = summaries;
  const { insights, recommendations } = buildComparisonInsights(basePage, others, keyword);

  return {
    id: createReportId("compare"),
    type: "compare",
    urls,
    timestamp: new Date().toISOString(),
    perPage: summaries,
    gapInsights: insights,
    recommendations
  };
}
