import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type BrowserTarget = 'firefox' | 'chrome';

/** Shared metadata with only platform-specific manifest keys replaced. */
export function createManifest(target: BrowserTarget) {
  const metadata = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  const firefox = {
    ...JSON.parse(readFileSync(resolve(import.meta.dirname, 'manifest.firefox.json'), 'utf8')),
    version: metadata.version
  };
  if (target === 'firefox') return firefox;
  const { browser_specific_settings, host_permissions, background, action, icons, permissions, ...shared } = firefox;
  const chromeIcons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/logo-${size}.png`]));
  return {
    ...shared,
    minimum_chrome_version: '148',
    permissions: ['bookmarks', 'storage', 'favicon'],
    action: { default_title: action.default_title, default_icon: chromeIcons },
    background: { service_worker: 'background.js', type: 'module' },
    icons: chromeIcons
  };
}
