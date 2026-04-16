import type { ExtensionSettings, SavedReport } from "../../shared/types";
import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../../shared/types";

const MAX_REPORTS = 50;

function runtimeErrorMessage(): string | undefined {
  return chrome.runtime.lastError?.message;
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const err = runtimeErrorMessage();
      if (err) {
        reject(new Error(err));
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const err = runtimeErrorMessage();
      if (err) {
        reject(new Error(err));
        return;
      }
      resolve();
    });
  });
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const value = (await storageGet<ExtensionSettings>(STORAGE_KEYS.settings)) ?? DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...value
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await storageSet({
    [STORAGE_KEYS.settings]: settings
  });
}

export async function getSavedReports(): Promise<SavedReport[]> {
  const reports = (await storageGet<SavedReport[]>(STORAGE_KEYS.savedReports)) ?? [];
  return reports;
}

export async function addSavedReport(report: SavedReport): Promise<void> {
  const reports = await getSavedReports();
  const updated = [report, ...reports].slice(0, MAX_REPORTS);
  await storageSet({
    [STORAGE_KEYS.savedReports]: updated
  });
}

export async function deleteSavedReport(reportId: string): Promise<void> {
  const reports = await getSavedReports();
  const updated = reports.filter((item) => item.id !== reportId);
  await storageSet({
    [STORAGE_KEYS.savedReports]: updated
  });
}
