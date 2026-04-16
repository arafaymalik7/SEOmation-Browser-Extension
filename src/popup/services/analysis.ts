import { MESSAGE_TYPES } from "../../shared/messages";
import type { AuditReport, ComparisonReport, ExtensionSettings, ExtractedPageData } from "../../shared/types";
import { extractCurrentPage, sendRuntimeMessage } from "./chrome-api";

interface BackgroundResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function runAuditForCurrentPage(
  keyword: string | undefined,
  settings: ExtensionSettings
): Promise<AuditReport> {
  const extracted = (await extractCurrentPage(settings.maxLinksToCheck)) as ExtractedPageData;
  const response = await sendRuntimeMessage<BackgroundResponse<AuditReport>>({
    type: MESSAGE_TYPES.runAudit,
    extracted,
    keyword,
    settings
  });

  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? "Audit failed.");
  }
  return response.data;
}

export async function runComparison(
  urls: string[],
  keyword: string | undefined,
  settings: ExtensionSettings
): Promise<ComparisonReport> {
  const response = await sendRuntimeMessage<BackgroundResponse<ComparisonReport>>({
    type: MESSAGE_TYPES.runComparison,
    urls,
    keyword,
    settings
  });
  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? "Comparison failed.");
  }
  return response.data;
}
