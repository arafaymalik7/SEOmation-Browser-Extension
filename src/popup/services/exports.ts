import type { AuditReport, ComparisonReport, SavedReport } from "../../shared/types";
import { domainFromUrl, formatTimestampForFilename } from "../../shared/utils";

function downloadWithChrome(url: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: true,
        conflictAction: "uniquify"
      },
      () => {
        const error = chrome.runtime.lastError?.message;
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve();
      }
    );
  });
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    await downloadWithChrome(objectUrl, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

export function buildAuditFilename(report: AuditReport): string {
  return `SEOmation_Audit_${domainFromUrl(report.url)}_${formatTimestampForFilename(report.timestamp)}.pdf`;
}

export function buildCompareFilename(report: ComparisonReport): string {
  const left = domainFromUrl(report.urls[0] ?? "");
  const right = domainFromUrl(report.urls[1] ?? "");
  return `SEOmation_Compare_${left}_vs_${right}_${formatTimestampForFilename(report.timestamp)}.pdf`;
}

export async function exportReportPdf(report: SavedReport): Promise<void> {
  const pdfModule = await import("./pdf-export");

  if (report.type === "audit") {
    const blob = await pdfModule.buildAuditPdfBlob(report);
    await downloadBlob(blob, buildAuditFilename(report));
    return;
  }

  const blob = await pdfModule.buildComparisonPdfBlob(report);
  await downloadBlob(blob, buildCompareFilename(report));
}

export async function exportEmailsCsv(url: string, emails: string[]): Promise<void> {
  const escapedUrl = url.replace(/"/g, '""');
  const lines = ["url,email", ...emails.map((email) => `"${escapedUrl}","${email.replace(/"/g, '""')}"`)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const name = `SEOmation_Emails_${domainFromUrl(url)}_${formatTimestampForFilename(new Date().toISOString())}.csv`;
  await downloadBlob(blob, name);
}

export async function exportEmailsJson(url: string, emails: string[]): Promise<void> {
  const payload = {
    url,
    timestamp: new Date().toISOString(),
    total: emails.length,
    emails
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const name = `SEOmation_Emails_${domainFromUrl(url)}_${formatTimestampForFilename(new Date().toISOString())}.json`;
  await downloadBlob(blob, name);
}
