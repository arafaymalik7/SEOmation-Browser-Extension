import { MESSAGE_TYPES } from "../../shared/messages";
import { isRestrictedBrowserPage } from "../../shared/utils";

function runtimeErrorMessage(): string | undefined {
  return chrome.runtime.lastError?.message;
}

export function queryActiveTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const err = runtimeErrorMessage();
      if (err) {
        reject(new Error(err));
        return;
      }
      const tab = tabs[0];
      if (!tab || !tab.id) {
        reject(new Error("No active tab found."));
        return;
      }
      if (!tab.url || isRestrictedBrowserPage(tab.url)) {
        reject(new Error("Cannot access this page due to browser restrictions."));
        return;
      }
      resolve(tab);
    });
  });
}

function sendTabMessage<TResponse>(tabId: number, message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = runtimeErrorMessage();
      if (err) {
        reject(new Error(err));
        return;
      }
      resolve(response as TResponse);
    });
  });
}

function executeContentScript(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["content.js"]
      },
      () => {
        const err = runtimeErrorMessage();
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve();
      }
    );
  });
}

export async function sendMessageToTabWithRetry<TResponse>(tabId: number, message: unknown): Promise<TResponse> {
  try {
    return await sendTabMessage<TResponse>(tabId, message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    const shouldRetry = /Receiving end does not exist|Could not establish connection/i.test(messageText);
    if (!shouldRetry) {
      throw error;
    }
    await executeContentScript(tabId);
    return sendTabMessage<TResponse>(tabId, message);
  }
}

export function sendRuntimeMessage<TResponse>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = runtimeErrorMessage();
      if (err) {
        reject(new Error(err));
        return;
      }
      resolve(response as TResponse);
    });
  });
}

export async function extractCurrentPage(maxLinksToCheck: number): Promise<unknown> {
  const tab = await queryActiveTab();
  const response = await sendMessageToTabWithRetry<{ ok: boolean; data?: unknown; error?: string }>(tab.id!, {
    type: MESSAGE_TYPES.extractPage,
    maxLinksToCheck
  });
  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? "Failed to extract page data.");
  }
  return response.data;
}

export async function extractCurrentPageEmails(): Promise<{ url: string; emails: string[] }> {
  const tab = await queryActiveTab();
  const response = await sendMessageToTabWithRetry<{ ok: boolean; data?: { url: string; emails: string[] }; error?: string }>(
    tab.id!,
    {
      type: MESSAGE_TYPES.extractEmails
    }
  );
  if (!response?.ok || !response.data) {
    throw new Error(response?.error ?? "Failed to extract emails.");
  }
  return response.data;
}
