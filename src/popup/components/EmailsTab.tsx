import { useState } from "react";
import { extractCurrentPageEmails } from "../services/chrome-api";
import { exportEmailsCsv, exportEmailsJson } from "../services/exports";

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = value;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }
}

export function EmailsTab() {
  const [emails, setEmails] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runExtract(): Promise<void> {
    setLoading(true);
    setError("");
    setMessage("");
    setEmails([]);
    setSourceUrl("");
    try {
      const result = await extractCurrentPageEmails();
      setEmails(result.emails);
      setSourceUrl(result.url);
      setMessage(`Extraction complete. ${result.emails.length} unique email(s) found.`);
    } catch (extractError) {
      setEmails([]);
      setSourceUrl("");
      setError(extractError instanceof Error ? extractError.message : "Email extraction failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAll(): Promise<void> {
    if (emails.length === 0) {
      return;
    }
    try {
      await copyText(emails.join("\n"));
      setMessage("All emails copied.");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Failed to copy emails.");
    }
  }

  async function copySingle(email: string): Promise<void> {
    try {
      await copyText(email);
      setMessage(`Copied ${email}`);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Failed to copy email.");
    }
  }

  async function exportCsv(): Promise<void> {
    if (emails.length === 0) {
      return;
    }
    try {
      await exportEmailsCsv(sourceUrl, emails);
      setMessage("CSV export complete.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export CSV.");
    }
  }

  async function exportJson(): Promise<void> {
    if (emails.length === 0) {
      return;
    }
    try {
      await exportEmailsJson(sourceUrl, emails);
      setMessage("JSON export complete.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export JSON.");
    }
  }

  return (
    <section className="panel">
      <div className="card section-intro">
        <h3>Extract Emails</h3>
        <p>Find email addresses on the active page.</p>
        <div className="chip-row">
          <span className="soft-chip">Visible text</span>
          <span className="soft-chip">Mailto links</span>
          <span className="soft-chip">Copy & export</span>
        </div>
      </div>

      <div className="banner warning">
        Privacy notice: extracted emails stay local in the popup unless you copy or export them.
      </div>

      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={runExtract} disabled={loading}>
          {loading ? "Extracting..." : "Extract Emails from Current Page"}
        </button>
      </div>

      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {emails.length === 0 && !loading ? (
        <div className="card empty-state">
          <strong>No emails extracted yet</strong>
          <p>Run extraction to collect, copy, and export unique email addresses from the current page.</p>
        </div>
      ) : null}

      {emails.length > 0 ? (
        <>
          <div className="card">
            <h3>Extracted Emails ({emails.length})</h3>
            <ul className="email-list">
              {emails.map((email) => (
                <li key={email}>
                  <code>{email}</code>
                  <button type="button" className="btn btn-ghost" onClick={() => copySingle(email)}>
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={copyAll}>
              Copy All
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportCsv}>
              Export CSV
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportJson}>
              Export JSON
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
