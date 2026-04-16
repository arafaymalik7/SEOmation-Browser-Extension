export type ReportType = "audit" | "compare";
export type Severity = "High" | "Medium" | "Low";
export type StatusLabel = "Poor" | "Fair" | "Good" | "Excellent" | "Unavailable";

export interface Recommendation {
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
}

export interface HeadingNode {
  level: 1 | 2 | 3;
  text: string;
}

export interface ImageInfo {
  src: string;
  alt: string;
}

export type LinkKind = "internal" | "external";

export interface LinkInfo {
  url: string;
  kind: LinkKind;
}

export interface ExtractedPageData {
  url: string;
  title: string;
  metaDescription: string;
  canonical: string | null;
  robotsMeta: string | null;
  viewportPresent: boolean;
  headings: HeadingNode[];
  visibleText: string;
  images: ImageInfo[];
  links: LinkInfo[];
  linksToCheck: string[];
}

export interface BrokenLinkResult {
  url: string;
  status: number | null;
  state: "ok" | "broken" | "unknown";
  reason?: string;
}

export interface AuditReport {
  id: string;
  type: "audit";
  url: string;
  timestamp: string;
  score: number;
  statusLabel: Exclude<StatusLabel, "Unavailable">;
  components: {
    titleQuality: number;
    metaDescription: number;
    headingsStructure: number;
    keywordDensity: number;
    readability: number;
    imageAltCoverage: number;
    linksProfile: number;
    brokenLinks: number;
    technicalBonus: number;
  };
  metrics: {
    title: string;
    titleLength: number;
    metaDescription: string;
    metaDescriptionLength: number;
    canonical: string | null;
    robotsMeta: string | null;
    viewportPresent: boolean;
  };
  headings: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    hierarchyIssues: string[];
  };
  keyword: {
    keyword?: string;
    density?: number;
    occurrences?: number;
  };
  readability: {
    avgSentenceLen: number;
    totalWords: number;
    totalSentences: number;
  };
  images: {
    totalImages: number;
    missingAltCount: number;
    altCoveragePct: number;
  };
  links: {
    internalCount: number;
    externalCount: number;
    brokenCount: number;
    brokenSamples: string[];
    blockedByRobotsCount: number;
    unknownCount: number;
  };
  recommendations: Recommendation[];
}

export interface AuditReportSummary {
  url: string;
  score: number | null;
  statusLabel: StatusLabel;
  titleLength: number;
  metaDescriptionLength: number;
  wordCount: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  keywordDensity?: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  brokenLinks: number;
  blockedByRobots?: boolean;
  error?: string;
}

export interface ComparisonReport {
  id: string;
  type: "compare";
  urls: string[];
  timestamp: string;
  perPage: AuditReportSummary[];
  gapInsights: string[];
  recommendations: Recommendation[];
}

export type SavedReport = AuditReport | ComparisonReport;

export interface ExtensionSettings {
  maxLinksToCheck: number;
  rateLimitMs: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  maxLinksToCheck: 50,
  rateLimitMs: 1000
};

export const STORAGE_KEYS = {
  settings: "settings",
  savedReports: "savedReports"
} as const;
