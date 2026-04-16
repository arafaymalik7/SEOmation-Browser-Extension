import { useEffect, useState } from "react";
import type { ExtensionSettings } from "../../shared/types";

interface SettingsTabProps {
  settings: ExtensionSettings;
  onSaveSettings: (next: ExtensionSettings) => Promise<void>;
}

export function SettingsTab({ settings, onSaveSettings }: SettingsTabProps) {
  const [maxLinksToCheck, setMaxLinksToCheck] = useState(String(settings.maxLinksToCheck));
  const [rateLimitMs, setRateLimitMs] = useState(String(settings.rateLimitMs));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMaxLinksToCheck(String(settings.maxLinksToCheck));
    setRateLimitMs(String(settings.rateLimitMs));
  }, [settings]);

  async function handleSave(): Promise<void> {
    setError("");
    setMessage("");

    const next: ExtensionSettings = {
      maxLinksToCheck: Math.max(10, Math.min(200, Number(maxLinksToCheck) || settings.maxLinksToCheck)),
      rateLimitMs: Math.max(200, Math.min(5000, Number(rateLimitMs) || settings.rateLimitMs))
    };

    try {
      await onSaveSettings(next);
      setMessage("Settings updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update settings.");
    }
  }

  return (
    <section className="panel">
      <div className="card section-intro">
        <h3>Settings</h3>
        <p>Adjust how deep link checks should go and how slowly competitor pages are fetched.</p>
      </div>

      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <div className="metric-grid compact-grid">
        <div className="metric-card">
          <span className="metric-label">Default Link Checks</span>
          <strong>{maxLinksToCheck}</strong>
          <p>Per audit run</p>
        </div>
        <div className="metric-card">
          <span className="metric-label">Compare Delay</span>
          <strong>{rateLimitMs} ms</strong>
          <p>Between competitor fetches</p>
        </div>
      </div>

      <div className="card">
        <h3>Audit & Comparison</h3>
        <div className="row two-col">
          <div>
            <label htmlFor="settings-max-links">Link checks per audit</label>
            <input
              id="settings-max-links"
              type="number"
              min={10}
              max={200}
              value={maxLinksToCheck}
              onChange={(event) => setMaxLinksToCheck(event.target.value)}
            />
            <p className="field-note">Higher values check more links, but audits take longer.</p>
          </div>
          <div>
            <label htmlFor="settings-rate-limit">Compare delay (ms)</label>
            <input
              id="settings-rate-limit"
              type="number"
              min={200}
              max={5000}
              value={rateLimitMs}
              onChange={(event) => setRateLimitMs(event.target.value)}
            />
            <p className="field-note">Higher values slow comparison runs to stay more polite to external sites.</p>
          </div>
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </section>
  );
}
