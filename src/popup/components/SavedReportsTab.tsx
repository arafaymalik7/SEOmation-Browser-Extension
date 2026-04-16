import { useEffect, useState } from "react";
import type { AuditReportSummary, ComparisonReport, SavedReport } from "../../shared/types";
import { exportReportPdf } from "../services/exports";
import { deleteSavedReport, getSavedReports } from "../services/storage";

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function reportTitle(report: SavedReport): string {
  if (report.type === "audit") {
    return `${safeHostname(report.url)} - ${report.score}/100`;
  }
  const first = report.urls[0] ?? "comparison";
  const second = report.urls[1] ?? "page";
  return `${safeHostname(first)} vs ${safeHostname(second)}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function compareStatus(page: AuditReportSummary): string {
  if (page.blockedByRobots) {
    return "Blocked by robots.txt";
  }
  if (page.error) {
    return page.error;
  }
  return page.statusLabel;
}

function bestComparisonScore(report: ComparisonReport): number {
  return report.perPage.reduce((best, page) => Math.max(best, page.score ?? 0), 0);
}

export function SavedReportsTab() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selected, setSelected] = useState<SavedReport | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshReports(): Promise<void> {
    setError("");
    try {
      const data = await getSavedReports();
      setReports(data);
      if (selected) {
        const updated = data.find((item) => item.id === selected.id) ?? null;
        setSelected(updated);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load saved reports.");
    }
  }

  useEffect(() => {
    refreshReports().catch(() => {
      // handled in refreshReports.
    });
  }, []);

  async function handleDelete(reportId: string): Promise<void> {
    try {
      await deleteSavedReport(reportId);
      setMessage("Report deleted.");
      await refreshReports();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete report.");
    }
  }

  async function handleExport(report: SavedReport): Promise<void> {
    try {
      await exportReportPdf(report);
      setMessage("Report exported.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export report.");
    }
  }

  return (
    <section className="panel">
      <div className="card section-intro">
        <h3>Saved Reports</h3>
        <p>Review saved audits and comparisons, export them again, or remove old results.</p>
      </div>

      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <div className="metric-grid compact-grid">
        <div className="metric-card">
          <span className="metric-label">Saved Reports</span>
          <strong>{reports.length}</strong>
          <p>Stored on this browser</p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Report Types</span>
          <strong>
            {reports.filter((report) => report.type === "audit").length}/
            {reports.filter((report) => report.type === "compare").length}
          </strong>
          <p>Audit / Compare</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Saved Reports</h3>
        </div>
        {reports.length === 0 ? (
          <div className="empty-state">
            <strong>No reports saved yet</strong>
            <p>Save an audit or comparison to keep it here for later review or PDF export.</p>
          </div>
        ) : (
          <ul className="saved-list">
            {reports.map((report) => (
              <li key={report.id}>
                <div>
                  <strong>{report.type === "audit" ? "Audit" : "Comparison"}</strong>
                  <p>{reportTitle(report)}</p>
                  <p className="muted">{formatDate(report.timestamp)}</p>
                </div>
                <div className="list-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setSelected(report)}>
                    View
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => handleExport(report)}>
                    Export PDF
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => handleDelete(report.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="card">
          <div className="card-header">
            <h3>Report Preview</h3>
            <span className="soft-chip">{selected.type === "audit" ? "Audit" : "Comparison"}</span>
          </div>
          <p className="muted">{formatDate(selected.timestamp)}</p>

          {selected.type === "audit" ? (
            <>
              <div className="metric-grid">
                <div className="metric-card">
                  <span className="metric-label">Score</span>
                  <strong>{selected.score}</strong>
                  <p>{selected.statusLabel}</p>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Broken Links</span>
                  <strong>{selected.links.brokenCount}</strong>
                  <p>Detected during audit</p>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Robots Skipped</span>
                  <strong>{selected.links.blockedByRobotsCount ?? 0}</strong>
                  <p>Link checks skipped</p>
                </div>
              </div>

              <ul className="detail-list">
                <li>
                  <span>URL</span>
                  <strong>{selected.url}</strong>
                </li>
                <li>
                  <span>Title length</span>
                  <strong>{selected.metrics.titleLength} chars</strong>
                </li>
                <li>
                  <span>Meta description</span>
                  <strong>{selected.metrics.metaDescriptionLength} chars</strong>
                </li>
                <li>
                  <span>Headings</span>
                  <strong>
                    {selected.headings.h1Count}/{selected.headings.h2Count}/{selected.headings.h3Count}
                  </strong>
                </li>
                <li>
                  <span>Recommendations</span>
                  <strong>{selected.recommendations.length}</strong>
                </li>
              </ul>
            </>
          ) : (
            <>
              <div className="metric-grid">
                <div className="metric-card">
                  <span className="metric-label">Pages</span>
                  <strong>{selected.perPage.length}</strong>
                  <p>Compared URLs</p>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Best Score</span>
                  <strong>{bestComparisonScore(selected)}</strong>
                  <p>Top page result</p>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Insights</span>
                  <strong>{selected.gapInsights.length}</strong>
                  <p>Gap findings</p>
                </div>
              </div>

              <ul className="saved-page-list">
                {selected.perPage.map((page) => (
                  <li key={page.url}>
                    <div>
                      <strong>{safeHostname(page.url)}</strong>
                      <p>{compareStatus(page)}</p>
                    </div>
                    <span className="page-score">{page.score ?? "N/A"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
