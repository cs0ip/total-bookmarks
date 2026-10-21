import { get, writable } from 'svelte/store';

type Settings = { escapeAddresses: boolean; escapeAddressInDialog: boolean };
const preferenceKey = 'total-bookmarks:settings';
const current = writable<Settings>({ escapeAddresses: false, escapeAddressInDialog: false });
export const settings = { subscribe: current.subscribe };
let pendingSave = Promise.resolve();

export async function initializeSettings(): Promise<void> {
  try {
    const saved = (await browser.storage.local.get(preferenceKey))[preferenceKey];
    current.set({ escapeAddresses: saved?.escapeAddresses === true, escapeAddressInDialog: saved?.escapeAddressInDialog === true });
  } catch (cause) {
    console.error('Failed to restore settings', cause);
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  current.update((settings) => ({ ...settings, [key]: value }));
  const snapshot = get(current);
  pendingSave = pendingSave.then(async () => {
    try { await browser.storage.local.set({ [preferenceKey]: snapshot }); }
    catch (cause) { console.error('Failed to save settings', cause); }
  });
  return pendingSave;
}
