import { siteOrigin } from '../../icons/protocol';

export const defaultIcons = {
  folder: browser.runtime.getURL('icons/folder.svg'),
  missing: browser.runtime.getURL('icons/site.svg')
};
export const iconOrigins: string[] = [];

export function watchSiteIcon(url: string, onIcon: (icon: string | null) => void): () => void {
  if (siteOrigin(url)) {
    const source = new URL(browser.runtime.getURL('/_favicon/'));
    source.searchParams.set('pageUrl', url);
    source.searchParams.set('size', '32');
    onIcon(source.href);
  }
  return () => {};
}
