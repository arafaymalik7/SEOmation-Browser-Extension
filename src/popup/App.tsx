import { useEffect, useState } from "react";
import type { ExtensionSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { AuditTab } from "./components/AuditTab";
import { CompareTab } from "./components/CompareTab";
import { EmailsTab } from "./components/EmailsTab";
import { SavedReportsTab } from "./components/SavedReportsTab";
import { SettingsTab } from "./components/SettingsTab";
import { loadSettings, saveSettings } from "./services/storage";

type PopupTab = "audit" | "compare" | "emails" | "saved" | "settings";

const TABS: Array<{ id: PopupTab; label: string }> = [
  { id: "audit", label: "Audit" },
  { id: "compare", label: "Compare" },
  { id: "emails", label: "Emails" },
  { id: "saved", label: "Reports" },
  { id: "settings", label: "Settings" }
];

function App() {
  const [activeTab, setActiveTab] = useState<PopupTab>("audit");
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    loadSettings()
      .then((loaded) => setSettings(loaded))
      .catch(() => {
        setStatus("Failed to load settings. Using defaults.");
      });
  }, []);

  async function handleSaveSettings(next: ExtensionSettings): Promise<void> {
    await saveSettings(next);
    setSettings(next);
    setStatus("Settings saved.");
    window.setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span>S</span>
          </div>
          <div className="brand-copy">
            <span className="eyebrow">SEO Analyzer</span>
            <h1>SEOmation</h1>
            <p>Audit pages, compare competitors, and export reports.</p>
          </div>
        </div>
        <div className="hero-badges" aria-label="Extension tools">
          <span className="hero-badge">Audit</span>
          <span className="hero-badge">Compare</span>
          <span className="hero-badge">Emails</span>
          <span className="hero-badge">PDF</span>
        </div>
      </header>

      {status ? <div className="banner info">{status}</div> : null}

      <nav className="tabs" role="tablist" aria-label="SEOmation features">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-controls={`panel-${tab.id}`}
            className={tab.id === activeTab ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {activeTab === "audit" && (
          <section id="panel-audit" role="tabpanel" aria-labelledby="audit-tab">
            <AuditTab settings={settings} />
          </section>
        )}
        {activeTab === "compare" && (
          <section id="panel-compare" role="tabpanel" aria-labelledby="compare-tab">
            <CompareTab settings={settings} />
          </section>
        )}
        {activeTab === "emails" && (
          <section id="panel-emails" role="tabpanel" aria-labelledby="emails-tab">
            <EmailsTab />
          </section>
        )}
        {activeTab === "saved" && (
          <section id="panel-saved" role="tabpanel" aria-labelledby="saved-tab">
            <SavedReportsTab />
          </section>
        )}
        {activeTab === "settings" && (
          <section id="panel-settings" role="tabpanel" aria-labelledby="settings-tab">
            <SettingsTab settings={settings} onSaveSettings={handleSaveSettings} />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
