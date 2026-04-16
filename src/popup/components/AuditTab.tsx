import { useEffect, useState } from "react";
import type { AuditReport, ExtensionSettings } from "../../shared/types";
import { runAuditForCurrentPage } from "../services/analysis";
import { queryActiveTab } from "../services/chrome-api";
import { exportReportPdf } from "../services/exports";
import { addSavedReport } from "../services/storage";

interface AuditTabProps {
  settings: ExtensionSettings;
}

function severityClass(level: string): string {
  if (level === "High") {
    return "chip high";
  }
  if (level === "Medium") {
    return "chip medium";
  }
  return "chip low";
}

function statusClass(label: string): string {
  if (label === "Excellent") {
    return "score excellent";
  }
  if (label === "Good") {
    return "score good";
  }
  if (label === "Fair") {
    return "score fair";
  }
  return "score poor";
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function AuditTab({ settings }: AuditTabProps) {
  const [keyword, setKeyword] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    queryActiveTab()
      .then((tab) => {
        setCurrentUrl(tab.url ?? "");
      })
      .catch(() => {
        setCurrentUrl("");
      });
  }, []);

  async function runAudit(): Promise<void> {
    setLoading(true);
    setError("");
    setMessage("");
    setReport(null);
    try {
      const result = await runAuditForCurrentPage(keyword || undefined, settings);
      setReport(result);
      setMessage("Audit complete.");
    } catch (auditError) {
      setReport(null);
      setError(auditError instanceof Error ? auditError.message : "Audit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveLocal(): Promise<void> {
    if (!report) {
      return;
    }
    try {
      await addSavedReport(report);
      setMessage("Audit report saved to local reports.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save report.");
    }
  }

  async function exportPdf(): Promise<void> {
    if (!report) {
      return;
    }
    try {
      await exportReportPdf(report);
      setMessage("PDF exported.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export PDF.");
    }
  }

  return (
    <section className="panel">
      <div className="card section-intro">
        <h3>Audit Current Page</h3>
        <p>Check the active tab for key on-page SEO signals.</p>
        {currentUrl ? <span className="site-pill">Active site: {safeHostname(currentUrl)}</span> : null}
      </div>

      <div className="row">
        <label htmlFor="audit-keyword">Primary keyword</label>
        <input
          id="audit-keyword"
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Optional keyword"
        />
        <p className="field-note">Adds keyword density and relevance checks.</p>
      </div>

      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={runAudit} disabled={loading}>
          {loading ? "Auditing..." : "Audit Current Page"}
        </button>
      </div>

      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {!report && !loading ? (
        <div className="card empty-state">
          <strong>Ready to scan</strong>
          <p>Run the audit to review metadata, headings, images, links, and recommendations.</p>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="card score-panel">
            <div>
              <h3>Overall SEO Score</h3>
              <p className={statusClass(report.statusLabel)}>
                {report.score} / 100
              </p>
              <p className="muted score-note">{report.statusLabel}</p>
            </div>
            <div className="quick-stats">
              <span>Broken {report.links.brokenCount}</span>
              <span>Robots {report.links.blockedByRobotsCount ?? 0}</span>
              <span>Missing Alt {report.images.missingAltCount}</span>
              <span>H1 {report.headings.h1Count}</span>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span className="metric-label">Title</span>
              <strong>{report.metrics.titleLength} chars</strong>
              <p>{report.metrics.title ? "Detected" : "Missing"}</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Meta Description</span>
              <strong>{report.metrics.metaDescriptionLength} chars</strong>
              <p>{report.metrics.metaDescription ? "Detected" : "Missing"}</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Headings</span>
              <strong>
                {report.headings.h1Count}/{report.headings.h2Count}/{report.headings.h3Count}
              </strong>
              <p>H1 / H2 / H3</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Keyword Density</span>
              <strong>{report.keyword.density !== undefined ? `${report.keyword.density}%` : "N/A"}</strong>
              <p>{report.keyword.occurrences ?? 0} mentions</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Images</span>
              <strong>{report.images.altCoveragePct}%</strong>
              <p>Alt coverage</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Readability</span>
              <strong>{report.readability.avgSentenceLen}</strong>
              <p>Words per sentence</p>
            </div>
          </div>

          <div className="card">
            <h3>Metadata</h3>
            <ul className="stat-list">
              <li>Title length: {report.metrics.titleLength}</li>
              <li>Meta description length: {report.metrics.metaDescriptionLength}</li>
              <li>Canonical: {report.metrics.canonical ? "Present" : "Missing"}</li>
              <li>Robots meta: {report.metrics.robotsMeta || "Not set"}</li>
              <li>Viewport: {report.metrics.viewportPresent ? "Present" : "Missing"}</li>
            </ul>
          </div>

          <div className="card">
            <h3>Headings</h3>
            <ul className="stat-list">
              <li>H1: {report.headings.h1Count}</li>
              <li>H2: {report.headings.h2Count}</li>
              <li>H3: {report.headings.h3Count}</li>
              <li>
                Hierarchy issues:
                {report.headings.hierarchyIssues.length > 0 ? (
                  <span> {report.headings.hierarchyIssues.join(" | ")}</span>
                ) : (
                  <span> None</span>
                )}
              </li>
            </ul>
          </div>

          <div className="card">
            <h3>Content & Media</h3>
            <ul className="stat-list">
              <li>
                Keyword density:{" "}
                {report.keyword.keyword
                  ? `${report.keyword.density ?? 0}% (${report.keyword.occurrences ?? 0} occurrences)`
                  : "No keyword provided"}
              </li>
              <li>
                Readability: avg sentence length {report.readability.avgSentenceLen} ({report.readability.totalWords} words,{" "}
                {report.readability.totalSentences} sentences)
              </li>
              <li>
                Images: {report.images.totalImages} total, {report.images.missingAltCount} missing alt (
                {report.images.altCoveragePct}% coverage)
              </li>
            </ul>
          </div>

          <div className="card">
            <h3>Links</h3>
            <ul className="stat-list">
              <li>Internal links: {report.links.internalCount}</li>
              <li>External links: {report.links.externalCount}</li>
              <li>Broken links: {report.links.brokenCount}</li>
              <li>Skipped by robots.txt: {report.links.blockedByRobotsCount ?? 0}</li>
              <li>Unknown checks (timeout/network): {report.links.unknownCount}</li>
              <li>Broken samples: {report.links.brokenSamples.slice(0, 10).join(" | ") || "None"}</li>
            </ul>
          </div>

          <div className="card">
            <h3>Prioritized Recommendations</h3>
            {report.recommendations.length === 0 ? (
              <p>No major issues found by the current rules.</p>
            ) : (
              <ul className="recommendations">
                {report.recommendations.map((item, index) => (
                  <li key={`${item.title}_${index}`}>
                    <span className={severityClass(item.severity)}>{item.severity}</span>
                    <strong>{item.title}</strong>
                    <p>Why it matters: {item.detail}</p>
                    <p>Fix: {item.fix}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={exportPdf}>
              Export PDF
            </button>
            <button type="button" className="btn btn-primary" onClick={saveLocal}>
              Save Report
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
