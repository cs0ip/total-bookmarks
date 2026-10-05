export const ICON_REQUEST = 'site-icons:get';
export const ICON_UPDATED = 'site-icons:updated';
export const ICON_ORIGINS = ['http://*/*', 'https://*/*'];

export const defaultIcons = {
  folder: 'chrome://global/skin/icons/folder.svg',
  missing: 'chrome://global/skin/icons/defaultFavicon.svg'
} as const;

export type IconUpdate = { type: typeof ICON_UPDATED; origin: string; icon: string | null };

export function siteOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}
