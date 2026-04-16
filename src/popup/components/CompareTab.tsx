import { useEffect, useMemo, useState } from "react";
import type { ComparisonReport, ExtensionSettings } from "../../shared/types";
import { queryActiveTab } from "../services/chrome-api";
import { runComparison } from "../services/analysis";
import { exportReportPdf } from "../services/exports";
import { addSavedReport } from "../services/storage";

interface CompareTabProps {
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

function pageTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function CompareTab({ settings }: CompareTabProps) {
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [urlC, setUrlC] = useState("");
  const [keyword, setKeyword] = useState("");
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    queryActiveTab()
      .then((tab) => {
        if (tab.url) {
          setUrlA(tab.url);
        }
      })
      .catch(() => {
        // Keep empty if unavailable.
      });
  }, []);

  const urls = useMemo(
    () =>
      [urlA, urlB, urlC]
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [urlA, urlB, urlC]
  );

  async function runCompare(): Promise<void> {
    if (!urlA.trim() || !urlB.trim()) {
      setError("URL A and URL B are required.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setReport(null);
    try {
      const result = await runComparison(urls, keyword || undefined, settings);
      setReport(result);
      setMessage("Comparison complete.");
    } catch (compareError) {
      setReport(null);
      setError(compareError instanceof Error ? compareError.message : "Comparison failed.");
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
      setMessage("Comparison saved to local reports.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save comparison.");
    }
  }

  async function exportPdf(): Promise<void> {
    if (!report) {
      return;
    }
    try {
      await exportReportPdf(report);
      setMessage("Comparison PDF exported.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export comparison PDF.");
    }
  }

  return (
    <section className="panel">
      <div className="card section-intro">
        <h3>Compare Pages</h3>
        <p>Compare your page with up to two competitor URLs.</p>
        <div className="chip-row">
          <span className="soft-chip">Robots.txt</span>
          <span className="soft-chip">Rate limit</span>
          <span className="soft-chip">Same score rules</span>
        </div>
      </div>

      <div className="row">
        <label htmlFor="compare-url-a">URL A (your page)</label>
        <input
          id="compare-url-a"
          type="url"
          value={urlA}
          onChange={(event) => setUrlA(event.target.value)}
          placeholder="https://your-site.com/page"
        />
      </div>
      <div className="row">
        <label htmlFor="compare-url-b">URL B (competitor)</label>
        <input
          id="compare-url-b"
          type="url"
          value={urlB}
          onChange={(event) => setUrlB(event.target.value)}
          placeholder="https://competitor.com/page"
        />
      </div>
      <div className="row">
        <label htmlFor="compare-url-c">URL C (optional)</label>
        <input
          id="compare-url-c"
          type="url"
          value={urlC}
          onChange={(event) => setUrlC(event.target.value)}
          placeholder="https://second-competitor.com/page"
        />
      </div>
      <div className="row">
        <label htmlFor="compare-keyword">Primary keyword</label>
        <input
          id="compare-keyword"
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Optional keyword"
        />
        <p className="field-note">Adds keyword density and relevance checks.</p>
      </div>

      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={runCompare} disabled={loading}>
          {loading ? "Comparing..." : "Run Comparison"}
        </button>
      </div>

      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {!report && !loading ? (
        <div className="card empty-state">
          <strong>Ready to compare</strong>
          <p>Add at least two URLs to highlight score gaps, structure differences, and quick wins.</p>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <span className="metric-label">Pages Compared</span>
              <strong>{report.perPage.length}</strong>
              <p>URLs analyzed</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Best Score</span>
              <strong>{Math.max(...report.perPage.map((page) => page.score ?? 0))}</strong>
              <p>Across compared pages</p>
            </div>
            <div className="metric-card">
              <span className="metric-label">Gap Insights</span>
              <strong>{report.gapInsights.length}</strong>
              <p>Actionable findings</p>
            </div>
          </div>

          <div className="card">
            <h3>Side-by-Side Summary</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {report.perPage.map((page) => (
                      <th key={page.url}>{pageTitle(page.url)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Status</td>
                    {report.perPage.map((page) => (
                      <td key={`status_${page.url}`}>
                        {page.blockedByRobots ? "Blocked by robots.txt" : page.error ? page.error : page.statusLabel}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Score</td>
                    {report.perPage.map((page) => (
                      <td key={`score_${page.url}`}>{page.score ?? "N/A"}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Title length</td>
                    {report.perPage.map((page) => (
                      <td key={`title_${page.url}`}>{page.titleLength}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Meta description length</td>
                    {report.perPage.map((page) => (
                      <td key={`meta_${page.url}`}>{page.metaDescriptionLength}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Word count</td>
                    {report.perPage.map((page) => (
                      <td key={`words_${page.url}`}>{page.wordCount}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>H1 / H2 / H3</td>
                    {report.perPage.map((page) => (
                      <td key={`h_${page.url}`}>
                        {page.h1Count}/{page.h2Count}/{page.h3Count}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Keyword density</td>
                    {report.perPage.map((page) => (
                      <td key={`density_${page.url}`}>{page.keywordDensity !== undefined ? `${page.keywordDensity}%` : "N/A"}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Images missing alt</td>
                    {report.perPage.map((page) => (
                      <td key={`img_${page.url}`}>{page.imagesMissingAlt}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Internal / External links</td>
                    {report.perPage.map((page) => (
                      <td key={`links_${page.url}`}>
                        {page.internalLinks}/{page.externalLinks}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Broken links</td>
                    {report.perPage.map((page) => (
                      <td key={`broken_${page.url}`}>{page.brokenLinks}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>Gap Insights</h3>
            {report.gapInsights.length === 0 ? (
              <p>No major content gaps detected.</p>
            ) : (
              <ul className="stat-list">
                {report.gapInsights.map((insight, index) => (
                  <li key={`${insight}_${index}`}>{insight}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Recommendations for URL A</h3>
            {report.recommendations.length === 0 ? (
              <p>No extra recommendations for URL A.</p>
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
              Export Comparison PDF
            </button>
            <button type="button" className="btn btn-primary" onClick={saveLocal}>
              Save Comparison
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
