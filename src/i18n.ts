import { derived, writable } from 'svelte/store';
import en from './locales/en.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

export type TranslationKey = keyof typeof en;
type Messages = Record<TranslationKey, string>;
export type Locale = 'en' | 'ru' | 'zh';
export const languages: readonly { locale: Locale; name: string }[] = [
  { locale: 'en', name: 'English' },
  { locale: 'ru', name: 'Русский' },
  { locale: 'zh', name: '中文' }
];
const messages: Record<Locale, Messages> = { en, ru, zh };
const preferenceKey = 'total-bookmarks:locale';

export function resolveLocale(language: string): Locale {
  const base = language.toLowerCase().split(/[-_]/)[0];
  return base === 'ru' || base === 'zh' ? base : 'en';
}

function isLocale(value: unknown): value is Locale {
  return languages.some(({ locale }) => locale === value);
}

const currentLocale = writable<Locale>(resolveLocale(browser.i18n.getUILanguage()));
let pendingSave: Promise<void> = Promise.resolve();

// Complete before mounting the app so the automatic locale never flashes over a saved choice.
export async function initializeLocale(): Promise<void> {
  try {
    const saved = (await browser.storage.local.get(preferenceKey))[preferenceKey];
    if (isLocale(saved)) {
      currentLocale.set(saved);
      return;
    }
    let legacy: string | null = null;
    try { legacy = localStorage.getItem(preferenceKey); } catch { /* Legacy page storage may be disabled. */ }
    if (isLocale(legacy)) {
      currentLocale.set(legacy);
      await browser.storage.local.set({ [preferenceKey]: legacy });
      try { localStorage.removeItem(preferenceKey); } catch { /* Migration is already persisted. */ }
    }
  } catch (cause) {
    console.error('Failed to restore the language preference', cause);
  }
}

export const locale = { subscribe: currentLocale.subscribe };
export const t = derived(currentLocale, (language) =>
  (key: TranslationKey, params: Record<string, string | number> = {}): string =>
    (messages[language][key] ?? en[key]).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : placeholder
    )
);

currentLocale.subscribe((language) => {
  document.documentElement.lang = language === 'zh' ? 'zh-Hans' : language;
});

export function setLocale(language: Locale): Promise<void> {
  currentLocale.set(language);
  // Serialize writes so a rapid second choice cannot be overwritten by the first.
  pendingSave = pendingSave.then(async () => {
    try {
      await browser.storage.local.set({ [preferenceKey]: language });
    } catch (cause) {
      console.error('Failed to save the language preference', cause);
    }
  });
  return pendingSave;
}
