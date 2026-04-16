import type { ExtractedPageData, ExtensionSettings } from "./types";

export const MESSAGE_TYPES = {
  extractPage: "SEOMATION_EXTRACT_PAGE",
  extractEmails: "SEOMATION_EXTRACT_EMAILS",
  runAudit: "SEOMATION_RUN_AUDIT",
  runComparison: "SEOMATION_RUN_COMPARISON"
} as const;

export interface ExtractPageMessage {
  type: typeof MESSAGE_TYPES.extractPage;
  maxLinksToCheck: number;
}

export interface ExtractEmailsMessage {
  type: typeof MESSAGE_TYPES.extractEmails;
}

export interface RunAuditMessage {
  type: typeof MESSAGE_TYPES.runAudit;
  extracted: ExtractedPageData;
  keyword?: string;
  settings?: Partial<ExtensionSettings>;
}

export interface RunComparisonMessage {
  type: typeof MESSAGE_TYPES.runComparison;
  urls: string[];
  keyword?: string;
  settings?: Partial<ExtensionSettings>;
}

export type ExtensionMessage = ExtractPageMessage | ExtractEmailsMessage | RunAuditMessage | RunComparisonMessage;
